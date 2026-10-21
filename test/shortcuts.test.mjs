import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import worker from "../worker.js";
import { DEFAULT_PROJECTS, normalizeProjects, projectUrl } from "../project-config.js";
const clone = () => structuredClone(DEFAULT_PROJECTS);
function database(projects = clone(), revision = "r1") {
  const row = { data: JSON.stringify(projects), revision };
  return { row, prepare(sql) { let args; return { bind(...values) { args = values; return this; }, async first() { return { ...row }; }, async run() {
    if (sql.startsWith("UPDATE")) {
      if (row.revision !== args[4]) return { meta: { changes: 0 } };
      row.data = args[0]; row.revision = args[2]; return { meta: { changes: 1 } };
    }
    throw new Error("Unexpected SQL");
  } }; } };
}
const api = (db, route, options) => worker.fetch(new Request("https://index.choi975.workers.dev" + route, options), { DB: db });
test("legacy data migrates, retains IDs, removes xizang and adds index", () => {
  const old = [{ id: "old-count-id", name: "count", cloudflare: true, github: false }, { id: "xizang", name: "xizang", cloudflare: false, github: true }];
  const migrated = normalizeProjects(old, { legacy: true });
  assert.equal(migrated.find(p => p.name === "count").id, "old-count-id");
  assert.equal(migrated.find(p => p.name === "count").shortcutNumber, 5);
  assert.equal(migrated.find(p => p.name === "index").shortcutNumber, 0);
  assert.ok(!migrated.some(p => p.name === "xizang"));
});
test("fixed projects, unique keys and deployed target validation", () => {
  let p = clone(); p[0].shortcutPlatform = "github"; assert.throws(() => normalizeProjects(p), /固定/);
  p = clone(); p[3].shortcutNumber = 5; assert.throws(() => normalizeProjects(p), /重复/);
  p = clone(); p[4].shortcutPlatform = "github"; assert.throws(() => normalizeProjects(p), /未启用/);
  assert.throws(() => normalizeProjects(clone().filter(p => p.name !== "index")), /固定/);
  p = clone(); p[3].shortcutPlatform = "github"; assert.equal(projectUrl(normalizeProjects(p)[3]), "https://choi975.github.io/wenti/");
});
test("sort and delete preserve shortcut gaps", () => {
  const p = clone().filter(p => p.name !== "wenti").reverse().map((p, i) => ({ ...p, sortOrder: i }));
  const result = normalizeProjects(p);
  assert.equal(result.find(p => p.name === "count").shortcutNumber, 5);
  assert.ok(!result.some(p => p.shortcutNumber === 4));
});
test("lookup always reads current database, missing returns explicit null, no caching", async () => {
  const db = database();
  let response = await api(db, "/api/shortcuts/4");
  assert.equal((await response.json()).url, "https://wenti.choi975.workers.dev/");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  const p = clone(); p[3].shortcutPlatform = "github"; db.row.data = JSON.stringify(p);
  assert.equal((await (await api(db, "/api/shortcuts/4")).json()).url, "https://choi975.github.io/wenti/");
  assert.equal((await (await api(db, "/api/shortcuts/9")).json()).url, null);
  assert.equal((await api(db, "/api/shortcuts/11")).status, 404);
});
test("revision saves reject stale clients and allow valid update", async () => {
  const db = database();
  const put = revision => api(db, "/api/projects", { method: "PUT", body: JSON.stringify({ projects: clone(), revision }) });
  assert.equal((await put("old")).status, 409);
  assert.equal((await put("r1")).status, 200);
  assert.notEqual(db.row.revision, "r1");
  assert.equal((await put("r1")).status, 409);
});
test("legacy GET migration is persisted once", async () => {
  const db = database(clone().map(({ id, name, cloudflare, github }) => ({ id, name, cloudflare, github })), "");
  const result = await (await api(db, "/api/projects")).json();
  assert.ok(result.revision);
  assert.ok(db.row.revision);
  assert.equal(result.projects.find(p => p.name === "sien-day").shortcutNumber, 3);
});
const clientCode = await readFile(new URL("../project-shortcuts.js", import.meta.url), "utf8");
function client() {
  const values = new Map(); const events = {}; const calls = []; let mode = "live"; let target = "https://wenti.choi975.workers.dev/";
  const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const window = { addEventListener(name, fn) { events[name] = fn; }, location: { assign(url) { calls.push(url); } }, open(url) { calls.push("open:" + url); return { opener: window, closed: false, document: { body: { style: {} } }, location: { replace(url) { calls.push("replace:" + url); } }, close() { calls.push("closed"); this.closed = true; } }; } };
  const nodes = new Map(); const document = { activeElement: null, body: { append(node) { nodes.set(node.id, node); } }, getElementById: id => nodes.get(id), createElement: () => ({ style: {}, setAttribute() {} }) };
  const context = { window, document, localStorage, URL, AbortController, setTimeout, clearTimeout, fetch: async (url, options) => {
    calls.push("fetch:" + url); assert.equal(options.cache, "no-store");
    if (mode === "offline") throw new Error("offline");
    if (mode === "error") return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ number: Number(url.split("/").at(-1)), url: mode === "empty" ? null : target }) };
  } };
  vm.runInNewContext(clientCode, context);
  return { shortcuts: window.ProjectShortcuts, values, events, calls, document, setMode: value => { mode = value; }, setTarget: value => { target = value; } };
}
test("fixed keys 0..3 never need network", async () => {
  const c = client(); c.setMode("offline");
  assert.equal((await c.shortcuts.resolve(0)).url, "https://index.choi975.workers.dev/");
  assert.equal((await c.shortcuts.resolve(3)).url, "https://sien-day.choi975.workers.dev/");
  assert.equal(c.calls.length, 0);
});
test("live cache refresh, offline fallback and authoritative deletion", async () => {
  const c = client();
  assert.equal((await c.shortcuts.resolve(4)).source, "live");
  c.setMode("offline"); assert.equal((await c.shortcuts.resolve(4)).source, "cache");
  c.setMode("live"); c.setTarget("https://choi975.github.io/wenti/"); assert.equal((await c.shortcuts.resolve(4)).url, "https://choi975.github.io/wenti/");
  c.setMode("empty"); assert.equal((await c.shortcuts.resolve(4)).source, "empty");
  c.setMode("offline"); assert.equal((await c.shortcuts.resolve(4)).url, null);
});
test("corrupt cache and unrelated URL do not navigate", async () => {
  const c = client(); c.values.set("choi975-project-shortcuts-v2", "bad-json"); c.setMode("offline");
  assert.equal((await c.shortcuts.resolve(4)).url, null);
  c.setMode("live"); c.setTarget("https://untrusted.example/"); assert.equal((await c.shortcuts.resolve(4)).url, null);
});
test("new tab is opened synchronously, closes for empty, and Ctrl routes separately", async () => {
  const c = client(); c.setMode("empty");
  await c.shortcuts.navigate(9, true);
  assert.equal(c.calls[0], "open:about:blank"); assert.equal(c.calls.at(-1), "closed");
  c.calls.length = 0; c.setMode("live");
  await c.shortcuts.navigate(4, true); assert.equal(c.calls.at(-1), "replace:https://wenti.choi975.workers.dev/");
});
test("keydown ignores typing, repeats, composition and Shift, covers numpad", () => {
  const c = client(); const handler = c.events.keydown;
  const event = { altKey: true, ctrlKey: false, key: "1", code: "Digit1", target: { tagName: "INPUT" }, preventDefault() {}, stopImmediatePropagation() {} };
  handler(event); assert.equal(c.calls.length, 0);
  handler({ ...event, target: null, shiftKey: true }); assert.equal(c.calls.length, 0);
  handler({ ...event, target: null, isComposing: true }); assert.equal(c.calls.length, 0);
  handler({ ...event, target: null, repeat: true }); assert.equal(c.calls.length, 0);
  handler({ ...event, target: null, key: "End", code: "Numpad1" }); assert.equal(c.calls[0], "https://todo.choi975.workers.dev/");
});
