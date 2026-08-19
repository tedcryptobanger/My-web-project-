/* =========================================================
   PROJECTHUB CLOUD VIEWER
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

  /*
   * 1. Static project
   */
  let project = null;

  try {
    if (
      typeof getStaticProjects ===
      "function"
    ) {
      project =
        getStaticProjects()
          .find(
            p =>
              String(p.id) ===
              String(id)
          );
    }
  } catch {}


  /*
   * 2. Local IndexedDB project
   */
  if (!project) {
    try {
      if (
        typeof idbGet ===
        "function"
      ) {
        project =
          await idbGet(id);
      }
    } catch {}
  }


  /*
   * 3. Cloud project
   */
  if (!project) {
    try {
      const response =
        await fetch(
          `${API_BASE}/api/projects/${encodeURIComponent(
            id
          )}`,
          {
            cache:
              "no-store"
          }
        );

      if (
        response.ok
      ) {
        const data =
          await response.json();

        if (
          data?.ok &&
          data.project
        ) {
          project =
            {
              ...data.project,
              source:
                "cloud"
            };
        }
      }

    } catch (
      error
    ) {
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
   * Header
   */
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
      project.category ||
      "";
  }


  /*
   * Loading
   */
  if (loading) {
    loading.hidden =
      false;
  }

  if (frame) {
    frame.style.display =
      "none";

    frame.onload =
      () => {
        if (loading) {
          loading.hidden =
            true;
        }

        frame.style.display =
          "block";
      };

    frame.onerror =
      () => {
        fail(
          "The project file could not be loaded."
        );
      };
  }


  /*
   * CLOUD PROJECT
   */
  if (
    project.source ===
    "cloud"
  ) {
    const entry =
      project.entryFile ||
      "index.html";

    const projectURL =
      `${API_BASE}/projects/` +
      `${encodeURIComponent(
        project.id
      )}/` +
      `${entry
        .split("/")
        .map(
          encodeURIComponent
        )
        .join("/")}`;

    console.log(
      "Loading cloud project:",
      projectURL
    );

    frame.src =
      projectURL;

    return;
  }


  /*
   * LOCAL PROJECT
   */
  if (
    project.source ===
      "local" ||
    project.html
  ) {
    frame.srcdoc =
      project.html ||
      "";

    return;
  }


  /*
   * STATIC PROJECT
   */
  if (project.path) {
    frame.src =
      project.path;

    return;
  }


  fail(
    "No project source was found."
  );
}


/* =========================================================
   ERROR
   ========================================================= */

function fail(message) {
  if (loading) {
    loading.hidden =
      true;
  }

  if (frame) {
    frame.style.display =
      "none";
  }

  if (errorBox) {
    errorBox.hidden =
      false;
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
  backButton.onclick =
    () => {
      if (
        history.length >
        1
      ) {
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
    () =>
      location.reload();
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
        if (
          frame?.contentWindow
        ) {
          frame.contentWindow
            .location.reload();
        } else {
          location.reload();
        }
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
        frame?.classList.toggle(
          "manual-full"
        );
      }
    };
}


/* =========================================================
   START
   ========================================================= */

boot();
