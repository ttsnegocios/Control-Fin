"""Controle Financeiro Pessoal — Streamlit + SQLite local.

Execute com:  streamlit run app.py
"""
import calendar
import os
from datetime import date

import pandas as pd
import plotly
import plotly.graph_objects as go
import streamlit as st
from packaging.version import Version

import db
import resumo

st.set_page_config(page_title="Controle Financeiro", page_icon="💰", layout="wide")

# Compatibilidade entre versões do Streamlit: **LARGO só existe a partir da 1.49;
# antes disso o equivalente é use_container_width=True.
VERSAO_ST = Version(st.__version__)
LARGO = {"width": "stretch"} if VERSAO_ST >= Version("1.49") else {"use_container_width": True}
# Barras com cantos arredondados só no Plotly 5.19+; em versões anteriores ficam retas.
RAIO = {"marker_cornerradius": 4} if Version(plotly.__version__) >= Version("5.19") else {}
if VERSAO_ST < Version("1.40"):
    st.error(f"Streamlit {st.__version__} é antigo demais para este aplicativo (mínimo 1.40). "
             "Atualize com:  pip install -r requirements.txt")
    st.stop()

db.init_db()

MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho",
         "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
MESES_ABREV = [m[:3] for m in MESES]

# Cores (paleta categórica validada p/ daltonismo): receita = azul, despesa = laranja
COR_RECEITA = "#2a78d6"
COR_DESPESA = "#eb6834"
COR_NEUTRA = "#b9b8b1"


def brl(v: float) -> str:
    s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"


def pct(v: float) -> str:
    return f"{v:.1f}%".replace(".", ",")


# ------------------------------------------------------------------ HTML / CSS
st.markdown("""
<style>
.kpi-row {display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin:4px 0 18px;}
.kpi {border:1px solid rgba(128,128,128,.25); border-radius:12px; padding:14px 16px; background:rgba(128,128,128,.04);}
.kpi .rot {font-size:.80rem; opacity:.72; text-transform:uppercase; letter-spacing:.04em; display:flex; align-items:center; gap:6px;}
.kpi .val {font-size:1.55rem; font-weight:700; margin-top:4px; font-variant-numeric:tabular-nums;}
.kpi .sub {font-size:.80rem; opacity:.7; margin-top:2px;}
.kpi .dot {width:10px; height:10px; border-radius:3px; display:inline-block;}
.barra {height:8px; border-radius:4px; background:rgba(128,128,128,.22); margin-top:8px; overflow:hidden;}
.barra > div {height:100%; border-radius:4px;}
.neg {color:#c43b3b;} .pos {color:#1a7f37;}
ul.dest {list-style:none; padding:0; margin:0 0 8px;}
ul.dest li {padding:8px 12px; border-left:4px solid; margin:6px 0; border-radius:6px; background:rgba(128,128,128,.07);}
ul.dest li.ok {border-color:#1a7f37;} ul.dest li.atencao {border-color:#d9a000;}
ul.dest li.alerta {border-color:#c43b3b;} ul.dest li.info {border-color:#2a78d6;}
</style>
""", unsafe_allow_html=True)


def kpi(rotulo, valor, sub="", cor=None, barra=None, classe=""):
    dot = f'<span class="dot" style="background:{cor}"></span>' if cor else ""
    b = ""
    if barra is not None:
        b = f'<div class="barra"><div style="width:{min(max(barra, 0), 100):.1f}%;background:{cor or COR_RECEITA}"></div></div>'
    return (f'<div class="kpi"><div class="rot">{dot}{rotulo}</div>'
            f'<div class="val {classe}">{valor}</div><div class="sub">{sub}</div>{b}</div>')


def kpis(cards):
    st.markdown(f'<div class="kpi-row">{"".join(cards)}</div>', unsafe_allow_html=True)


def layout_fig(fig, altura=340):
    fig.update_layout(height=altura, margin=dict(l=10, r=10, t=10, b=10),
                      legend=dict(orientation="h", y=1.08, x=0),
                      hoverlabel=dict(namelength=-1), separators=",.")
    fig.update_yaxes(gridcolor="rgba(128,128,128,.18)", zeroline=False)
    fig.update_xaxes(showgrid=False)
    return fig


# ------------------------------------------------------------------ navegação
st.sidebar.title("💰 Controle Financeiro")
pagina = st.sidebar.radio("Menu", ["📊 Dashboard", "🧾 Resumo do mês", "📝 Lançamentos",
                                   "⚖️ Equilíbrio por período", "🗂️ Cadastros"])

hoje = date.today()
st.sidebar.divider()
anos = db.anos_disponiveis()
ano_sel = st.sidebar.selectbox("Ano", anos, index=anos.index(hoje.year) if hoje.year in anos else len(anos) - 1)
mes_sel = st.sidebar.selectbox("Mês", range(1, 13), index=hoje.month - 1, format_func=lambda m: MESES[m - 1])

st.sidebar.divider()
with st.sidebar.expander("Dados de exemplo"):
    st.caption("Popula o ano selecionado com lançamentos fictícios para testar o dashboard.")
    if st.button("Carregar exemplo"):
        db.carregar_exemplo(ano_sel)
        st.success("Exemplo carregado.")
        st.rerun()
with st.sidebar.expander("Backup dos dados"):
    st.download_button("⬇️ Baixar backup (.db)", db.exportar_bytes(),
                       file_name=f"financeiro_backup_{hoje.isoformat()}.db", mime="application/octet-stream")
    arq = st.file_uploader("Restaurar backup", type=["db"], help="Substitui TODOS os dados atuais pelos do arquivo.")
    if arq is not None and st.button("Restaurar agora", type="primary"):
        try:
            db.restaurar_bytes(arq.getvalue())
            st.success("Backup restaurado.")
            st.rerun()
        except ValueError as e:
            st.error(str(e))
if os.environ.get("CF_PLATAFORMA") == "web":
    st.sidebar.caption("Dados salvos neste aparelho e sincronizados com o OneDrive (botão ☁️ no canto inferior).")

    @st.fragment(run_every=3)
    def _verificar_dados_remotos():
        """Recarrega a tela quando a sincronização baixa dados de outro aparelho."""
        marca = db.marca_remota()
        anterior = st.session_state.setdefault("_marca_remota", marca)
        if marca != anterior:
            st.session_state["_marca_remota"] = marca
            st.toast("Dados atualizados a partir do OneDrive.", icon="☁️")
            st.rerun()

    with st.sidebar:
        _verificar_dados_remotos()
else:
    st.sidebar.caption(f"Dados em: `{db.DB_PATH}`")

if os.environ.get("CF_DESKTOP") == "1":
    if st.sidebar.button("⏻ Encerrar aplicativo", **LARGO):
        st.sidebar.success("Aplicativo encerrado. Pode fechar esta aba.")
        import threading
        threading.Timer(1.0, lambda: os._exit(0)).start()
        st.stop()


# ================================================================== DASHBOARD
def pagina_dashboard():
    st.header("Dashboard")
    escopo = st.segmented_control("Visão", ["Mês selecionado", "Ano inteiro"], default="Mês selecionado")
    df_ano = db.lancamentos(ano_sel)
    df = df_ano if escopo == "Ano inteiro" else df_ano[df_ano["mes"] == mes_sel]
    titulo = f"{ano_sel}" if escopo == "Ano inteiro" else f"{MESES[mes_sel - 1]} / {ano_sel}"
    st.caption(f"Período analisado: **{titulo}**")

    if df.empty:
        st.info("Sem lançamentos neste período. Cadastre em **Lançamentos** ou carregue os dados de exemplo na barra lateral.")
        return

    rec = df[df.natureza == "R"]
    desp = df[df.natureza == "D"]
    tot_r, tot_d = rec.valor.sum(), desp.valor.sum()
    rec_ok, desp_ok = rec[rec.efetivado].valor.sum(), desp[desp.efetivado].valor.sum()
    saldo = tot_r - tot_d
    pct_desp_rec = (tot_d / tot_r * 100) if tot_r else 0
    pct_pagas = (desp_ok / tot_d * 100) if tot_d else 0
    qtd_pagas = int(desp.efetivado.sum())
    vencidas = desp[(~desp.efetivado) & (desp.vencimento < hoje)]

    kpis([
        kpi("Total de receitas", brl(tot_r), f"Recebido: {brl(rec_ok)}", COR_RECEITA),
        kpi("Total de despesas", brl(tot_d), f"Pago: {brl(desp_ok)}", COR_DESPESA),
        kpi("Saldo previsto", brl(saldo), f"Saldo realizado: {brl(rec_ok - desp_ok)}",
            classe="pos" if saldo >= 0 else "neg"),
        kpi("Despesa / Receita", pct(pct_desp_rec),
            "comprometimento da receita" if pct_desp_rec <= 100 else "despesas acima da receita",
            COR_DESPESA, barra=pct_desp_rec),
        kpi("Despesas pagas", pct(pct_pagas), f"{qtd_pagas} de {len(desp)} lançamentos · por valor",
            COR_DESPESA, barra=pct_pagas),
    ])
    if len(vencidas):
        st.warning(f"⚠️ {len(vencidas)} despesa(s) vencida(s) e não paga(s), somando {brl(vencidas.valor.sum())}.")

    c1, c2 = st.columns([3, 2])
    with c1:
        st.subheader("Receitas x Despesas por mês")
        g = df_ano.groupby(["mes", "natureza"]).valor.sum().unstack(fill_value=0).reindex(range(1, 13), fill_value=0)
        for col in ("R", "D"):
            if col not in g:
                g[col] = 0.0
        fig = go.Figure()
        fig.add_bar(x=MESES_ABREV, y=g["R"], name="Receitas", marker_color=COR_RECEITA,
                    hovertemplate="%{x}: R$ %{y:,.2f}<extra>Receitas</extra>")
        fig.add_bar(x=MESES_ABREV, y=g["D"], name="Despesas", marker_color=COR_DESPESA,
                    hovertemplate="%{x}: R$ %{y:,.2f}<extra>Despesas</extra>")
        fig.update_layout(barmode="group", bargap=0.3, bargroupgap=0.08)
        fig.update_traces(marker_line_width=0, **RAIO)
        if escopo == "Mês selecionado":
            fig.add_vrect(x0=mes_sel - 1.5, x1=mes_sel - 0.5, fillcolor="rgba(128,128,128,.12)", line_width=0, layer="below")
        st.plotly_chart(layout_fig(fig), **LARGO)
    with c2:
        st.subheader("Despesas por tipo")
        por_tipo = desp.groupby(desp["tipo"].fillna("Sem tipo")).valor.sum().sort_values()
        if por_tipo.empty:
            st.caption("Sem despesas.")
        else:
            perc = por_tipo / por_tipo.sum() * 100
            fig = go.Figure(go.Bar(
                x=por_tipo.values, y=por_tipo.index, orientation="h", marker_color=COR_DESPESA,
                marker_line_width=0, **RAIO,
                text=[f"{pct(p)}" for p in perc], textposition="outside", cliponaxis=False,
                customdata=perc, hovertemplate="%{y}: R$ %{x:,.2f} (%{customdata:.1f}%)<extra></extra>"))
            fig.update_xaxes(range=[0, por_tipo.max() * 1.18])
            st.plotly_chart(layout_fig(fig, max(240, 36 * len(por_tipo) + 40)), **LARGO)

    c3, c4 = st.columns(2)
    with c3:
        st.subheader("Saldo mensal (receita − despesa)")
        saldo_m = g["R"] - g["D"]
        fig = go.Figure(go.Bar(
            x=MESES_ABREV, y=saldo_m, marker_line_width=0, **RAIO,
            marker_color=[COR_RECEITA if v >= 0 else COR_DESPESA for v in saldo_m],
            hovertemplate="%{x}: R$ %{y:,.2f}<extra>Saldo</extra>"))
        fig.add_hline(y=0, line_color="rgba(128,128,128,.6)", line_width=1)
        st.plotly_chart(layout_fig(fig, 300), **LARGO)
    with c4:
        st.subheader("Despesas por tipo — pagas x a pagar")
        if not desp.empty:
            t = desp.assign(tipo=desp["tipo"].fillna("Sem tipo")).pivot_table(
                index="tipo", columns="efetivado", values="valor", aggfunc="sum", fill_value=0)
            t = t.reindex(columns=[True, False], fill_value=0)
            t = t.loc[t.sum(axis=1).sort_values().index]
            fig = go.Figure()
            fig.add_bar(y=t.index, x=t[True], name="Pago", orientation="h", marker_color=COR_DESPESA,
                        hovertemplate="%{y}: R$ %{x:,.2f}<extra>Pago</extra>")
            fig.add_bar(y=t.index, x=t[False], name="A pagar", orientation="h", marker_color=COR_NEUTRA,
                        hovertemplate="%{y}: R$ %{x:,.2f}<extra>A pagar</extra>")
            fig.update_layout(barmode="stack", legend_traceorder="normal")
            fig.update_traces(marker_line_width=2, marker_line_color="rgba(0,0,0,0)")
            st.plotly_chart(layout_fig(fig, max(240, 36 * len(t) + 40)), **LARGO)

    with st.expander("Tabela resumo por tipo"):
        resumo = (desp.assign(tipo=desp["tipo"].fillna("Sem tipo"))
                  .groupby("tipo").agg(Total=("valor", "sum"),
                                       Pago=("valor", lambda s: s[desp.loc[s.index, "efetivado"]].sum()),
                                       Lancamentos=("valor", "size"))
                  .sort_values("Total", ascending=False))
        resumo["% das despesas"] = resumo["Total"] / tot_d * 100 if tot_d else 0
        resumo["% da receita"] = resumo["Total"] / tot_r * 100 if tot_r else 0
        st.dataframe(resumo, **LARGO, column_config={
            "Total": st.column_config.NumberColumn(format="R$ %.2f"),
            "Pago": st.column_config.NumberColumn(format="R$ %.2f"),
            "% das despesas": st.column_config.NumberColumn(format="%.1f%%"),
            "% da receita": st.column_config.NumberColumn(format="%.1f%%"),
        })


# ================================================================== RESUMO DO MÊS
COLS_VALOR = {c: st.column_config.NumberColumn(format="R$ %.2f")
              for c in ["Total", "Efetivado", "Pendente", "Valor", "Receitas", "Despesas",
                        "Saldo do período", "Saldo acumulado"]}
COLS_PCT = {c: st.column_config.NumberColumn(format="%.1f%%") for c in ["% do total", "% da receita"]}


def _tabela_tipo(t, rot_ef, rot_pend, com_receita):
    cols = ["Tipo", "Total", "% do total"] + (["% da receita"] if com_receita else []) + ["Efetivado", "Pendente", "Qtd"]
    st.dataframe(t[cols].rename(columns={"Efetivado": rot_ef, "Pendente": rot_pend}), hide_index=True, **LARGO,
                 column_config={**COLS_VALOR, **COLS_PCT,
                                rot_ef: st.column_config.NumberColumn(format="R$ %.2f"),
                                rot_pend: st.column_config.NumberColumn(format="R$ %.2f")})


def _lista(l):
    st.dataframe(l, hide_index=True, **LARGO, column_config={
        **COLS_VALOR,
        "Vencimento": st.column_config.DateColumn(format="DD/MM/YYYY"),
        "Efetivado em": st.column_config.DateColumn(format="DD/MM/YYYY")})


def _grafico_tipo(t, cor, rot_ef, rot_pend):
    t = t.iloc[::-1]
    fig = go.Figure()
    fig.add_bar(y=t["Tipo"], x=t["Efetivado"], name=rot_ef, orientation="h", marker_color=cor,
                hovertemplate="%{y}: R$ %{x:,.2f}<extra>" + rot_ef + "</extra>")
    fig.add_bar(y=t["Tipo"], x=t["Pendente"], name=rot_pend, orientation="h", marker_color=COR_NEUTRA,
                text=[resumo.pct(p) for p in t["% do total"]], textposition="outside", cliponaxis=False,
                hovertemplate="%{y}: R$ %{x:,.2f}<extra>" + rot_pend + "</extra>")
    fig.update_layout(barmode="stack", legend_traceorder="normal")
    fig.update_traces(marker_line_width=0)
    fig.update_xaxes(range=[0, t["Total"].max() * 1.2])
    return layout_fig(fig, max(220, 34 * len(t) + 60))


def pagina_resumo():
    ano_ant, mes_ant = resumo.mes_anterior(ano_sel, mes_sel)
    res = resumo.calcular(db.lancamentos(ano_sel, mes_sel), db.lancamentos(ano_ant, mes_ant),
                          db.listar("periodos"), ano_sel, mes_sel, hoje)
    i, c, eq = res["indicadores"], res["comparativo"], res["equilibrio"]

    c1, c2 = st.columns([4, 1.3], vertical_alignment="bottom")
    c1.header(f"Resumo do mês — {MESES[mes_sel - 1]} / {ano_sel}")
    c2.download_button("🖨️ Baixar relatório", resumo.relatorio_html(res).encode("utf-8"),
                       file_name=f"resumo_{ano_sel}_{mes_sel:02d}.html", mime="text/html", **LARGO,
                       help="Relatório em HTML para abrir no navegador, imprimir ou salvar em PDF.")
    if res["vazio"]:
        st.info("Sem lançamentos neste mês. Cadastre em **Lançamentos** ou carregue os dados de exemplo na barra lateral.")
        return

    # ---------------- 1. visão geral
    st.subheader("Visão geral")
    pdr, pp, pr = i["pct_desp_receita"], i["pct_pagas_valor"], i["pct_recebidas_valor"]
    kpis([
        kpi("Receitas", brl(i["receitas"]), f"Recebido {brl(i['recebido'])}", COR_RECEITA, barra=pr),
        kpi("Despesas", brl(i["despesas"]), f"Pago {brl(i['pago'])}", COR_DESPESA, barra=pp),
        kpi("Saldo previsto", brl(i["saldo_previsto"]), f"Realizado {brl(i['saldo_realizado'])}",
            classe="pos" if i["saldo_previsto"] >= 0 else "neg"),
        kpi("Despesa / Receita", pct(pdr) if pdr is not None else "—", "comprometimento da receita",
            COR_DESPESA, barra=pdr),
    ])
    kpis([
        kpi("Despesas pagas", pct(pp) if pp is not None else "—", f"{i['qtd_pagas']} de {i['qtd_despesas']} lançamentos · por valor"),
        kpi("A pagar", brl(i["a_pagar"]), f"{i['vencidas_qtd']} vencida(s): {brl(i['vencidas_valor'])}",
            classe="neg" if i["vencidas_qtd"] else ""),
        kpi("A receber", brl(i["a_receber"]), f"{i['qtd_receitas'] - i['qtd_recebidas']} lançamento(s)"),
        kpi("Vence em 7 dias", brl(i["prox7_valor"]), f"{i['prox7_qtd']} despesa(s)"),
    ])

    if c["tem_dados"]:
        st.caption(f"Comparativo com {c['rotulo']}")
        m1, m2, m3 = st.columns(3)
        fmt = lambda v: None if v is None else f"{v:+.1f}%".replace(".", ",")
        m1.metric("Receitas", brl(i["receitas"]), fmt(c["var_receitas"]))
        m2.metric("Despesas", brl(i["despesas"]), fmt(c["var_despesas"]), delta_color="inverse")
        m3.metric("Saldo previsto", brl(i["saldo_previsto"]),
                  resumo.brl(i["saldo_previsto"] - c["saldo_ant"]))  # sinal no início: seta/cor corretas

    # ---------------- 2. destaques
    st.subheader("Destaques")
    icone = {"ok": "✅", "atencao": "⚠️", "alerta": "🔴", "info": "ℹ️"}
    st.markdown('<ul class="dest">' + "".join(
        f'<li class="{n}">{icone[n]} {t}</li>' for n, t in res["destaques"]) + "</ul>", unsafe_allow_html=True)

    # ---------------- 3. equilíbrio
    st.subheader("Equilíbrio por período")
    fig = go.Figure()
    fig.add_bar(x=eq.index, y=eq["Receitas"], name="Receitas", marker_color=COR_RECEITA,
                hovertemplate="%{x}: R$ %{y:,.2f}<extra>Receitas</extra>")
    fig.add_bar(x=eq.index, y=eq["Despesas"], name="Despesas", marker_color=COR_DESPESA,
                hovertemplate="%{x}: R$ %{y:,.2f}<extra>Despesas</extra>")
    fig.add_scatter(x=eq.index, y=eq["Saldo acumulado"], name="Saldo acumulado", mode="lines+markers",
                    line=dict(color="#52514e", width=2), marker=dict(size=9),
                    hovertemplate="%{x}: R$ %{y:,.2f}<extra>Saldo acumulado</extra>")
    fig.add_hline(y=0, line_color="rgba(128,128,128,.6)", line_width=1)
    fig.update_traces(selector=dict(type="bar"), marker_line_width=0, **RAIO)
    fig.update_layout(barmode="group", bargap=0.35)
    st.plotly_chart(layout_fig(fig, 300), **LARGO)
    st.dataframe(eq, **LARGO, column_config=COLS_VALOR)
    st.caption("Saldo acumulado = o que sobrou (ou faltou) desde o início do mês até o fim de cada período. "
               "Negativo indica falta de caixa naquele período.")

    # ---------------- 4/5. analíticos
    st.subheader("Analítico")
    tr, td = st.tabs([f"Receitas ({i['qtd_receitas']})", f"Despesas ({i['qtd_despesas']})"])
    with tr:
        if res["receitas_por_tipo"].empty:
            st.caption("Sem receitas no mês.")
        else:
            a1, a2 = st.columns([2, 3])
            a1.plotly_chart(_grafico_tipo(res["receitas_por_tipo"], COR_RECEITA, "Recebido", "A receber"), **LARGO)
            with a2:
                _tabela_tipo(res["receitas_por_tipo"], "Recebido", "A receber", False)
            st.markdown("**Lançamentos**")
            _lista(res["lista_receitas"])
    with td:
        if res["despesas_por_tipo"].empty:
            st.caption("Sem despesas no mês.")
        else:
            a1, a2 = st.columns([2, 3])
            a1.plotly_chart(_grafico_tipo(res["despesas_por_tipo"], COR_DESPESA, "Pago", "A pagar"), **LARGO)
            with a2:
                _tabela_tipo(res["despesas_por_tipo"], "Pago", "A pagar", True)
                st.markdown("**5 maiores despesas**")
                _lista(res["maiores_despesas"][["Vencimento", "Descrição", "Tipo", "Valor", "Situação"]])
            st.markdown("**Lançamentos**")
            _lista(res["lista_despesas"])


# ================================================================== LANÇAMENTOS
def opcoes(tabela):
    df = db.listar(tabela, somente_ativos=True)
    return dict(zip(df["nome"], df["id"]))


def form_novo():
    with st.expander("➕ Novo lançamento", expanded=False):
        natureza = st.radio("Natureza", ["Despesa", "Receita"], horizontal=True, key="nat_novo")
        nat = "D" if natureza == "Despesa" else "R"
        tipos = opcoes("tipos_despesa" if nat == "D" else "tipos_receita")
        per = db.listar("periodos")
        per_opts = {"Automático (pelo dia do vencimento)": None, **dict(zip(per["nome"], per["id"]))}
        dia_padrao = min(hoje.day, calendar.monthrange(ano_sel, mes_sel)[1])
        with st.form("novo", clear_on_submit=True):
            c1, c2, c3 = st.columns([3, 1.3, 1.3])
            descricao = c1.text_input("Descrição*")
            valor = c2.number_input("Valor (R$)*", min_value=0.0, step=10.0, format="%.2f")
            venc = c3.date_input("Vencimento*", value=date(ano_sel, mes_sel, dia_padrao), format="DD/MM/YYYY")
            c4, c5, c6 = st.columns([2, 2, 1])
            tipo_nome = c4.selectbox(f"Tipo de {natureza.lower()}*", list(tipos) or ["— cadastre um tipo —"])
            per_nome = c5.selectbox("Período", list(per_opts))
            repetir = c6.number_input("Repetir (meses)", min_value=1, max_value=60, value=1,
                                      help="Cria o mesmo lançamento nos meses seguintes (ex.: contas fixas, parcelas).")
            c7, c8 = st.columns([1, 3])
            efetivado = c7.checkbox("Pago" if nat == "D" else "Recebido")
            obs = c8.text_input("Observação")
            if st.form_submit_button("Salvar lançamento", type="primary"):
                if not descricao.strip() or valor <= 0 or tipo_nome not in tipos:
                    st.error("Preencha descrição, valor maior que zero e tipo.")
                else:
                    db.inserir_lancamento(nat, descricao.strip(), valor, venc, tipos[tipo_nome],
                                          per_opts[per_nome], efetivado, obs, int(repetir))
                    st.toast(f"{natureza} salva ({int(repetir)} lançamento(s)).", icon="✅")
                    st.rerun()


def tabela_editavel(df, nat):
    rotulo_ef = "Pago" if nat == "D" else "Recebido"
    tabela_tipo = "tipos_despesa" if nat == "D" else "tipos_receita"
    tipos_df = db.listar(tabela_tipo)
    tipos = dict(zip(tipos_df["nome"], tipos_df["id"]))
    per_df = db.listar("periodos")
    periodos = dict(zip(per_df["nome"], per_df["id"]))

    base = df[df.natureza == nat].copy()
    if base.empty:
        st.caption("Nenhum lançamento.")
        return

    def status(r):
        if r.efetivado:
            return "✅ " + rotulo_ef
        return "🔴 Vencido" if r.vencimento < hoje else "🕒 A vencer"

    view = pd.DataFrame({
        "id": base["id"],
        rotulo_ef: base["efetivado"],
        "Status": base.apply(status, axis=1),
        "Vencimento": base["vencimento"],
        "Descrição": base["descricao"],
        "Tipo": base["tipo"],
        "Período": base["periodo"],
        "Valor": base["valor"],
        "Observação": base["observacao"].fillna(""),
        "Excluir": False,
    }).set_index("id")

    key = f"ed_{nat}_{ano_sel}_{mes_sel}"
    editado = st.data_editor(
        view, key=key, **LARGO, hide_index=True, num_rows="fixed",
        disabled=["Status"],
        column_config={
            rotulo_ef: st.column_config.CheckboxColumn(rotulo_ef, width="small"),
            "Vencimento": st.column_config.DateColumn(format="DD/MM/YYYY", required=True),
            "Tipo": st.column_config.SelectboxColumn(options=list(tipos), required=True),
            "Período": st.column_config.SelectboxColumn(options=list(periodos)),
            "Valor": st.column_config.NumberColumn(format="R$ %.2f", min_value=0, required=True),
            "Excluir": st.column_config.CheckboxColumn("🗑️", width="small"),
        },
    )

    c1, c2, _ = st.columns([1.3, 1.6, 4])
    if c1.button("💾 Salvar alterações", key=f"salvar_{key}", type="primary"):
        n_upd = n_del = 0
        for id_, row in editado.iterrows():
            if row["Excluir"]:
                db.excluir_lancamento(id_); n_del += 1
                continue
            orig = view.loc[id_]
            campos = [rotulo_ef, "Vencimento", "Descrição", "Tipo", "Período", "Valor", "Observação"]
            if any(str(row[c]) != str(orig[c]) for c in campos):
                venc = pd.to_datetime(row["Vencimento"]).date()
                db.atualizar_lancamento(id_, nat, row["Descrição"], row["Valor"], venc,
                                        tipos.get(row["Tipo"]), periodos.get(row["Período"]),
                                        bool(row[rotulo_ef]), row["Observação"])
                n_upd += 1
        st.session_state.pop(key, None)
        st.toast(f"{n_upd} alterado(s), {n_del} excluído(s).", icon="💾")
        st.rerun()
    pendentes = base[~base.efetivado]
    if len(pendentes) and c2.button(f"Marcar todos como {rotulo_ef.lower()}s", key=f"todos_{key}"):
        for _, r in pendentes.iterrows():
            db.atualizar_lancamento(r.id, nat, r.descricao, r.valor, r.vencimento,
                                    r.tipo_despesa_id if nat == "D" else r.tipo_receita_id,
                                    r.periodo_id, True, r.observacao)
        st.session_state.pop(key, None)
        st.rerun()


def pagina_lancamentos():
    st.header(f"Lançamentos — {MESES[mes_sel - 1]} / {ano_sel}")
    form_novo()
    df = db.lancamentos(ano_sel, mes_sel)
    rec, desp = df[df.natureza == "R"], df[df.natureza == "D"]
    kpis([
        kpi("Receitas do mês", brl(rec.valor.sum()), f"Recebido: {brl(rec[rec.efetivado].valor.sum())}", COR_RECEITA),
        kpi("Despesas do mês", brl(desp.valor.sum()), f"Pago: {brl(desp[desp.efetivado].valor.sum())}", COR_DESPESA),
        kpi("Saldo do mês", brl(rec.valor.sum() - desp.valor.sum()),
            classe="pos" if rec.valor.sum() >= desp.valor.sum() else "neg"),
        kpi("A pagar", brl(desp[~desp.efetivado].valor.sum()), f"{int((~desp.efetivado).sum())} lançamento(s)"),
    ])
    st.caption("Edite direto na tabela (marque Pago/Recebido, altere valores, datas, tipo) e clique em **Salvar alterações**. "
               "Para excluir, marque 🗑️ e salve.")
    t1, t2 = st.tabs([f"Despesas ({len(desp)})", f"Receitas ({len(rec)})"])
    with t1:
        tabela_editavel(df, "D")
    with t2:
        tabela_editavel(df, "R")


# ================================================================== EQUILÍBRIO
def pagina_equilibrio():
    st.header(f"Equilíbrio por período — {MESES[mes_sel - 1]} / {ano_sel}")
    st.caption("Compara o que entra e o que sai em cada período do mês, para ver se as receitas chegam antes das despesas vencerem.")
    df = db.lancamentos(ano_sel, mes_sel)
    per = db.listar("periodos")
    if df.empty:
        st.info("Sem lançamentos neste mês.")
        return
    df["periodo"] = df["periodo"].fillna("Sem período")
    ordem = per["nome"].tolist() + (["Sem período"] if (df["periodo"] == "Sem período").any() else [])
    t = (df.pivot_table(index="periodo", columns="natureza", values="valor", aggfunc="sum", fill_value=0)
         .reindex(index=ordem, columns=["R", "D"], fill_value=0))
    t.columns = ["Receitas", "Despesas"]
    t["Saldo do período"] = t["Receitas"] - t["Despesas"]
    t["Saldo acumulado"] = t["Saldo do período"].cumsum()

    fig = go.Figure()
    fig.add_bar(x=t.index, y=t["Receitas"], name="Receitas", marker_color=COR_RECEITA,
                hovertemplate="%{x}: R$ %{y:,.2f}<extra>Receitas</extra>")
    fig.add_bar(x=t.index, y=t["Despesas"], name="Despesas", marker_color=COR_DESPESA,
                hovertemplate="%{x}: R$ %{y:,.2f}<extra>Despesas</extra>")
    fig.update_traces(marker_line_width=0, **RAIO)
    fig.update_layout(barmode="group", bargap=0.35)
    c1, c2 = st.columns([3, 2])
    with c1:
        st.plotly_chart(layout_fig(fig, 320), **LARGO)
    with c2:
        cards = []
        for nome, r in t.iterrows():
            cls = "pos" if r["Saldo acumulado"] >= 0 else "neg"
            cards.append(kpi(nome, brl(r["Saldo acumulado"]),
                             f"Entra {brl(r['Receitas'])} · Sai {brl(r['Despesas'])}", classe=cls))
        st.markdown('<div class="kpi-row" style="grid-template-columns:1fr">' + "".join(cards) + "</div>",
                    unsafe_allow_html=True)
        st.caption("Valor em destaque = saldo acumulado até o fim do período. Negativo indica que faltará caixa nesse período.")

    st.dataframe(t, **LARGO, column_config={c: st.column_config.NumberColumn(format="R$ %.2f") for c in t.columns})

    st.subheader("Lançamentos por período")
    for nome in ordem:
        sub = df[df["periodo"] == nome]
        if sub.empty:
            continue
        with st.expander(f"{nome} — {len(sub)} lançamento(s)"):
            st.dataframe(
                sub.assign(Natureza=sub.natureza.map({"R": "Receita", "D": "Despesa"}))
                [["vencimento", "Natureza", "descricao", "tipo", "valor", "efetivado"]]
                .rename(columns={"vencimento": "Vencimento", "descricao": "Descrição", "tipo": "Tipo",
                                 "valor": "Valor", "efetivado": "Efetivado"}),
                hide_index=True, **LARGO,
                column_config={"Valor": st.column_config.NumberColumn(format="R$ %.2f"),
                               "Vencimento": st.column_config.DateColumn(format="DD/MM/YYYY")})


# ================================================================== CADASTROS
def cadastro_tipos(tabela, titulo):
    df = db.listar(tabela)
    with st.form(f"novo_{tabela}", clear_on_submit=True):
        c1, c2 = st.columns([4, 1])
        nome = c1.text_input(f"Novo {titulo.lower()}", placeholder="Nome")
        c2.write(""); c2.write("")
        if c2.form_submit_button("Adicionar", type="primary"):
            if not nome.strip():
                st.error("Informe um nome.")
            elif nome.strip().lower() in df["nome"].str.lower().tolist():
                st.error("Já existe um cadastro com esse nome.")
            else:
                db.execute(f"INSERT INTO {tabela}(nome) VALUES (?)", (nome.strip(),))
                st.rerun()

    view = df.assign(ativo=df["ativo"].astype(bool), Excluir=False).set_index("id")
    key = f"cad_{tabela}"
    ed = st.data_editor(view, key=key, hide_index=True, **LARGO, num_rows="fixed",
                        column_config={"nome": st.column_config.TextColumn("Nome", required=True),
                                       "ativo": st.column_config.CheckboxColumn("Ativo", help="Inativos não aparecem no lançamento"),
                                       "Excluir": st.column_config.CheckboxColumn("🗑️")})
    if st.button("Salvar", key=f"salvar_{key}"):
        for id_, r in ed.iterrows():
            if r["Excluir"]:
                if db.em_uso(tabela, id_):
                    st.error(f"'{r['nome']}' está em uso em lançamentos — desative em vez de excluir.")
                    continue
                db.execute(f"DELETE FROM {tabela} WHERE id=?", (int(id_),))
            else:
                db.execute(f"UPDATE {tabela} SET nome=?, ativo=? WHERE id=?", (r["nome"].strip(), int(r["ativo"]), int(id_)))
        st.session_state.pop(key, None)
        st.rerun()


def cadastro_periodos():
    st.caption("Os períodos dividem o mês em faixas de dias. Ao lançar, o período é atribuído automaticamente "
               "pelo dia do vencimento (ou escolha manualmente).")
    df = db.listar("periodos")
    with st.form("novo_periodo", clear_on_submit=True):
        c1, c2, c3, c4 = st.columns([3, 1, 1, 1])
        nome = c1.text_input("Nome do período", placeholder="Ex.: Quinzena 1")
        ini = c2.number_input("Dia início", 1, 31, 1)
        fim = c3.number_input("Dia fim", 1, 31, 15)
        c4.write(""); c4.write("")
        if c4.form_submit_button("Adicionar", type="primary"):
            if not nome.strip() or ini > fim:
                st.error("Informe o nome e um intervalo válido (início ≤ fim).")
            else:
                db.execute("INSERT INTO periodos(nome, dia_inicio, dia_fim) VALUES (?,?,?)", (nome.strip(), ini, fim))
                st.rerun()

    view = df.assign(Excluir=False).set_index("id")
    ed = st.data_editor(view, key="cad_periodos", hide_index=True, **LARGO, num_rows="fixed",
                        column_config={"nome": st.column_config.TextColumn("Nome", required=True),
                                       "dia_inicio": st.column_config.NumberColumn("Dia início", min_value=1, max_value=31),
                                       "dia_fim": st.column_config.NumberColumn("Dia fim", min_value=1, max_value=31),
                                       "Excluir": st.column_config.CheckboxColumn("🗑️")})
    # aviso de dias sem cobertura
    cobertos = {d for _, r in ed[~ed["Excluir"]].iterrows() for d in range(int(r.dia_inicio), int(r.dia_fim) + 1)}
    faltando = sorted(set(range(1, 32)) - cobertos)
    if faltando:
        st.warning(f"Dias sem período: {', '.join(map(str, faltando))}")
    c1, c2, _ = st.columns([1, 2.5, 3])
    if c1.button("Salvar", key="salvar_periodos"):
        for id_, r in ed.iterrows():
            if r["Excluir"]:
                if db.em_uso("periodos", id_):
                    st.error(f"'{r['nome']}' está em uso — ajuste os lançamentos antes de excluir.")
                    continue
                db.execute("DELETE FROM periodos WHERE id=?", (int(id_),))
            elif int(r.dia_inicio) <= int(r.dia_fim):
                db.execute("UPDATE periodos SET nome=?, dia_inicio=?, dia_fim=? WHERE id=?",
                           (r["nome"].strip(), int(r.dia_inicio), int(r.dia_fim), int(id_)))
        st.session_state.pop("cad_periodos", None)
        st.rerun()
    if c2.button("Reclassificar lançamentos pelos períodos atuais",
                 help="Recalcula o período de todos os lançamentos a partir do dia de vencimento."):
        for _, r in db.query("SELECT id, vencimento FROM lancamentos").iterrows():
            db.execute("UPDATE lancamentos SET periodo_id=? WHERE id=?",
                       (db.periodo_do_dia(int(r.vencimento[8:10])), int(r.id)))
        st.toast("Lançamentos reclassificados.", icon="🔁")


def pagina_cadastros():
    st.header("Cadastros")
    t1, t2, t3 = st.tabs(["Tipos de despesa", "Tipos de receita", "Períodos do mês"])
    with t1:
        cadastro_tipos("tipos_despesa", "Tipo de despesa")
    with t2:
        cadastro_tipos("tipos_receita", "Tipo de receita")
    with t3:
        cadastro_periodos()


{"📊 Dashboard": pagina_dashboard, "🧾 Resumo do mês": pagina_resumo, "📝 Lançamentos": pagina_lancamentos,
 "⚖️ Equilíbrio por período": pagina_equilibrio, "🗂️ Cadastros": pagina_cadastros}[pagina]()
