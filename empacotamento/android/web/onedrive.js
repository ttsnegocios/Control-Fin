// Sincronização do banco (financeiro.db) com o OneDrive do usuário.
//
// O app sempre trabalha numa cópia local (IndexedDB), então funciona offline.
// Este módulo, rodando na página, compara essa cópia com a do OneDrive:
//   - só o aparelho mudou      -> envia   (PUT com If-Match: garante que ninguém mudou no meio)
//   - só o OneDrive mudou      -> baixa e avisa o app para recarregar a tela
//   - os dois mudaram          -> conflito: o usuário escolhe; a versão descartada
//                                 é guardada no OneDrive como cópia, nada se perde.
//
// Arquivos no sistema de arquivos do app (Pyodide):
//   financeiro.db  banco | .alteracao  contador de gravações (escrito pelo db.py)
//   .sync.json     {ctag, alteracao} do último acordo com o OneDrive
//   .remoto        marca escrita aqui ao baixar; o app (fragmento) recarrega ao vê-la mudar

export const CAMINHOS = {
  db: "/mnt/dados/financeiro.db",
  alteracao: "/mnt/dados/.alteracao",
  sync: "/mnt/dados/.sync.json",
  remoto: "/mnt/dados/.remoto",
};

export const GRAPH_APPROOT = "https://graph.microsoft.com/v1.0/me/drive/special/approot";
const ARQUIVO = "financeiro.db";

export class Sincronizador {
  /**
   * @param {object} o
   * @param {{ler:(p:string,texto?:boolean)=>Promise<any>, gravar:(p:string,d:any)=>Promise<void>}} o.fs
   * @param {() => Promise<string|null>} o.obterToken   token do Graph ou null (não conectado)
   * @param {(info:object) => Promise<"onedrive"|"local"|null>} o.resolverConflito
   * @param {(estado:string, detalhe?:string) => void} [o.aoMudarEstado]
   * @param {string} [o.aparelho]   nome curto usado nas cópias de conflito
   * @param {typeof fetch} [o.fetchFn]
   */
  constructor({ fs, obterToken, resolverConflito, aoMudarEstado = () => {}, aparelho = "aparelho", fetchFn }) {
    this.fs = fs;
    this.obterToken = obterToken;
    this.resolverConflito = resolverConflito;
    this.aoMudarEstado = aoMudarEstado;
    this.aparelho = aparelho.replace(/[^\w-]+/g, "-").slice(0, 30) || "aparelho";
    this.fetch = fetchFn || globalThis.fetch.bind(globalThis);
    this.estado = "iniciando";
    this.ultimaSync = null;
    this._rodando = null;
    this._repetir = false;
    this._ultimoContador = null;
    this._timer = null;
  }

  _estado(e, detalhe = "") {
    this.estado = e;
    this.aoMudarEstado(e, detalhe);
  }

  // ---------------------------------------------------------------- arquivos locais
  async lerContador() {
    const t = await this.fs.ler(CAMINHOS.alteracao, true);
    const n = parseInt(t ?? "0", 10);
    return Number.isFinite(n) ? n : 0;
  }

  async lerSync() {
    const t = await this.fs.ler(CAMINHOS.sync, true);
    try { return t ? JSON.parse(t) : null; } catch { return null; }
  }

  async gravarSync(ctag, alteracao) {
    await this.fs.gravar(CAMINHOS.sync, JSON.stringify({ ctag, alteracao, em: new Date().toISOString() }));
  }

  async sujo() {
    const [contador, sync] = await Promise.all([this.lerContador(), this.lerSync()]);
    return sync ? contador !== sync.alteracao : contador > 0;
  }

  // ---------------------------------------------------------------- Graph
  async _graph(token, url, opts = {}) {
    const r = await this.fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
    return r;
  }

  async metaRemota(token) {
    const r = await this._graph(token, `${GRAPH_APPROOT}:/${ARQUIVO}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`OneDrive respondeu ${r.status} ao consultar o arquivo`);
    return r.json();
  }

  async _put(token, nome, bytes, cabecalhos = {}) {
    return this._graph(token, `${GRAPH_APPROOT}:/${encodeURIComponent(nome)}:/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", ...cabecalhos },
      body: bytes,
    });
  }

  async _baixarConteudo(meta) {
    const url = meta["@microsoft.graph.downloadUrl"];
    if (!url) throw new Error("OneDrive não forneceu o endereço de download");
    const r = await this.fetch(url);
    if (!r.ok) throw new Error(`Falha ao baixar do OneDrive (${r.status})`);
    return new Uint8Array(await r.arrayBuffer());
  }

  _nomeCopia(origem) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return `financeiro-conflito-${ts}-${origem}.db`;
  }

  // ---------------------------------------------------------------- operações
  async _baixar(meta, contador) {
    const bytes = await this._baixarConteudo(meta);
    await this.fs.gravar(CAMINHOS.db, bytes);
    await this.gravarSync(meta.cTag, contador);
    await this.fs.gravar(CAMINHOS.remoto, String(Date.now()));
    return "baixado";
  }

  async _enviar(token, ctagEsperado, contador) {
    const bytes = await this.fs.ler(CAMINHOS.db);
    if (!bytes) throw new Error("Banco local não encontrado");
    const cab = ctagEsperado ? { "If-Match": ctagEsperado } : { "If-None-Match": "*" };
    const r = await this._put(token, ARQUIVO, bytes, cab);
    if (r.status === 412) {
      // alguém alterou o OneDrive desde a última sincronização
      const meta = await this.metaRemota(token);
      return this._conflito(token, meta, contador);
    }
    if (!r.ok) throw new Error(`OneDrive respondeu ${r.status} ao enviar`);
    const j = await r.json();
    await this.gravarSync(j.cTag, contador);
    return "enviado";
  }

  async _conflito(token, meta, contador) {
    if (!meta) return this._enviar(token, null, contador);
    this._estado("conflito");
    const escolha = await this.resolverConflito({
      remotoModificadoEm: meta.lastModifiedDateTime,
      remotoPor: meta.lastModifiedBy?.application?.displayName || meta.lastModifiedBy?.user?.displayName || "",
    });
    if (escolha === "onedrive") {
      const local = await this.fs.ler(CAMINHOS.db);
      if (local) await this._put(token, this._nomeCopia(this.aparelho), local);
      await this._baixar(meta, await this.lerContador());
      return "conflito-onedrive";
    }
    if (escolha === "local") {
      const remoto = await this._baixarConteudo(meta);
      await this._put(token, this._nomeCopia("onedrive"), remoto);
      return this._enviar(token, meta.cTag, await this.lerContador());
    }
    return "adiado";
  }

  async _sincronizar() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this._estado((await this.sujo()) ? "pendente-offline" : "offline");
      return "offline";
    }
    const token = await this.obterToken();
    if (!token) { this._estado("desconectado"); return "desconectado"; }

    this._estado("sincronizando");
    const [contador, sync] = await Promise.all([this.lerContador(), this.lerSync()]);
    const sujo = sync ? contador !== sync.alteracao : contador > 0;
    const meta = await this.metaRemota(token);

    let resultado;
    if (!meta) {
      resultado = await this._enviar(token, null, contador);              // primeiro envio
    } else if (sync && sync.ctag === meta.cTag) {
      resultado = sujo ? await this._enviar(token, meta.cTag, contador) : "em-dia";
    } else if (!sujo) {
      resultado = await this._baixar(meta, contador);                      // novidade no OneDrive
    } else {
      resultado = await this._conflito(token, meta, contador);             // os dois mudaram
    }
    if (resultado === "adiado") {
      this._estado("conflito");
    } else {
      this.ultimaSync = new Date();
      this._estado("sincronizado");
    }
    return resultado;
  }

  /** Executa uma sincronização (nunca duas ao mesmo tempo; pedidos durante uma são reagrupados). */
  async sincronizar() {
    if (this._rodando) { this._repetir = true; return this._rodando; }
    this._rodando = (async () => {
      let res;
      try {
        do {
          this._repetir = false;
          res = await this._sincronizar();
        } while (this._repetir);
      } catch (e) {
        console.error("[onedrive]", e);
        const offline = e instanceof TypeError;   // fetch falhou: sem rede
        this._estado(offline ? "pendente-offline" : "erro", String(e.message || e));
        res = "erro";
      } finally {
        this._rodando = null;
      }
      return res;
    })();
    return this._rodando;
  }

  /** Observa alterações locais e sincroniza periodicamente. */
  iniciar({ verificarAlteracaoMs = 2000, esperaEnvioMs = 2500, periodoMs = 60000 } = {}) {
    let agendado = null;
    const agendar = (ms) => { clearTimeout(agendado); agendado = setTimeout(() => this.sincronizar(), ms); };

    this._timer = setInterval(async () => {
      try {
        const c = await this.lerContador();
        if (this._ultimoContador !== null && c !== this._ultimoContador) agendar(esperaEnvioMs);
        this._ultimoContador = c;
      } catch { /* app ainda carregando */ }
    }, verificarAlteracaoMs);
    this._periodico = setInterval(() => this.sincronizar(), periodoMs);
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.sincronizar());
      document.addEventListener("visibilitychange", () => { if (!document.hidden) this.sincronizar(); });
    }
    return this.sincronizar();
  }

  parar() { clearInterval(this._timer); clearInterval(this._periodico); }
}
