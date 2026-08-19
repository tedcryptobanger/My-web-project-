const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/*
 * =========================================================
 * CLOUDFLARE API
 * =========================================================
 *
 * Your Worker URL from your screenshot:
 * https://project-launcher-api.alertsvisapurchase.workers.dev
 *
 * If your Worker URL is different, change it here.
 */

const API_BASE = "https://project-launcher-api.alertsvisapurchase.workers.dev";

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
   INITIALIZE
   ========================================================= */

async function init() {

  try {

    const cloudProjects = await fetchCloudProjects();

    let localProjects = [];

    try {
      localProjects =
        (await idbGetAll()).map(p => ({
          ...p,
          source: "local"
        }));
    } catch {}

    /*
     * Static demo + cloud + local
     *
     * Cloud projects take priority over duplicates.
     */

    const combined = [
      ...getStaticProjects(),
      ...cloudProjects,
      ...localProjects
    ];

    const unique = new Map();

    combined.forEach(project => {
      unique.set(project.id, project);
    });

    allProjects = [...unique.values()];

  } catch (error) {

    console.error(error);

    try {
      allProjects = [
        ...getStaticProjects(),
        ...(await idbGetAll()).map(p => ({
          ...p,
          source: "local"
        }))
      ];
    } catch {
      allProjects = getStaticProjects();
    }

    showToast(
      "Cloud API unavailable. Showing local projects."
    );
  }

  renderCategories();
  render();

  bindEvents();

  loadTheme();

  /*
   * PWA installation
   */

  window.addEventListener(
    "beforeinstallprompt",
    e => {
      e.preventDefault();
      deferredInstall = e;

      const installBtn = $("#installBtn");

      if (installBtn) {
        installBtn.hidden = false;
      }
    }
  );

  const installBtn = $("#installBtn");

  if (installBtn) {

    installBtn.onclick = async () => {

      if (!deferredInstall) return;

      await deferredInstall.prompt();

      deferredInstall = null;
    };
  }

  /*
   * Service worker
   */

  if ("serviceWorker" in navigator) {

    navigator.serviceWorker
      .register("sw.js")
      .catch(() => {});
  }
}


/* =========================================================
   EVENTS
   ========================================================= */

function bindEvents() {

  $$(".app-shell [data-nav], .mobile-nav [data-nav]")
    .forEach(button => {

      button.onclick = () =>
        navigate(button.dataset.nav);

    });

  const addTopBtn = $("#addTopBtn");

  if (addTopBtn) {
    addTopBtn.onclick = () =>
      navigate("add");
  }

  const themeBtn = $("#themeBtn");

  if (themeBtn) {
    themeBtn.onclick = toggleTheme;
  }

  if (els.search) {
    els.search.oninput = render;
  }

  const addForm = $("#addForm");

  if (addForm) {
    addForm.onsubmit = saveProject;
  }

  const fileBtn = $("#fileBtn");

  if (fileBtn) {
    fileBtn.onclick = () =>
      $("#fileInput")?.click();
  }

  const fileInput = $("#fileInput");

  if (fileInput) {
    fileInput.onchange = readFile;
  }

  const dropzone = $("#dropzone");

  if (dropzone) {

    dropzone.ondragover = e => {

      e.preventDefault();

      dropzone.classList.add("drag");
    };

    dropzone.ondragleave = () => {

      dropzone.classList.remove("drag");
    };

    dropzone.ondrop = readDrop;
  }

  const previewPasteBtn = $("#previewPaste");

  if (previewPasteBtn) {
    previewPasteBtn.onclick = previewPaste;
  }
}


/* =========================================================
   CLOUD API
   ========================================================= */

async function fetchCloudProjects() {

  const response =
    await fetch(`${API_BASE}/api/projects`, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

  if (!response.ok) {

    throw new Error(
      `Cloud API returned ${response.status}`
    );
  }

  const data = await response.json();

  if (!data.ok) {

    throw new Error(
      data.error || "Could not load projects"
    );
  }

  return Array.isArray(data.projects)
    ? data.projects
    : [];
}


/* =========================================================
   ADMIN TOKEN
   ========================================================= */

function getAdminToken() {

  return sessionStorage.getItem(
    "projecthub_admin_token"
  ) || "";
}


function setAdminToken(token) {

  sessionStorage.setItem(
    "projecthub_admin_token",
    token
  );
}


function clearAdminToken() {

  sessionStorage.removeItem(
    "projecthub_admin_token"
  );
}


/*
 * Ask for the Cloudflare ADMIN_TOKEN only when
 * a publish operation requires it.
 *
 * It is stored in sessionStorage, not permanently
 * in localStorage.
 */

function requestAdminToken() {

  const token = prompt(
    "Enter your Project Launcher ADMIN_TOKEN:"
  );

  if (!token) {
    return "";
  }

  setAdminToken(token.trim());

  return token.trim();
}


/* =========================================================
   PUBLISH TO CLOUDFLARE
   ========================================================= */

async function publishProject(project) {

  let token = getAdminToken();

  if (!token) {

    token = requestAdminToken();

    if (!token) {
      throw new Error(
        "Publishing cancelled."
      );
    }
  }

  const form = new FormData();

  /*
   * Metadata expected by your Worker.
   */

  form.append(
    "metadata",
    JSON.stringify({
      id: project.id,
      name: project.name,
      description: project.description,
      category: project.category,
      icon: project.icon,
      version: project.version,
      tags: project.tags,
      entryFile: "index.html"
    })
  );

  /*
   * HTML file
   */

  const htmlBlob = new Blob(
    [project.html],
    {
      type: "text/html"
    }
  );

  form.append(
    "files",
    htmlBlob,
    "index.html"
  );

  form.append(
    "paths",
    "index.html"
  );

  let response = await fetch(
    `${API_BASE}/api/projects`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`
      },
      body: form
    }
  );

  /*
   * If token is wrong, remove it and allow one retry.
   */

  if (response.status === 401) {

    clearAdminToken();

    token = requestAdminToken();

    if (!token) {
      throw new Error(
        "Authorization required."
      );
    }

    response = await fetch(
      `${API_BASE}/api/projects`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: form
      }
    );
  }

  const data = await response.json();

  if (!response.ok || !data.ok) {

    throw new Error(
      data.error ||
      data.message ||
      `Publish failed (${response.status})`
    );
  }

  return data;
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
      .map(category => {

        return `
          <button
            class="chip ${category === currentCategory ? "active" : ""}"
            data-cat="${esc(category)}"
          >
            ${esc(category)}
          </button>
        `;

      })
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
   RENDER PROJECTS
   ========================================================= */

function render() {

  if (!els.grid) return;

  const q =
    els.search?.value
      ?.trim()
      .toLowerCase() || "";

  const fav =
    prefs.get("favorites", []);

  const recent =
    prefs.get("recent", []);

  let list =
    allProjects.filter(project => {

      if (currentNav === "favorites") {

        return fav.includes(project.id);
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

    list =
      list.filter(
        project =>
          project.category === currentCategory
      );
  }


  if (q) {

    list =
      list.filter(project => {

        return [
          project.name,
          project.description,
          project.category,
          ...(project.tags || [])
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);

      });
  }


  if (els.stats) {

    els.stats.textContent =
      `${list.length} project${list.length === 1 ? "" : "s"} • ` +
      `${fav.length} favorite${fav.length === 1 ? "" : "s"}`;
  }


  els.grid.innerHTML =
    list.length
      ? list.map(card).join("")
      : `
        <div class="empty">
          <div>⌘</div>
          <h2>Nothing found</h2>
          <p>Add a project or change your filters.</p>
          <button class="primary-btn" id="emptyAdd">
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
   CARD
   ========================================================= */

function card(p) {

  const fav =
    prefs
      .get("favorites", [])
      .includes(p.id);

  return `
    <article class="card">

      <div class="card-top">

        <div class="project-icon">
          ${p.icon || "◇"}
        </div>

        <button
          class="fav ${fav ? "on" : ""}"
          data-id="${esc(p.id)}"
        >
          ${fav ? "★" : "☆"}
        </button>

      </div>

      <div class="card-body">

        <div class="badge">
          ${esc(p.category || "Custom")}
        </div>

        <h3>
          ${esc(p.name)}
        </h3>

        <p>
          ${esc(
            p.description ||
            "No description"
          )}
        </p>

        <div class="meta">

          <span>
            v${esc(p.version || "1.0.0")}
          </span>

          <span>
            ${esc(p.dateAdded || "")}
          </span>

        </div>

      </div>

      <div class="card-actions">

        <button
          class="primary-small run"
          data-id="${esc(p.id)}"
        >
          ▶ Run in App
        </button>

        <button
          class="secondary-small browser"
          data-id="${esc(p.id)}"
        >
          ↗ Browser
        </button>

      </div>

    </article>
  `;
}


/* =========================================================
   FIND PROJECT
   ========================================================= */

function findProject(id) {

  return allProjects.find(
    p => p.id === id
  );
}


/* =========================================================
   OPEN VIEWER
   ========================================================= */

function openViewer(id) {

  if (!findProject(id)) return;

  let recent =
    prefs.get("recent", [])
      .filter(x => x !== id);

  recent.unshift(id);

  prefs.set(
    "recent",
    recent.slice(0, 20)
  );

  location.href =
    `viewer.html?id=${encodeURIComponent(id)}`;
}


/* =========================================================
   OPEN BROWSER
   ========================================================= */

function openBrowser(id) {

  const project =
    findProject(id);

  if (!project) return;


  /*
   * CLOUD PROJECT
   */

  if (project.source === "cloud") {

    const entry =
      project.entryFile ||
      "index.html";

    const url =
      `${API_BASE}/projects/` +
      `${encodeURIComponent(project.id)}/` +
      `${entry
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;

    const w =
      window.open(
        url,
        "_blank",
        "noopener,noreferrer"
      );

    if (!w) {

      showToast(
        "Popup blocked. Allow popups for this site."
      );
    }

    return;
  }


  /*
   * LOCAL PROJECT
   */

  if (project.source === "local") {

    showToast(
      "Local projects stay in the isolated viewer."
    );

    openViewer(id);

    return;
  }


  /*
   * STATIC PROJECT
   */

  const w =
    window.open(
      project.path,
      "_blank",
      "noopener,noreferrer"
    );

  if (!w) {

    showToast(
      "Popup blocked. Allow popups for this site."
    );
  }
}


/* =========================================================
   FAVORITES
   ========================================================= */

function toggleFav(id) {

  let a =
    prefs.get(
      "favorites",
      []
    );

  a =
    a.includes(id)
      ? a.filter(x => x !== id)
      : [...a, id];

  prefs.set(
    "favorites",
    a
  );

  render();
}


/* =========================================================
   SAVE / PUBLISH PROJECT
   ========================================================= */

async function saveProject(e) {

  e.preventDefault();

  const html =
    $("#pHtml")?.value.trim();

  if (!html) {

    showToast(
      "Paste HTML first."
    );

    return;
  }


  const name =
    $("#pName")?.value.trim() ||
    "Untitled Project";


  const project = {

    id:
      "project-" +
      Date.now()
        .toString(36),

    name,

    description:
      $("#pDescription")
        ?.value.trim() || "",

    category:
      $("#pCategory")
        ?.value || "Custom",

    tags:
      ($("#pTags")
        ?.value || "")
        .split(",")
        .map(x => x.trim())
        .filter(Boolean),

    icon: "📄",

    version: "1.0.0",

    dateAdded:
      new Date()
        .toISOString()
        .slice(0, 10),

    html,

    source: "cloud"
  };


  /*
   * Disable submit button while publishing.
   */

  const submit =
    e.submitter ||
    $("#addForm button[type='submit']");

  if (submit) {
    submit.disabled = true;
    submit.dataset.oldText =
      submit.textContent;
    submit.textContent =
      "Publishing…";
  }


  try {

    showToast(
      "Publishing project…"
    );

    const result =
      await publishProject(project);


    /*
     * Add returned cloud project
     */

    const cloudProject = {

      ...project,

      ...(result.project || {}),

      source: "cloud",

      entryFile:
        result.project?.entryFile ||
        "index.html"
    };


    /*
     * Remove any old version of this ID.
     */

    allProjects =
      allProjects.filter(
        p => p.id !== cloudProject.id
      );

    allProjects.push(
      cloudProject
    );


    /*
     * Reset form
     */

    $("#addForm")?.reset();


    showToast(
      "Project published successfully."
    );


    /*
     * Return to library
     */

    navigate("library");


    /*
     * Refresh from D1 so the UI uses
     * the authoritative cloud record.
     */

    try {

      const cloud =
        await fetchCloudProjects();

      const map =
        new Map(
          allProjects.map(
            p => [p.id, p]
          )
        );

      cloud.forEach(
        p => map.set(p.id, p)
      );

      allProjects =
        [...map.values()];

      render();

    } catch {}


  } catch (error) {

    console.error(error);

    showToast(
      error.message ||
      "Could not publish project."
    );

  } finally {

    if (submit) {

      submit.disabled = false;

      submit.textContent =
        submit.dataset.oldText ||
        "Publish";
    }
  }
}


/* =========================================================
   FILE INPUT
   ========================================================= */

function readFile(e) {

  const f =
    e.target.files[0];

  if (f) {
    loadFile(f);
  }
}


function readDrop(e) {

  e.preventDefault();

  $("#dropzone")
    ?.classList
    .remove("drag");

  const f =
    e.dataTransfer.files[0];

  if (f) {
    loadFile(f);
  }
}


function loadFile(f) {

  if (!/\.html?$/i.test(f.name)) {

    showToast(
      "Choose an HTML file."
    );

    return;
  }


  const reader =
    new FileReader();


  reader.onload = () => {

    $("#pHtml").value =
      reader.result;

    if (!$("#pName").value) {

      $("#pName").value =
        f.name.replace(
          /\.html?$/i,
          ""
        );
    }
  };


  reader.readAsText(f);
}


/* =========================================================
   PREVIEW
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


  const w =
    window.open(
      "",
      "_blank"
    );

  if (!w) {

    showToast(
      "Popup blocked."
    );

    return;
  }


  w.document.open();

  w.document.write(
    html
  );

  w.document.close();
}


/* =========================================================
   THEME
   ========================================================= */

function toggleTheme() {

  const t =
    document.documentElement
      .dataset.theme === "light"
        ? "dark"
        : "light";

  document.documentElement
    .dataset.theme = t;

  prefs.set(
    "theme",
    t
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

function showToast(m) {

  if (!els.toast) return;

  els.toast.textContent = m;

  els.toast.classList.add(
    "show"
  );

  clearTimeout(
    showToast.t
  );

  showToast.t =
    setTimeout(
      () =>
        els.toast.classList.remove(
          "show"
        ),
      2600
    );
}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function esc(s) {

  return String(
    s ?? ""
  ).replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c])
  );
}
