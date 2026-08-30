const DEFAULT_PROJECTS = [
  { id: "badminton", name: "badminton", cloudflare: true, github: true },
  { id: "sien-day", name: "sien-day", cloudflare: true, github: true },
  { id: "todo", name: "todo", cloudflare: true, github: true },
  { id: "wenti", name: "wenti", cloudflare: true, github: true },
  { id: "xizang", name: "xizang", cloudflare: false, github: true },
];

const JSON_HEADERS = {
  "content-type": "application/json; charset=UTF-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, OPTIONS",
  "access-control-allow-headers": "content-type, accept",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function validProject(project) {
  return project && typeof project.id === "string" && typeof project.name === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.name) &&
    typeof project.cloudflare === "boolean" && typeof project.github === "boolean";
}

async function getProjects(env) {
  const row = await env.DB.prepare("SELECT data FROM project_index WHERE id = ?").bind("default").first();
  if (!row) {
    await env.DB.prepare("INSERT INTO project_index (id, data, updated_at) VALUES (?, ?, datetime('now'))")
      .bind("default", JSON.stringify(DEFAULT_PROJECTS)).run();
    return DEFAULT_PROJECTS;
  }
  try {
    const projects = JSON.parse(row.data);
    return Array.isArray(projects) ? projects : DEFAULT_PROJECTS;
  } catch {
    return DEFAULT_PROJECTS;
  }
}

async function handleApi(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (url.pathname !== "/api/projects") return json({ error: "Not found" }, 404);

  if (request.method === "GET") return json({ projects: await getProjects(env) });

  if (request.method === "PUT") {
    let projects;
    try {
      projects = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const names = new Set();
    const ids = new Set();
    const valid = Array.isArray(projects) && projects.length <= 200 && projects.every((project) => {
      if (!validProject(project) || names.has(project.name) || ids.has(project.id)) return false;
      names.add(project.name);
      ids.add(project.id);
      return true;
    });
    if (!valid) {
      return json({ error: "Invalid project data" }, 400);
    }
    await env.DB.prepare(
      "INSERT INTO project_index (id, data, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    ).bind("default", JSON.stringify(projects)).run();
    return json({ ok: true, projects });
  }

  return json({ error: "Method not allowed" }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    return env.ASSETS.fetch(request);
  },
};
