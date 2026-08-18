const qs=new URLSearchParams(location.search), id=qs.get("id");
const frame=document.getElementById("projectFrame"), loading=document.getElementById("loading"), errorBox=document.getElementById("error");

async function boot(){
  if(!id)return fail("No project ID was provided.");
  let p=getStaticProjects().find(x=>x.id===id);
  if(!p){try{p=await idbGet(id)}catch{}}
  if(!p)return fail("The requested project does not exist.");
  document.title=p.name+" — ProjectHub"; document.getElementById("viewerName").textContent=p.name; document.getElementById("viewerMeta").textContent=p.category||"";
  frame.onload=()=>{loading.hidden=true;frame.style.display="block"};
  frame.onerror=()=>fail("The project file could not be loaded.");
  try{if(p.source==="local"||p.html)frame.srcdoc=p.html;else frame.src=p.path}catch(e){fail(e.message)}
}
function fail(msg){loading.hidden=true;frame.style.display="none";errorBox.hidden=false;document.getElementById("errorText").textContent=msg}
function home(){location.href="index.html"}
document.getElementById("backBtn").onclick=()=>history.length>1?history.back():home();
document.getElementById("homeBtn").onclick=home;
document.getElementById("retryBtn").onclick=()=>location.reload();
document.getElementById("errorHomeBtn").onclick=home;
document.getElementById("reloadBtn").onclick=()=>{try{frame.contentWindow.location.reload()}catch{location.reload()}};
document.getElementById("fullBtn").onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{frame.classList.toggle("manual-full")}};
boot();
