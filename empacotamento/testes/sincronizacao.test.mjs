import { Sincronizador, CAMINHOS, GRAPH_APPROOT } from "../android/web/onedrive.js";
import assert from "node:assert/strict";

// ---- OneDrive falso (regras do Graph para upload simples) ----
const nuvem = { arquivos: new Map(), n: 0, offline: false, antesDoPut: null, puts: [] };
const enc = new TextEncoder(), dec = new TextDecoder();
async function fakeFetch(url, opts = {}) {
  if (nuvem.offline) throw new TypeError("Failed to fetch");
  const h = opts.headers || {};
  if (url.startsWith("https://download/")) {
    const f = nuvem.arquivos.get(decodeURIComponent(url.slice(17)));
    return new Response(f.bytes);
  }
  assert.ok(h.Authorization?.startsWith("Bearer "), "sem token");
  const m = url.match(/approot:\/(.+?)(:\/content)?$/);
  const nome = decodeURIComponent(m[1]);
  if ((opts.method || "GET") === "GET") {
    const f = nuvem.arquivos.get(nome);
    if (!f) return new Response("{}", { status: 404 });
    return Response.json({ cTag: f.ctag, eTag: f.ctag + ",1", lastModifiedDateTime: new Date().toISOString(),
      "@microsoft.graph.downloadUrl": "https://download/" + encodeURIComponent(nome) });
  }
  if (nuvem.antesDoPut) { const f = nuvem.antesDoPut; nuvem.antesDoPut = null; f(); }
  const atual = nuvem.arquivos.get(nome);
  if (h["If-Match"] && (!atual || atual.ctag !== h["If-Match"])) return new Response("{}", { status: 412 });
  if (h["If-None-Match"] === "*" && atual) return new Response("{}", { status: 412 });
  const ctag = `c${++nuvem.n}`;
  nuvem.arquivos.set(nome, { bytes: new Uint8Array(opts.body), ctag });
  nuvem.puts.push(nome);
  return Response.json({ cTag: ctag }, { status: atual ? 200 : 201 });
}

// ---- aparelho: FS do app + simulação do db.py ----
function aparelho(nome, escolhaConflito = "onedrive") {
  const arq = new Map();
  const fs = {
    ler: async (p, texto) => { const v = arq.get(p); if (v === undefined) return null; return texto ? (typeof v === "string" ? v : dec.decode(v)) : (typeof v === "string" ? enc.encode(v) : v); },
    gravar: async (p, d) => { arq.set(p, d); },
  };
  const estados = [];
  const conflitos = [];
  const s = new Sincronizador({ fs, obterToken: async () => "tok", aparelho: nome, fetchFn: fakeFetch,
    resolverConflito: async (i) => { conflitos.push(i); return escolhaConflito; },
    aoMudarEstado: (e) => estados.push(e) });
  return {
    s, arq, estados, conflitos,
    banco: () => dec.decode(arq.get(CAMINHOS.db)),
    // db.py: grava o banco e incrementa o contador (init_db não incrementa)
    criarBanco: (conteudo) => arq.set(CAMINHOS.db, enc.encode(conteudo)),
    editar: (conteudo) => { arq.set(CAMINHOS.db, enc.encode(conteudo)); const n = parseInt(arq.get(CAMINHOS.alteracao) ?? "0"); arq.set(CAMINHOS.alteracao, String(n + 1)); },
    remoto: () => arq.get(CAMINHOS.remoto),
  };
}
const conteudoNuvem = () => dec.decode(nuvem.arquivos.get("financeiro.db").bytes);
const ok = (t) => console.log("✓", t);

// 1. Aparelho A: primeiro uso, sem nada no OneDrive -> envia
const A = aparelho("pc");
A.criarBanco("vazio-A"); A.editar("A1");
assert.equal(await A.s.sincronizar(), "enviado");
assert.equal(conteudoNuvem(), "A1"); assert.equal(A.s.estado, "sincronizado");
ok("primeiro envio cria o arquivo no OneDrive");

// 2. Sem mudanças -> nada a fazer
assert.equal(await A.s.sincronizar(), "em-dia");
ok("sem alterações: em dia, nenhum envio");

// 3. A edita -> envia com If-Match
A.editar("A2");
assert.equal(await A.s.sincronizar(), "enviado"); assert.equal(conteudoNuvem(), "A2");
ok("alteração local é enviada");

// 4. Aparelho B novo (banco recém-criado, sem alterações do usuário) -> baixa
const B = aparelho("celular");
B.criarBanco("vazio-B");
assert.equal(await B.s.sincronizar(), "baixado");
assert.equal(B.banco(), "A2"); assert.ok(B.remoto(), "marca .remoto para recarregar a tela");
ok("aparelho novo baixa os dados do OneDrive e sinaliza o app");

// 5. B edita e envia; A (sem alterações) baixa
B.editar("B1");
assert.equal(await B.s.sincronizar(), "enviado");
assert.equal(await A.s.sincronizar(), "baixado"); assert.equal(A.banco(), "B1");
ok("alteração feita no celular chega no PC");

// 6. Conflito: os dois editam; B envia primeiro; A escolhe 'usar OneDrive'
A.editar("A3"); B.editar("B2");
assert.equal(await B.s.sincronizar(), "enviado");
assert.equal(await A.s.sincronizar(), "conflito-onedrive");
assert.equal(A.banco(), "B2"); assert.equal(A.conflitos.length, 1);
const copiaA = [...nuvem.arquivos.keys()].find((k) => k.includes("conflito") && k.includes("pc"));
assert.ok(copiaA && dec.decode(nuvem.arquivos.get(copiaA).bytes) === "A3", "versão descartada guardada");
assert.equal(await A.s.sincronizar(), "em-dia");
ok("conflito → 'usar OneDrive': adota a nuvem e guarda a versão local como cópia");

// 7. Conflito com escolha 'manter este aparelho'
const C = aparelho("tablet", "local");
C.criarBanco("x"); assert.equal(await C.s.sincronizar(), "baixado");
C.editar("C1"); A.editar("A4");
assert.equal(await A.s.sincronizar(), "enviado");
assert.equal(await C.s.sincronizar(), "enviado");
assert.equal(conteudoNuvem(), "C1");
const copiaNuvem = [...nuvem.arquivos.keys()].find((k) => k.includes("conflito") && k.endsWith("onedrive.db"));
assert.equal(dec.decode(nuvem.arquivos.get(copiaNuvem).bytes), "A4");
assert.equal(await A.s.sincronizar(), "baixado"); assert.equal(A.banco(), "C1");
ok("conflito → 'manter este aparelho': envia a local e guarda a da nuvem como cópia");

// 8. Corrida: outro aparelho grava entre a consulta e o envio -> 412 tratado como conflito
B.s.resolverConflito = async () => "onedrive";
await B.s.sincronizar();                    // B fica em dia (baixa C1)
B.editar("B3");
nuvem.antesDoPut = () => nuvem.arquivos.set("financeiro.db", { bytes: enc.encode("X-corrida"), ctag: "cX" });
assert.equal(await B.s.sincronizar(), "conflito-onedrive");
assert.equal(B.banco(), "X-corrida");
ok("gravação simultânea (412) não sobrescreve: vira conflito");

// 9. Offline: mantém pendente e envia quando volta
B.editar("B4"); nuvem.offline = true;
assert.equal(await B.s.sincronizar(), "erro"); assert.equal(B.s.estado, "pendente-offline");
nuvem.offline = false;
assert.equal(await B.s.sincronizar(), "enviado"); assert.equal(conteudoNuvem(), "B4");
ok("offline: alterações ficam pendentes e são enviadas ao voltar a conexão");

// 10. Conflito adiado: nada muda até decidir
const D = aparelho("note", null);
D.criarBanco("d"); await D.s.sincronizar(); D.editar("D1"); B.editar("B5"); assert.equal(await B.s.sincronizar(), "enviado");
const antes = conteudoNuvem();
assert.equal(await D.s.sincronizar(), "adiado"); assert.equal(D.s.estado, "conflito");
assert.equal(conteudoNuvem(), antes); assert.equal(D.banco(), "D1");
ok("'decidir depois' não altera nada em nenhum lado");

// 11. Desconectado
const E = aparelho("x"); E.s.obterToken = async () => null; E.criarBanco("e");
assert.equal(await E.s.sincronizar(), "desconectado");
ok("sem login: fica como 'desconectado' e usa só os dados locais");

// 12. Vários pedidos ao mesmo tempo -> uma sincronização por vez
A.editar("A6");
const r = await Promise.all([A.s.sincronizar(), A.s.sincronizar(), A.s.sincronizar()]);
assert.ok(r.every((x) => x === r[0]));
ok("pedidos simultâneos são agrupados (sem envios duplicados)");
console.log("\nTodos os cenários passaram.");
