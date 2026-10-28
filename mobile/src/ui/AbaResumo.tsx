import { useMemo, useState } from "react";
import { useApp } from "./contexto";
import { calcular } from "../dominio/resumo";
import { relatorioHtml } from "../dominio/relatorio";
import { brl, pct, mesAnterior } from "../dominio/datas";
import { entregarArquivo, abrirHtml } from "../plataforma";
import { BarrasPorTipo, Destaques, Kpi, Vazio } from "./comum";

export function AbaResumo() {
  const { repo, ano, mes, hoje, versao, irPara, novoLancamento, aviso } = useApp();
  const [ocupado, setOcupado] = useState(false);
  const res = useMemo(() => {
    const [aa, ma] = mesAnterior(ano, mes);
    return calcular(repo.lancamentos(ano, mes), repo.lancamentos(aa, ma), repo.periodos(), ano, mes, hoje);
  }, [repo, ano, mes, hoje, versao]);
  const i = res.ind;

  async function compartilhar() {
    setOcupado(true);
    try {
      const r = await entregarArquivo(`resumo_${ano}_${String(mes).padStart(2, "0")}.html`, relatorioHtml(res), "text/html");
      if (r === "baixado") aviso("Relatório salvo em Downloads.");
    } catch (e) { aviso(`Não foi possível compartilhar: ${(e as Error).message}`); }
    finally { setOcupado(false); }
  }

  if (res.vazio) {
    return (
      <div className="cartao">
        <Vazio icone="🗓️">
          <p><b>Nenhum lançamento neste mês.</b></p>
          <p className="sub">Toque em <b>+</b> para lançar uma receita ou despesa, ou carregue dados de exemplo em Ajustes.</p>
          <div className="linha-botoes" style={{ marginTop: 16 }}>
            <button className="botao prim" onClick={() => novoLancamento("D")}>Lançar despesa</button>
            <button className="botao" onClick={() => novoLancamento("R")}>Lançar receita</button>
          </div>
        </Vazio>
      </div>
    );
  }

  const c = res.comparativo;
  const variacao = (v: number | null, inverso = false) => v === null ? null : (
    <span className={(v >= 0) !== inverso ? "pos" : "neg"} title="em relação ao mês anterior">{v >= 0 ? "▲" : "▼"}{pct(Math.abs(v))}</span>);

  return (
    <>
      <section className="cartao heroi" aria-label="Saldo do mês">
        <div className="rotulo">Saldo previsto do mês</div>
        <div className={`valor num ${i.saldoPrevisto >= 0 ? "pos" : "neg"}`}>{brl(i.saldoPrevisto)}</div>
        <div className="linha-mini sub num">
          <span>Realizado: <b>{brl(i.saldoRealizado)}</b></span>
          {c.temDados && <span>{c.rotulo}: {brl(c.saldoAnt)}</span>}
        </div>
      </section>

      <div className="grade-kpi">
        <Kpi rotulo="Receitas" valor={brl(i.receitas)} cor="var(--receita)" medidor={i.pctRecebidas}
          sub={`Recebido ${brl(i.recebido)}`} extra={c.temDados && variacao(c.varReceitas)} />
        <Kpi rotulo="Despesas" valor={brl(i.despesas)} cor="var(--despesa)" medidor={i.pctPagas}
          sub={`Pago ${brl(i.pago)}`} extra={c.temDados && variacao(c.varDespesas, true)} />
        <Kpi rotulo="Despesa / Receita" valor={i.pctDespReceita !== null ? pct(i.pctDespReceita) : "—"} cor="var(--despesa)"
          medidor={i.pctDespReceita} sub="comprometimento da receita" />
        <Kpi rotulo="Despesas pagas" valor={i.pctPagas !== null ? pct(i.pctPagas) : "—"} sub={`${i.qtdPagas} de ${i.qtdDespesas} · por valor`} />
        <Kpi rotulo="A pagar" valor={brl(i.aPagar)} classe={i.vencidasQtd ? "neg" : ""}
          sub={i.vencidasQtd ? `${i.vencidasQtd} vencida(s): ${brl(i.vencidasValor)}` : "nenhuma vencida"} />
        <Kpi rotulo="Vence em 7 dias" valor={brl(i.prox7Valor)} sub={`${i.prox7Qtd} despesa(s)`} />
      </div>

      <section className="cartao">
        <h2>Destaques</h2>
        <Destaques itens={res.destaques} />
      </section>

      <section className="cartao">
        <h2>Equilíbrio por período <button className="acao" onClick={() => irPara("equilibrio")}>Detalhes</button></h2>
        {res.equilibrio.map((p) => (
          <div className="periodo" key={p.periodo}>
            <div className="cab"><span className="nome">{p.periodo}</span>
              <span className={`acum num ${p.acumulado >= 0 ? "pos" : "neg"}`}>{brl(p.acumulado)}</span></div>
            <div className="mini num">Entra {brl(p.receitas)} · Sai {brl(p.despesas)} · saldo acumulado</div>
          </div>
        ))}
      </section>

      <section className="cartao">
        <h2>Despesas por tipo</h2>
        <BarrasPorTipo itens={res.despesasPorTipo} cor="var(--despesa)" rotEf="Pago" rotPend="A pagar" />
      </section>

      <section className="cartao">
        <h2>Receitas por tipo</h2>
        <BarrasPorTipo itens={res.receitasPorTipo} cor="var(--receita)" rotEf="Recebido" rotPend="A receber" />
      </section>

      <div className="linha-botoes">
        <button className="botao prim" disabled={ocupado} onClick={compartilhar}>Compartilhar relatório</button>
        <button className="botao" onClick={() => abrirHtml(relatorioHtml(res))}>Ver / imprimir</button>
      </div>
    </>
  );
}
