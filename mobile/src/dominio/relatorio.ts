// Relatório do mês em HTML (mesmo layout do app de desktop) — para compartilhar, imprimir ou salvar em PDF.
import type { Resumo, PorTipo } from "./resumo";
import { situacao } from "./resumo";
import type { Lancamento } from "../db/repositorio";
import { brl, pct, dataBr } from "./datas";

const COR_RECEITA = "#2a78d6";
const COR_DESPESA = "#eb6834";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const CSS = `*{box-sizing:border-box} body{font:13px/1.45 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2328;
margin:0;background:#fff} .pag{max-width:960px;margin:0 auto;padding:28px 28px 40px}
h1{font-size:22px;margin:0} h2{font-size:15px;margin:26px 0 10px;padding-bottom:6px;border-bottom:2px solid #e6e6e3}
h3{font-size:13px;margin:16px 0 6px;color:#52514e} .sub{color:#6b6b68;margin-top:2px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px} .kpi{border:1px solid #e1e0dc;border-radius:10px;padding:10px 12px}
.kpi .r{font-size:11px;color:#6b6b68;text-transform:uppercase;letter-spacing:.03em;display:flex;gap:6px;align-items:center}
.kpi .v{font-size:18px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums} .kpi .s{font-size:11px;color:#6b6b68}
.dot{width:9px;height:9px;border-radius:2px;display:inline-block} .pos{color:#1a7f37} .neg{color:#c43b3b}
.meter{height:6px;border-radius:3px;background:#ecebe7;margin-top:6px;overflow:hidden}.meter>div{height:100%;border-radius:3px}
ul.dest{list-style:none;padding:0;margin:0} ul.dest li{padding:7px 10px;border-left:4px solid;margin:5px 0;border-radius:4px;background:#f7f7f5}
ul.dest li.ok{border-color:#1a7f37} ul.dest li.atencao{border-color:#d9a000} ul.dest li.alerta{border-color:#c43b3b} ul.dest li.info{border-color:#2a78d6}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums} th,td{padding:5px 8px;border-bottom:1px solid #ecebe7;text-align:left}
th{font-size:11px;color:#6b6b68;text-transform:uppercase;letter-spacing:.03em;font-weight:600} td.n,th.n{text-align:right}
tfoot td{font-weight:700;border-top:2px solid #d6d5d0} .barcell{width:28%} .bar{height:10px;border-radius:0 3px 3px 0}
.tag{font-size:11px;padding:1px 7px;border-radius:9px;background:#ecebe7;white-space:nowrap}
.tag.Pago,.tag.Recebido{background:#dcefe0;color:#1a6b30}.tag.Vencido,.tag.Atrasado{background:#f8dcdc;color:#a32a2a}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px} .rod{margin-top:30px;color:#8a8984;font-size:11px}
.leg{display:flex;gap:14px;font-size:11px;color:#52514e;margin:4px 0 8px}
@media print{.pag{padding:0} h2{break-after:avoid} table,.kpis{break-inside:avoid} @page{size:A4;margin:14mm}}
@media (max-width:700px){.kpis{grid-template-columns:repeat(2,1fr)} .cols{grid-template-columns:1fr}}`;

function kpi(rot: string, val: string, sub = "", cor?: string, medidor?: number | null, cls = "") {
  const dot = cor ? `<span class="dot" style="background:${cor}"></span>` : "";
  const m = medidor == null ? "" : `<div class="meter"><div style="width:${Math.min(Math.max(medidor, 0), 100).toFixed(1)}%;background:${cor ?? COR_RECEITA}"></div></div>`;
  return `<div class="kpi"><div class="r">${dot}${esc(rot)}</div><div class="v ${cls}">${val}</div><div class="s">${sub}</div>${m}</div>`;
}

function tabelaTipos(t: PorTipo[], cor: string, rotEf: string, rotPend: string, comReceita: boolean) {
  if (!t.length) return "<p class='sub'>Sem lançamentos.</p>";
  const mx = Math.max(...t.map((x) => x.total)) || 1;
  const linhas = t.map((r) => `<tr><td>${esc(r.tipo)}</td><td class='n'>${brl(r.total)}</td>
    <td class='barcell'><div class='bar' style='width:${(r.total / mx * 100).toFixed(1)}%;background:${cor}'></div></td>
    <td class='n'>${pct(r.pctTotal)}</td>${comReceita ? `<td class='n'>${pct(r.pctReceita)}</td>` : ""}
    <td class='n'>${brl(r.efetivado)}</td><td class='n'>${brl(r.pendente)}</td><td class='n'>${r.qtd}</td></tr>`).join("");
  const s = (k: keyof PorTipo) => t.reduce((a, r) => a + Number(r[k]), 0);
  return `<table><thead><tr><th>Tipo</th><th class='n'>Total</th><th></th><th class='n'>% do total</th>
    ${comReceita ? "<th class='n'>% receita</th>" : ""}<th class='n'>${rotEf}</th><th class='n'>${rotPend}</th><th class='n'>Qtd</th></tr></thead>
    <tbody>${linhas}</tbody><tfoot><tr><td>Total</td><td class='n'>${brl(s("total"))}</td><td></td><td class='n'>100,0%</td>
    ${comReceita ? `<td class='n'>${pct(s("pctReceita"))}</td>` : ""}<td class='n'>${brl(s("efetivado"))}</td>
    <td class='n'>${brl(s("pendente"))}</td><td class='n'>${s("qtd")}</td></tr></tfoot></table>`;
}

function tabelaLista(ls: Lancamento[], hoje: string) {
  if (!ls.length) return "<p class='sub'>Sem lançamentos.</p>";
  const linhas = ls.map((l) => {
    const sit = situacao(l, hoje);
    return `<tr><td>${dataBr(l.vencimento)}</td><td>${esc(l.descricao)}</td><td>${esc(l.tipo ?? "Sem tipo")}</td>
      <td>${esc(l.periodo ?? "Sem período")}</td><td class='n'>${brl(l.valor)}</td>
      <td><span class='tag ${sit.replace(" ", "")}'>${sit}</span></td><td>${dataBr(l.data_efetivacao)}</td></tr>`;
  }).join("");
  const tot = ls.reduce((a, l) => a + l.valor, 0);
  return `<table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Tipo</th><th>Período</th><th class='n'>Valor</th>
    <th>Situação</th><th>Efetivado em</th></tr></thead><tbody>${linhas}</tbody>
    <tfoot><tr><td colspan='4'>Total (${ls.length})</td><td class='n'>${brl(tot)}</td><td colspan='2'></td></tr></tfoot></table>`;
}

export function relatorioHtml(res: Resumo): string {
  const { ind: i, comparativo: c, equilibrio: eq } = res;
  const icone = { ok: "✅", atencao: "⚠️", alerta: "🔴", info: "ℹ️" };
  const kpis = [
    kpi("Receitas", brl(i.receitas), `Recebido ${brl(i.recebido)}`, COR_RECEITA, i.pctRecebidas),
    kpi("Despesas", brl(i.despesas), `Pago ${brl(i.pago)}`, COR_DESPESA, i.pctPagas),
    kpi("Saldo previsto", brl(i.saldoPrevisto), `Realizado ${brl(i.saldoRealizado)}`, undefined, null, i.saldoPrevisto >= 0 ? "pos" : "neg"),
    kpi("Despesa / Receita", i.pctDespReceita !== null ? pct(i.pctDespReceita) : "—", "comprometimento da receita", COR_DESPESA, i.pctDespReceita),
    kpi("Despesas pagas", i.pctPagas !== null ? pct(i.pctPagas) : "—", `${i.qtdPagas} de ${i.qtdDespesas} lançamentos`),
    kpi("A pagar", brl(i.aPagar), `${i.vencidasQtd} vencida(s): ${brl(i.vencidasValor)}`, undefined, null, i.vencidasQtd ? "neg" : ""),
    kpi("A receber", brl(i.aReceber), `${i.qtdReceitas - i.qtdRecebidas} lançamento(s)`),
    kpi(`Saldo em ${c.rotulo}`, c.temDados ? brl(c.saldoAnt) : "—", c.temDados ? `Rec. ${brl(c.receitasAnt)} · Desp. ${brl(c.despesasAnt)}` : "sem dados"),
  ].join("");
  const dest = res.destaques.map(([n, t]) => `<li class='${n}'>${icone[n]} ${esc(t)}</li>`).join("");
  const mx = Math.max(1, ...eq.map((r) => Math.max(r.receitas, r.despesas)));
  const eqLinhas = eq.map((r) => {
    const dias = !r.dias || r.periodo.includes(r.dias.split(" ").pop()!) ? "" : `<div class='sub'>${esc(r.dias)}</div>`;
    return `<tr><td>${esc(r.periodo)}${dias}</td>
      <td class='n'>${brl(r.receitas)}<div class='bar' style='margin-left:auto;width:${(r.receitas / mx * 100).toFixed(0)}%;background:${COR_RECEITA}'></div></td>
      <td class='n'>${brl(r.despesas)}<div class='bar' style='margin-left:auto;width:${(r.despesas / mx * 100).toFixed(0)}%;background:${COR_DESPESA}'></div></td>
      <td class='n ${r.saldo >= 0 ? "pos" : "neg"}'>${brl(r.saldo)}</td>
      <td class='n ${r.acumulado >= 0 ? "pos" : "neg"}'><b>${brl(r.acumulado)}</b></td></tr>`;
  }).join("");
  const somaEq = (k: "receitas" | "despesas" | "saldo") => eq.reduce((a, r) => a + r[k], 0);
  const maiores = res.maioresDespesas.map((l) => `<tr><td>${dataBr(l.vencimento)}</td><td>${esc(l.descricao)}</td>
    <td>${esc(l.tipo ?? "Sem tipo")}</td><td class='n'>${brl(l.valor)}</td></tr>`).join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resumo financeiro — ${res.titulo}</title><style>${CSS}</style></head><body><div class="pag">
<h1>Resumo financeiro — ${res.titulo}</h1>
<div class="sub">Gerado em ${dataBr(res.hoje)} · Controle Financeiro</div>
<h2>1. Visão geral</h2><div class="kpis">${kpis}</div>
<h2>2. Destaques do mês</h2><ul class="dest">${dest}</ul>
<h2>3. Equilíbrio por período</h2>
<div class="leg"><span><span class="dot" style="background:${COR_RECEITA}"></span> Receitas</span>
<span><span class="dot" style="background:${COR_DESPESA}"></span> Despesas</span>
<span>Saldo acumulado negativo = falta de caixa naquele período</span></div>
<table><thead><tr><th>Período</th><th class="n">Receitas</th><th class="n">Despesas</th>
<th class="n">Saldo do período</th><th class="n">Saldo acumulado</th></tr></thead><tbody>${eqLinhas}</tbody>
<tfoot><tr><td>Mês</td><td class="n">${brl(somaEq("receitas"))}</td><td class="n">${brl(somaEq("despesas"))}</td>
<td class="n">${brl(somaEq("saldo"))}</td><td></td></tr></tfoot></table>
<h2>4. Receitas — analítico</h2>
<h3>Por tipo</h3>${tabelaTipos(res.receitasPorTipo, COR_RECEITA, "Recebido", "A receber", false)}
<h3>Lançamentos</h3>${tabelaLista(res.receitas, res.hoje)}
<h2>5. Despesas — analítico</h2>
<h3>Por tipo</h3>${tabelaTipos(res.despesasPorTipo, COR_DESPESA, "Pago", "A pagar", true)}
<h3>5 maiores despesas</h3><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Tipo</th><th class="n">Valor</th></tr></thead>
<tbody>${maiores}</tbody></table>
<h3>Lançamentos</h3>${tabelaLista(res.despesas, res.hoje)}
<div class="rod">Valores previstos consideram todos os lançamentos do mês; realizados consideram apenas os marcados como
pagos/recebidos. Para salvar em PDF, use Imprimir → Salvar como PDF.</div>
</div></body></html>`;
}
