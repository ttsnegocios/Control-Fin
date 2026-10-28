// Service worker: guarda tudo o que o app baixa (stlite, Pyodide, pacotes Python)
// para que ele abra sem internet depois da primeira vez.
const CACHE = "controle-financeiro-__VERSAO__";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "index.html", "manifest.webmanifest"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith("http")) return;
  const url = new URL(req.url);
  if (url.pathname.includes("/_stcore/")) return;
  // Só guarda arquivos do próprio app e do Python (Pyodide/PyPI). Login Microsoft,
  // OneDrive e Graph nunca passam pelo cache — a sincronização precisa da resposta real.
  const CACHEAVEIS = [self.location.origin, "https://cdn.jsdelivr.net", "https://pypi.org", "https://files.pythonhosted.org"];
  if (!CACHEAVEIS.includes(url.origin) || req.headers.has("Authorization")) return;
  if (url.origin === self.location.origin && url.pathname.endsWith("/redirect.html")) return;

  // Página principal: rede primeiro (pega atualizações), cache se offline
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => {
      const copia = r.clone();
      caches.open(CACHE).then((c) => c.put(req, copia));
      return r;
    }).catch(() => caches.match(req).then((r) => r || caches.match("index.html"))));
    return;
  }

  // Demais arquivos: cache primeiro
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok || r.type === "opaque") {
      const copia = r.clone();
      caches.open(CACHE).then((c) => c.put(req, copia));
    }
    return r;
  })));
});
