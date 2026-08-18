const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let allProjects=[], currentNav="library", currentCategory="All", deferredInstall=null;
const els={grid:$("#projectGrid"),search:$("#searchInput"),cats:$("#categoryBar"),stats:$("#stats"),library:$("#libraryView"),add:$("#addView"),title:$("#pageTitle"),toast:$("#toast")};

document.addEventListener("DOMContentLoaded",init);

async function init(){
  try{allProjects=[...getStaticProjects(),...(await idbGetAll()).map(p=>({...p,source:"local"}))];}
  catch(e){allProjects=getStaticProjects();showToast("Browser storage is unavailable; static projects still work.");}
  renderCategories(); render();
  $$(".app-shell [data-nav],.mobile-nav [data-nav]").forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
  $("#addTopBtn").onclick=()=>navigate("add"); $("#themeBtn").onclick=toggleTheme;
  $("#searchInput").oninput=render; $("#addForm").onsubmit=saveProject; $("#fileBtn").onclick=()=>$("#fileInput").click();
  $("#fileInput").onchange=readFile; $("#dropzone").ondragover=e=>{e.preventDefault();$("#dropzone").classList.add("drag")};
  $("#dropzone").ondragleave=()=>$("#dropzone").classList.remove("drag"); $("#dropzone").ondrop=readDrop;
  $("#previewPaste").onclick=previewPaste; loadTheme();
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("#installBtn").hidden=false;});
  $("#installBtn").onclick=async()=>{if(deferredInstall){await deferredInstall.prompt();deferredInstall=null;}};
  if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
}

function navigate(n){
  currentNav=n; els.library.hidden=n==="add"; els.add.hidden=n!=="add";
  els.title.textContent=n==="favorites"?"Favorites":n==="recent"?"Recently opened":n==="add"?"Add project":"Projects";
  $$(".app-shell [data-nav],.mobile-nav [data-nav]").forEach(b=>b.classList.toggle("active",b.dataset.nav===n));
  if(n!=="add")render();
}

function renderCategories(){
  els.cats.innerHTML=DEFAULT_CATEGORIES.map(c=>`<button class="chip ${c===currentCategory?"active":""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
  $$("[data-cat]").forEach(b=>b.onclick=()=>{currentCategory=b.dataset.cat;renderCategories();render();});
}

function render(){
  const q=els.search.value.trim().toLowerCase(), fav=prefs.get("favorites",[]), recent=prefs.get("recent",[]);
  let list=allProjects.filter(p=>currentNav==="favorites"?fav.includes(p.id):currentNav==="recent"?recent.includes(p.id):true);
  if(currentCategory!=="All"&&currentNav==="library")list=list.filter(p=>p.category===currentCategory);
  if(q)list=list.filter(p=>[p.name,p.description,p.category,...(p.tags||[])].join(" ").toLowerCase().includes(q));
  els.stats.textContent=`${list.length} project${list.length===1?"":"s"} • ${fav.length} favorite${fav.length===1?"":"s"}`;
  els.grid.innerHTML=list.length?list.map(card).join(""):`<div class="empty"><div>⌘</div><h2>Nothing found</h2><p>Add a project or change your filters.</p><button class="primary-btn" id="emptyAdd">＋ Add project</button></div>`;
  $("#emptyAdd")?.addEventListener("click",()=>navigate("add"));
  $$(".run").forEach(b=>b.onclick=()=>openViewer(b.dataset.id));$$(".browser").forEach(b=>b.onclick=()=>openBrowser(b.dataset.id));$$(".fav").forEach(b=>b.onclick=()=>toggleFav(b.dataset.id));
}

function card(p){
  const fav=prefs.get("favorites",[]).includes(p.id);
  return `<article class="card"><div class="card-top"><div class="project-icon">${p.icon||"◇"}</div><button class="fav ${fav?"on":""}" data-id="${esc(p.id)}">${fav?"★":"☆"}</button></div><div class="card-body"><div class="badge">${esc(p.category||"Custom")}</div><h3>${esc(p.name)}</h3><p>${esc(p.description||"No description")}</p><div class="meta"><span>v${esc(p.version||"1.0.0")}</span><span>${esc(p.dateAdded||"")}</span></div></div><div class="card-actions"><button class="primary-small run" data-id="${esc(p.id)}">▶ Run in App</button><button class="secondary-small browser" data-id="${esc(p.id)}">↗ Browser</button></div></article>`;
}
function findProject(id){return allProjects.find(p=>p.id===id)}
function openViewer(id){if(!findProject(id))return;let r=prefs.get("recent",[]).filter(x=>x!==id);r.unshift(id);prefs.set("recent",r.slice(0,20));location.href=`viewer.html?id=${encodeURIComponent(id)}`;}
function openBrowser(id){const p=findProject(id);if(!p)return;if(p.source==="local"){showToast("Local projects stay in the isolated viewer.");openViewer(id);return}const w=window.open(p.path,"_blank","noopener,noreferrer");if(!w)showToast("Popup blocked. Allow popups for this site.");}
function toggleFav(id){let a=prefs.get("favorites",[]);a=a.includes(id)?a.filter(x=>x!==id):[...a,id];prefs.set("favorites",a);render();}
async function saveProject(e){
  e.preventDefault(); const html=$("#pHtml").value.trim(); if(!html){showToast("Paste HTML first.");return}
  const p={id:"local-"+Date.now().toString(36),name:$("#pName").value.trim(),description:$("#pDescription").value.trim(),category:$("#pCategory").value,tags:$("#pTags").value.split(",").map(x=>x.trim()).filter(Boolean),icon:"📄",version:"1.0.0",dateAdded:new Date().toISOString().slice(0,10),html,source:"local"};
  try{await idbPut(p);allProjects.push(p);$("#addForm").reset();showToast("Project saved.");navigate("library");}catch(e){showToast("Could not save in browser storage.");}
}
function readFile(e){const f=e.target.files[0];if(f)loadFile(f)}
function readDrop(e){e.preventDefault();$("#dropzone").classList.remove("drag");const f=e.dataTransfer.files[0];if(f)loadFile(f)}
function loadFile(f){if(!/\.html?$/i.test(f.name)){showToast("Choose an HTML file.");return}const r=new FileReader();r.onload=()=>{$("#pHtml").value=r.result;if(!$("#pName").value)$("#pName").value=f.name.replace(/\.html?$/i,"")};r.readAsText(f)}
function previewPaste(){const h=$("#pHtml").value;if(!h){showToast("Paste HTML first.");return}const w=window.open("","_blank");if(!w){showToast("Popup blocked.");return}w.document.open();w.document.write(h);w.document.close();}
function toggleTheme(){const t=document.documentElement.dataset.theme==="light"?"dark":"light";document.documentElement.dataset.theme=t;prefs.set("theme",t)}
function loadTheme(){document.documentElement.dataset.theme=prefs.get("theme","dark")}
function showToast(m){els.toast.textContent=m;els.toast.classList.add("show");clearTimeout(showToast.t);showToast.t=setTimeout(()=>els.toast.classList.remove("show"),2600)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
