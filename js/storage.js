const PH_DB="projecthub-v2", PH_STORE="projects";
function openPHDB(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(PH_DB,1);
    r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(PH_STORE))r.result.createObjectStore(PH_STORE,{keyPath:"id"});};
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
}
async function idbPut(project){const db=await openPHDB();return new Promise((res,rej)=>{const tx=db.transaction(PH_STORE,"readwrite");tx.objectStore(PH_STORE).put(project);tx.oncomplete=()=>res(project);tx.onerror=()=>rej(tx.error);});}
async function idbGetAll(){const db=await openPHDB();return new Promise((res,rej)=>{const r=db.transaction(PH_STORE).objectStore(PH_STORE).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});}
async function idbGet(id){const db=await openPHDB();return new Promise((res,rej)=>{const r=db.transaction(PH_STORE).objectStore(PH_STORE).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
const prefs={get(k,d=null){try{const v=localStorage.getItem("ph_"+k);return v===null?d:JSON.parse(v)}catch{return d}},set(k,v){localStorage.setItem("ph_"+k,JSON.stringify(v))}};
