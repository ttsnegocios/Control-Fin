// Guarda o arquivo do banco no IndexedDB do aparelho (persistente; funciona offline,
// no navegador instalado como app e dentro do app nativo Capacitor).
const NOME_DB = "controle-financeiro";
const LOJA = "arquivos";
const CHAVE = "financeiro.db";

function abrirIdb(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const r = indexedDB.open(NOME_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}

export async function lerBanco(): Promise<Uint8Array | null> {
  const idb = await abrirIdb();
  return new Promise((ok, erro) => {
    const r = idb.transaction(LOJA, "readonly").objectStore(LOJA).get(CHAVE);
    r.onsuccess = () => ok(r.result ? new Uint8Array(r.result as ArrayBuffer) : null);
    r.onerror = () => erro(r.error);
  });
}

// Gravações em fila: a última versão sempre vence e nunca há duas gravações simultâneas.
let fila: Promise<void> = Promise.resolve();
let pendentes = 0;
export function gravarBanco(bytes: Uint8Array): Promise<void> {
  pendentes++;
  const copia = bytes.slice().buffer;
  fila = fila.then(async () => {
    const idb = await abrirIdb();
    await new Promise<void>((ok, erro) => {
      const tx = idb.transaction(LOJA, "readwrite");
      tx.objectStore(LOJA).put(copia, CHAVE);
      tx.oncomplete = () => ok();
      tx.onerror = () => erro(tx.error);
    });
  }).catch((e) => console.error("[armazenamento]", e)).finally(() => { pendentes--; });
  return fila;
}

export const gravacoesPendentes = () => pendentes;

/** Pede ao sistema para não apagar os dados quando faltar espaço. */
export async function pedirPersistencia(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* sem suporte */ }
  return null;
}
