# ProjectHub — HTML Project Launcher

## Permanent projects
Create `projects/my-project/index.html`, paste your complete project there, then register it in `js/projects.js`:

```js
{
  id:"my-project",
  name:"My Project",
  description:"What this project does",
  category:"Tools",
  icon:"🛠️",
  version:"1.0.0",b
  dateAdded:"2026-08-18",
  path:"projects/my-project/index.html",
  tags:["tool","custom"]
}
```

For projects with separate CSS/JS/assets, keep them inside the same project folder and use relative paths.

## Browser Add Project
The Add Project screen can paste/import a complete HTML file. It stores the project in IndexedDB on that browser/device. It does not write files back to GitHub.

## Viewer
Projects are isolated in a sandboxed iframe. Some projects that require unrestricted browser APIs may need their own hosting or a different wrapper.

## Address bar
A normal browser page cannot forcibly hide browser chrome. Fullscreen is used where supported. The PWA manifest uses `standalone`, so an installed PWA can run without normal browser chrome on supported platforms.

## GitHub Pages
Keep `index.html` at the repository root. Settings → Pages → Deploy from branch → `main` → `/ (root)`.

## Important
Do not flatten `css/` or `js/`. The HTML files reference those folders.
