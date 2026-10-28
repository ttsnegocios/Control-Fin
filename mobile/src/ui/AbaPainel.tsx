import { useMemo, useState } from "react";
import { useApp } from "./contexto";
import { porMes, porTipo } from "../dominio/resumo";
import { brl, pct, MESES_ABREV } from "../dominio/datas";
import { BarrasPorTipo, Kpi, Vazio } from "./comum";
import { Colunas } from "./graficos";

export function AbaPainel() {
  const { repo, ano, mes, versao } = useApp();
  const [escopo, setEscopo] = useState<"mes" | "ano">("mes");
  const doAno = useMemo(() => repo.lancamentos(ano), [repo, ano, versao]);
  const ls = escopo === "ano" ? doAno : doAno.filter((l) => l.mes === mes);
  const meses = porMes(doAno);

  const rec = ls.filter((l) => l.natureza === "R"), desp = ls.filter((l) => l.natureza === "D");
  const s = (x: typeof ls) => x.reduce((a, l) => a + l.valor, 0);
  const totR = s(rec), totD = s(desp), pago = s(desp.filter((l) => l.efetivado)), recebido = s(rec.filter((l) => l.efetivado));
  const pctDR = totR ? (totD / totR) * 100 : null, pctPagas = totD ? (pago / totD) * 100 : null;
  const tipos = porTipo(desp, totD, totR);

  return (
    <>
      <div className="segmentado" role="radiogroup" aria-label="Período analisado">
        <button role="radio" aria-checked={escopo === "mes"} className={escopo === "mes" ? "ativo" : ""} onClick={() => setEscopo("mes")}>Mês</button>
        <button role="radio" aria-checked={escopo === "ano"} className={escopo === "ano" ? "ativo" : ""} onClick={() => setEscopo("ano")}>Ano {ano}</button>
      </div>

      {!ls.length ? <div className="cartao"><Vazio icone="📊">Sem lançamentos {escopo === "ano" ? `em ${ano}` : "neste mês"}.</Vazio></div> : (
        <>
          <div className="grade-kpi">
            <Kpi rotulo="Total de receitas" valor={brl(totR)} cor="var(--receita)" sub={`Recebido ${brl(recebido)}`} />
            <Kpi rotulo="Total de despesas" valor={brl(totD)} cor="var(--despesa)" sub={`Pago ${brl(pago)}`} />
            <Kpi rotulo="Despesa / Receita" valor={pctDR !== null ? pct(pctDR) : "—"} cor="var(--despesa)" medidor={pctDR}
              sub={pctDR !== null && pctDR > 100 ? "despesas acima da receita" : "comprometimento da receita"} />
            <Kpi rotulo="Despesas pagas" valor={pctPagas !== null ? pct(pctPagas) : "—"} cor="var(--ok)" medidor={pctPagas}
              sub={`${desp.filter((l) => l.efetivado).length} de ${desp.length} · por valor`} />
          </div>

          <section className="cartao">
            <h2>Despesas por tipo {escopo === "ano" ? `— ${ano}` : ""}</h2>
            <BarrasPorTipo itens={tipos} cor="var(--despesa)" rotEf="Pago" rotPend="A pagar" />
          </section>
        </>
      )}

      <section className="cartao">
        <h2>Receitas x despesas — {ano}</h2>
        <div className="legenda"><span><i className="ponto" style={{ background: "var(--receita)" }} />Receitas</span>
          <span><i className="ponto" style={{ background: "var(--despesa)" }} />Despesas</span></div>
        <Colunas key={`rd-${ano}-${mes}`} categorias={MESES_ABREV} destaque={mes - 1}
          series={[{ nome: "Receitas", cor: "var(--receita)", valores: meses.map((m) => m.receitas) },
                   { nome: "Despesas", cor: "var(--despesa)", valores: meses.map((m) => m.despesas) }]} />
      </section>

      <section className="cartao">
        <h2>Saldo mensal — {ano}</h2>
        <div className="legenda"><span><i className="ponto" style={{ background: "var(--ok)" }} />Sobrou</span>
          <span><i className="ponto" style={{ background: "var(--alerta)" }} />Faltou</span></div>
        <Colunas key={`s-${ano}-${mes}`} categorias={MESES_ABREV} destaque={mes - 1} altura={170}
          series={[{ nome: "Saldo", cor: "cond:var(--ok):var(--alerta)", valores: meses.map((m) => m.saldo) }]} />
      </section>
    </>
  );
}
