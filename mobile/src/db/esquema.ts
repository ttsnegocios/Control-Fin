// Mesmo esquema do app de desktop (db.py): um backup .db funciona nos dois.
export const ESQUEMA = `
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
    natureza TEXT NOT NULL CHECK (natureza IN ('R','D')),
    descricao TEXT NOT NULL,
    valor REAL NOT NULL CHECK (valor >= 0),
    vencimento TEXT NOT NULL,
    ano INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    tipo_despesa_id INTEGER REFERENCES tipos_despesa(id),
    tipo_receita_id INTEGER REFERENCES tipos_receita(id),
    periodo_id INTEGER REFERENCES periodos(id),
    efetivado INTEGER NOT NULL DEFAULT 0,
    data_efetivacao TEXT,
    observacao TEXT
);
CREATE INDEX IF NOT EXISTS ix_lanc_ano_mes ON lancamentos(ano, mes);
`;

export const TABELAS_OBRIGATORIAS = ["lancamentos", "tipos_despesa", "tipos_receita", "periodos"];

export const TIPOS_DESPESA_PADRAO = ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação",
  "Lazer", "Cartão de crédito", "Contas de consumo", "Impostos", "Outros"];
export const TIPOS_RECEITA_PADRAO = ["Salário", "Freelance", "Aluguel recebido", "Investimentos", "Outros"];
export const PERIODOS_PADRAO: [string, number, number][] = [
  ["1º período (dia 1–10)", 1, 10],
  ["2º período (dia 11–20)", 11, 20],
  ["3º período (dia 21–31)", 21, 31],
];
