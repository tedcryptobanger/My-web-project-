/* =========================================================
   PROJECT LAUNCHER — CLOUD/R2 ENABLED APP.JS
   ========================================================= */

const API_BASE =
  "https://project-launcher-api.alertsvisapurchase.workers.dev";

const JSZIP_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let allProjects = [];
let currentNav = "library";
let currentCategory = "All";
let deferredInstall = null;

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
  try {
    const staticProjects = getStaticProjects();

    let localProjects = [];

    try {
      localProjects = (await idbGetAll()).map(p => ({
        ...p,
        source: "local"
      }));
    } catch {
      localProjects = [];
    }

    let cloudProjects = [];

    try {
      cloudProjects = await fetchCloudProjects();
    } catch (error) {
      console.warn("Cloud project loading failed:", error);
    }

    /*
     * Merge projects.
     * Cloud projects take priority when IDs are identical.
     */
    const merged = new Map();

    [...staticProjects, ...localProjects, ...cloudProjects]
      .forEach(project => {
        if (project?.id) {
          merged.set(project.id, project);
        }
      });

    allProjects = [...merged.values()];

  } catch (error) {
    console.error(error);

    try {
      allProjects = getStaticProjects();
    } catch {
      allProjects = [];
    }

    showToast(
      "Launcher loaded with limited storage support."
    );
  }

  renderCategories();
  render();

  bindInterface();
  loadTheme();

  /*
   * PWA install support.
   */
  window.addEventListener(
    "beforeinstallprompt",
    event => {
      event.preventDefault();
      deferredInstall = event;

      const button = $("#installBtn");

      if (button) {
        button.hidden = false;
      }
    }
  );

  const installButton = $("#installBtn");

  if (installButton) {
    installButton.onclick = async () => {
      if (!deferredInstall) return;

      await deferredInstall.prompt();
      deferredInstall = null;
      installButton.hidden = true;
    };
  }

  /*
   * Service worker.
   */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("sw.js")
      .catch(error => {
        console.warn(
          "Service worker registration failed:",
          error
        );
      });
  }

  /*
   * Make the Add Project interface more powerful.
   */
  setupCloudUploadUI();
}


/* =========================================================
   INTERFACE EVENTS
   ========================================================= */

function bindInterface() {
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

  const themeButton = $("#themeBtn");

  if (themeButton) {
    themeButton.onclick = toggleTheme;
  }

  if (els.search) {
    els.search.oninput = render;
  }

  const form = $("#addForm");

  if (form) {
    /*
     * We override the original local-storage submit
     * handler with the cloud publisher.
     */
    form.onsubmit = publishProject;
  }

  const previewPaste = $("#previewPaste");

  if (previewPaste) {
    previewPaste.onclick = previewPasteProject;
  }
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function navigate(n) {
  currentNav = n;

  if (els.library) {
    els.library.hidden = n === "add";
  }

  if (els.add) {
    els.add.hidden = n !== "add";
  }

  if (els.title) {
    els.title.textContent =
      n === "favorites"
        ? "Favorites"
        : n === "recent"
        ? "Recently opened"
        : n === "add"
        ? "Add project"
        : "Projects";
  }

  $$(".app-shell [data-nav], .mobile-nav [data-nav]")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.nav === n
      );
    });

  if (n !== "add") {
    render();
  }
}


/* =========================================================
   CATEGORIES
   ========================================================= */

function renderCategories() {
  if (!els.cats) return;

  els.cats.innerHTML =
    DEFAULT_CATEGORIES
      .map(category => `
        <button
          class="chip ${category === currentCategory ? "active" : ""}"
          data-cat="${esc(category)}"
          type="button"
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
   RENDER PROJECT LIBRARY
   ========================================================= */

function render() {
  if (!els.grid) return;

  const query =
    (els.search?.value || "")
      .trim()
      .toLowerCase();

  const favorites =
    prefs.get("favorites", []);

  const recent =
    prefs.get("recent", []);

  let list = allProjects.filter(project => {
    if (currentNav === "favorites") {
      return favorites.includes(project.id);
    }

    if (currentNav === "recent") {
      return recent.includes(project.id);
    }

    return true;
  });

  if (
    currentCategory !== "All" &&
    currentNav === "library"
  ) {
    list = list.filter(
      project =>
        project.category === currentCategory
    );
  }

  if (query) {
    list = list.filter(project => {
      const searchable = [
        project.name,
        project.description,
        project.category,
        ...(project.tags || [])
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }

  if (els.stats) {
    els.stats.textContent =
      `${list.length} project${list.length === 1 ? "" : "s"} • ` +
      `${favorites.length} favorite${favorites.length === 1 ? "" : "s"}`;
  }

  els.grid.innerHTML =
    list.length
      ? list.map(card).join("")
      : `
        <div class="empty">
          <div>⌘</div>
          <h2>Nothing found</h2>
          <p>Add a project or change your filters.</p>
          <button
            class="primary-btn"
            id="emptyAdd"
            type="button"
          >
            ＋ Add project
          </button>
        </div>
      `;

  $("#emptyAdd")?.addEventListener(
    "click",
    () => navigate("add")
  );

  $$(".run").forEach(button => {
    button.onclick = () =>
      openViewer(button.dataset.id);
  });

  $$(".browser").forEach(button => {
    button.onclick = () =>
      openBrowser(button.dataset.id);
  });

  $$(".fav").forEach(button => {
    button.onclick = () =>
      toggleFav(button.dataset.id);
  });
}


/* =========================================================
   PROJECT CARD
   ========================================================= */

function card(project) {
  const favorite =
    prefs.get("favorites", [])
      .includes(project.id);

  const sourceLabel =
    project.source === "cloud"
      ? "Cloud"
      : project.source === "static"
      ? "Built-in"
      : "Local";

  return `
    <article class="card">

      <div class="card-top">

        <div class="project-icon">
          ${project.icon || "◇"}
        </div>

        <button
          class="fav ${favorite ? "on" : ""}"
          data-id="${esc(project.id)}"
          type="button"
          aria-label="Favorite"
        >
          ${favorite ? "★" : "☆"}
        </button>

      </div>

      <div class="card-body">

        <div class="badge">
          ${esc(project.category || "Custom")}
        </div>

        <h3>
          ${esc(project.name || "Untitled Project")}
        </h3>

        <p>
          ${esc(
            project.description ||
            "No description"
          )}
        </p>

        <div class="meta">

          <span>
            v${esc(project.version || "1.0.0")}
          </span>

          <span>
            ${esc(project.dateAdded || "")}
          </span>

          <span>
            ${sourceLabel}
          </span>

        </div>

      </div>

      <div class="card-actions">

        <button
          class="primary-small run"
          data-id="${esc(project.id)}"
          type="button"
        >
          ▶ Run in App
        </button>

        <button
          class="secondary-small browser"
          data-id="${esc(project.id)}"
          type="button"
        >
          ↗ Browser
        </button>

      </div>

    </article>
  `;
}


/* =========================================================
   PROJECT LOOKUP
   ========================================================= */

function findProject(id) {
  return allProjects.find(
    project => project.id === id
  );
}


/* =========================================================
   RUN PROJECT
   ========================================================= */

function openViewer(id) {
  if (!findProject(id)) return;

  let recent =
    prefs.get("recent", [])
      .filter(existing => existing !== id);

  recent.unshift(id);

  prefs.set(
    "recent",
    recent.slice(0, 20)
  );

  location.href =
    `viewer.html?id=${encodeURIComponent(id)}`;
}


/* =========================================================
   OPEN IN BROWSER
   ========================================================= */

function openBrowser(id) {
  const project = findProject(id);

  if (!project) return;

  /*
   * Cloud projects are served directly by Worker/R2.
   */
  if (project.source === "cloud") {
    const url =
      project.path ||
      `${API_BASE}/projects/${encodeURIComponent(project.id)}/${encodeURIComponent(project.entryFile || "index.html")}`;

    const opened =
      window.open(
        url,
        "_blank",
        "noopener,noreferrer"
      );

    if (!opened) {
      showToast(
        "Popup blocked. Allow popups for this site."
      );
    }

    return;
  }

  /*
   * Static projects.
   */
  if (project.source === "static") {
    const opened =
      window.open(
        project.path,
        "_blank",
        "noopener,noreferrer"
      );

    if (!opened) {
      showToast(
        "Popup blocked. Allow popups for this site."
      );
    }

    return;
  }

  /*
   * Browser-local projects stay inside the
   * isolated viewer.
   */
  showToast(
    "Local projects stay in the isolated viewer."
  );

  openViewer(id);
}


/* =========================================================
   FAVORITES
   ========================================================= */

function toggleFav(id) {
  let favorites =
    prefs.get("favorites", []);

  favorites =
    favorites.includes(id)
      ? favorites.filter(x => x !== id)
      : [...favorites, id];

  prefs.set(
    "favorites",
    favorites
  );

  render();
}


/* =========================================================
   CLOUD PROJECT API
   ========================================================= */

async function fetchCloudProjects() {
  const response =
    await fetch(
      `${API_BASE}/api/projects`,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );

  if (!response.ok) {
    throw new Error(
      `API returned HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  if (!data.ok) {
    throw new Error(
      data.error ||
      "Unable to load cloud projects."
    );
  }

  return (data.projects || []).map(project => ({
    ...project,
    source: "cloud",

    path:
      `${API_BASE}/projects/` +
      `${encodeURIComponent(project.id)}/` +
      `${encodeURIComponent(project.entryFile || "index.html")}`
  }));
}


/* =========================================================
   CLOUD UPLOAD UI
   ========================================================= */

function setupCloudUploadUI() {
  const form = $("#addForm");

  if (!form) return;

  /*
   * Do not destroy the existing HTML form.
   * We enhance it by inserting the cloud uploader
   * immediately before the HTML code field.
   */

  if ($("#cloudUploader")) {
    return;
  }

  const htmlField =
    $("#pHtml")?.closest(
      ".form-group, .field, .input-group"
    );

  const uploader =
    document.createElement("div");

  uploader.id = "cloudUploader";

  uploader.style.cssText = `
    margin:18px 0;
    padding:18px;
    border:1px solid rgba(100,140,200,.35);
    border-radius:16px;
    background:rgba(20,35,60,.35);
  `;

  uploader.innerHTML = `
    <div style="
      font-weight:700;
      font-size:16px;
      margin-bottom:8px;
    ">
      Publish project to Cloud
    </div>

    <div style="
      opacity:.75;
      font-size:13px;
      line-height:1.5;
      margin-bottom:14px;
    ">
      Select a complete ZIP, an entire project folder,
      or a single HTML file. All files and folder paths
      will be uploaded to Cloudflare R2.
    </div>

    <div style="
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      margin-bottom:12px;
    ">

      <button
        id="chooseZipBtn"
        type="button"
        class="secondary-small"
      >
        📦 Choose ZIP
      </button>

      <button
        id="chooseFolderBtn"
        type="button"
        class="secondary-small"
      >
        📁 Choose Folder
      </button>

      <button
        id="chooseHtmlBtn"
        type="button"
        class="secondary-small"
      >
        📄 Choose HTML
      </button>

    </div>

    <input
      id="zipInput"
      type="file"
      accept=".zip,application/zip"
      hidden
    >

    <input
      id="folderInput"
      type="file"
      webkitdirectory
      directory
      multiple
      hidden
    >

    <input
      id="cloudHtmlInput"
      type="file"
      accept=".html,.htm,text/html"
      hidden
    >

    <div
      id="selectedFiles"
      style="
        font-size:13px;
        opacity:.8;
        margin-top:8px;
      "
    >
      No cloud files selected.
    </div>

    <div style="
      margin-top:14px;
    ">

      <label style="
        display:block;
        font-size:13px;
        margin-bottom:6px;
      ">
        Admin publishing token
      </label>

      <input
        id="adminTokenInput"
        type="password"
        autocomplete="off"
        placeholder="Enter your Cloudflare ADMIN_TOKEN"
        style="
          width:100%;
          box-sizing:border-box;
          padding:12px;
          border-radius:10px;
          border:1px solid rgba(120,150,190,.35);
          background:rgba(0,0,0,.2);
          color:inherit;
        "
      >

      <div style="
        font-size:11px;
        opacity:.6;
        margin-top:5px;
      ">
        Kept only in this browser session. It is not
        included in your GitHub source code.
      </div>

    </div>

    <div
      id="uploadStatus"
      style="
        display:none;
        margin-top:12px;
        font-size:13px;
      "
    ></div>
  `;

  /*
   * Insert before the HTML field if possible.
   */
  if (htmlField) {
    form.insertBefore(
      uploader,
      htmlField
    );
  } else {
    form.prepend(uploader);
  }

  $("#chooseZipBtn").onclick =
    () => $("#zipInput").click();

  $("#chooseFolderBtn").onclick =
    () => $("#folderInput").click();

  $("#chooseHtmlBtn").onclick =
    () => $("#cloudHtmlInput").click();

  $("#zipInput").onchange =
    handleZipSelection;

  $("#folderInput").onchange =
    handleFolderSelection;

  $("#cloudHtmlInput").onchange =
    handleHtmlSelection;

  /*
   * Restore token for this browser tab/session.
   */
  const savedToken =
    sessionStorage.getItem(
      "projecthub_admin_token"
    );

  if (savedToken) {
    $("#adminTokenInput").value =
      savedToken;
  }
}


/* =========================================================
   SELECTED CLOUD FILES
   ========================================================= */

let cloudFiles = [];


/* =========================================================
   ZIP
   ========================================================= */

async function handleZipSelection(event) {
  const file =
    event.target.files?.[0];

  if (!file) return;

  try {
    setUploadStatus(
      "Reading ZIP file..."
    );

    await loadJSZip();

    const zip =
      await window.JSZip.loadAsync(file);

    const extracted = [];

    const entries =
      Object.values(zip.files);

    for (const entry of entries) {
      if (entry.dir) continue;

      const path =
        cleanClientPath(
          entry.name
        );

      if (!path) continue;

      const blob =
        await entry.async("blob");

      const outputFile =
        new File(
          [blob],
          getFileName(path),
          {
            type:
              guessMimeType(path)
          }
        );

      extracted.push({
        file: outputFile,
        path
      });
    }

    if (!extracted.length) {
      setUploadStatus(
        "The ZIP does not contain usable files.",
        true
      );

      return;
    }

    cloudFiles = extracted;

    /*
     * Try to detect project name from ZIP.
     */
    const firstTopFolder =
      getCommonTopFolder(
        extracted.map(x => x.path)
      );

    if (
      firstTopFolder &&
      !$("#pName").value.trim()
    ) {
      $("#pName").value =
        firstTopFolder;
    }

    updateSelectedFiles();

    setUploadStatus(
      `${cloudFiles.length} file(s) loaded from ZIP.`
    );

  } catch (error) {
    console.error(error);

    cloudFiles = [];

    setUploadStatus(
      "Could not read ZIP: " +
      (error.message || error),
      true
    );
  }
}


/* =========================================================
   FOLDER
   ========================================================= */

function handleFolderSelection(event) {
  const files =
    [...(event.target.files || [])];

  if (!files.length) return;

  cloudFiles =
    files
      .map(file => ({
        file,
        path:
          cleanClientPath(
            file.webkitRelativePath ||
            file.name
          )
      }))
      .filter(item => item.path);

  const topFolder =
    getCommonTopFolder(
      cloudFiles.map(
        item => item.path
      )
    );

  if (
    topFolder &&
    !$("#pName").value.trim()
  ) {
    $("#pName").value =
      topFolder;
  }

  updateSelectedFiles();

  setUploadStatus(
    `${cloudFiles.length} file(s) selected from folder.`
  );
}


/* =========================================================
   SINGLE HTML
   ========================================================= */

async function handleHtmlSelection(event) {
  const file =
    event.target.files?.[0];

  if (!file) return;

  cloudFiles = [
    {
      file,
      path: "index.html"
    }
  ];

  if (!$("#pName").value.trim()) {
    $("#pName").value =
      file.name
        .replace(/\.html?$/i, "");
  }

  /*
   * Also populate the old HTML textarea,
   * if the existing interface has one.
   */
  try {
    const html =
      await file.text();

    if ($("#pHtml")) {
      $("#pHtml").value =
        html;
    }
  } catch {}

  updateSelectedFiles();

  setUploadStatus(
    "1 HTML file selected."
  );
}


/* =========================================================
   UPLOAD STATUS
   ========================================================= */

function setUploadStatus(message, error = false) {
  const element =
    $("#uploadStatus");

  if (!element) return;

  element.style.display =
    "block";

  element.style.color =
    error
      ? "#ff7b7b"
      : "inherit";

  element.textContent =
    message;
}


/* =========================================================
   FILE SUMMARY
   ========================================================= */

function updateSelectedFiles() {
  const element =
    $("#selectedFiles");

  if (!element) return;

  if (!cloudFiles.length) {
    element.textContent =
      "No cloud files selected.";

    return;
  }

  const preview =
    cloudFiles
      .slice(0, 8)
      .map(item => item.path)
      .join("\n");

  element.textContent =
    cloudFiles.length > 8
      ? `${cloudFiles.length} files selected.\n${preview}\n...`
      : `${cloudFiles.length} files selected.\n${preview}`;

  element.style.whiteSpace =
    "pre-line";
}


/* =========================================================
   PUBLISH PROJECT
   ========================================================= */

async function publishProject(event) {
  event.preventDefault();

  /*
   * If the user has not selected a ZIP/folder,
   * fall back to the old HTML textarea.
   */
  if (!cloudFiles.length) {
    const html =
      $("#pHtml")?.value.trim();

    if (html) {
      cloudFiles = [
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
          path: "index.html"
        }
      ];
    }
  }

  if (!cloudFiles.length) {
    showToast(
      "Choose a ZIP, folder, or HTML file first."
    );

    setUploadStatus(
      "No project files selected.",
      true
    );

    return;
  }

  const name =
    $("#pName")?.value.trim();

  if (!name) {
    showToast(
      "Enter a project name."
    );

    $("#pName")?.focus();

    return;
  }

  const token =
    $("#adminTokenInput")?.value.trim();

  if (!token) {
    showToast(
      "Enter your admin publishing token."
    );

    $("#adminTokenInput")?.focus();

    return;
  }

  /*
   * Keep token only for this browser session.
   */
  try {
    sessionStorage.setItem(
      "projecthub_admin_token",
      token
    );
  } catch {}

  const id =
    makeProjectId(name);

  const description =
    $("#pDescription")?.value.trim() ||
    "";

  const category =
    $("#pCategory")?.value ||
    "Custom";

  const tags =
    ($("#pTags")?.value || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean)
      .slice(0, 30);

  /*
   * Determine index.html.
   */
  const entryFile =
    findEntryFile(cloudFiles);

  if (!entryFile) {
    showToast(
      "Your project needs an index.html file."
    );

    setUploadStatus(
      "No index.html was found.",
      true
    );

    return;
  }

  const metadata = {
    id,
    name,
    description,
    category,
    icon: "🚀",
    version: "1.0.0",
    tags,
    entryFile
  };

  const formData =
    new FormData();

  formData.append(
    "metadata",
    JSON.stringify(metadata)
  );

  /*
   * IMPORTANT:
   *
   * Your Worker expects:
   *
   * files = uploaded File objects
   * paths = corresponding relative paths
   */
  for (const item of cloudFiles) {
    formData.append(
      "files",
      item.file,
      getFileName(item.path)
    );

    formData.append(
      "paths",
      item.path
    );
  }

  const saveButton =
    $("#addForm button[type='submit']");

  const originalText =
    saveButton?.textContent;

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent =
      "Publishing...";
  }

  setUploadStatus(
    `Uploading ${cloudFiles.length} file(s) to Cloudflare R2...`
  );

  try {
    const response =
      await fetch(
        `${API_BASE}/api/projects`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${token}`
          },

          body: formData
        }
      );

    const text =
      await response.text();

    let data;

    try {
      data =
        JSON.parse(text);
    } catch {
      data = {
        ok: false,
        error: text ||
          `HTTP ${response.status}`
      };
    }

    if (!response.ok || !data.ok) {
      if (response.status === 401) {
        throw new Error(
          "Unauthorized. Check your ADMIN_TOKEN."
        );
      }

      throw new Error(
        data.message ||
        data.error ||
        `Publishing failed (HTTP ${response.status}).`
      );
    }

    /*
     * Successfully published.
     */
    showToast(
      "Project published successfully!"
    );

    setUploadStatus(
      `Published successfully — ${data.project?.files || cloudFiles.length} file(s) uploaded to R2.`
    );

    /*
     * Clear local file selection.
     */
    cloudFiles = [];

    updateSelectedFiles();

    /*
     * Reload cloud projects.
     */
    try {
      const cloudProjects =
        await fetchCloudProjects();

      const map =
        new Map(
          allProjects.map(
            project => [
              project.id,
              project
            ]
          )
        );

      cloudProjects.forEach(
        project => {
          map.set(
            project.id,
            project
          );
        }
      );

      allProjects =
        [...map.values()];

    } catch (error) {
      console.warn(
        "Could not refresh cloud projects:",
        error
      );
    }

    /*
     * Reset form after successful publication.
     */
    const form =
      $("#addForm");

    if (form) {
      /*
       * Don't clear token.
       * The user may publish another project.
       */
      const currentToken =
        $("#adminTokenInput")?.value || "";

      form.reset();

      if ($("#adminTokenInput")) {
        $("#adminTokenInput").value =
          currentToken;
      }
    }

    /*
     * Go back to library.
     */
    navigate("library");

    render();

  } catch (error) {
    console.error(
      "Publish error:",
      error
    );

    const message =
      error?.message ||
      String(error);

    /*
     * This gives useful errors instead of
     * the generic "Failed to fetch".
     */
    if (
      message.toLowerCase()
        .includes("failed to fetch")
    ) {
      setUploadStatus(
        "Could not connect to the Cloudflare Worker. Check your internet connection or API URL.",
        true
      );

      showToast(
        "Could not connect to Cloudflare."
      );
    } else {
      setUploadStatus(
        message,
        true
      );

      showToast(
        message
      );
    }

  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent =
        originalText ||
        "Save project";
    }
  }
}


/* =========================================================
   ENTRY FILE
   ========================================================= */

function findEntryFile(files) {
  const exact =
    files.find(
      item =>
        item.path.toLowerCase() ===
        "index.html"
    );

  if (exact) {
    return exact.path;
  }

  const nested =
    files.find(
      item =>
        item.path
          .toLowerCase()
          .endsWith("/index.html")
    );

  if (nested) {
    return nested.path;
  }

  return null;
}


/* =========================================================
   PROJECT ID
   ========================================================= */

function makeProjectId(name) {
  return String(name || "project")
    .toLowerCase()
    .trim()
    .replace(
      /[^a-z0-9-_]+/g,
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
    .slice(0, 70)
    || `project-${Date.now()}`;
}


/* =========================================================
   PATH CLEANING
   ========================================================= */

function cleanClientPath(value) {
  let path =
    String(value || "")
      .replace(/\\/g, "/")
      .trim();

  path =
    path
      .split("/")
      .filter(
        part =>
          part &&
          part !== "." &&
          part !== ".."
      )
      .join("/");

  if (!path) {
    return "";
  }

  if (
    path.startsWith("/") ||
    path.includes("\0")
  ) {
    return "";
  }

  return path.slice(0, 300);
}


/* =========================================================
   FILE HELPERS
   ========================================================= */

function getFileName(path) {
  return String(path)
    .split("/")
    .pop();
}


function guessMimeType(path) {
  const extension =
    String(path)
      .split(".")
      .pop()
      .toLowerCase();

  const types = {
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "text/javascript",
    mjs: "text/javascript",
    json: "application/json",
    xml: "application/xml",

    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    ico: "image/x-icon",

    mp3: "audio/mpeg",
    mp4: "video/mp4",
    webm: "video/webm",

    pdf: "application/pdf",

    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf"
  };

  return (
    types[extension] ||
    "application/octet-stream"
  );
}


/* =========================================================
   COMMON FOLDER
   ========================================================= */

function getCommonTopFolder(paths) {
  if (!paths.length) {
    return "";
  }

  const first =
    paths[0].split("/");

  if (first.length <= 1) {
    return "";
  }

  const candidate =
    first[0];

  if (
    paths.every(
      path =>
        path.startsWith(
          candidate + "/"
        )
    )
  ) {
    return candidate;
  }

  return "";
}


/* =========================================================
   JSZIP LOADER
   ========================================================= */

let jsZipPromise = null;

function loadJSZip() {
  if (
    window.JSZip
  ) {
    return Promise.resolve(
      window.JSZip
    );
  }

  if (jsZipPromise) {
    return jsZipPromise;
  }

  jsZipPromise =
    new Promise(
      (resolve, reject) => {
        const script =
          document.createElement(
            "script"
          );

        script.src =
          JSZIP_URL;

        script.onload =
          () => {
            if (window.JSZip) {
              resolve(
                window.JSZip
              );
            } else {
              reject(
                new Error(
                  "JSZip loaded but is unavailable."
                )
              );
            }
          };

        script.onerror =
          () => reject(
            new Error(
              "Could not load ZIP support. Check your internet connection."
            )
          );

        document.head.appendChild(
          script
        );
      }
    );

  return jsZipPromise;
}


/* =========================================================
   HTML PREVIEW
   ========================================================= */

function previewPasteProject() {
  const html =
    $("#pHtml")?.value;

  if (!html) {
    showToast(
      "Paste HTML first."
    );

    return;
  }

  const popup =
    window.open(
      "",
      "_blank"
    );

  if (!popup) {
    showToast(
      "Popup blocked."
    );

    return;
  }

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}


/* =========================================================
   THEME
   ========================================================= */

function toggleTheme() {
  const theme =
    document.documentElement
      .dataset.theme === "light"
      ? "dark"
      : "light";

  document.documentElement
    .dataset.theme =
    theme;

  prefs.set(
    "theme",
    theme
  );
}


function loadTheme() {
  document.documentElement
    .dataset.theme =
    prefs.get(
      "theme",
      "dark"
    );
}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(message) {
  if (!els.toast) return;

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
      () => {
        els.toast.classList.remove(
          "show"
        );
      },
      3000
    );
}


/* =========================================================
   HTML ESCAPE
   ========================================================= */

function esc(value) {
  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character]
  );
}
