const CACHE="collective-211f0e0f46e24d7c",ASSETS=["assets/index-BMkp73d5.js","assets/index-TYDpHz_W.css","assets/simulation.worker-yGzglRDw.js","build-info.json","icon-192.png","icon-512.png","index.html","manifest.webmanifest","sprites/atlas.json","sprites/atlas.png"],BUILD={"version":"2.4.0","commit":"ea5ae37a797f82976ef2bb5ea061c13091c751b2","builtAt":"2026-11-01T05:36:22.999Z","environment":"production"};
// COLLECTIVE service worker body. scripts/build-sw.mjs prepends `const CACHE=…,ASSETS=[…],BUILD={…};`.
// Lifecycle: install downloads every asset straight from the network (bypassing HTTP and CDN caches), validates the set as one
// coherent build and only then commits it; the new worker then WAITS. The page activates it (SKIP_WAITING) after saving the
// simulation, or it activates naturally once every window is closed. The message protocol is unchanged since v2.2.0, so older
// installed pages can still take this worker through their own "Save & update" flow.
const at=path=>new URL(path,self.registration.scope).href;
// A unique query defeats GitHub Pages / CDN edge caching (max-age=600) so a fresh worker never precaches a stale index.html.
const fresh=path=>new Request(at(path)+(path.includes('?')?'&':'?')+'sw-install='+encodeURIComponent(CACHE),{cache:'reload',credentials:'same-origin'});
/** Throws unless the downloaded files form one consistent build: every request OK, build-info matches this worker, index.html only references precached assets. */
async function validate(responses){
  for(const [path,response] of responses)if(!response.ok)throw new Error(`${path} HTTP ${response.status}`);
  const info=await responses.get('build-info.json')?.clone().json().catch(()=>null);
  if(!info||info.commit!==BUILD.commit||info.version!==BUILD.version)throw new Error(`build-info.json is ${info?.commit??'unreadable'}, expected ${BUILD.commit}`);
  const html=await responses.get('index.html')?.clone().text();if(!html)throw new Error('index.html missing');
  for(const ref of html.match(/assets\/[\w.-]+\.(?:js|css)/g)??[])if(!ASSETS.includes(ref))throw new Error(`index.html references ${ref}, which is not part of build ${BUILD.commit}`);
}
async function install(){
  const responses=new Map();
  // Download everything first; nothing is written to Cache Storage until the whole set has arrived and validated.
  // Each body is read as soon as it arrives: unread bodies would pin HTTP/1.1 connections (6 per host) and stall the rest.
  await Promise.all(ASSETS.map(async path=>{const r=await fetch(fresh(path)),body=await r.arrayBuffer();responses.set(path,new Response(body,{status:r.status,statusText:r.statusText,headers:r.headers}));}));
  await validate(responses);
  const cache=await caches.open(CACHE);
  try{for(const [path,response] of responses)await cache.put(at(path),response);}
  catch(error){await caches.delete(CACHE);throw error;}
}
self.addEventListener('install',event=>event.waitUntil(install().catch(async error=>{await caches.delete(CACHE);throw error;})));
self.addEventListener('message',event=>{const type=event.data&&event.data.type;if(type==='SKIP_WAITING')self.skipWaiting();else if(type==='GET_BUILD'&&event.ports[0])event.ports[0].postMessage({build:BUILD,cache:CACHE});});
// Old caches are removed only once this version's cache is verified complete, so an interrupted update can always fall back.
self.addEventListener('activate',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);const missing=[];for(const path of ASSETS)if(!(await cache.match(at(path),{ignoreVary:true})))missing.push(path);if(missing.length){try{for(const path of missing){const r=await fetch(fresh(path));if(r.ok)await cache.put(at(path),r);}missing.length=0;}catch{}}if(!missing.length){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('collective-')&&k!==CACHE).map(k=>caches.delete(k)));}await self.clients.claim();})()));
const copy=async page=>{const headers=new Headers(page.headers);headers.delete('content-encoding');headers.delete('content-length');return new Response(await page.arrayBuffer(),{status:page.status,statusText:page.statusText,headers});};
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=='GET')return;
  // The version endpoint is authoritative: always from the network (any query string), falling back to the cached copy offline.
  if(url.origin+url.pathname===at('build-info.json')){event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(at('build-info.json'),{ignoreVary:true}).then(r=>r??Response.error())));return;}
  event.respondWith(caches.open(CACHE).then(async cache=>{if(event.request.mode==='navigate'){const page=await cache.match(at('index.html'),{ignoreVary:true})??await caches.match(at('index.html'),{ignoreVary:true});if(page)return copy(page);}const hit=await cache.match(event.request,{ignoreVary:true})??await caches.match(event.request,{ignoreVary:true});if(hit)return hit;return fetch(event.request);}));});
