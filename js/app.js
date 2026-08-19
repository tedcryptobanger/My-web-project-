/* =========================================================
   PROJECTHUB — CLOUD + LOCAL APP CONTROLLER
   Version 3.0
   ========================================================= */

const API_BASE =
  "https://project-launcher-api.alertsvisapurchase.workers.dev";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let allProjects = [];
let currentNav = "library";
let currentCategory = "All";
let deferredInstall = null;

let selectedFiles = [];
let selectedProjectId = null;

const els = {
  grid: $("#projectGrid"),
  search: $("#searchInput"),
  cats: $("#categoryBar"),
  stats: $("#stats"),
  library: $("#libraryView"),
  add: $("#addView"),
  title: $("#pageTitle"),
  toast: $("#toast")
};

document.addEventListener("DOMContentLoaded", init);


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function init() {
  loadTheme();

  try {
    const local = await idbGetAllSafe();

    const staticProjects =
      typeof getStaticProjects === "function"
        ? getStaticProjects()
        : [];

    const cloud = await fetchCloudProjects();

    allProjects = mergeProjects(
      staticProjects,
      local,
      cloud
    );

  } catch (error) {
    console.error(error);

    try {
      const local = await idbGetAllSafe();

      const staticProjects =
        typeof getStaticProjects === "function"
          ? getStaticProjects()
          : [];

      allProjects = mergeProjects(
        staticProjects,
        local,
        []
      );
    } catch {
      allProjects =
        typeof getStaticProjects === "function"
          ? getStaticProjects()
          : [];
    }

    showToast(
      "Cloud library unavailable. Local projects are still available."
    );
  }

  renderCategories();
  render();

  bindNavigation();
  bindAddForm();
  bindUploadControls();
  bindPWA();

  window.addEventListener(
    "beforeinstallprompt",
    e => {
      e.preventDefault();
      deferredInstall = e;

      const install = $("#installBtn");

      if (install) {
        install.hidden = false;
      }
    }
  );
}


/* =========================================================
   CLOUD API
   ========================================================= */

async function apiFetch(path, options = {}) {
  const url =
    API_BASE.replace(/\/+$/, "") +
    "/" +
    String(path).replace(/^\/+/, "");

  const response = await fetch(url, {
    ...options,
    cache: "no-store"
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.error ||
      data?.message ||
      `Request failed (${response.status})`;

    throw new Error(message);
  }

  return data;
}


async function fetchCloudProjects() {
  try {
    const data =
      await apiFetch("/api/projects");

    if (!data?.ok) {
      throw new Error(
        data?.error || "Could not load cloud projects."
      );
    }

    return Array.isArray(data.projects)
      ? data.projects.map(p => ({
          ...p,
          source: "cloud"
        }))
      : [];

  } catch (error) {
    console.error(
      "Cloud project loading failed:",
      error
    );

    return [];
  }
}


/* =========================================================
   PROJECT MERGING
   ========================================================= */

function mergeProjects(...groups) {
  const map = new Map();

  for (const group of groups) {
    for (const project of group || []) {
      if (!project?.id) continue;

      map.set(
        String(project.id),
        project
      );
    }
  }

  return [...map.values()];
}


function findProject(id) {
  return allProjects.find(
    p => String(p.id) === String(id)
  );
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function bindNavigation() {
  $$(".app-shell [data-nav], .mobile-nav [data-nav]")
    .forEach(button => {
      button.onclick = () =>
        navigate(button.dataset.nav);
    });

  const addTop = $("#addTopBtn");

  if (addTop) {
    addTop.onclick = () =>
      navigate("add");
  }

  const theme = $("#themeBtn");

  if (theme) {
    theme.onclick = toggleTheme;
  }

  if (els.search) {
    els.search.oninput = render;
  }
}


function navigate(nav) {
  currentNav = nav;

  if (els.library) {
    els.library.hidden = nav === "add";
  }

  if (els.add) {
    els.add.hidden = nav !== "add";
  }

  if (els.title) {
    els.title.textContent =
      nav === "favorites"
        ? "Favorites"
        : nav === "recent"
        ? "Recently opened"
        : nav === "add"
        ? "Add project"
        : "Projects";
  }

  $$(".app-shell [data-nav], .mobile-nav [data-nav]")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.nav === nav
      );
    });

  if (nav !== "add") {
    render();
  }
}


/* =========================================================
   CATEGORIES
   ========================================================= */

function renderCategories() {
  const categories =
    typeof DEFAULT_CATEGORIES !== "undefined"
      ? DEFAULT_CATEGORIES
      : [
          "All",
          "Web Apps",
          "Tools",
          "Games",
          "Utilities",
          "Dashboards",
          "Forms",
          "Experiments",
          "Custom"
        ];

  if (!els.cats) return;

  els.cats.innerHTML =
    categories
      .map(category => `
        <button
          class="chip ${
            category === currentCategory
              ? "active"
              : ""
          }"
          data-cat="${esc(category)}"
        >
          ${esc(category)}
        </button>
      `)
      .join("");

  $$("[data-cat]").forEach(button => {
    button.onclick = () => {
      currentCategory =
        button.dataset.cat;

      renderCategories();
      render();
    };
  });
}


/* =========================================================
   RENDER LIBRARY
   ========================================================= */

function render() {
  if (!els.grid) return;

  const query =
    (els.search?.value || "")
      .trim()
      .toLowerCase();

  const favorites =
    prefsSafeGet(
      "favorites",
      []
    );

  const recent =
    prefsSafeGet(
      "recent",
      []
    );

  let list = [...allProjects];

  if (currentNav === "favorites") {
    list = list.filter(p =>
      favorites.includes(p.id)
    );
  }

  if (currentNav === "recent") {
    list = recent
      .map(id =>
        allProjects.find(
          p => p.id === id
        )
      )
      .filter(Boolean);
  }

  if (
    currentCategory !== "All" &&
    currentNav === "library"
  ) {
    list = list.filter(
      p =>
        (p.category || "Custom") ===
        currentCategory
    );
  }

  if (query) {
    list = list.filter(project => {
      const text = [
        project.name,
        project.description,
        project.category,
        ...(project.tags || [])
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(query);
    });
  }

  if (els.stats) {
    els.stats.textContent =
      `${list.length} project${
        list.length === 1 ? "" : "s"
      } • ${favorites.length} favorite${
        favorites.length === 1
          ? ""
          : "s"
      }`;
  }

  els.grid.innerHTML =
    list.length
      ? list.map(card).join("")
      : emptyState();

  bindCards();
}


function emptyState() {
  return `
    <div class="empty">
      <div>⌘</div>
      <h2>Nothing found</h2>
      <p>
        Add a project or change your filters.
      </p>
      <button
        class="primary-btn"
        id="emptyAdd"
      >
        ＋ Add project
      </button>
    </div>
  `;
}


function card(project) {
  const favorites =
    prefsSafeGet(
      "favorites",
      []
    );

  const favorite =
    favorites.includes(project.id);

  const isCloud =
    project.source === "cloud";

  const admin =
    isAdminAuthenticated();

  return `
    <article
      class="card"
      data-project-id="${esc(project.id)}"
    >

      <div class="card-top">

        <div class="project-icon">
          ${project.icon || "◇"}
        </div>

        <div style="display:flex;gap:6px;align-items:center">

          ${
            isCloud
              ? `<span
                  title="Cloud project"
                  style="
                    font-size:12px;
                    opacity:.8;
                  "
                >☁️</span>`
              : ""
          }

          <button
            class="fav ${
              favorite ? "on" : ""
            }"
            data-id="${esc(project.id)}"
            aria-label="Favorite"
          >
            ${favorite ? "★" : "☆"}
          </button>

        </div>

      </div>

      <div class="card-body">

        <div class="badge">
          ${esc(
            project.category ||
            "Custom"
          )}
        </div>

        <h3>
          ${esc(
            project.name ||
            "Untitled Project"
          )}
        </h3>

        <p>
          ${esc(
            project.description ||
            "No description"
          )}
        </p>

        <div class="meta">

          <span>
            v${esc(
              project.version ||
              "1.0.0"
            )}
          </span>

          <span>
            ${esc(
              project.dateAdded ||
              ""
            )}
          </span>

        </div>

      </div>

      <div class="card-actions">

        <button
          class="primary-small run"
          data-id="${esc(project.id)}"
        >
          ▶ Run in App
        </button>

        <button
          class="secondary-small browser"
          data-id="${esc(project.id)}"
        >
          ↗ Browser
        </button>

      </div>

      ${
        isCloud && admin
          ? `
            <div
              class="cloud-admin-actions"
              style="
                display:flex;
                gap:7px;
                padding:0 16px 16px;
                flex-wrap:wrap;
              "
            >

              <button
                class="secondary-small edit-cloud"
                data-id="${esc(project.id)}"
              >
                ✎ Edit
              </button>

              <button
                class="secondary-small update-cloud"
                data-id="${esc(project.id)}"
              >
                ↻ Update
              </button>

              <button
                class="secondary-small delete-cloud"
                data-id="${esc(project.id)}"
                style="color:#ef4444"
              >
                🗑 Delete
              </button>

            </div>
          `
          : ""
      }

    </article>
  `;
}


/* =========================================================
   CARD EVENTS
   ========================================================= */

function bindCards() {
  $("#emptyAdd")?.addEventListener(
    "click",
    () => navigate("add")
  );

  $$(".run").forEach(button => {
    button.onclick = () =>
      openViewer(
        button.dataset.id
      );
  });

  $$(".browser").forEach(button => {
    button.onclick = () =>
      openBrowser(
        button.dataset.id
      );
  });

  $$(".fav").forEach(button => {
    button.onclick = () =>
      toggleFavorite(
        button.dataset.id
      );
  });

  $$(".delete-cloud").forEach(button => {
    button.onclick = () =>
      deleteCloudProject(
        button.dataset.id
      );
  });

  $$(".update-cloud").forEach(button => {
    button.onclick = () =>
      beginCloudUpdate(
        button.dataset.id
      );
  });

  $$(".edit-cloud").forEach(button => {
    button.onclick = () =>
      beginCloudEdit(
        button.dataset.id
      );
  });
}


/* =========================================================
   RUN IN APP
   ========================================================= */

function openViewer(id) {
  const project =
    findProject(id);

  if (!project) {
    showToast(
      "Project could not be found."
    );
    return;
  }

  let recent =
    prefsSafeGet(
      "recent",
      []
    );

  recent =
    recent.filter(
      x => x !== id
    );

  recent.unshift(id);

  prefsSafeSet(
    "recent",
    recent.slice(0, 20)
  );

  location.href =
    `viewer.html?id=${encodeURIComponent(
      id
    )}`;
}


/* =========================================================
   BROWSER
   ========================================================= */

function openBrowser(id) {
  const project =
    findProject(id);

  if (!project) {
    showToast(
      "Project could not be found."
    );
    return;
  }

  let url = "";

  if (
    project.source === "cloud"
  ) {
    url =
      `${API_BASE}/projects/` +
      `${encodeURIComponent(project.id)}/` +
      `${encodeURIComponent(
        project.entryFile ||
        "index.html"
      )}`;
  } else if (
    project.source === "local"
  ) {
    showToast(
      "Local projects open in the isolated viewer."
    );

    openViewer(id);
    return;
  } else {
    url = project.path;
  }

  const win =
    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );

  if (!win) {
    showToast(
      "Popup blocked. Allow popups for this site."
    );
  }
}


/* =========================================================
   FAVORITES
   ========================================================= */

function toggleFavorite(id) {
  let favorites =
    prefsSafeGet(
      "favorites",
      []
    );

  if (
    favorites.includes(id)
  ) {
    favorites =
      favorites.filter(
        x => x !== id
      );
  } else {
    favorites.push(id);
  }

  prefsSafeSet(
    "favorites",
    favorites
  );

  render();
}


/* =========================================================
   ADD PROJECT UI
   ========================================================= */

function bindAddForm() {
  const form =
    $("#addForm");

  if (form) {
    form.onsubmit =
      saveProject;
  }

  const pastePreview =
    $("#previewPaste");

  if (pastePreview) {
    pastePreview.onclick =
      previewPaste;
  }
}


function bindUploadControls() {
  const fileButton =
    $("#fileBtn");

  const fileInput =
    $("#fileInput");

  if (fileButton && fileInput) {
    fileButton.onclick =
      () => fileInput.click();

    fileInput.onchange =
      handleFileSelection;
  }

  createAdvancedUploadControls();
}


/* =========================================================
   ADVANCED UPLOAD CONTROLS
   ========================================================= */

function createAdvancedUploadControls() {
  const form =
    $("#addForm");

  if (!form) return;

  if (
    document.getElementById(
      "cloudUploadTools"
    )
  ) {
    return;
  }

  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.id =
    "cloudUploadTools";

  wrapper.style.cssText =
    `
      margin:14px 0;
      display:grid;
      gap:10px;
    `;

  wrapper.innerHTML =
    `
      <div
        style="
          display:grid;
          grid-template-columns:
            repeat(
              auto-fit,
              minmax(140px,1fr)
            );
          gap:10px;
        "
      >

        <button
          type="button"
          class="secondary-small"
          id="chooseProjectFiles"
        >
          📄 Files
        </button>

        <button
          type="button"
          class="secondary-small"
          id="chooseProjectFolder"
        >
          📁 Folder
        </button>

        <button
          type="button"
          class="secondary-small"
          id="chooseProjectZip"
        >
          📦 ZIP
        </button>

      </div>

      <input
        id="projectFilesInput"
        type="file"
        multiple
        hidden
      >

      <input
        id="projectFolderInput"
        type="file"
        webkitdirectory
        directory
        multiple
        hidden
      >

      <input
        id="projectZipInput"
        type="file"
        accept=".zip,application/zip"
        hidden
      >

      <div
        id="selectedFilesInfo"
        style="
          font-size:13px;
          opacity:.8;
        "
      >
        No cloud files selected.
      </div>

      <div
        id="publishModeInfo"
        style="
          font-size:12px;
          opacity:.65;
        "
      >
        Publishing a project sends its files
        securely to your Cloudflare Worker,
        which stores them in R2.
      </div>
    `;

  const submit =
    form.querySelector(
      'button[type="submit"]'
    );

  if (submit) {
    form.insertBefore(
      wrapper,
      submit
    );
  } else {
    form.appendChild(
      wrapper
    );
  }

  $("#chooseProjectFiles").onclick =
    () =>
      $("#projectFilesInput").click();

  $("#chooseProjectFolder").onclick =
    () =>
      $("#projectFolderInput").click();

  $("#chooseProjectZip").onclick =
    () =>
      $("#projectZipInput").click();

  $("#projectFilesInput").onchange =
    e =>
      handleCloudFiles(
        [...e.target.files]
      );

  $("#projectFolderInput").onchange =
    e =>
      handleCloudFiles(
        [...e.target.files]
      );

  $("#projectZipInput").onchange =
    handleZipSelection;
}


/* =========================================================
   FILE SELECTION
   ========================================================= */

async function handleFileSelection(e) {
  const files =
    [...e.target.files];

  if (!files.length) {
    return;
  }

  const html =
    files.find(
      file =>
        /\.html?$/i.test(
          file.name
        )
    );

  if (html) {
    loadFileIntoForm(
      html
    );
  }

  await handleCloudFiles(
    files
  );
}


async function handleCloudFiles(files) {
  if (!files.length) {
    return;
  }

  selectedFiles =
    files.map(file => ({
      file,
      path:
        getRelativeFilePath(
          file
        )
    }));

  updateSelectedFilesInfo();

  const html =
    files.find(
      file =>
        /\.html?$/i.test(
          file.name
        )
    );

  if (
    html &&
    $("#pHtml")
  ) {
    $("#pHtml").value =
      await html.text();

    if (
      $("#pName") &&
      !$("#pName").value
    ) {
      $("#pName").value =
        html.name.replace(
          /\.html?$/i,
          ""
        );
    }
  }

  showToast(
    `${files.length} file${
      files.length === 1
        ? ""
        : "s"
    } selected.`
  );
}


function getRelativeFilePath(file) {
  return (
    file.webkitRelativePath ||
    file.name
  )
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}


/* =========================================================
   ZIP SUPPORT
   ========================================================= */

async function handleZipSelection(e) {
  const file =
    e.target.files?.[0];

  if (!file) return;

  try {
    showToast(
      "Reading ZIP..."
    );

    const JSZip =
      await loadJSZip();

    const zip =
      await JSZip.loadAsync(
        file
      );

    const files = [];

    for (
      const [path, entry]
      of Object.entries(
        zip.files
      )
    ) {
      if (
        entry.dir ||
        path.endsWith("/")
      ) {
        continue;
      }

      const blob =
        await entry.async(
          "blob"
        );

      const clean =
        path
          .replace(/\\/g, "/")
          .replace(/^\/+/, "");

      files.push({
        file:
          new File(
            [blob],
            clean.split("/").pop(),
            {
              type:
                guessMime(clean)
            }
          ),
        path: clean
      });
    }

    selectedFiles =
      files;

    updateSelectedFilesInfo();

    const html =
      files.find(
        item =>
          /\.html?$/i.test(
            item.path
          )
      );

    if (
      html &&
      $("#pHtml")
    ) {
      $("#pHtml").value =
        await html.file.text();

      if (
        $("#pName") &&
        !$("#pName").value
      ) {
        const pieces =
          html.path.split("/");

        $("#pName").value =
          pieces[
            pieces.length - 1
          ].replace(
            /\.html?$/i,
            ""
          );
      }
    }

    showToast(
      `${files.length} ZIP files loaded.`
    );

  } catch (error) {
    console.error(error);

    showToast(
      "Could not read the ZIP file."
    );
  }
}


function loadJSZip() {
  if (
    window.JSZip
  ) {
    return Promise.resolve(
      window.JSZip
    );
  }

  return new Promise(
    (resolve, reject) => {
      const script =
        document.createElement(
          "script"
        );

      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

      script.onload =
        () =>
          window.JSZip
            ? resolve(
                window.JSZip
              )
            : reject(
                new Error(
                  "JSZip failed."
                )
              );

      script.onerror =
        () =>
          reject(
            new Error(
              "Could not load ZIP library."
            )
          );

      document.head.appendChild(
        script
      );
    }
  );
}


/* =========================================================
   SELECTED FILE DISPLAY
   ========================================================= */

function updateSelectedFilesInfo() {
  const box =
    $("#selectedFilesInfo");

  if (!box) return;

  if (!selectedFiles.length) {
    box.textContent =
      "No cloud files selected.";

    return;
  }

  const preview =
    selectedFiles
      .slice(0, 8)
      .map(
        item =>
          item.path
      );

  box.innerHTML =
    `
      <strong>
        ${selectedFiles.length}
        file${
          selectedFiles.length === 1
            ? ""
            : "s"
        }
      </strong>
      selected
      <br>
      <span style="opacity:.7">
        ${preview
          .map(
            esc
          )
          .join("<br>")}
        ${
          selectedFiles.length > 8
            ? "<br>…and more"
            : ""
        }
      </span>
    `;
}


/* =========================================================
   SAVE / PUBLISH
   ========================================================= */

async function saveProject(e) {
  e.preventDefault();

  const name =
    $("#pName")?.value.trim();

  const description =
    $("#pDescription")?.value.trim();

  const category =
    $("#pCategory")?.value ||
    "Custom";

  const tags =
    ($("#pTags")?.value || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

  const html =
    $("#pHtml")?.value.trim();

  if (!name) {
    showToast(
      "Enter a project name."
    );
    return;
  }

  if (!html && !selectedFiles.length) {
    showToast(
      "Add HTML, files, a folder, or a ZIP first."
    );
    return;
  }

  /*
   * If only pasted HTML was supplied,
   * create an index.html automatically.
   */
  if (
    !selectedFiles.length &&
    html
  ) {
    selectedFiles = [
      {
        file:
          new File(
            [html],
            "index.html",
            {
              type:
                "text/html"
            }
          ),
        path:
          "index.html"
      }
    ];
  }

  /*
   * Make sure index.html exists
   * when publishing.
   */
  const hasHTML =
    selectedFiles.some(
      item =>
        /(^|\/)index\.html?$/i.test(
          item.path
        )
    );

  if (!hasHTML && html) {
    selectedFiles.unshift({
      file:
        new File(
          [html],
          "index.html",
          {
            type:
              "text/html"
          }
        ),
      path:
        "index.html"
    });
  }

  const password =
    await requestAdminPassword();

  if (!password) {
    return;
  }

  const submit =
    e.submitter ||
    $("#saveProjectBtn") ||
    $("#addForm button[type='submit']");

  if (submit) {
    submit.disabled = true;
    submit.dataset.originalText =
      submit.textContent;

    submit.textContent =
      "Publishing...";
  }

  try {
    const metadata = {
      id:
        selectedProjectId ||
        cleanProjectId(name),

      name,

      description,

      category,

      icon: "📦",

      version: "1.0.0",

      tags,

      entryFile:
        findEntryFile()
    };

    const formData =
      new FormData();

    formData.append(
      "metadata",
      JSON.stringify(
        metadata
      )
    );

    selectedFiles.forEach(
      item => {
        formData.append(
          "files",
          item.file,
          item.file.name
        );

        formData.append(
          "paths",
          item.path
        );
      }
    );

    const result =
      await apiFetch(
        "/api/projects",
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${password}`
          },

          body:
            formData
        }
      );

    if (!result?.ok) {
      throw new Error(
        result?.error ||
          "Publishing failed."
      );
    }

    saveAdminSession(
      password
    );

    showToast(
      "Project published successfully."
    );

    selectedFiles = [];
    selectedProjectId = null;

    if ($("#addForm")) {
      $("#addForm").reset();
    }

    await refreshCloudLibrary();

    navigate(
      "library"
    );

  } catch (error) {
    console.error(
      "Publish error:",
      error
    );

    showToast(
      error.message ||
        "Publishing failed."
    );

  } finally {
    if (submit) {
      submit.disabled =
        false;

      submit.textContent =
        submit.dataset.originalText ||
        "Save project";
    }
  }
}


/* =========================================================
   ENTRY FILE
   ========================================================= */

function findEntryFile() {
  const preferred =
    selectedFiles.find(
      item =>
        /^index\.html?$/i.test(
          item.path
        )
    );

  if (preferred) {
    return preferred.path;
  }

  const anyHTML =
    selectedFiles.find(
      item =>
        /\.html?$/i.test(
          item.path
        )
    );

  return (
    anyHTML?.path ||
    "index.html"
  );
}


/* =========================================================
   CLOUD UPDATE
   ========================================================= */

async function beginCloudUpdate(id) {
  const project =
    findProject(id);

  if (!project) {
    showToast(
      "Project not found."
    );
    return;
  }

  selectedProjectId =
    project.id;

  navigate("add");

  if ($("#pName")) {
    $("#pName").value =
      project.name || "";
  }

  if ($("#pDescription")) {
    $("#pDescription").value =
      project.description || "";
  }

  if ($("#pCategory")) {
    $("#pCategory").value =
      project.category || "Custom";
  }

  if ($("#pTags")) {
    $("#pTags").value =
      (
        project.tags || []
      ).join(", ");
  }

  showToast(
    "Select the updated project files, then save."
  );
}


async function beginCloudEdit(id) {
  const project =
    findProject(id);

  if (!project) {
    return;
  }

  /*
   * The full CodeSpace editor will be
   * enabled once the Worker exposes
   * authenticated file read/write
   * endpoints.
   *
   * For now, safely open the project
   * in the Add/Update workflow.
   */

  await beginCloudUpdate(
    id
  );
}


/* =========================================================
   DELETE CLOUD PROJECT
   ========================================================= */

async function deleteCloudProject(id) {
  const project =
    findProject(id);

  if (!project) {
    showToast(
      "Project not found."
    );
    return;
  }

  const confirmed =
    window.confirm(
      `Permanently delete "${project.name}"?\n\nThis removes the project record and its R2 files.`
    );

  if (!confirmed) {
    return;
  }

  const password =
    await requestAdminPassword();

  if (!password) {
    return;
  }

  try {
    await apiFetch(
      `/api/projects/${encodeURIComponent(
        id
      )}`,
      {
        method:
          "DELETE",

        headers: {
          Authorization:
            `Bearer ${password}`
        }
      }
    );

    saveAdminSession(
      password
    );

    showToast(
      "Project permanently deleted."
    );

    await refreshCloudLibrary();

  } catch (error) {
    console.error(
      error
    );

    showToast(
      error.message ||
        "Delete failed."
    );
  }
}


/* =========================================================
   REFRESH CLOUD LIBRARY
   ========================================================= */

async function refreshCloudLibrary() {
  const local =
    await idbGetAllSafe();

  const staticProjects =
    typeof getStaticProjects ===
    "function"
      ? getStaticProjects()
      : [];

  const cloud =
    await fetchCloudProjects();

  allProjects =
    mergeProjects(
      staticProjects,
      local,
      cloud
    );

  render();
}


/* =========================================================
   ADMIN AUTH
   ========================================================= */

function isAdminAuthenticated() {
  return Boolean(
    sessionStorage.getItem(
      "ph_admin_session"
    )
  );
}


function saveAdminSession(token) {
  sessionStorage.setItem(
    "ph_admin_session",
    token
  );
}


function getAdminSession() {
  return sessionStorage.getItem(
    "ph_admin_session"
  );
}


async function requestAdminPassword() {
  const existing =
    getAdminSession();

  if (existing) {
    return existing;
  }

  return new Promise(
    resolve => {
      createAdminModal(
        resolve
      );
    }
  );
}


function createAdminModal(resolve) {
  const old =
    document.getElementById(
      "phAdminModal"
    );

  if (old) {
    old.remove();
  }

  const modal =
    document.createElement(
      "div"
    );

  modal.id =
    "phAdminModal";

  modal.style.cssText =
    `
      position:fixed;
      inset:0;
      z-index:99999;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      background:rgba(0,0,0,.65);
      backdrop-filter:blur(8px);
    `;

  modal.innerHTML =
    `
      <div
        style="
          width:min(420px,100%);
          background:
            var(--card-bg,#101827);
          color:
            var(--text,#fff);
          border:
            1px solid rgba(255,255,255,.1);
          border-radius:20px;
          padding:22px;
          box-shadow:
            0 25px 80px rgba(0,0,0,.4);
        "
      >

        <div
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:10px;
          "
        >
          <div>
            <h2
              style="
                margin:0 0 5px;
              "
            >
              Admin access
            </h2>

            <p
              style="
                margin:0;
                opacity:.65;
                font-size:13px;
              "
            >
              Enter your deployment password.
            </p>
          </div>

          <button
            id="phAdminClose"
            type="button"
            style="
              border:0;
              background:transparent;
              color:inherit;
              font-size:22px;
            "
          >
            ×
          </button>

        </div>

        <input
          id="phAdminPassword"
          type="password"
          autocomplete="current-password"
          placeholder="Admin password"
          style="
            width:100%;
            box-sizing:border-box;
            margin-top:18px;
            padding:14px;
            border-radius:12px;
            border:1px solid rgba(255,255,255,.15);
            background:rgba(255,255,255,.06);
            color:inherit;
            font-size:16px;
            outline:none;
          "
        >

        <div
          style="
            display:flex;
            gap:10px;
            margin-top:14px;
          "
        >

          <button
            id="phAdminCancel"
            type="button"
            class="secondary-small"
            style="flex:1"
          >
            Cancel
          </button>

          <button
            id="phAdminContinue"
            type="button"
            class="primary-small"
            style="flex:1"
          >
            Continue
          </button>

        </div>

        <p
          style="
            margin:14px 0 0;
            font-size:11px;
            opacity:.5;
          "
        >
          Your password is used for the
          authenticated request and stored only
          for this browser session.
        </p>

      </div>
    `;

  document.body.appendChild(
    modal
  );

  const input =
    $("#phAdminPassword");

  const close =
    () => {
      modal.remove();
      resolve(null);
    };

  $("#phAdminClose").onclick =
    close;

  $("#phAdminCancel").onclick =
    close;

  $("#phAdminContinue").onclick =
    () => {
      const password =
        input.value.trim();

      if (!password) {
        input.focus();
        return;
      }

      modal.remove();
      resolve(password);
    };

  input.onkeydown =
    e => {
      if (
        e.key === "Enter"
      ) {
        $("#phAdminContinue").click();
      }

      if (
        e.key === "Escape"
      ) {
        close();
      }
    };

  setTimeout(
    () =>
      input.focus(),
    50
  );
}


/* =========================================================
   PREVIEW PASTED HTML
   ========================================================= */

function previewPaste() {
  const html =
    $("#pHtml")?.value;

  if (!html) {
    showToast(
      "Paste HTML first."
    );
    return;
  }

  const blob =
    new Blob(
      [html],
      {
        type:
          "text/html"
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const win =
    window.open(
      url,
      "_blank"
    );

  if (!win) {
    URL.revokeObjectURL(
      url
    );

    showToast(
      "Popup blocked."
    );
  }
}


/* =========================================================
   FILE LOADING
   ========================================================= */

function loadFileIntoForm(file) {
  if (!$("#pHtml")) {
    return;
  }

  const reader =
    new FileReader();

  reader.onload =
    () => {
      $("#pHtml").value =
        reader.result;

      if (
        $("#pName") &&
        !$("#pName").value
      ) {
        $("#pName").value =
          file.name.replace(
            /\.html?$/i,
            ""
          );
      }
    };

  reader.readAsText(
    file
  );
}


/* =========================================================
   THEME
   ========================================================= */

function toggleTheme() {
  const current =
    document.documentElement
      .dataset.theme;

  const next =
    current === "light"
      ? "dark"
      : "light";

  document.documentElement
    .dataset.theme =
    next;

  prefsSafeSet(
    "theme",
    next
  );
}


function loadTheme() {
  const theme =
    prefsSafeGet(
      "theme",
      "dark"
    );

  document.documentElement
    .dataset.theme =
    theme;
}


/* =========================================================
   PWA
   ========================================================= */

function bindPWA() {
  const install =
    $("#installBtn");

  if (!install) return;

  install.onclick =
    async () => {
      if (!deferredInstall) {
        showToast(
          "Install is not available yet."
        );
        return;
      }

      try {
        await deferredInstall.prompt();
      } catch {}

      deferredInstall =
        null;

      install.hidden =
        true;
    };
}


/* =========================================================
   SAFE STORAGE
   ========================================================= */

async function idbGetAllSafe() {
  if (
    typeof idbGetAll !==
    "function"
  ) {
    return [];
  }

  try {
    return await idbGetAll();
  } catch {
    return [];
  }
}


function prefsSafeGet(
  key,
  fallback
) {
  try {
    if (
      typeof prefs !==
      "undefined" &&
      prefs.get
    ) {
      return prefs.get(
        key,
        fallback
      );
    }

    const value =
      localStorage.getItem(
        "ph_" + key
      );

    return value === null
      ? fallback
      : JSON.parse(
          value
        );

  } catch {
    return fallback;
  }
}


function prefsSafeSet(
  key,
  value
) {
  try {
    if (
      typeof prefs !==
        "undefined" &&
      prefs.set
    ) {
      prefs.set(
        key,
        value
      );

      return;
    }

    localStorage.setItem(
      "ph_" + key,
      JSON.stringify(
        value
      )
    );

  } catch {}
}


/* =========================================================
   HELPERS
   ========================================================= */

function cleanProjectId(
  value
) {
  return String(
    value || ""
  )
    .toLowerCase()
    .trim()
    .replace(
      /[^a-z0-9-_]/g,
      "-"
    )
    .replace(
      /-+/g,
      "-"
    )
    .replace(
      /^-|-$/g,
      ""
    )
    .slice(
      0,
      80
    ) || "project";
}


function guessMime(path) {
  const ext =
    path
      .split(".")
      .pop()
      .toLowerCase();

  const types = {
    html:
      "text/html",
    htm:
      "text/html",
    css:
      "text/css",
    js:
      "text/javascript",
    mjs:
      "text/javascript",
    json:
      "application/json",
    png:
      "image/png",
    jpg:
      "image/jpeg",
    jpeg:
      "image/jpeg",
    gif:
      "image/gif",
    svg:
      "image/svg+xml",
    webp:
      "image/webp",
    ico:
      "image/x-icon",
    txt:
      "text/plain",
    mp3:
      "audio/mpeg",
    mp4:
      "video/mp4",
    webm:
      "video/webm",
    woff:
      "font/woff",
    woff2:
      "font/woff2",
    ttf:
      "font/ttf"
  };

  return (
    types[ext] ||
    "application/octet-stream"
  );
}


function esc(value) {
  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    char =>
      ({
        "&":
          "&amp;",
        "<":
          "&lt;",
        ">":
          "&gt;",
        '"':
          "&quot;",
        "'":
          "&#39;"
      }[char])
  );
}


function showToast(message) {
  if (!els.toast) {
    alert(message);
    return;
  }

  els.toast.textContent =
    message;

  els.toast.classList.add(
    "show"
  );

  clearTimeout(
    showToast.timer
  );

  showToast.timer =
    setTimeout(
      () =>
        els.toast.classList.remove(
          "show"
        ),
      3000
    );
}


/* =========================================================
   INITIAL DROPZONE SUPPORT
   ========================================================= */

document.addEventListener(
  "dragover",
  e => {
    const zone =
      $("#dropzone");

    if (
      zone &&
      e.target.closest(
        "#dropzone"
      )
    ) {
      e.preventDefault();
      zone.classList.add(
        "drag"
      );
    }
  }
);


document.addEventListener(
  "dragleave",
  e => {
    const zone =
      $("#dropzone");

    if (
      zone &&
      !zone.contains(
        e.relatedTarget
      )
    ) {
      zone.classList.remove(
        "drag"
      );
    }
  }
);


document.addEventListener(
  "drop",
  async e => {
    const zone =
      $("#dropzone");

    if (
      !zone ||
      !e.target.closest(
        "#dropzone"
      )
    ) {
      return;
    }

    e.preventDefault();

    zone.classList.remove(
      "drag"
    );

    const files =
      [...(
        e.dataTransfer
          ?.files || []
      )];

    if (files.length) {
      await handleCloudFiles(
        files
      );
    }
  }
);


/* =========================================================
   END
   ========================================================= */
