import { DEFAULT_PROJECTS, FIXED_PROJECTS, normalizeProjects, isFixed } from "./project-config.js";
const STORAGE_KEY = "choi975-project-index-v2";
const API_BASE = location.hostname === "index.choi975.workers.dev" ? "" : "https://index.choi975.workers.dev";
const INITIAL_PROJECTS = DEFAULT_PROJECTS;

const elements = {
  list: document.querySelector("#project-list"),
  template: document.querySelector("#project-row-template"),
  search: document.querySelector("#search"),
  editButton: document.querySelector("#edit-button"),
  addButton: document.querySelector("#add-button"),
  importButton: document.querySelector("#import-button"),
  importFile: document.querySelector("#import-file"),
  exportButton: document.querySelector("#export-button"),
  resetButton: document.querySelector("#reset-button"),
  emptyState: document.querySelector("#empty-state"),
  projectCount: document.querySelector("#project-count"),
  linkCount: document.querySelector("#link-count"),
  toast: document.querySelector("#toast"),
  syncStatus: document.querySelector("#sync-status"),
  retrySync: document.querySelector("#retry-sync"),
};

let cloudRevision = null;
let localChangesPending = false;
let saving = false;
let saveConflict = false;
let projects = loadProjects();
let editing = false;
let toastTimer;
let remoteSaveTimer;

function cloneInitialProjects() {
  return INITIAL_PROJECTS.map((project) => ({ ...project }));
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidName(name) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

function cloudflareUrl(name) {
  return `https://${name}.choi975.workers.dev/`;
}

function githubPagesUrl(name) {
  return `https://choi975.github.io/${name}/`;
}

function githubRepoUrl(name) {
  return `https://github.com/choi975/${name}`;
}

function sanitizeProjects(value) {
  return normalizeProjects(value, { legacy: Array.isArray(value) && value.every((project) => project.shortcutNumber === undefined) });
}
function persistLocal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, revision: cloudRevision, pending: localChangesPending })); }
  catch { setSyncStatus("本机存储不可用，请保持页面打开直到云端保存成功", "error"); }
}
function loadProjects() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored) {
      const projects = sanitizeProjects(stored.projects);
      cloudRevision = typeof stored.revision === "string" ? stored.revision : null;
      localChangesPending = Boolean(stored.pending);
      return projects;
    }
    const legacy = localStorage.getItem("choi975-project-index-v1");
    if (legacy) return sanitizeProjects(JSON.parse(legacy));
  } catch (error) { console.warn("本机配置读取失败", error); }
  return cloneInitialProjects();
}
function saveProjects() {
  normalizeProjects(projects);
  localChangesPending = true;
  persistLocal();
  updateStats();
  setSyncStatus("改动已保存在本机，正在同步…");
  queueRemoteSave();
}
function setSyncStatus(message, state = "") {
  elements.syncStatus.textContent = message;
  elements.syncStatus.dataset.state = state;
}
function queueRemoteSave() {
  window.clearTimeout(remoteSaveTimer);
  if (saveConflict || saving || !localChangesPending) return;
  remoteSaveTimer = window.setTimeout(saveToCloud, 350);
}
async function saveToCloud() {
  if (saving || saveConflict || !localChangesPending) return;
  normalizeProjects(projects);
  if (!cloudRevision) { setSyncStatus("尚未读取云端版本，点击重新同步后保存", "error"); return; }
  saving = true;
  const snapshot = JSON.stringify(projects);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(API_BASE + "/api/projects", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ projects: JSON.parse(snapshot), revision: cloudRevision }), signal: controller.signal,
    });
    const payload = await response.json();
    if (response.status === 409) { saveConflict = true; throw new Error(payload.error); }
    if (!response.ok) throw new Error(payload.error || "HTTP " + response.status);
    if (typeof payload.revision !== "string") throw new Error("云端版本无效");
    cloudRevision = payload.revision;
    localChangesPending = snapshot !== JSON.stringify(projects);
    persistLocal();
    setSyncStatus(localChangesPending ? "继续同步最新修改…" : "已同步到云端", localChangesPending ? "" : "success");
  } catch (error) {
    console.warn("云端保存失败", error);
    setSyncStatus(saveConflict ? "保存冲突：请先导出本机修改，再点重新同步" : "保存失败，改动仍在本机；点击重新同步重试", "error");
  } finally {
    clearTimeout(timer);
    saving = false;
    if (localChangesPending && !saveConflict && snapshot !== JSON.stringify(projects)) queueRemoteSave();
  }
}
async function syncFromCloud() {
  if (saving || saveConflict) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(API_BASE + "/api/projects", { cache: "no-store", headers: { accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const payload = await response.json();
    const remoteProjects = sanitizeProjects(payload.projects);
    if (typeof payload.revision !== "string" || !payload.revision) throw new Error("请等待新版云端配置服务部署完成");
    if (localChangesPending) {
      if (cloudRevision !== payload.revision) {
        saveConflict = true;
        setSyncStatus("云端已有新配置，请导出本机修改后重新同步", "error");
      } else queueRemoteSave();
      return;
    }
    projects = remoteProjects;
    cloudRevision = payload.revision;
    persistLocal();
    render();
    setSyncStatus("已连接云端数据", "success");
  } catch (error) {
    console.warn("云端读取失败", error);
    setSyncStatus("云端暂不可用，使用本机配置；可点击重新同步", "error");
  } finally { clearTimeout(timer); }
}

function updateStats() {
  elements.projectCount.textContent = projects.length;
  elements.linkCount.textContent = projects.reduce(
    (total, project) => total + Number(project.cloudflare) + Number(project.github),
    0,
  );
}

function getMonogram(name) {
  return name
    .split("-")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("") || "+";
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2200);
}

function setEditing(nextEditing) {
  editing = nextEditing;
  document.body.classList.toggle("editing", editing);
  elements.editButton.setAttribute("aria-pressed", String(editing));
  elements.editButton.querySelector("span").textContent = editing ? "完成" : "编辑";
  render();
}

function findDuplicate(name, currentId) {
  return projects.some((project) => project.id !== currentId && project.name === name);
}

function updateProjectName(project, input, errorElement) {
  const name = normalizeName(input.value);
  input.value = name;

  if (!name) {
    input.classList.add("invalid");
    errorElement.textContent = "请输入项目名称";
    return false;
  }

  if (!isValidName(name)) {
    input.classList.add("invalid");
    errorElement.textContent = "仅支持小写字母、数字和连字符";
    return false;
  }

  if (findDuplicate(name, project.id)) {
    input.classList.add("invalid");
    errorElement.textContent = "这个项目已经存在";
    return false;
  }

  input.classList.remove("invalid");
  errorElement.textContent = "";
  if (Object.hasOwn(FIXED_PROJECTS, name) && !isFixed(project)) {
    errorElement.textContent = "这个名称属于固定项目";
    return false;
  }
  project.name = name;
  saveProjects();
  return true;
}

function createProjectRow(project) {
  const fragment = elements.template.content.cloneNode(true);
  const row = fragment.querySelector(".project-row");
  const monogram = fragment.querySelector(".project-monogram");
  const nameLink = fragment.querySelector(".project-name");
  const slug = fragment.querySelector(".project-slug");
  const input = fragment.querySelector(".project-input");
  const error = fragment.querySelector(".input-error");
  const deleteButton = fragment.querySelector(".delete-button");
  const cloudflareLink = fragment.querySelector(".cloudflare-button");
  const githubLink = fragment.querySelector(".github-button");
  const cloudflareToggle = fragment.querySelector(".cloudflare-toggle");
  const githubToggle = fragment.querySelector(".github-toggle");
  const platformCells = fragment.querySelectorAll(".platform-cell");

  row.dataset.projectId = project.id;
  monogram.textContent = getMonogram(project.name);
  nameLink.textContent = project.name || "未命名项目";
  if (project.github) {
    nameLink.href = githubRepoUrl(project.name);
    nameLink.title = "打开 GitHub 仓库";
  } else {
    nameLink.removeAttribute("href");
    nameLink.removeAttribute("target");
    nameLink.removeAttribute("title");
  }
  slug.textContent = project.name;
  input.value = project.name;
  const fixed = isFixed(project);
  input.disabled = fixed;
  deleteButton.disabled = fixed;
  deleteButton.title = fixed ? "固定项目不能删除" : "删除项目";
  cloudflareToggle.disabled = fixed;
  row.classList.toggle("fixed-project", fixed);
  fragment.querySelector(".row-number").textContent = project.sortOrder + 1;
  const numberSelect = fragment.querySelector(".shortcut-number");
  const platformSelect = fragment.querySelector(".shortcut-platform");
  numberSelect.value = project.shortcutNumber === null ? "" : String(project.shortcutNumber);
  numberSelect.disabled = fixed;
  if (!fixed) for (const option of numberSelect.options) if (option.value !== "" && Number(option.value) < 4) option.disabled = true;
  numberSelect.setAttribute("aria-label", project.name + "的快捷键编号");
  platformSelect.value = project.shortcutPlatform;
  platformSelect.disabled = fixed;
  platformSelect.setAttribute("aria-label", project.name + "的快捷键目标平台");
  platformSelect.querySelector('[value="cloudflare"]').disabled = !project.cloudflare;
  platformSelect.querySelector('[value="github"]').disabled = !project.github;
  fragment.querySelector(".shortcut-lock").hidden = !fixed;
  fragment.querySelector(".shortcut-display").textContent = project.shortcutNumber === null ? "未分配" : "Alt+" + project.shortcutNumber;
  fragment.querySelector(".shortcut-target-display").textContent = project.shortcutPlatform === "github" ? "GitHub Pages" : "Cloudflare";
  numberSelect.addEventListener("change", () => {
    const number = numberSelect.value === "" ? null : Number(numberSelect.value);
    const duplicate = projects.find((item) => item.id !== project.id && item.shortcutNumber === number && number !== null);
    if (duplicate) { showToast("编号 " + number + " 已分配给 " + duplicate.name + "，请先释放它的编号"); numberSelect.value = project.shortcutNumber === null ? "" : project.shortcutNumber; return; }
    if (number !== null && !project[project.shortcutPlatform]) { showToast("请先启用快捷键目标平台"); numberSelect.value = project.shortcutNumber === null ? "" : project.shortcutNumber; return; }
    project.shortcutNumber = number;
    saveProjects(); render();
  });
  platformSelect.addEventListener("change", () => { project.shortcutPlatform = platformSelect.value; saveProjects(); render(); });
  const move = (offset) => {
    const index = projects.findIndex((item) => item.id === project.id);
    const other = index + offset;
    if (other < 0 || other >= projects.length) return;
    [projects[index], projects[other]] = [projects[other], projects[index]];
    projects.forEach((item, index) => { item.sortOrder = index; });
    saveProjects(); render();
  };
  const up = fragment.querySelector(".move-up"); const down = fragment.querySelector(".move-down");
  up.disabled = project.sortOrder === 0; down.disabled = project.sortOrder === projects.length - 1;
  up.setAttribute("aria-label", "上移 " + project.name); down.setAttribute("aria-label", "下移 " + project.name);
  up.addEventListener("click", () => move(-1)); down.addEventListener("click", () => move(1));

  cloudflareLink.href = cloudflareUrl(project.name);
  cloudflareLink.hidden = !project.cloudflare;
  platformCells[0].querySelector(".platform-empty").hidden = project.cloudflare;

  githubLink.href = githubPagesUrl(project.name);
  githubLink.hidden = !project.github;
  platformCells[1].querySelector(".platform-empty").hidden = project.github;

  cloudflareToggle.checked = project.cloudflare;
  githubToggle.checked = project.github;

  input.addEventListener("input", () => {
    const caret = input.selectionStart;
    updateProjectName(project, input, error);
    monogram.textContent = getMonogram(input.value);
    window.requestAnimationFrame(() => input.setSelectionRange(caret, caret));
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && updateProjectName(project, input, error)) {
      event.preventDefault();
      setEditing(false);
    }
    if (event.key === "Escape") {
      input.value = project.name;
      input.classList.remove("invalid");
      error.textContent = "";
      setEditing(false);
    }
  });

  cloudflareToggle.addEventListener("change", () => {
    if (fixed) return;
    project.cloudflare = cloudflareToggle.checked;
    if (!project.cloudflare && project.shortcutPlatform === "cloudflare") {
      if (project.github) project.shortcutPlatform = "github";
      else project.shortcutNumber = null;
    }
    saveProjects(); render();
  });

  githubToggle.addEventListener("change", () => {
    project.github = githubToggle.checked;
    if (!project.github && project.shortcutPlatform === "github") {
      project.shortcutPlatform = "cloudflare";
      if (!project.cloudflare) project.shortcutNumber = null;
    }
    saveProjects(); render();
  });

  deleteButton.addEventListener("click", () => {
    if (fixed) return;
    const confirmed = window.confirm(`确定删除“${project.name || "未命名项目"}”吗？`);
    if (!confirmed) return;
    projects = projects.filter((candidate) => candidate.id !== project.id);
    projects.forEach((item, index) => { item.sortOrder = index; });
    saveProjects();
    render();
    showToast("项目已删除");
  });

  return fragment;
}

function render() {
  const query = normalizeName(elements.search.value);
  const visibleProjects = projects.filter((project) => project.name.includes(query));

  elements.list.replaceChildren(...visibleProjects.map(createProjectRow));
  elements.emptyState.hidden = visibleProjects.length > 0;
  updateStats();
}

function addProject() {
  const project = {
    id: makeId(),
    name: `new-project-${projects.length + 1}`,
    cloudflare: true,
    github: false,
    shortcutNumber: null,
    shortcutPlatform: "cloudflare",
    sortOrder: projects.length,
  };

  projects.push(project);
  elements.search.value = "";
  saveProjects();
  setEditing(true);

  window.requestAnimationFrame(() => {
    const input = elements.list.querySelector(`[data-project-id="${CSS.escape(project.id)}"] .project-input`);
    if (!input) return;
    input.focus();
    input.select();
    input.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function exportProjects() {
  const payload = JSON.stringify(projects, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `project-index-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("项目数据已导出");
}

async function importProjects(file) {
  try {
    const imported = sanitizeProjects(JSON.parse(await file.text()));
    projects = imported;
    saveProjects();
    elements.search.value = "";
    render();
    showToast(`已导入 ${projects.length} 个项目`);
  } catch (error) {
    window.alert(`无法导入：${error.message}`);
  } finally {
    elements.importFile.value = "";
  }
}

elements.search.addEventListener("input", render);
elements.editButton.addEventListener("click", () => {
  if (!editing) {
    setEditing(true);
    return;
  }

  const invalidInput = [...elements.list.querySelectorAll(".project-input")].find(
    (input) => !isValidName(normalizeName(input.value)),
  );
  if (invalidInput) {
    invalidInput.focus();
    showToast("请先修正无效的项目名称");
    return;
  }

  setEditing(false);
});
elements.addButton.addEventListener("click", addProject);
elements.exportButton.addEventListener("click", exportProjects);
elements.importButton.addEventListener("click", () => elements.importFile.click());
elements.importFile.addEventListener("change", () => {
  const [file] = elements.importFile.files;
  if (file) importProjects(file);
});
elements.resetButton.addEventListener("click", () => {
  const confirmed = window.confirm("确定恢复默认 6 个项目及快捷键配置吗？现有设置将被覆盖，其他网站下一次成功查询后会采用默认配置。");
  if (!confirmed) return;
  projects = cloneInitialProjects();
  saveProjects();
  elements.search.value = "";
  setEditing(false);
  showToast("已恢复初始项目");
});

document.addEventListener("keydown", (event) => {
  const activeTag = document.activeElement?.tagName;
  const isTyping = activeTag === "INPUT" || activeTag === "TEXTAREA";

  if (event.key === "/" && !isTyping) {
    event.preventDefault();
    elements.search.focus();
  }

  if (event.key === "Escape" && document.activeElement === elements.search) {
    elements.search.value = "";
    elements.search.blur();
    render();
  }
});

elements.retrySync.addEventListener("click", async () => {
  if (saveConflict) {
    if (!window.confirm("请先导出本机修改。继续将丢弃本机待同步改动，读取最新云端配置。")) return;
    localChangesPending = false; saveConflict = false; persistLocal();
  }
  if (localChangesPending && cloudRevision) await saveToCloud();
  else await syncFromCloud();
});
window.addEventListener("online", () => { if (localChangesPending) queueRemoteSave(); else void syncFromCloud(); });
window.addEventListener("beforeunload", (event) => { if (localChangesPending) { event.preventDefault(); event.returnValue = ""; } });
render();
syncFromCloud();
