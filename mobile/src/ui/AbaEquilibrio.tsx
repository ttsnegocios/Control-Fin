import { useMemo, useState } from "react";
import { useApp } from "./contexto";
import { equilibrio, situacao } from "../dominio/resumo";
import { brl, dataBr } from "../dominio/datas";
import { Vazio } from "./comum";
import { Colunas } from "./graficos";

export function AbaEquilibrio() {
  const { repo, ano, mes, hoje, versao, editarLancamento } = useApp();
  const [aberto, setAberto] = useState<string | null>(null);
  const ls = useMemo(() => repo.lancamentos(ano, mes), [repo, ano, mes, versao]);
  const eq = useMemo(() => equilibrio(ls, repo.periodos()), [ls, repo, versao]);

  if (!ls.length) return <div className="cartao"><Vazio icone="⚖️">Sem lançamentos neste mês.</Vazio></div>;
  const curto = (n: string) => n.replace(/\s*\(.*\)/, "");
  const falta = eq.find((p) => p.acumulado < 0);

  return (
    <>
      <section className="cartao">
        <h2>Entradas x saídas por período</h2>
        <p className="sub" style={{ marginTop: -6 }}>Mostra se as receitas chegam antes das despesas vencerem.</p>
        <div className="legenda"><span><i className="ponto" style={{ background: "var(--receita)" }} />Receitas</span>
          <span><i className="ponto" style={{ background: "var(--despesa)" }} />Despesas</span>
          <span><i className="ponto" style={{ background: "var(--texto-2)", borderRadius: 5 }} />Saldo acumulado</span></div>
        <Colunas key={`${ano}-${mes}`} categorias={eq.map((p) => curto(p.periodo))} altura={200}
          series={[{ nome: "Receitas", cor: "var(--receita)", valores: eq.map((p) => p.receitas) },
                   { nome: "Despesas", cor: "var(--despesa)", valores: eq.map((p) => p.despesas) }]}
          linha={{ nome: "Acumulado", cor: "var(--texto-2)", valores: eq.map((p) => p.acumulado) }} />
        {falta && <p className="erro" style={{ marginTop: 10 }}>Falta de caixa em "{falta.periodo}": {brl(falta.acumulado)}.</p>}
      </section>

      <section className="cartao">
        {eq.map((p) => {
          const doPeriodo = ls.filter((l) => (l.periodo ?? "Sem período") === p.periodo);
          return (
            <div className="periodo" key={p.periodo}>
              <div className="cab"><span className="nome">{p.periodo}</span>
                <span className={`acum num ${p.acumulado >= 0 ? "pos" : "neg"}`}>{brl(p.acumulado)}</span></div>
              <div className="es num">
                <span><i className="ponto" style={{ background: "var(--receita)" }} /> Entra <b>{brl(p.receitas)}</b></span>
                <span><i className="ponto" style={{ background: "var(--despesa)" }} /> Sai <b>{brl(p.despesas)}</b></span>
              </div>
              <div className="mini num" style={{ marginTop: 4 }}>Saldo do período {brl(p.saldo)} · acumulado até aqui {brl(p.acumulado)}</div>
              {doPeriodo.length > 0 && (
                <button className="voltar" style={{ fontSize: 14 }} onClick={() => setAberto(aberto === p.periodo ? null : p.periodo)}>
                  {aberto === p.periodo ? "Ocultar" : `Ver ${doPeriodo.length} lançamento(s)`}
                </button>
              )}
              {aberto === p.periodo && (
                <div className="lista" style={{ marginTop: 6 }}>
                  {doPeriodo.map((l) => (
                    <div className="item" key={l.id} onClick={() => editarLancamento(l.id)} style={{ cursor: "pointer", minHeight: 52 }}>
                      <span className="marca" style={{ background: l.natureza === "D" ? "var(--despesa)" : "var(--receita)" }} />
                      <div className="corpo"><div className="desc">{l.descricao}</div><div className="meta">{dataBr(l.vencimento)} · {situacao(l, hoje)}</div></div>
                      <div className="valor num">{l.natureza === "D" ? "−" : "+"} {brl(l.valor)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}
