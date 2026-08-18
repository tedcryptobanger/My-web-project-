const API_BASE = "https://purchase.workers.dev";

const qs =
  new URLSearchParams(
    location.search
  );

const id = qs.get("id");

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


  let project;


  /*
   * 1. Check built-in projects
   */

  project =
    getStaticProjects()
      .find(
        x => x.id === id
      );


  /*
   * 2. If not static, check cloud
   */

  if (!project) {

    try {

      const response =
        await fetch(
          `${API_BASE}/api/projects/${encodeURIComponent(id)}`
        );

      if (response.ok) {

        const data =
          await response.json();

        if (data.ok) {

          project =
            data.project;
        }
      }

    } catch (error) {

      console.error(
        "Cloud project lookup failed:",
        error
      );
    }
  }


  /*
   * 3. If not cloud, check local IndexedDB
   */

  if (!project) {

    try {

      project =
        await idbGet(id);

    } catch {}
  }


  /*
   * Nothing found
   */

  if (!project) {

    fail(
      "The requested project does not exist."
    );

    return;
  }


  document.title =
    `${project.name} — ProjectHub`;


  const viewerName =
    document.getElementById(
      "viewerName"
    );

  const viewerMeta =
    document.getElementById(
      "viewerMeta"
    );


  if (viewerName) {

    viewerName.textContent =
      project.name;
  }


  if (viewerMeta) {

    viewerMeta.textContent =
      project.category || "";
  }


  /*
   * Frame loaded
   */

  frame.onload = () => {

    loading.hidden = true;

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
     * CLOUD PROJECT
     */

    if (
      project.source === "cloud"
    ) {

      const entry =
        project.entryFile ||
        "index.html";


      const entryPath =
        entry
          .split("/")
          .map(
            encodeURIComponent
          )
          .join("/");


      frame.src =
        `${API_BASE}/projects/` +
        `${encodeURIComponent(project.id)}/` +
        entryPath;


      return;
    }


    /*
     * LOCAL PROJECT
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
     * STATIC PROJECT
     */

    frame.src =
      project.path;

  } catch (error) {

    fail(
      error.message
    );
  }
}


/* =========================================================
   ERROR
   ========================================================= */

function fail(msg) {

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
      msg;
  }
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function home() {

  location.href =
    "index.html";
}


const backBtn =
  document.getElementById(
    "backBtn"
  );

if (backBtn) {

  backBtn.onclick = () => {

    if (
      history.length > 1
    ) {

      history.back();

    } else {

      home();
    }
  };
}


const homeBtn =
  document.getElementById(
    "homeBtn"
  );

if (homeBtn) {

  homeBtn.onclick =
    home;
}


const retryBtn =
  document.getElementById(
    "retryBtn"
  );

if (retryBtn) {

  retryBtn.onclick =
    () =>
      location.reload();
}


const errorHomeBtn =
  document.getElementById(
    "errorHomeBtn"
  );

if (errorHomeBtn) {

  errorHomeBtn.onclick =
    home;
}


const reloadBtn =
  document.getElementById(
    "reloadBtn"
  );

if (reloadBtn) {

  reloadBtn.onclick = () => {

    try {

      frame.contentWindow
        .location.reload();

    } catch {

      location.reload();
    }
  };
}


const fullBtn =
  document.getElementById(
    "fullBtn"
  );

if (fullBtn) {

  fullBtn.onclick =
    async () => {

      try {

        if (
          document.fullscreenElement
        ) {

          await document
            .exitFullscreen();

        } else {

          await document
            .documentElement
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
