// Interface da sincronização: login Microsoft (MSAL), botão de status e janela de conflito.
import { Sincronizador, CAMINHOS } from "./onedrive.js";

const ESCOPOS = ["Files.ReadWrite.AppFolder", "User.Read"];
const CHAVE_CLIENT_ID = "cf.onedriveClientId";
const CHAVE_APARELHO = "cf.nomeAparelho";

const TEXTOS = {
  "iniciando": ["☁️", "Iniciando…"],
  "sem-config": ["☁️", "Configurar OneDrive"],
  "sem-suporte": ["☁️", "Somente local"],
  "desconectado": ["☁️", "Conectar OneDrive"],
  "reconectar": ["⚠️", "Entrar novamente"],
  "sincronizando": ["↻", "Sincronizando…"],
  "sincronizado": ["✓", "Sincronizado"],
  "offline": ["☁️", "Offline"],
  "pendente-offline": ["●", "Alterações pendentes"],
  "conflito": ["⚠️", "Conflito — decidir"],
  "erro": ["⚠️", "Erro ao sincronizar"],
};

function css() {
  const s = document.createElement("style");
  s.textContent = `
  .cf-nuvem{position:fixed;right:14px;bottom:14px;z-index:2147483000;font:13px/1.3 system-ui,sans-serif}
  .cf-pill{display:flex;align-items:center;gap:6px;border:1px solid rgba(128,128,128,.35);border-radius:999px;
    padding:7px 12px;background:var(--cf-bg);color:var(--cf-fg);box-shadow:0 2px 10px rgba(0,0,0,.12);cursor:pointer}
  .cf-pill[data-estado=sincronizado] .cf-ic{color:#1a7f37}
  .cf-pill[data-estado=conflito] , .cf-pill[data-estado=erro], .cf-pill[data-estado=reconectar]{border-color:#c43b3b}
  .cf-pill[data-estado=sincronizando] .cf-ic{display:inline-block;animation:cfgira 1s linear infinite}
  @keyframes cfgira{to{transform:rotate(360deg)}}
  .cf-painel{position:absolute;right:0;bottom:46px;width:min(320px,calc(100vw - 28px));background:var(--cf-bg);color:var(--cf-fg);
    border:1px solid rgba(128,128,128,.35);border-radius:12px;padding:14px;box-shadow:0 8px 28px rgba(0,0,0,.18)}
  .cf-painel h4{margin:0 0 6px;font-size:14px}.cf-painel p{margin:6px 0;color:var(--cf-sub)}
  .cf-painel input{width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid rgba(128,128,128,.4);
    background:transparent;color:inherit;margin:6px 0}
  .cf-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .cf-btn{border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;border-radius:8px;padding:7px 12px;cursor:pointer;font:inherit}
  .cf-btn.prim{background:#1d5fb5;border-color:#1d5fb5;color:#fff}
  .cf-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:2147483001;padding:16px}
  .cf-modal > div{background:var(--cf-bg);color:var(--cf-fg);border-radius:14px;padding:20px;max-width:440px;font:14px/1.45 system-ui,sans-serif}
  .cf-modal h3{margin:0 0 8px}
  :root{--cf-bg:#fff;--cf-fg:#31333f;--cf-sub:#6b6b6b}
  @media (prefers-color-scheme:dark){:root{--cf-bg:#1a1c24;--cf-fg:#fafafa;--cf-sub:#a3a3a3}}`;
  document.head.appendChild(s);
}

function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }

function nomeAparelho() {
  let n = localStorage.getItem(CHAVE_APARELHO);
  if (!n) {
    const ua = navigator.userAgent;
    n = /Android/i.test(ua) ? "android" : /iPhone|iPad/i.test(ua) ? "ios" : /Mac/i.test(ua) ? "mac" : /Windows/i.test(ua) ? "windows" : "navegador";
    n += "-" + Math.random().toString(36).slice(2, 6);
    localStorage.setItem(CHAVE_APARELHO, n);
  }
  return n;
}

export function perguntarConflito({ remotoModificadoEm }) {
  return new Promise((resolve) => {
    const quando = remotoModificadoEm ? new Date(remotoModificadoEm).toLocaleString("pt-BR") : "—";
    const m = el(`<div class="cf-modal"><div>
      <h3>⚠️ Dados alterados em dois lugares</h3>
      <p>Este aparelho tem alterações que ainda não foram enviadas, e os dados no OneDrive também
      foram alterados em outro aparelho (em ${quando}).</p>
      <p>Escolha qual versão manter. <b>A outra não é apagada:</b> fica salva no OneDrive como
      <i>financeiro-conflito-….db</i>, e pode ser restaurada em "Backup dos dados".</p>
      <div class="cf-btns">
        <button class="cf-btn prim" data-v="onedrive">Usar a do OneDrive</button>
        <button class="cf-btn" data-v="local">Manter a deste aparelho</button>
        <button class="cf-btn" data-v="">Decidir depois</button>
      </div></div></div>`);
    m.addEventListener("click", (ev) => {
      const v = ev.target.closest("button")?.dataset.v;
      if (v === undefined) return;
      m.remove();
      resolve(v || null);
    });
    document.body.appendChild(m);
  });
}

async function criarAuth(clientId) {
  const pca = new window.msal.PublicClientApplication({
    auth: {
      clientId,
      authority: "https://login.microsoftonline.com/common",
      redirectUri: new URL("redirect.html", location.href).href,
    },
    cache: { cacheLocation: "localStorage" },
  });
  await pca.initialize();
  const res = await pca.handleRedirectPromise().catch((e) => { console.error("[login]", e); return null; });
  const conta = res?.account || pca.getActiveAccount() || pca.getAllAccounts()[0] || null;
  if (conta) pca.setActiveAccount(conta);

  let precisaReconectar = false;
  return {
    conta: () => pca.getActiveAccount(),
    get precisaReconectar() { return precisaReconectar; },
    entrar: () => pca.loginRedirect({ scopes: ESCOPOS, prompt: "select_account" }),
    sair: async () => { await pca.clearCache(); pca.setActiveAccount(null); },
    async token() {
      const account = pca.getActiveAccount();
      if (!account) return null;
      try {
        const r = await pca.acquireTokenSilent({ scopes: ESCOPOS, account });
        precisaReconectar = false;
        return r.accessToken;
      } catch (e) {
        if (e instanceof window.msal.InteractionRequiredAuthError) { precisaReconectar = true; return null; }
        throw e;
      }
    },
  };
}

async function esperarBanco(controller) {
  // o banco é criado pelo app na primeira execução do script Python
  for (let i = 0; i < 600; i++) {
    try { await controller.readFile(CAMINHOS.db); return; } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
}

export async function iniciarNuvem(controller) {
  css();
  const raiz = el(`<div class="cf-nuvem"><button class="cf-pill" data-estado="iniciando" aria-haspopup="dialog">
    <span class="cf-ic">☁️</span><span class="cf-tx">Iniciando…</span></button></div>`);
  document.body.appendChild(raiz);
  const pill = raiz.querySelector(".cf-pill");
  let painel = null;
  let auth = null;
  let sinc = null;
  let detalheErro = "";

  const mostrar = (estado) => {
    if (estado === "desconectado" && auth?.precisaReconectar) estado = "reconectar";
    const [ic, tx] = TEXTOS[estado] || TEXTOS.erro;
    pill.dataset.estado = estado;
    pill.querySelector(".cf-ic").textContent = ic;
    pill.querySelector(".cf-tx").textContent = tx;
    if (painel) abrirPainel(true);
  };

  function abrirPainel(reabrir = false) {
    painel?.remove();
    if (!reabrir && painel) { painel = null; return; }
    const estado = pill.dataset.estado;
    const conta = auth?.conta();
    let corpo;
    if (estado === "sem-suporte") {
      corpo = `<h4>Sincronização indisponível no APK</h4>
        <p>Nesta versão os dados ficam só neste aparelho. Para sincronizar com o OneDrive,
        abra o endereço do aplicativo no Chrome e use <b>⋮ → Instalar app</b>.
        Antes, baixe um backup aqui e restaure lá (barra lateral → Backup dos dados).</p>`;
    } else if (estado === "sem-config") {
      corpo = `<h4>Configurar OneDrive</h4>
        <p>Informe o <b>ID do aplicativo (client ID)</b> registrado no portal do Azure
        (veja o README, seção OneDrive).</p>
        <input id="cf-cid" placeholder="00000000-0000-0000-0000-000000000000" />
        <div class="cf-btns"><button class="cf-btn prim" data-a="salvar-cid">Salvar</button></div>`;
    } else if (!conta || estado === "reconectar") {
      corpo = `<h4>Sincronizar com o OneDrive</h4>
        <p>Entre com sua conta Microsoft para guardar os dados no seu OneDrive
        (pasta <i>Aplicativos</i>) e usar em qualquer aparelho.</p>
        <div class="cf-btns"><button class="cf-btn prim" data-a="entrar">Entrar com conta Microsoft</button></div>`;
    } else {
      const quando = sinc?.ultimaSync ? sinc.ultimaSync.toLocaleTimeString("pt-BR") : "—";
      corpo = `<h4>OneDrive</h4>
        <p>Conta: <b>${conta.username || conta.name || ""}</b></p>
        <p>Situação: ${TEXTOS[estado]?.[1] || estado}${estado === "erro" && detalheErro ? `<br><small>${detalheErro}</small>` : ""}</p>
        <p>Última sincronização: ${quando}</p>
        <div class="cf-btns">
          <button class="cf-btn prim" data-a="sync">Sincronizar agora</button>
          <button class="cf-btn" data-a="sair">Desconectar</button>
        </div>`;
    }
    painel = el(`<div class="cf-painel" role="dialog">${corpo}</div>`);
    raiz.appendChild(painel);
  }

  pill.addEventListener("click", () => abrirPainel());
  raiz.addEventListener("click", async (ev) => {
    const a = ev.target.closest("[data-a]")?.dataset.a;
    if (!a) return;
    if (a === "salvar-cid") {
      const v = raiz.querySelector("#cf-cid").value.trim();
      if (v) { localStorage.setItem(CHAVE_CLIENT_ID, v); location.reload(); }
    } else if (a === "entrar") {
      await auth.entrar();
    } else if (a === "sync") {
      sinc.sincronizar();
    } else if (a === "sair") {
      if (confirm("Desconectar do OneDrive neste aparelho? Os dados locais continuam aqui; a sincronização para até você entrar de novo.")) {
        await auth.sair(); painel?.remove(); painel = null; mostrar("desconectado");
      }
    }
  });

  // No APK (WebView do Capacitor) o login Microsoft abriria fora do app
  if (window.Capacitor) { mostrar("sem-suporte"); return; }

  const cfg = window.CF_CONFIG || {};
  const clientId = localStorage.getItem(CHAVE_CLIENT_ID) || (cfg.onedriveClientId?.startsWith("__") ? "" : cfg.onedriveClientId);
  if (!clientId || !window.msal) { mostrar("sem-config"); return; }

  try {
    auth = await criarAuth(clientId);
  } catch (e) {
    console.error(e); detalheErro = String(e.message || e); mostrar("erro"); return;
  }

  const fs = {
    ler: async (p, texto = false) => {
      try { return await controller.readFile(p, texto ? { encoding: "utf8" } : undefined); } catch { return null; }
    },
    gravar: (p, d) => controller.writeFile(p, d),
  };
  sinc = new Sincronizador({
    fs,
    obterToken: () => auth.token(),
    resolverConflito: perguntarConflito,
    aparelho: nomeAparelho(),
    aoMudarEstado: (e, det) => { detalheErro = det || ""; mostrar(e); },
  });
  window.cfSincronizador = sinc;   // útil para diagnóstico no console

  if (!auth.conta()) { mostrar("desconectado"); }
  await esperarBanco(controller);
  sinc.iniciar();
}
