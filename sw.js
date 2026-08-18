const CACHE="projecthub-v3";
const ASSETS=["./","./index.html","./viewer.html","./manifest.json","./css/app.css","./css/viewer.css","./js/app.js","./js/projects.js","./js/storage.js","./js/viewer.js","./projects/welcome-demo/index.html","./assets/icons/icon-192.png","./assets/icons/icon-512.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{if(r.ok&&new URL(e.request.url).origin===location.origin){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match("./index.html"))))});
