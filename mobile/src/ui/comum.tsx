import { useEffect, type ReactNode } from "react";
import { brl } from "../dominio/datas";

export function Folha({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [aoFechar]);
  return (
    <div className="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="folha" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="alca" />
        <h3>{titulo}<button aria-label="Fechar" onClick={aoFechar}>✕</button></h3>
        {children}
      </div>
    </div>
  );
}

export function Kpi({ rotulo, valor, sub, cor, medidor, classe = "", extra }:
  { rotulo: string; valor: string; sub?: ReactNode; cor?: string; medidor?: number | null; classe?: string; extra?: ReactNode }) {
  return (
    <div className="kpi">
      <div className="r">{cor && <span className="ponto" style={{ background: cor }} />}{rotulo}{extra && <span className="extra num">{extra}</span>}</div>
      <div className={`v num ${classe}`}>{valor}</div>
      {sub && <div className="s num">{sub}</div>}
      {medidor != null && <div className="medidor"><div style={{ width: `${Math.min(Math.max(medidor, 0), 100)}%`, background: cor ?? "var(--primaria)" }} /></div>}
    </div>
  );
}

/** Barras horizontais com parte efetivada (cor) e pendente (neutra). */
export function BarrasPorTipo({ itens, cor, rotEf, rotPend }:
  { itens: { tipo: string; total: number; efetivado: number; pctTotal: number }[]; cor: string; rotEf: string; rotPend: string }) {
  if (!itens.length) return <p className="sub">Sem lançamentos.</p>;
  const mx = Math.max(...itens.map((i) => i.total)) || 1;
  return (
    <>
      <div className="legenda"><span><i className="ponto" style={{ background: cor }} />{rotEf}</span>
        <span><i className="ponto" style={{ background: "var(--neutro)" }} />{rotPend}</span></div>
      <div className="barras">
        {itens.map((i) => (
          <div className="barra-linha" key={i.tipo} aria-label={`${i.tipo}: ${brl(i.total)}, ${rotEf.toLowerCase()} ${brl(i.efetivado)}`}>
            <div className="topo"><span>{i.tipo}</span><span className="num"><b>{brl(i.total)}</b> <span className="mini">{i.pctTotal.toFixed(0)}%</span></span></div>
            <div className="trilho" style={{ width: `${(i.total / mx) * 100}%` }}>
              {i.efetivado > 0 && <div style={{ flex: i.efetivado, background: cor }} />}
              {i.total - i.efetivado > 0.004 && <div style={{ flex: i.total - i.efetivado, background: "var(--neutro)" }} />}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function Destaques({ itens }: { itens: [string, string][] }) {
  const sinal: Record<string, string> = { ok: "✓", atencao: "!", alerta: "!", info: "i" };
  return (
    <ul className="destaques">
      {itens.map(([n, t], k) => <li key={k}><span className={`ic ${n}`} aria-hidden>{sinal[n]}</span><span>{t}</span></li>)}
    </ul>
  );
}

export function Vazio({ icone, children }: { icone: string; children: ReactNode }) {
  return <div className="vazio"><div className="grande" aria-hidden>{icone}</div>{children}</div>;
}

const caminho: Record<string, ReactNode> = {
  resumo: <path d="M4 13h4v7H4zM10 4h4v16h-4zM16 9h4v11h-4z" />,
  lancamentos: <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  painel: <><path d="M3 20h18" /><path d="M5 16l4-5 4 3 6-8" /></>,
  equilibrio: <><path d="M12 3v18M5 7h14" /><path d="M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0z" /></>,
  ajustes: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
};

export function Icone({ nome }: { nome: keyof typeof caminho }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{caminho[nome]}</svg>;
}
