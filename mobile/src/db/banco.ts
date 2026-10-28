// Banco SQLite rodando no próprio aparelho (sql.js / WebAssembly).
// O arquivo inteiro é gravado no armazenamento local após cada alteração.
import type { Database, SqlJsStatic, SqlValue } from "sql.js";
import { ESQUEMA, PERIODOS_PADRAO, TABELAS_OBRIGATORIAS, TIPOS_DESPESA_PADRAO, TIPOS_RECEITA_PADRAO } from "./esquema";

export type Parametros = SqlValue[];
export type AoSalvar = (bytes: Uint8Array) => void | Promise<void>;

export class Banco {
  private db: Database;
  private emTransacao = 0;
  private alterado = false;

  private constructor(private SQL: SqlJsStatic, bytes: Uint8Array | null, private aoSalvar?: AoSalvar) {
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this.preparar();
  }

  static abrir(SQL: SqlJsStatic, bytes: Uint8Array | null, aoSalvar?: AoSalvar): Banco {
    return new Banco(SQL, bytes, aoSalvar);
  }

  private preparar() {
    this.db.run("PRAGMA foreign_keys = ON");
    this.db.exec(ESQUEMA);
    const vazio = (t: string) => Number(this.db.exec(`SELECT COUNT(*) FROM ${t}`)[0].values[0][0]) === 0;
    let semeou = false;
    if (vazio("tipos_despesa")) { TIPOS_DESPESA_PADRAO.forEach((n) => this.db.run("INSERT INTO tipos_despesa(nome) VALUES (?)", [n])); semeou = true; }
    if (vazio("tipos_receita")) { TIPOS_RECEITA_PADRAO.forEach((n) => this.db.run("INSERT INTO tipos_receita(nome) VALUES (?)", [n])); semeou = true; }
    if (vazio("periodos")) { PERIODOS_PADRAO.forEach((p) => this.db.run("INSERT INTO periodos(nome, dia_inicio, dia_fim) VALUES (?,?,?)", p)); semeou = true; }
    if (semeou) void this.aoSalvar?.(this.exportar());
  }

  /** Consulta e devolve as linhas como objetos. */
  todos<T = Record<string, SqlValue>>(sql: string, params: Parametros = []): T[] {
    const st = this.db.prepare(sql);
    try {
      st.bind(params);
      const out: T[] = [];
      while (st.step()) out.push(st.getAsObject() as T);
      return out;
    } finally {
      st.free();
    }
  }

  um<T = Record<string, SqlValue>>(sql: string, params: Parametros = []): T | undefined {
    return this.todos<T>(sql, params)[0];
  }

  /** Executa um comando de escrita; retorna o id inserido e as linhas afetadas. */
  executar(sql: string, params: Parametros = []): { id: number; alteradas: number } {
    this.db.run(sql, params);
    const alteradas = this.db.getRowsModified();
    const id = Number(this.db.exec("SELECT last_insert_rowid()")[0].values[0][0]);
    if (alteradas) this.alterado = true;
    if (!this.emTransacao) this.salvarSeAlterado();
    return { id, alteradas };
  }

  /** Agrupa várias gravações: tudo ou nada, e um único salvamento no final. */
  transacao<R>(fn: () => R): R {
    if (this.emTransacao++ === 0) this.db.run("BEGIN");
    try {
      const r = fn();
      if (--this.emTransacao === 0) { this.db.run("COMMIT"); this.salvarSeAlterado(); }
      return r;
    } catch (e) {
      if (--this.emTransacao === 0) { this.db.run("ROLLBACK"); this.alterado = false; }
      throw e;
    }
  }

  private salvarSeAlterado() {
    if (!this.alterado) return;
    this.alterado = false;
    void this.aoSalvar?.(this.exportar());
  }

  exportar(): Uint8Array {
    return this.db.export();
  }

  /** Substitui todos os dados por um backup .db (do celular ou do app de computador). */
  restaurar(bytes: Uint8Array) {
    let novo: Database;
    try {
      novo = new this.SQL.Database(bytes);
      const tabelas = new Set(novo.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values.map((v) => String(v[0])) ?? []);
      if (!TABELAS_OBRIGATORIAS.every((t) => tabelas.has(t))) {
        novo.close();
        throw new ErroBackup("O arquivo não é um backup do Controle Financeiro.");
      }
    } catch (e) {
      if (e instanceof ErroBackup) throw e;
      throw new ErroBackup("Arquivo inválido: não é um banco SQLite.");
    }
    this.db.close();
    this.db = novo;
    this.preparar();
    void this.aoSalvar?.(this.exportar());
  }

  fechar() { this.db.close(); }
}

export class ErroBackup extends Error {}
