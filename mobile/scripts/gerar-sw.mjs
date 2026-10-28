// Gera dist/sw.js com a lista de todos os arquivos do app (pré-cache) para funcionar 100% offline.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const arquivos = [];
(function varrer(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) varrer(p);
    else if (n !== "sw.js") arquivos.push(relative(DIST, p).split("\\").join("/"));
  }
})(DIST);
arquivos.sort();
const hash = createHash("sha256");
for (const a of arquivos) hash.update(a).update(readFileSync(join(DIST, a)));
const versao = hash.digest("hex").slice(0, 12);

const sw = `// Gerado automaticamente por scripts/gerar-sw.mjs — não editar.
const CACHE = "cf-${versao}";
const ARQUIVOS = ${JSON.stringify(["./", ...arquivos.map((a) => "./" + a)], null, 0)};

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    // tela principal: sempre do cache (abre instantâneo e offline); a atualização vem pelo service worker novo
    e.respondWith(caches.match("./index.html").then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
`;
writeFileSync(join(DIST, "sw.js"), sw);
console.log(`sw.js: ${arquivos.length} arquivos no cache offline (versão ${versao})`);
