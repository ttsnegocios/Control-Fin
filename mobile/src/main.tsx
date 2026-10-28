import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./estilo.css";
import { App } from "./App";
import { iniciarRepositorio } from "./db/iniciar";
import { ehNativo } from "./plataforma";

const raiz = createRoot(document.getElementById("root")!);
raiz.render(<div className="carregando"><div><img src="./icones/icone-192.png" alt="" /><p>Abrindo seus dados…</p></div></div>);

iniciarRepositorio()
  .then((repo) => raiz.render(<StrictMode><App repo={repo} /></StrictMode>))
  .catch((e) => {
    console.error(e);
    raiz.render(<div className="carregando"><div style={{ padding: 24 }}><p><b>Não foi possível abrir o banco de dados.</b></p>
      <p className="sub">{String(e?.message ?? e)}</p></div></div>);
  });

// Funciona offline: no navegador, um service worker guarda o app no aparelho.
if ("serviceWorker" in navigator && !ehNativo() && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
