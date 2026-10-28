"""Camada de dados: SQLite local (arquivo dados/financeiro.db)."""
import os
import sqlite3
from contextlib import contextmanager
from datetime import date
from pathlib import Path

import pandas as pd

# CF_DATA_DIR é definido pelo lançador da versão instalada (pasta do usuário);
# rodando direto com "streamlit run", os dados ficam em ./dados
DB_PATH = Path(os.environ.get("CF_DATA_DIR") or Path(__file__).parent / "dados") / "financeiro.db"

# Versão web: a página (onedrive.js) observa este contador para saber que há
# alterações a enviar ao OneDrive, e grava ".remoto" quando baixa dados novos.
SINCRONIZA = os.environ.get("CF_PLATAFORMA") == "web"
ARQ_ALTERACAO = DB_PATH.parent / ".alteracao"
ARQ_REMOTO = DB_PATH.parent / ".remoto"


def marcar_alteracao():
    if not SINCRONIZA:
        return
    try:
        n = int(ARQ_ALTERACAO.read_text() or 0)
    except (OSError, ValueError):
        n = 0
    ARQ_ALTERACAO.write_text(str(n + 1))


def marca_remota() -> str:
    try:
        return ARQ_REMOTO.read_text()
    except OSError:
        return ""

SCHEMA = """
CREATE TABLE IF NOT EXISTS tipos_despesa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS tipos_receita (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS periodos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    dia_inicio INTEGER NOT NULL CHECK (dia_inicio BETWEEN 1 AND 31),
    dia_fim INTEGER NOT NULL CHECK (dia_fim BETWEEN 1 AND 31)
);
CREATE TABLE IF NOT EXISTS lancamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    natureza TEXT NOT NULL CHECK (natureza IN ('R','D')),   -- R = receita, D = despesa
    descricao TEXT NOT NULL,
    valor REAL NOT NULL CHECK (valor >= 0),
    vencimento TEXT NOT NULL,                               -- ISO yyyy-mm-dd
    ano INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    tipo_despesa_id INTEGER REFERENCES tipos_despesa(id),
    tipo_receita_id INTEGER REFERENCES tipos_receita(id),
    periodo_id INTEGER REFERENCES periodos(id),
    efetivado INTEGER NOT NULL DEFAULT 0,                   -- recebido / pago
    data_efetivacao TEXT,
    observacao TEXT
);
CREATE INDEX IF NOT EXISTS ix_lanc_ano_mes ON lancamentos(ano, mes);
"""

TIPOS_DESPESA_PADRAO = ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação",
                        "Lazer", "Cartão de crédito", "Contas de consumo", "Impostos", "Outros"]
TIPOS_RECEITA_PADRAO = ["Salário", "Freelance", "Aluguel recebido", "Investimentos", "Outros"]
PERIODOS_PADRAO = [("1º período (dia 1–10)", 1, 10),
                   ("2º período (dia 11–20)", 11, 20),
                   ("3º período (dia 21–31)", 21, 31)]


@contextmanager
def conn(marcar=True):
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.execute("PRAGMA foreign_keys = ON")
    try:
        yield c
        c.commit()
        if marcar and c.total_changes:
            marcar_alteracao()
    finally:
        c.close()


def init_db():
    # criação/sementes iniciais não contam como alteração do usuário
    with conn(marcar=False) as c:
        c.executescript(SCHEMA)
        if c.execute("SELECT COUNT(*) FROM tipos_despesa").fetchone()[0] == 0:
            c.executemany("INSERT INTO tipos_despesa(nome) VALUES (?)", [(n,) for n in TIPOS_DESPESA_PADRAO])
        if c.execute("SELECT COUNT(*) FROM tipos_receita").fetchone()[0] == 0:
            c.executemany("INSERT INTO tipos_receita(nome) VALUES (?)", [(n,) for n in TIPOS_RECEITA_PADRAO])
        if c.execute("SELECT COUNT(*) FROM periodos").fetchone()[0] == 0:
            c.executemany("INSERT INTO periodos(nome, dia_inicio, dia_fim) VALUES (?,?,?)", PERIODOS_PADRAO)


def exportar_bytes() -> bytes:
    """Cópia consistente do banco para backup."""
    with conn() as c:
        dst = sqlite3.connect(":memory:")
        c.backup(dst)
        return dst.serialize()


def restaurar_bytes(dados: bytes):
    """Substitui o banco atual por um backup .db (valida antes)."""
    src = sqlite3.connect(":memory:")
    try:
        src.deserialize(dados)
        tabelas = {r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    except sqlite3.DatabaseError:
        raise ValueError("Arquivo não é um banco SQLite válido.")
    if not {"lancamentos", "tipos_despesa", "tipos_receita", "periodos"} <= tabelas:
        raise ValueError("O arquivo não é um backup do Controle Financeiro.")
    with conn() as c:
        src.backup(c)
    marcar_alteracao()


def query(sql, params=()):
    with conn() as c:
        return pd.read_sql_query(sql, c, params=params)


def execute(sql, params=()):
    with conn() as c:
        cur = c.execute(sql, params)
        return cur.lastrowid


# ---------------------------------------------------------------- cadastros
CADASTROS = {"tipos_despesa", "tipos_receita", "periodos"}


def listar(tabela, somente_ativos=False):
    assert tabela in CADASTROS
    where = " WHERE ativo = 1" if somente_ativos and tabela != "periodos" else ""
    order = "dia_inicio" if tabela == "periodos" else "nome"
    return query(f"SELECT * FROM {tabela}{where} ORDER BY {order}")


def em_uso(tabela, id_):
    col = {"tipos_despesa": "tipo_despesa_id", "tipos_receita": "tipo_receita_id",
           "periodos": "periodo_id"}[tabela]
    return query(f"SELECT COUNT(*) n FROM lancamentos WHERE {col} = ?", (id_,))["n"][0]


def periodo_do_dia(dia):
    df = query("SELECT id FROM periodos WHERE ? BETWEEN dia_inicio AND dia_fim ORDER BY dia_inicio LIMIT 1", (dia,))
    return int(df["id"][0]) if len(df) else None


# ---------------------------------------------------------------- lançamentos
def _add_meses(d: date, n: int) -> date:
    import calendar
    m = d.month - 1 + n
    ano, mes = d.year + m // 12, m % 12 + 1
    return date(ano, mes, min(d.day, calendar.monthrange(ano, mes)[1]))


def inserir_lancamento(natureza, descricao, valor, vencimento: date, tipo_id, periodo_id=None,
                       efetivado=False, observacao="", repetir=1):
    """Insere o lançamento; com repetir > 1 cria as parcelas/recorrências nos meses seguintes."""
    for i in range(max(1, repetir)):
        venc = _add_meses(vencimento, i)
        per = periodo_id if periodo_id else periodo_do_dia(venc.day)
        desc = f"{descricao} ({i + 1}/{repetir})" if repetir > 1 else descricao
        execute(
            """INSERT INTO lancamentos (natureza, descricao, valor, vencimento, ano, mes,
                   tipo_despesa_id, tipo_receita_id, periodo_id, efetivado, data_efetivacao, observacao)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (natureza, desc, float(valor), venc.isoformat(), venc.year, venc.month,
             tipo_id if natureza == "D" else None, tipo_id if natureza == "R" else None,
             per, int(efetivado and i == 0), date.today().isoformat() if (efetivado and i == 0) else None,
             observacao),
        )


def lancamentos(ano=None, mes=None):
    sql = """
    SELECT l.id, l.natureza, l.descricao, l.valor, l.vencimento, l.ano, l.mes,
           l.efetivado, l.data_efetivacao, l.observacao, l.periodo_id,
           l.tipo_despesa_id, l.tipo_receita_id,
           COALESCE(td.nome, tr.nome) AS tipo,
           p.nome AS periodo
    FROM lancamentos l
    LEFT JOIN tipos_despesa td ON td.id = l.tipo_despesa_id
    LEFT JOIN tipos_receita tr ON tr.id = l.tipo_receita_id
    LEFT JOIN periodos p ON p.id = l.periodo_id
    WHERE 1=1"""
    params = []
    if ano:
        sql += " AND l.ano = ?"; params.append(int(ano))
    if mes:
        sql += " AND l.mes = ?"; params.append(int(mes))
    df = query(sql + " ORDER BY l.vencimento, l.id", params)
    df["vencimento"] = pd.to_datetime(df["vencimento"]).dt.date
    df["efetivado"] = df["efetivado"].astype(bool)
    return df


def atualizar_lancamento(id_, natureza, descricao, valor, vencimento: date, tipo_id, periodo_id, efetivado, observacao):
    atual = query("SELECT efetivado, data_efetivacao FROM lancamentos WHERE id=?", (id_,))
    data_ef = atual["data_efetivacao"][0]
    if efetivado and not atual["efetivado"][0]:
        data_ef = date.today().isoformat()
    elif not efetivado:
        data_ef = None
    execute(
        """UPDATE lancamentos SET descricao=?, valor=?, vencimento=?, ano=?, mes=?,
               tipo_despesa_id=?, tipo_receita_id=?, periodo_id=?, efetivado=?, data_efetivacao=?, observacao=?
           WHERE id=?""",
        (descricao, float(valor), vencimento.isoformat(), vencimento.year, vencimento.month,
         tipo_id if natureza == "D" else None, tipo_id if natureza == "R" else None,
         periodo_id, int(bool(efetivado)), data_ef, observacao, int(id_)),
    )


def excluir_lancamento(id_):
    execute("DELETE FROM lancamentos WHERE id=?", (int(id_),))


def anos_disponiveis():
    df = query("SELECT DISTINCT ano FROM lancamentos ORDER BY ano")
    anos = set(df["ano"].tolist()) | {date.today().year}
    return sorted(anos)


# ---------------------------------------------------------------- dados de exemplo
def carregar_exemplo(ano=None):
    """Popula o ano com receitas e despesas fictícias para visualizar o dashboard."""
    import random
    random.seed(42)
    ano = ano or date.today().year
    td = dict(query("SELECT nome, id FROM tipos_despesa").values)
    tr = dict(query("SELECT nome, id FROM tipos_receita").values)
    hoje = date.today()
    fixas = [("Aluguel", "Moradia", 1800, 5), ("Condomínio", "Moradia", 520, 10),
             ("Energia", "Contas de consumo", 210, 15), ("Internet", "Contas de consumo", 120, 15),
             ("Supermercado", "Alimentação", 1100, 8), ("Combustível", "Transporte", 450, 20),
             ("Plano de saúde", "Saúde", 680, 12), ("Escola / curso", "Educação", 750, 10),
             ("Fatura do cartão", "Cartão de crédito", 1400, 25), ("Streaming e lazer", "Lazer", 260, 28)]
    for mes in range(1, 13):
        venc = lambda d: date(ano, mes, min(d, 28))
        passado = (ano, mes) < (hoje.year, hoje.month)
        corrente = (ano, mes) == (hoje.year, hoje.month)
        for desc, tipo, d, dia in [("Salário", "Salário", 6500, 5), ("Adiantamento", "Salário", 2600, 20)]:
            v = venc(dia)
            ef = passado or (corrente and v <= hoje)
            inserir_lancamento("R", desc, d, v, tr.get(tipo), efetivado=ef)
        if mes % 3 == 0:
            inserir_lancamento("R", "Projeto freelance", round(random.uniform(800, 2200), 2), venc(18),
                               tr.get("Freelance"), efetivado=passado)
        for desc, tipo, base, dia in fixas:
            v = venc(dia)
            valor = round(base * random.uniform(0.9, 1.12), 2)
            ef = passado or (corrente and v <= hoje and random.random() > 0.3)
            inserir_lancamento("D", desc, valor, v, td.get(tipo), efetivado=ef)
        if mes == 4:
            inserir_lancamento("D", "IPVA", 1250, venc(22), td.get("Impostos"), efetivado=passado)
