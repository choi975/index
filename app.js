const STORAGE_KEY = "choi975-project-index-v1";

const INITIAL_PROJECTS = [
  { id: "badminton-level", name: "badminton-level", cloudflare: true, github: true },
  { id: "sien-day", name: "sien-day", cloudflare: true, github: true },
  { id: "todo", name: "todo", cloudflare: true, github: true },
  { id: "wenti", name: "wenti", cloudflare: true, github: true },
  { id: "xizang", name: "xizang", cloudflare: false, github: true },
];

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
};

let projects = loadProjects();
let editing = false;
let toastTimer;

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
  if (!Array.isArray(value)) throw new Error("JSON 顶层必须是项目数组");

  const seen = new Set();
  return value.map((item, index) => {
    const name = normalizeName(item?.name);
    if (!isValidName(name)) throw new Error(`第 ${index + 1} 个项目名称无效`);
    if (seen.has(name)) throw new Error(`项目名称重复：${name}`);
    seen.add(name);

    return {
      id: typeof item.id === "string" && item.id ? item.id : makeId(),
      name,
      cloudflare: Boolean(item.cloudflare),
      github: Boolean(item.github),
    };
  });
}

function loadProjects() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? sanitizeProjects(JSON.parse(stored)) : cloneInitialProjects();
  } catch (error) {
    console.warn("无法读取已保存的数据，已恢复初始项目。", error);
    return cloneInitialProjects();
  }
}

function saveProjects() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  updateStats();
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
    project.cloudflare = cloudflareToggle.checked;
    saveProjects();
  });

  githubToggle.addEventListener("change", () => {
    project.github = githubToggle.checked;
    saveProjects();
  });

  deleteButton.addEventListener("click", () => {
    const confirmed = window.confirm(`确定删除“${project.name || "未命名项目"}”吗？`);
    if (!confirmed) return;
    projects = projects.filter((candidate) => candidate.id !== project.id);
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
    cloudflare: false,
    github: false,
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
  const confirmed = window.confirm("确定恢复为最初的 6 个项目吗？当前浏览器中的修改将被覆盖。");
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

render();
