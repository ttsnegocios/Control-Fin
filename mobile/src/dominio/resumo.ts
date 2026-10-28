// Cálculos do mês (porta do resumo.py do app de desktop — mesmas regras e números).
import type { Lancamento, Periodo } from "../db/repositorio";
import { MESES, brl, pct, mesAnterior, somarDias } from "./datas";

export type Nivel = "ok" | "atencao" | "alerta" | "info";

export interface PorTipo { tipo: string; total: number; efetivado: number; pendente: number; qtd: number; pctTotal: number; pctReceita: number }
export interface LinhaPeriodo { periodo: string; dias: string; receitas: number; despesas: number; saldo: number; acumulado: number }
export type Situacao = "Pago" | "Recebido" | "Vencido" | "Atrasado" | "A vencer" | "A receber";

export interface Indicadores {
  receitas: number; recebido: number; aReceber: number;
  despesas: number; pago: number; aPagar: number;
  saldoPrevisto: number; saldoRealizado: number;
  pctDespReceita: number | null; pctPagas: number | null; pctRecebidas: number | null;
  qtdReceitas: number; qtdDespesas: number; qtdPagas: number; qtdRecebidas: number;
  vencidasQtd: number; vencidasValor: number; atrasadasQtd: number; atrasadasValor: number;
  prox7Qtd: number; prox7Valor: number;
}

export interface Resumo {
  ano: number; mes: number; titulo: string; hoje: string; vazio: boolean;
  ind: Indicadores;
  comparativo: { rotulo: string; temDados: boolean; receitasAnt: number; despesasAnt: number; saldoAnt: number; varReceitas: number | null; varDespesas: number | null };
  equilibrio: LinhaPeriodo[];
  receitasPorTipo: PorTipo[]; despesasPorTipo: PorTipo[];
  receitas: Lancamento[]; despesas: Lancamento[]; maioresDespesas: Lancamento[];
  destaques: [Nivel, string][];
}

const soma = (ls: Lancamento[]) => ls.reduce((s, l) => s + l.valor, 0);
const variacao = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);

export function situacao(l: Lancamento, hoje: string): Situacao {
  if (l.efetivado) return l.natureza === "D" ? "Pago" : "Recebido";
  if (l.vencimento < hoje) return l.natureza === "D" ? "Vencido" : "Atrasado";
  return l.natureza === "D" ? "A vencer" : "A receber";
}

export function porTipo(ls: Lancamento[], totalRef: number, totalReceita: number): PorTipo[] {
  const m = new Map<string, PorTipo>();
  for (const l of ls) {
    const k = l.tipo ?? "Sem tipo";
    const t = m.get(k) ?? { tipo: k, total: 0, efetivado: 0, pendente: 0, qtd: 0, pctTotal: 0, pctReceita: 0 };
    t.total += l.valor; t.qtd += 1; if (l.efetivado) t.efetivado += l.valor;
    m.set(k, t);
  }
  return [...m.values()].map((t) => ({
    ...t, pendente: t.total - t.efetivado,
    pctTotal: totalRef ? (t.total / totalRef) * 100 : 0,
    pctReceita: totalReceita ? (t.total / totalReceita) * 100 : 0,
  })).sort((a, b) => b.total - a.total);
}

export function equilibrio(ls: Lancamento[], periodos: Periodo[]): LinhaPeriodo[] {
  const ordem = periodos.map((p) => p.nome);
  if (ls.some((l) => !l.periodo)) ordem.push("Sem período");
  const faixa = new Map(periodos.map((p) => [p.nome, `dias ${p.dia_inicio}–${p.dia_fim}`]));
  let acumulado = 0;
  return ordem.map((nome) => {
    const doPeriodo = ls.filter((l) => (l.periodo ?? "Sem período") === nome);
    const receitas = soma(doPeriodo.filter((l) => l.natureza === "R"));
    const despesas = soma(doPeriodo.filter((l) => l.natureza === "D"));
    acumulado += receitas - despesas;
    return { periodo: nome, dias: faixa.get(nome) ?? "", receitas, despesas, saldo: receitas - despesas, acumulado };
  });
}

export function calcular(doMes: Lancamento[], mesAnt: Lancamento[], periodos: Periodo[], ano: number, mes: number, hoje: string): Resumo {
  const rec = doMes.filter((l) => l.natureza === "R");
  const desp = doMes.filter((l) => l.natureza === "D");
  const totR = soma(rec), totD = soma(desp);
  const recOk = soma(rec.filter((l) => l.efetivado)), despOk = soma(desp.filter((l) => l.efetivado));
  const vencidas = desp.filter((l) => !l.efetivado && l.vencimento < hoje);
  const atrasadas = rec.filter((l) => !l.efetivado && l.vencimento < hoje);
  const limite7 = somarDias(hoje, 7);
  const prox7 = desp.filter((l) => !l.efetivado && l.vencimento >= hoje && l.vencimento <= limite7);

  const ind: Indicadores = {
    receitas: totR, recebido: recOk, aReceber: totR - recOk,
    despesas: totD, pago: despOk, aPagar: totD - despOk,
    saldoPrevisto: totR - totD, saldoRealizado: recOk - despOk,
    pctDespReceita: totR ? (totD / totR) * 100 : null,
    pctPagas: totD ? (despOk / totD) * 100 : null,
    pctRecebidas: totR ? (recOk / totR) * 100 : null,
    qtdReceitas: rec.length, qtdDespesas: desp.length,
    qtdPagas: desp.filter((l) => l.efetivado).length, qtdRecebidas: rec.filter((l) => l.efetivado).length,
    vencidasQtd: vencidas.length, vencidasValor: soma(vencidas),
    atrasadasQtd: atrasadas.length, atrasadasValor: soma(atrasadas),
    prox7Qtd: prox7.length, prox7Valor: soma(prox7),
  };

  const ra = soma(mesAnt.filter((l) => l.natureza === "R")), da = soma(mesAnt.filter((l) => l.natureza === "D"));
  const [aa, ma] = mesAnterior(ano, mes);
  const comparativo = {
    rotulo: `${MESES[ma - 1]}/${aa}`, temDados: mesAnt.length > 0,
    receitasAnt: ra, despesasAnt: da, saldoAnt: ra - da,
    varReceitas: variacao(totR, ra), varDespesas: variacao(totD, da),
  };

  const res: Resumo = {
    ano, mes, titulo: `${MESES[mes - 1]} de ${ano}`, hoje, vazio: doMes.length === 0, ind, comparativo,
    equilibrio: equilibrio(doMes, periodos),
    receitasPorTipo: porTipo(rec, totR, totR), despesasPorTipo: porTipo(desp, totD, totR),
    receitas: rec, despesas: desp,
    maioresDespesas: [...desp].sort((a, b) => b.valor - a.valor).slice(0, 5),
    destaques: [],
  };
  res.destaques = destaques(res);
  return res;
}

export function destaques(res: Resumo): [Nivel, string][] {
  const { ind: i, comparativo: c, equilibrio: eq } = res;
  if (res.vazio) return [["info", "Nenhum lançamento neste mês."]];
  const out: [Nivel, string][] = [];

  if (i.saldoPrevisto >= 0) out.push(["ok", `O mês fecha com saldo positivo previsto de ${brl(i.saldoPrevisto)}.`]);
  else out.push(["alerta", `As despesas superam as receitas em ${brl(-i.saldoPrevisto)} — o mês fecha negativo.`]);

  const p = i.pctDespReceita;
  if (p !== null) out.push([p <= 70 ? "ok" : p <= 100 ? "atencao" : "alerta", `As despesas comprometem ${pct(p)} da receita do mês.`]);
  else if (i.despesas) out.push(["alerta", "Há despesas lançadas, mas nenhuma receita no mês."]);

  const negativos = eq.filter((l) => l.acumulado < 0);
  if (negativos.length) {
    const pior = Math.min(...negativos.map((l) => l.acumulado));
    out.push(["atencao", `Falta de caixa em "${negativos[0].periodo}": o saldo acumulado chega a ${brl(pior)}. ` +
      "As despesas desse período vencem antes das receitas entrarem — considere renegociar vencimentos."]);
  } else if (eq.length) {
    out.push(["ok", "Em todos os períodos as receitas acumuladas cobrem as despesas."]);
  }

  if (i.vencidasQtd) out.push(["alerta", `${i.vencidasQtd} despesa(s) vencida(s) e não paga(s), somando ${brl(i.vencidasValor)}.`]);
  if (i.prox7Qtd) out.push(["info", `${i.prox7Qtd} despesa(s) vencem nos próximos 7 dias (${brl(i.prox7Valor)}).`]);
  if (i.atrasadasQtd) out.push(["atencao", `${i.atrasadasQtd} receita(s) com data passada ainda não confirmadas (${brl(i.atrasadasValor)}).`]);

  const t = res.despesasPorTipo[0];
  if (t) out.push(["info", `Maior grupo de despesa: ${t.tipo}, com ${brl(t.total)} (${pct(t.pctTotal)} das despesas).`]);

  if (c.temDados) {
    const partes: string[] = [];
    if (c.varReceitas !== null) partes.push(`receitas ${c.varReceitas >= 0 ? "+" : ""}${pct(c.varReceitas)}`);
    if (c.varDespesas !== null) partes.push(`despesas ${c.varDespesas >= 0 ? "+" : ""}${pct(c.varDespesas)}`);
    if (partes.length) out.push(["info", `Em relação a ${c.rotulo}: ${partes.join(", ")}.`]);
  }
  return out;
}

/** Totais por mês do ano (painel). */
export function porMes(doAno: Lancamento[]): { mes: number; receitas: number; despesas: number; saldo: number }[] {
  return Array.from({ length: 12 }, (_, k) => {
    const ls = doAno.filter((l) => l.mes === k + 1);
    const receitas = soma(ls.filter((l) => l.natureza === "R")), despesas = soma(ls.filter((l) => l.natureza === "D"));
    return { mes: k + 1, receitas, despesas, saldo: receitas - despesas };
  });
}
