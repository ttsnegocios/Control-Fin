"""Resumo geral do mês: indicadores, equilíbrio por período e analíticos de receitas/despesas.

`calcular()` produz um dicionário único usado tanto pela tela "Resumo do mês" quanto
pelo relatório HTML para impressão (`relatorio_html()`), garantindo os mesmos números.
"""
from datetime import date, timedelta
from html import escape

import pandas as pd

MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho",
         "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
COR_RECEITA = "#2a78d6"
COR_DESPESA = "#eb6834"
COR_NEUTRA = "#b9b8b1"


def brl(v: float) -> str:
    s = f"{abs(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{'-' if v < 0 else ''}R$ {s}"


def pct(v: float) -> str:
    return f"{v:.1f}%".replace(".", ",")


def data_br(d) -> str:
    return d.strftime("%d/%m/%Y") if d is not None and not pd.isna(d) else ""


def mes_anterior(ano: int, mes: int) -> tuple[int, int]:
    return (ano - 1, 12) if mes == 1 else (ano, mes - 1)


def _variacao(atual: float, anterior: float):
    if not anterior:
        return None
    return (atual - anterior) / anterior * 100


def _por_tipo(df: pd.DataFrame, total_ref: float, total_receita: float) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["Tipo", "Total", "Efetivado", "Pendente", "Qtd", "% do total", "% da receita"])
    d = df.assign(Tipo=df["tipo"].fillna("Sem tipo"),
                  ef=df["valor"].where(df["efetivado"], 0.0))
    t = d.groupby("Tipo").agg(Total=("valor", "sum"), Efetivado=("ef", "sum"), Qtd=("valor", "size"))
    t["Pendente"] = t["Total"] - t["Efetivado"]
    t["% do total"] = t["Total"] / total_ref * 100 if total_ref else 0.0
    t["% da receita"] = t["Total"] / total_receita * 100 if total_receita else 0.0
    t = t.sort_values("Total", ascending=False).reset_index()
    return t[["Tipo", "Total", "Efetivado", "Pendente", "Qtd", "% do total", "% da receita"]]


def _status(r, hoje: date, natureza: str) -> str:
    if r["efetivado"]:
        return "Pago" if natureza == "D" else "Recebido"
    if r["vencimento"] < hoje:
        return "Vencido" if natureza == "D" else "Atrasado"
    return "A vencer" if natureza == "D" else "A receber"


def _lista(df: pd.DataFrame, natureza: str, hoje: date) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["Vencimento", "Descrição", "Tipo", "Período", "Valor", "Situação", "Efetivado em"])
    d = df.sort_values(["vencimento", "id"])
    return pd.DataFrame({
        "Vencimento": d["vencimento"].values,
        "Descrição": d["descricao"].values,
        "Tipo": d["tipo"].fillna("Sem tipo").values,
        "Período": d["periodo"].fillna("Sem período").values,
        "Valor": d["valor"].values,
        "Situação": [_status(r, hoje, natureza) for _, r in d.iterrows()],
        "Efetivado em": pd.to_datetime(d["data_efetivacao"]).values,   # NaT = ainda não efetivado (fica em branco)
    })


def calcular(df_mes: pd.DataFrame, df_mes_ant: pd.DataFrame, periodos: pd.DataFrame,
             ano: int, mes: int, hoje: date | None = None) -> dict:
    """df_mes / df_mes_ant: saída de db.lancamentos(ano, mes); periodos: db.listar('periodos')."""
    hoje = hoje or date.today()
    rec = df_mes[df_mes["natureza"] == "R"]
    desp = df_mes[df_mes["natureza"] == "D"]

    tot_r, tot_d = float(rec["valor"].sum()), float(desp["valor"].sum())
    rec_ok = float(rec.loc[rec["efetivado"], "valor"].sum())
    desp_ok = float(desp.loc[desp["efetivado"], "valor"].sum())
    vencidas = desp[(~desp["efetivado"]) & (desp["vencimento"] < hoje)]
    atrasadas = rec[(~rec["efetivado"]) & (rec["vencimento"] < hoje)]
    prox7 = desp[(~desp["efetivado"]) & (desp["vencimento"] >= hoje) & (desp["vencimento"] <= hoje + timedelta(days=7))]

    indicadores = {
        "receitas": tot_r, "recebido": rec_ok, "a_receber": tot_r - rec_ok,
        "despesas": tot_d, "pago": desp_ok, "a_pagar": tot_d - desp_ok,
        "saldo_previsto": tot_r - tot_d, "saldo_realizado": rec_ok - desp_ok,
        "pct_desp_receita": tot_d / tot_r * 100 if tot_r else None,
        "pct_pagas_valor": desp_ok / tot_d * 100 if tot_d else None,
        "pct_recebidas_valor": rec_ok / tot_r * 100 if tot_r else None,
        "qtd_receitas": len(rec), "qtd_despesas": len(desp),
        "qtd_pagas": int(desp["efetivado"].sum()), "qtd_recebidas": int(rec["efetivado"].sum()),
        "vencidas_qtd": len(vencidas), "vencidas_valor": float(vencidas["valor"].sum()),
        "atrasadas_qtd": len(atrasadas), "atrasadas_valor": float(atrasadas["valor"].sum()),
        "prox7_qtd": len(prox7), "prox7_valor": float(prox7["valor"].sum()),
    }

    # comparativo com o mês anterior
    ra = float(df_mes_ant.loc[df_mes_ant["natureza"] == "R", "valor"].sum()) if not df_mes_ant.empty else 0.0
    da = float(df_mes_ant.loc[df_mes_ant["natureza"] == "D", "valor"].sum()) if not df_mes_ant.empty else 0.0
    a_ant, m_ant = mes_anterior(ano, mes)
    comparativo = {
        "rotulo": f"{MESES[m_ant - 1]}/{a_ant}", "tem_dados": not df_mes_ant.empty,
        "receitas_ant": ra, "despesas_ant": da, "saldo_ant": ra - da,
        "var_receitas": _variacao(tot_r, ra), "var_despesas": _variacao(tot_d, da),
    }

    # equilíbrio por período
    ordem = periodos["nome"].tolist() if not periodos.empty else []
    d = df_mes.assign(periodo=df_mes["periodo"].fillna("Sem período"))
    if (d["periodo"] == "Sem período").any():
        ordem = ordem + ["Sem período"]
    eq = (d.pivot_table(index="periodo", columns="natureza", values="valor", aggfunc="sum", fill_value=0)
          .reindex(index=ordem, columns=["R", "D"], fill_value=0)) if not d.empty else \
        pd.DataFrame(0.0, index=ordem, columns=["R", "D"])
    eq.columns = ["Receitas", "Despesas"]
    eq["Saldo do período"] = eq["Receitas"] - eq["Despesas"]
    eq["Saldo acumulado"] = eq["Saldo do período"].cumsum()
    eq.index.name = "Período"
    if not periodos.empty:
        faixa = {r["nome"]: f"dias {r['dia_inicio']}–{r['dia_fim']}" for _, r in periodos.iterrows()}
        eq.insert(0, "Dias", [faixa.get(p, "") for p in eq.index])
    else:
        eq.insert(0, "Dias", "")

    rec_tipo = _por_tipo(rec, tot_r, tot_r)
    desp_tipo = _por_tipo(desp, tot_d, tot_r)
    lista_rec = _lista(rec, "R", hoje)
    lista_desp = _lista(desp, "D", hoje)
    maiores = lista_desp.sort_values("Valor", ascending=False).head(5) if not lista_desp.empty else lista_desp

    res = {
        "ano": ano, "mes": mes, "titulo": f"{MESES[mes - 1]} de {ano}", "gerado_em": hoje,
        "vazio": df_mes.empty,
        "indicadores": indicadores, "comparativo": comparativo, "equilibrio": eq,
        "receitas_por_tipo": rec_tipo, "despesas_por_tipo": desp_tipo,
        "lista_receitas": lista_rec, "lista_despesas": lista_desp, "maiores_despesas": maiores,
    }
    res["destaques"] = destaques(res)
    return res


def destaques(res: dict) -> list[tuple[str, str]]:
    """Observações automáticas: lista de (nível, texto); nível em ok | atencao | alerta | info."""
    i, c, eq = res["indicadores"], res["comparativo"], res["equilibrio"]
    out = []
    if res["vazio"]:
        return [("info", "Nenhum lançamento neste mês.")]

    if i["saldo_previsto"] >= 0:
        out.append(("ok", f"O mês fecha com saldo positivo previsto de {brl(i['saldo_previsto'])}."))
    else:
        out.append(("alerta", f"As despesas superam as receitas em {brl(-i['saldo_previsto'])} — o mês fecha negativo."))

    p = i["pct_desp_receita"]
    if p is not None:
        nivel = "ok" if p <= 70 else "atencao" if p <= 100 else "alerta"
        out.append((nivel, f"As despesas comprometem {pct(p)} da receita do mês."))
    elif i["despesas"]:
        out.append(("alerta", "Há despesas lançadas, mas nenhuma receita no mês."))

    negativos = eq[eq["Saldo acumulado"] < 0]
    if len(negativos):
        nome = negativos.index[0]
        out.append(("atencao", f"Falta de caixa em \"{nome}\": o saldo acumulado chega a "
                               f"{brl(negativos['Saldo acumulado'].min())}. As despesas desse período vencem antes "
                               f"das receitas entrarem — considere renegociar vencimentos."))
    elif len(eq):
        out.append(("ok", "Em todos os períodos as receitas acumuladas cobrem as despesas."))

    if i["vencidas_qtd"]:
        out.append(("alerta", f"{i['vencidas_qtd']} despesa(s) vencida(s) e não paga(s), somando {brl(i['vencidas_valor'])}."))
    if i["prox7_qtd"]:
        out.append(("info", f"{i['prox7_qtd']} despesa(s) vencem nos próximos 7 dias ({brl(i['prox7_valor'])})."))
    if i["atrasadas_qtd"]:
        out.append(("atencao", f"{i['atrasadas_qtd']} receita(s) com data passada ainda não confirmadas "
                               f"({brl(i['atrasadas_valor'])})."))

    dt = res["despesas_por_tipo"]
    if len(dt):
        t = dt.iloc[0]
        out.append(("info", f"Maior grupo de despesa: {t['Tipo']}, com {brl(t['Total'])} "
                            f"({pct(t['% do total'])} das despesas)."))

    if c["tem_dados"]:
        partes = []
        if c["var_receitas"] is not None:
            partes.append(f"receitas {'+' if c['var_receitas'] >= 0 else ''}{pct(c['var_receitas'])}")
        if c["var_despesas"] is not None:
            partes.append(f"despesas {'+' if c['var_despesas'] >= 0 else ''}{pct(c['var_despesas'])}")
        if partes:
            out.append(("info", f"Em relação a {c['rotulo']}: " + ", ".join(partes) + "."))
    return out


# ====================================================================== relatório HTML
_CSS = """
*{box-sizing:border-box} body{font:13px/1.45 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2328;
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
@media (max-width:700px){.kpis{grid-template-columns:repeat(2,1fr)} .cols{grid-template-columns:1fr}}
"""


def _kpi_html(rot, val, sub="", cor=None, meter=None, cls=""):
    dot = f'<span class="dot" style="background:{cor}"></span>' if cor else ""
    m = ""
    if meter is not None:
        m = f'<div class="meter"><div style="width:{min(max(meter, 0), 100):.1f}%;background:{cor or COR_RECEITA}"></div></div>'
    return f'<div class="kpi"><div class="r">{dot}{escape(rot)}</div><div class="v {cls}">{val}</div><div class="s">{sub}</div>{m}</div>'


def _tabela_tipos(t: pd.DataFrame, cor: str, rot_ef: str, rot_pend: str, com_receita: bool) -> str:
    if t.empty:
        return "<p class='sub'>Sem lançamentos.</p>"
    mx = t["Total"].max() or 1
    linhas = []
    for _, r in t.iterrows():
        extra = f"<td class='n'>{pct(r['% da receita'])}</td>" if com_receita else ""
        linhas.append(
            f"<tr><td>{escape(str(r['Tipo']))}</td><td class='n'>{brl(r['Total'])}</td>"
            f"<td class='barcell'><div class='bar' style='width:{r['Total'] / mx * 100:.1f}%;background:{cor}'></div></td>"
            f"<td class='n'>{pct(r['% do total'])}</td>{extra}<td class='n'>{brl(r['Efetivado'])}</td>"
            f"<td class='n'>{brl(r['Pendente'])}</td><td class='n'>{int(r['Qtd'])}</td></tr>")
    extra_h = "<th class='n'>% receita</th>" if com_receita else ""
    tot = t["Total"].sum()
    extra_f = f"<td class='n'>{pct(t['% da receita'].sum())}</td>" if com_receita else ""
    return (f"<table><thead><tr><th>Tipo</th><th class='n'>Total</th><th></th><th class='n'>% do total</th>{extra_h}"
            f"<th class='n'>{rot_ef}</th><th class='n'>{rot_pend}</th><th class='n'>Qtd</th></tr></thead>"
            f"<tbody>{''.join(linhas)}</tbody><tfoot><tr><td>Total</td><td class='n'>{brl(tot)}</td><td></td>"
            f"<td class='n'>100,0%</td>{extra_f}<td class='n'>{brl(t['Efetivado'].sum())}</td>"
            f"<td class='n'>{brl(t['Pendente'].sum())}</td><td class='n'>{int(t['Qtd'].sum())}</td></tr></tfoot></table>")


def _tabela_lista(l: pd.DataFrame) -> str:
    if l.empty:
        return "<p class='sub'>Sem lançamentos.</p>"
    linhas = "".join(
        f"<tr><td>{data_br(r['Vencimento'])}</td><td>{escape(str(r['Descrição']))}</td><td>{escape(str(r['Tipo']))}</td>"
        f"<td>{escape(str(r['Período']))}</td><td class='n'>{brl(r['Valor'])}</td>"
        f"<td><span class='tag {r['Situação'].replace(' ', '')}'>{r['Situação']}</span></td>"
        f"<td>{data_br(r['Efetivado em'])}</td></tr>" for _, r in l.iterrows())
    return (f"<table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Tipo</th><th>Período</th>"
            f"<th class='n'>Valor</th><th>Situação</th><th>Efetivado em</th></tr></thead><tbody>{linhas}</tbody>"
            f"<tfoot><tr><td colspan='4'>Total ({len(l)})</td><td class='n'>{brl(l['Valor'].sum())}</td>"
            f"<td colspan='2'></td></tr></tfoot></table>")


def relatorio_html(res: dict) -> str:
    i, c, eq = res["indicadores"], res["comparativo"], res["equilibrio"]
    pdr = i["pct_desp_receita"]
    kpis = "".join([
        _kpi_html("Receitas", brl(i["receitas"]), f"Recebido {brl(i['recebido'])}", COR_RECEITA,
                  i["pct_recebidas_valor"]),
        _kpi_html("Despesas", brl(i["despesas"]), f"Pago {brl(i['pago'])}", COR_DESPESA, i["pct_pagas_valor"]),
        _kpi_html("Saldo previsto", brl(i["saldo_previsto"]), f"Realizado {brl(i['saldo_realizado'])}",
                  cls="pos" if i["saldo_previsto"] >= 0 else "neg"),
        _kpi_html("Despesa / Receita", pct(pdr) if pdr is not None else "—", "comprometimento da receita",
                  COR_DESPESA, pdr),
        _kpi_html("Despesas pagas", pct(i["pct_pagas_valor"]) if i["pct_pagas_valor"] is not None else "—",
                  f"{i['qtd_pagas']} de {i['qtd_despesas']} lançamentos"),
        _kpi_html("A pagar", brl(i["a_pagar"]), f"{i['vencidas_qtd']} vencida(s): {brl(i['vencidas_valor'])}",
                  cls="neg" if i["vencidas_qtd"] else ""),
        _kpi_html("A receber", brl(i["a_receber"]), f"{i['qtd_receitas'] - i['qtd_recebidas']} lançamento(s)"),
        _kpi_html(f"Saldo em {c['rotulo']}", brl(c["saldo_ant"]) if c["tem_dados"] else "—",
                  f"Rec. {brl(c['receitas_ant'])} · Desp. {brl(c['despesas_ant'])}" if c["tem_dados"] else "sem dados"),
    ])
    icone = {"ok": "✅", "atencao": "⚠️", "alerta": "🔴", "info": "ℹ️"}
    dest = "".join(f"<li class='{n}'>{icone[n]} {escape(t)}</li>" for n, t in res["destaques"])

    mx = max(eq["Receitas"].max() if len(eq) else 0, eq["Despesas"].max() if len(eq) else 0) or 1
    eq_linhas = "".join(
        f"<tr><td>{escape(p)}" + ("" if (not r['Dias'] or r['Dias'].split()[-1] in p) else f"<div class='sub'>{escape(r['Dias'])}</div>") + "</td>"
        f"<td class='n'>{brl(r['Receitas'])}<div class='bar' style='margin-left:auto;width:{r['Receitas'] / mx * 100:.0f}%;background:{COR_RECEITA}'></div></td>"
        f"<td class='n'>{brl(r['Despesas'])}<div class='bar' style='margin-left:auto;width:{r['Despesas'] / mx * 100:.0f}%;background:{COR_DESPESA}'></div></td>"
        f"<td class='n {'pos' if r['Saldo do período'] >= 0 else 'neg'}'>{brl(r['Saldo do período'])}</td>"
        f"<td class='n {'pos' if r['Saldo acumulado'] >= 0 else 'neg'}'><b>{brl(r['Saldo acumulado'])}</b></td></tr>"
        for p, r in eq.iterrows())

    maiores = "".join(f"<tr><td>{data_br(r['Vencimento'])}</td><td>{escape(str(r['Descrição']))}</td>"
                      f"<td>{escape(str(r['Tipo']))}</td><td class='n'>{brl(r['Valor'])}</td></tr>"
                      for _, r in res["maiores_despesas"].iterrows())

    return f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resumo financeiro — {res['titulo']}</title><style>{_CSS}</style></head><body><div class="pag">
<h1>Resumo financeiro — {res['titulo']}</h1>
<div class="sub">Gerado em {data_br(res['gerado_em'])} · Controle Financeiro</div>

<h2>1. Visão geral</h2><div class="kpis">{kpis}</div>

<h2>2. Destaques do mês</h2><ul class="dest">{dest}</ul>

<h2>3. Equilíbrio por período</h2>
<div class="leg"><span><span class="dot" style="background:{COR_RECEITA}"></span> Receitas</span>
<span><span class="dot" style="background:{COR_DESPESA}"></span> Despesas</span>
<span>Saldo acumulado negativo = falta de caixa naquele período</span></div>
<table><thead><tr><th>Período</th><th class="n">Receitas</th><th class="n">Despesas</th>
<th class="n">Saldo do período</th><th class="n">Saldo acumulado</th></tr></thead><tbody>{eq_linhas}</tbody>
<tfoot><tr><td>Mês</td><td class="n">{brl(eq['Receitas'].sum())}</td><td class="n">{brl(eq['Despesas'].sum())}</td>
<td class="n">{brl(eq['Saldo do período'].sum())}</td><td></td></tr></tfoot></table>

<h2>4. Receitas — analítico</h2>
<h3>Por tipo</h3>{_tabela_tipos(res['receitas_por_tipo'], COR_RECEITA, 'Recebido', 'A receber', False)}
<h3>Lançamentos</h3>{_tabela_lista(res['lista_receitas'])}

<h2>5. Despesas — analítico</h2>
<h3>Por tipo</h3>{_tabela_tipos(res['despesas_por_tipo'], COR_DESPESA, 'Pago', 'A pagar', True)}
<h3>5 maiores despesas</h3><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Tipo</th><th class="n">Valor</th></tr></thead>
<tbody>{maiores}</tbody></table>
<h3>Lançamentos</h3>{_tabela_lista(res['lista_despesas'])}

<div class="rod">Valores previstos consideram todos os lançamentos do mês; realizados consideram apenas os marcados como
pagos/recebidos. Para salvar em PDF, use Imprimir → Salvar como PDF.</div>
</div></body></html>"""
