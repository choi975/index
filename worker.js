import { DEFAULT_PROJECTS, normalizeProjects, projectUrl } from "./project-config.js";
const JSON_HEADERS = {
  "content-type": "application/json; charset=UTF-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, OPTIONS",
  "access-control-allow-headers": "content-type, accept",
  "cache-control": "no-store, max-age=0",
};
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS }); }
async function getState(env) {
  let row = await env.DB.prepare("SELECT data, revision FROM project_index WHERE id = ?").bind("default").first();
  if (!row) {
    await env.DB.prepare("INSERT OR IGNORE INTO project_index (id, data, updated_at, revision) VALUES (?, ?, ?, ?)").bind("default", JSON.stringify(DEFAULT_PROJECTS), new Date().toISOString(), crypto.randomUUID()).run();
    row = await env.DB.prepare("SELECT data, revision FROM project_index WHERE id = ?").bind("default").first();
  }
  const raw = JSON.parse(row.data);
  const projects = normalizeProjects(raw, { legacy: !row.revision });
  if (!row.revision) {
    const revision = crypto.randomUUID();
    const update = await env.DB.prepare("UPDATE project_index SET data = ?, updated_at = ?, revision = ? WHERE id = ? AND revision = ?").bind(JSON.stringify(projects), new Date().toISOString(), revision, "default", row.revision).run();
    if (!update.meta.changes) return getState(env);
    return { projects, revision };
  }
  return { projects, revision: row.revision };
}
async function handleApi(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
  const shortcut = /^\/api\/shortcuts\/([0-9])$/.exec(url.pathname);
  if (shortcut) {
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
    const state = await getState(env);
    const number = Number(shortcut[1]);
    const project = state.projects.find((item) => item.shortcutNumber === number);
    return json({ number, url: project ? projectUrl(project) : null, project: project?.name ?? null, revision: state.revision });
  }
  if (url.pathname !== "/api/projects") return json({ error: "Not found" }, 404);
  if (request.method === "GET") return json(await getState(env));
  if (request.method === "PUT") {
    let payload;
    try { payload = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    let projects;
    try { projects = normalizeProjects(payload.projects); } catch (error) { return json({ error: error.message }, 400); }
    if (typeof payload.revision !== "string" || !payload.revision) return json({ error: "请刷新页面后再保存，旧版页面不支持新配置" }, 409);
    const revision = crypto.randomUUID();
    const update = await env.DB.prepare("UPDATE project_index SET data = ?, updated_at = ?, revision = ? WHERE id = ? AND revision = ?").bind(JSON.stringify(projects), new Date().toISOString(), revision, "default", payload.revision).run();
    if (!update.meta.changes) return json({ error: "配置已被其他页面修改。请导出本机修改，再重新载入云端配置。" }, 409);
    return json({ ok: true, projects, revision });
  }
  return json({ error: "Method not allowed" }, 405);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await handleApi(request, env, url); }
      catch (error) { console.error("Index API failure", error); return json({ error: "配置服务暂不可用" }, 503); }
    }
    return env.ASSETS.fetch(request);
  },
};
