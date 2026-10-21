export const FIXED_PROJECTS = Object.freeze({ index: 0, todo: 1, badminton: 2, "sien-day": 3 });
export const DEFAULT_PROJECTS = [
  { id: "todo", name: "todo", cloudflare: true, github: true, shortcutNumber: 1, shortcutPlatform: "cloudflare", sortOrder: 0 },
  { id: "badminton", name: "badminton", cloudflare: true, github: true, shortcutNumber: 2, shortcutPlatform: "cloudflare", sortOrder: 1 },
  { id: "sien-day", name: "sien-day", cloudflare: true, github: true, shortcutNumber: 3, shortcutPlatform: "cloudflare", sortOrder: 2 },
  { id: "wenti", name: "wenti", cloudflare: true, github: true, shortcutNumber: 4, shortcutPlatform: "cloudflare", sortOrder: 3 },
  { id: "count", name: "count", cloudflare: true, github: false, shortcutNumber: 5, shortcutPlatform: "cloudflare", sortOrder: 4 },
  { id: "index", name: "index", cloudflare: true, github: true, shortcutNumber: 0, shortcutPlatform: "cloudflare", sortOrder: 5 },
];
export function isFixed(project) { return Object.hasOwn(FIXED_PROJECTS, project.name); }
export function projectUrl(project, platform = project.shortcutPlatform) {
  if (!project[platform]) return null;
  return platform === "cloudflare" ? "https://" + project.name + ".choi975.workers.dev/" : "https://choi975.github.io/" + project.name + "/";
}
export function normalizeProjects(value, { legacy = false } = {}) {
  if (!Array.isArray(value) || value.length > 200) throw new Error("项目数据必须是最多 200 项的数组");
  const names = new Set(); const ids = new Set(); const numbers = new Set();
  let source = value;
  if (legacy) {
    source = value.filter((item) => !["xizang", "badminton-scoring"].includes(item?.name)).map((item) => item.name === "badminton-level" ? { ...item, name: "badminton", id: "badminton" } : item);
    source = [...source];
    for (const project of DEFAULT_PROJECTS.filter(isFixed)) if (!source.some((item) => item.name === project.name)) source.push({ ...project });
    const preferred = ["todo", "badminton", "sien-day", "wenti", "count", "index"];
    source.sort((a, b) => (preferred.includes(a.name) ? preferred.indexOf(a.name) : 100) - (preferred.includes(b.name) ? preferred.indexOf(b.name) : 100));
  }
  const result = source.map((item, index) => {
    const name = String(item?.name || "").trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 80) throw new Error("项目名称仅支持小写字母、数字和连字符");
    const id = typeof item.id === "string" && item.id ? item.id : legacy ? name : "";
    if (!id || id.length > 200 || names.has(name) || ids.has(id)) throw new Error("项目名称或 ID 重复或无效");
    names.add(name); ids.add(id);
    if (typeof item.cloudflare !== "boolean" || typeof item.github !== "boolean") throw new Error("平台设置无效");
    let shortcutNumber = item.shortcutNumber;
    let shortcutPlatform = item.shortcutPlatform;
    if (legacy) {
      shortcutNumber = FIXED_PROJECTS[name] ?? ({ wenti: 4, count: 5 }[name] ?? null);
      shortcutPlatform = item.cloudflare ? "cloudflare" : item.github ? "github" : "cloudflare";
    }
    if (shortcutNumber !== null && (!Number.isInteger(shortcutNumber) || shortcutNumber < 0 || shortcutNumber > 9)) throw new Error("快捷键必须为 0～9 或未分配");
    if (shortcutPlatform !== "cloudflare" && shortcutPlatform !== "github") throw new Error("快捷键目标平台无效");
    if (Object.hasOwn(FIXED_PROJECTS, name)) {
      if (!legacy && (shortcutNumber !== FIXED_PROJECTS[name] || shortcutPlatform !== "cloudflare" || !item.cloudflare)) throw new Error("0～3 是固定 Cloudflare 快捷键，不能修改");
      shortcutNumber = FIXED_PROJECTS[name]; shortcutPlatform = "cloudflare";
    } else if (shortcutNumber !== null && shortcutNumber < 4) throw new Error("0～3 已保留给固定项目");
    if (shortcutNumber !== null) {
      if (numbers.has(shortcutNumber)) throw new Error("快捷键编号重复：" + shortcutNumber);
      if (!item[shortcutPlatform] && !Object.hasOwn(FIXED_PROJECTS, name)) throw new Error("快捷键目标平台尚未启用");
      numbers.add(shortcutNumber);
    }
    const sortOrder = legacy ? index : item.sortOrder;
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) throw new Error("项目排序无效");
    return { id, name, cloudflare: Object.hasOwn(FIXED_PROJECTS, name) ? true : item.cloudflare, github: item.github, shortcutNumber, shortcutPlatform, sortOrder };
  });
  for (const name of Object.keys(FIXED_PROJECTS)) if (!names.has(name)) throw new Error("不能删除固定项目：" + name);
  return result.sort((a, b) => a.sortOrder - b.sortOrder).map((project, index) => ({ ...project, sortOrder: index }));
}
