/* =========================================================
   PROJECT LAUNCHER — CLOUD/R2 VIEWER
   ========================================================= */

const API_BASE =
  "https://project-launcher-api.alertsvisapurchase.workers.dev";

const qs =
  new URLSearchParams(
    location.search
  );

const id =
  qs.get("id");

const frame =
  document.getElementById(
    "projectFrame"
  );

const loading =
  document.getElementById(
    "loading"
  );

const errorBox =
  document.getElementById(
    "error"
  );


/* =========================================================
   BOOT
   ========================================================= */

async function boot() {
  if (!id) {
    fail(
      "No project ID was provided."
    );

    return;
  }

  let project = null;

  /*
   * 1. Check static projects.
   */
  try {
    project =
      getStaticProjects()
        .find(
          item =>
            item.id === id
        );
  } catch {}


  /*
   * 2. Check local IndexedDB projects.
   */
  if (!project) {
    try {
      project =
        await idbGet(id);
    } catch {}
  }


  /*
   * 3. Check Cloudflare Worker / D1.
   */
  if (!project) {
    try {
      project =
        await fetchCloudProject(
          id
        );
    } catch (error) {
      console.error(
        "Cloud project lookup failed:",
        error
      );
    }
  }


  if (!project) {
    fail(
      "The requested project does not exist."
    );

    return;
  }


  /*
   * Update viewer title.
   */
  document.title =
    `${project.name} — ProjectHub`;

  const nameElement =
    document.getElementById(
      "viewerName"
    );

  if (nameElement) {
    nameElement.textContent =
      project.name ||
      "Project";
  }

  const metaElement =
    document.getElementById(
      "viewerMeta"
    );

  if (metaElement) {
    metaElement.textContent =
      project.category ||
      "";
  }


  /*
   * Frame loaded.
   */
  frame.onload = () => {
    if (loading) {
      loading.hidden = true;
    }

    frame.style.display =
      "block";
  };


  frame.onerror = () => {
    fail(
      "The project file could not be loaded."
    );
  };


  try {

    /*
     * Browser-local project.
     */
    if (
      project.source === "local" ||
      project.html
    ) {
      frame.srcdoc =
        project.html;

      return;
    }


    /*
     * Static project.
     */
    if (
      project.source === "static"
    ) {
      frame.src =
        project.path;

      return;
    }


    /*
     * Cloud/R2 project.
     */
    if (
      project.source === "cloud"
    ) {
      const entry =
        project.entryFile ||
        "index.html";

      frame.src =
        `${API_BASE}/projects/` +
        `${encodeURIComponent(project.id)}/` +
        `${encodeURIComponent(entry)}`;

      return;
    }


    /*
     * Fallback.
     */
    if (project.path) {
      frame.src =
        project.path;

      return;
    }

    fail(
      "This project has no entry file."
    );

  } catch (error) {
    fail(
      error?.message ||
      String(error)
    );
  }
}


/* =========================================================
   CLOUD PROJECT
   ========================================================= */

async function fetchCloudProject(id) {
  const response =
    await fetch(
      `${API_BASE}/api/projects/${encodeURIComponent(id)}`,
      {
        method: "GET",
        headers: {
          Accept:
            "application/json"
        },
        cache: "no-store"
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(text);
  } catch {
    throw new Error(
      `Cloud API returned invalid JSON (HTTP ${response.status}).`
    );
  }

  if (!response.ok || !data.ok) {
    throw new Error(
      data.error ||
      `Cloud API error (HTTP ${response.status}).`
    );
  }

  return {
    ...data.project,
    source: "cloud",

    path:
      `${API_BASE}/projects/` +
      `${encodeURIComponent(data.project.id)}/` +
      `${encodeURIComponent(data.project.entryFile || "index.html")}`
  };
}


/* =========================================================
   ERROR
   ========================================================= */

function fail(message) {
  if (loading) {
    loading.hidden = true;
  }

  if (frame) {
    frame.style.display =
      "none";
  }

  if (errorBox) {
    errorBox.hidden = false;
  }

  const errorText =
    document.getElementById(
      "errorText"
    );

  if (errorText) {
    errorText.textContent =
      message;
  }
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function home() {
  location.href =
    "index.html";
}


const backButton =
  document.getElementById(
    "backBtn"
  );

if (backButton) {
  backButton.onclick = () => {
    if (history.length > 1) {
      history.back();
    } else {
      home();
    }
  };
}


const homeButton =
  document.getElementById(
    "homeBtn"
  );

if (homeButton) {
  homeButton.onclick =
    home;
}


const retryButton =
  document.getElementById(
    "retryBtn"
  );

if (retryButton) {
  retryButton.onclick =
    () => location.reload();
}


const errorHomeButton =
  document.getElementById(
    "errorHomeBtn"
  );

if (errorHomeButton) {
  errorHomeButton.onclick =
    home;
}


/* =========================================================
   RELOAD
   ========================================================= */

const reloadButton =
  document.getElementById(
    "reloadBtn"
  );

if (reloadButton) {
  reloadButton.onclick =
    () => {
      try {
        frame.contentWindow
          .location
          .reload();
      } catch {
        location.reload();
      }
    };
}


/* =========================================================
   FULLSCREEN
   ========================================================= */

const fullButton =
  document.getElementById(
    "fullBtn"
  );

if (fullButton) {
  fullButton.onclick =
    async () => {
      try {

        if (
          document.fullscreenElement
        ) {
          await document.exitFullscreen();
        } else {
          await document.documentElement
            .requestFullscreen();
        }

      } catch {
        frame.classList.toggle(
          "manual-full"
        );
      }
    };
}


/* =========================================================
   START
   ========================================================= */

boot();
