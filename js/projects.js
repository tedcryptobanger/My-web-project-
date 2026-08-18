/* =========================================================
   PERMANENT PROJECT REGISTRY
   ADD YOUR DEPLOYED PROJECTS BELOW THIS COMMENT.
   Create: projects/my-project/index.html
   Then add one object to STATIC_PROJECTS.
   ========================================================= */
const STATIC_PROJECTS = [
  {
    id:"welcome-demo",
    name:"Welcome Demo",
    description:"Working test project for the launcher and viewer.",
    category:"Web Apps",
    icon:"🚀",
    version:"1.0.0",
    dateAdded:"2026-08-18",
    path:"projects/welcome-demo/index.html",
    tags:["demo","test","launcher"]
  }
];

const DEFAULT_CATEGORIES=["All","Web Apps","Tools","Games","Utilities","Dashboards","Forms","Experiments","Custom"];
function getStaticProjects(){ return STATIC_PROJECTS.map(p=>({...p,source:"static"})); }
