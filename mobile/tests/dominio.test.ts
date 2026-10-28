import { describe, it, expect, beforeEach } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Banco, ErroBackup } from "../src/db/banco";
import { Repositorio } from "../src/db/repositorio";
import { calcular } from "../src/dominio/resumo";
import { relatorioHtml } from "../src/dominio/relatorio";
import { somarMeses, mesAnterior } from "../src/dominio/datas";

let SQL: SqlJsStatic;
const HOJE = "2026-10-12";
const novoRepo = (bytes: Uint8Array | null = null, salvos: Uint8Array[] = []) =>
  new Repositorio(Banco.abrir(SQL, bytes, (b) => { salvos.push(b); }), () => HOJE);

beforeEach(async () => { SQL ??= await initSqlJs(); });

describe("datas", () => {
  it("soma meses mantendo o dia e limitando ao fim do mês", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2026-11-15", 3)).toBe("2027-02-15");
    expect(mesAnterior(2026, 1)).toEqual([2025, 12]);
  });
});

describe("banco e repositório", () => {
  it("cria o banco com tipos e períodos padrão e salva no armazenamento", () => {
    const salvos: Uint8Array[] = [];
    const r = novoRepo(null, salvos);
    expect(r.tipos("tipos_despesa").length).toBe(10);
    expect(r.tipos("tipos_receita").length).toBe(5);
    expect(r.periodos().map((p) => p.dia_inicio)).toEqual([1, 11, 21]);
    expect(salvos.length).toBe(1);
  });

  it("insere com período automático, repetição e efetivação só na 1ª parcela", () => {
    const salvos: Uint8Array[] = [];
    const r = novoRepo(null, salvos);
    const tipo = r.tipos("tipos_despesa")[0].id;
    const antes = salvos.length;
    const ids = r.inserir({ natureza: "D", descricao: "Curso", valor: 300, vencimento: "2026-01-31", tipo_id: tipo, efetivado: true, repetir: 3 });
    expect(ids.length).toBe(3);
    expect(salvos.length - antes).toBe(1); // uma gravação para a transação inteira
    const ls = r.lancamentos();
    expect(ls.map((l) => l.vencimento)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(ls.map((l) => l.descricao)).toEqual(["Curso (1/3)", "Curso (2/3)", "Curso (3/3)"]);
    expect(ls.map((l) => l.efetivado)).toEqual([true, false, false]);
    expect(ls[0].data_efetivacao).toBe(HOJE);
    expect(ls.every((l) => l.periodo === "3º período (dia 21–31)")).toBe(true);
  });

  it("valida dados obrigatórios", () => {
    const r = novoRepo();
    const tipo = r.tipos("tipos_receita")[0].id;
    expect(() => r.inserir({ natureza: "R", descricao: " ", valor: 10, vencimento: HOJE, tipo_id: tipo })).toThrow(/descrição/);
    expect(() => r.inserir({ natureza: "R", descricao: "x", valor: 0, vencimento: HOJE, tipo_id: tipo })).toThrow(/maior que zero/);
    expect(() => r.inserir({ natureza: "R", descricao: "x", valor: 5, vencimento: HOJE, tipo_id: null })).toThrow(/tipo/);
  });

  it("alterna pago/recebido registrando e limpando a data", () => {
    const r = novoRepo();
    const [id] = r.inserir({ natureza: "D", descricao: "Luz", valor: 100, vencimento: "2026-10-15", tipo_id: 1 });
    expect(r.alternarEfetivado(id)).toBe(true);
    expect(r.lancamento(id)!.data_efetivacao).toBe(HOJE);
    expect(r.alternarEfetivado(id)).toBe(false);
    expect(r.lancamento(id)!.data_efetivacao).toBeNull();
  });

  it("edita mudando a natureza e o mês", () => {
    const r = novoRepo();
    const [id] = r.inserir({ natureza: "D", descricao: "X", valor: 100, vencimento: "2026-10-05", tipo_id: 1 });
    r.atualizar(id, { natureza: "R", descricao: "Y", valor: 50, vencimento: "2026-11-25", tipo_id: 2, efetivado: true });
    const l = r.lancamento(id)!;
    expect([l.natureza, l.descricao, l.valor, l.ano, l.mes, l.periodo]).toEqual(["R", "Y", 50, 2026, 11, "3º período (dia 21–31)"]);
    expect(l.tipo).toBe(r.tipos("tipos_receita").find((t) => t.id === 2)!.nome);
  });

  it("protege cadastros em uso e nomes duplicados", () => {
    const r = novoRepo();
    const moradia = r.tipos("tipos_despesa").find((t) => t.nome === "Moradia")!.id;
    r.inserir({ natureza: "D", descricao: "Aluguel", valor: 1000, vencimento: HOJE, tipo_id: moradia });
    expect(() => r.excluirTipo("tipos_despesa", moradia)).toThrow(/em uso/);
    expect(() => r.adicionarTipo("tipos_despesa", "moradia")).toThrow(/Já existe/);
    expect(() => r.adicionarPeriodo("Quinzena", 20, 10)).toThrow(/Intervalo/);
    const p = r.periodos()[2];
    r.atualizarPeriodo(p.id, p.nome, 21, 30);
    expect(r.diasSemPeriodo()).toEqual([31]);
  });

  it("restaura backup e rejeita arquivos inválidos", () => {
    const a = novoRepo();
    a.inserir({ natureza: "R", descricao: "Salário", valor: 5000, vencimento: HOJE, tipo_id: 1 });
    const b = novoRepo();
    b.banco.restaurar(a.banco.exportar());
    expect(b.lancamentos().map((l) => l.descricao)).toEqual(["Salário"]);
    expect(() => b.banco.restaurar(new TextEncoder().encode("não é sqlite"))).toThrow(ErroBackup);
    const outro = new SQL.Database(); outro.run("CREATE TABLE x(a)");
    expect(() => b.banco.restaurar(outro.export())).toThrow(/não é um backup/);
    expect(b.lancamentos().length).toBe(1); // dados intactos após falha
  });
});

describe("resumo do mês", () => {
  it("calcula indicadores, equilíbrio e destaques coerentes", () => {
    const r = novoRepo();
    r.carregarExemplo(2026);
    const res = calcular(r.lancamentos(2026, 10), r.lancamentos(2026, 9), r.periodos(), 2026, 10, HOJE);
    const i = res.ind;
    const somaR = r.lancamentos(2026, 10).filter((l) => l.natureza === "R").reduce((s, l) => s + l.valor, 0);
    expect(i.receitas).toBeCloseTo(somaR, 6);
    expect(i.saldoPrevisto).toBeCloseTo(res.equilibrio.at(-1)!.acumulado, 6);
    expect(res.despesasPorTipo.reduce((s, t) => s + t.pctTotal, 0)).toBeCloseTo(100, 6);
    expect(res.destaques.length).toBeGreaterThan(3);
    expect(relatorioHtml(res)).toContain("Resumo financeiro — Outubro de 2026");
  });

  it("alerta falta de caixa quando a despesa vence antes da receita", () => {
    const r = novoRepo();
    r.inserir({ natureza: "D", descricao: "Aluguel", valor: 2000, vencimento: "2026-11-05", tipo_id: 1 });
    r.inserir({ natureza: "R", descricao: "Salário", valor: 3000, vencimento: "2026-11-25", tipo_id: 1 });
    const res = calcular(r.lancamentos(2026, 11), [], r.periodos(), 2026, 11, "2026-11-01");
    expect(res.destaques.some(([n, t]) => n === "atencao" && t.includes("Falta de caixa"))).toBe(true);
  });
});

// ------------------------------------------------------------ compatibilidade com o app de desktop (Python)
const RAIZ = resolve(__dirname, "../..");
const temPython = (() => {
  try { execFileSync("python3", ["-c", "import pandas"], { stdio: "ignore" }); return existsSync(join(RAIZ, "db.py")); } catch { return false; }
})();

describe.skipIf(!temPython)("compatibilidade com o app de desktop", () => {
  it("abre um banco criado pelo app Python e chega aos mesmos números do resumo", () => {
    const dir = mkdtempSync(join(tmpdir(), "cf-"));
    const script = `
import os, sys, json
os.environ["CF_DATA_DIR"] = sys.argv[1]
sys.path.insert(0, sys.argv[2])
from datetime import date
import db, resumo
db.init_db(); db.carregar_exemplo(2026)
h = date(2026, 10, 12)
r = resumo.calcular(db.lancamentos(2026, 10), db.lancamentos(2026, 9), db.listar("periodos"), 2026, 10, h)
i = r["indicadores"]
print(json.dumps({"ind": {k: (float(v) if v is not None else None) for k, v in i.items()},
  "acum": [float(x) for x in r["equilibrio"]["Saldo acumulado"]],
  "tipos": {t: float(v) for t, v in zip(r["despesas_por_tipo"]["Tipo"], r["despesas_por_tipo"]["Total"])},
  "destaques": [t for _, t in r["destaques"]]}))`;
    const py = JSON.parse(execFileSync("python3", ["-c", script, dir, RAIZ], { encoding: "utf8" }).trim().split("\n").pop()!);
    const r = novoRepo(new Uint8Array(readFileSync(join(dir, "financeiro.db"))));
    const res = calcular(r.lancamentos(2026, 10), r.lancamentos(2026, 9), r.periodos(), 2026, 10, HOJE);
    const mapa: Record<string, number | null> = {
      receitas: res.ind.receitas, recebido: res.ind.recebido, despesas: res.ind.despesas, pago: res.ind.pago,
      saldo_previsto: res.ind.saldoPrevisto, saldo_realizado: res.ind.saldoRealizado, pct_desp_receita: res.ind.pctDespReceita,
      pct_pagas_valor: res.ind.pctPagas, vencidas_qtd: res.ind.vencidasQtd, vencidas_valor: res.ind.vencidasValor,
      prox7_qtd: res.ind.prox7Qtd, prox7_valor: res.ind.prox7Valor, qtd_despesas: res.ind.qtdDespesas,
    };
    for (const [k, v] of Object.entries(mapa)) expect(v, k).toBeCloseTo(py.ind[k], 6);
    res.equilibrio.forEach((l, k) => expect(l.acumulado).toBeCloseTo(py.acum[k], 6));
    for (const t of res.despesasPorTipo) expect(t.total, t.tipo).toBeCloseTo(py.tipos[t.tipo], 6);
    expect(res.destaques.map(([, t]) => t)).toEqual(py.destaques);
  });

  it("um backup feito no celular é lido pelo app Python", () => {
    const r = novoRepo();
    r.inserir({ natureza: "D", descricao: "Feito no celular", valor: 123.45, vencimento: "2026-10-20", tipo_id: 1, efetivado: true });
    const dir = mkdtempSync(join(tmpdir(), "cf-"));
    writeFileSync(join(dir, "financeiro.db"), r.banco.exportar());
    const script = `
import os, sys
os.environ["CF_DATA_DIR"] = sys.argv[1]; sys.path.insert(0, sys.argv[2])
import db
df = db.lancamentos(2026, 10)
print(df.iloc[0]["descricao"], df.iloc[0]["valor"], bool(df.iloc[0]["efetivado"]), df.iloc[0]["periodo"])`;
    const out = execFileSync("python3", ["-c", script, dir, RAIZ], { encoding: "utf8" }).trim().split("\n").pop();
    expect(out).toBe("Feito no celular 123.45 True 2º período (dia 11–20)");
  });
});
