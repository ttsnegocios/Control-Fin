// Operações de dados — equivalentes às funções do db.py do app de desktop.
import type { Banco } from "./banco";
import { hojeIso, partes, somarMeses, iso } from "../dominio/datas";

export type Natureza = "R" | "D";
export type TabelaTipo = "tipos_despesa" | "tipos_receita";

export interface Tipo { id: number; nome: string; ativo: boolean }
export interface Periodo { id: number; nome: string; dia_inicio: number; dia_fim: number }
export interface Lancamento {
  id: number; natureza: Natureza; descricao: string; valor: number; vencimento: string;
  ano: number; mes: number; tipo_id: number | null; periodo_id: number | null;
  efetivado: boolean; data_efetivacao: string | null; observacao: string;
  tipo: string | null; periodo: string | null;
}
export interface NovoLancamento {
  natureza: Natureza; descricao: string; valor: number; vencimento: string;
  tipo_id: number | null; periodo_id?: number | null; efetivado?: boolean; observacao?: string; repetir?: number;
}

type Linha = Record<string, unknown>;

export class Repositorio {
  constructor(public banco: Banco, private hoje: () => string = () => hojeIso()) {}

  // ---------------------------------------------------------------- cadastros
  tipos(tabela: TabelaTipo, somenteAtivos = false): Tipo[] {
    const w = somenteAtivos ? " WHERE ativo = 1" : "";
    return this.banco.todos<Linha>(`SELECT * FROM ${tabela}${w} ORDER BY nome COLLATE NOCASE`)
      .map((r) => ({ id: Number(r.id), nome: String(r.nome), ativo: Boolean(r.ativo) }));
  }

  periodos(): Periodo[] {
    return this.banco.todos<Linha>("SELECT * FROM periodos ORDER BY dia_inicio, id").map((r) => ({
      id: Number(r.id), nome: String(r.nome), dia_inicio: Number(r.dia_inicio), dia_fim: Number(r.dia_fim),
    }));
  }

  private validarNome(tabela: string, nome: string, ignorarId?: number) {
    const n = nome.trim();
    if (!n) throw new Error("Informe um nome.");
    const dup = this.banco.um(`SELECT id FROM ${tabela} WHERE lower(nome) = lower(?) AND id <> ?`, [n, ignorarId ?? -1]);
    if (dup) throw new Error("Já existe um cadastro com esse nome.");
    return n;
  }

  adicionarTipo(tabela: TabelaTipo, nome: string) {
    return this.banco.executar(`INSERT INTO ${tabela}(nome) VALUES (?)`, [this.validarNome(tabela, nome)]).id;
  }

  atualizarTipo(tabela: TabelaTipo, id: number, nome: string, ativo: boolean) {
    this.banco.executar(`UPDATE ${tabela} SET nome=?, ativo=? WHERE id=?`, [this.validarNome(tabela, nome, id), ativo ? 1 : 0, id]);
  }

  emUso(tabela: TabelaTipo | "periodos", id: number): number {
    const col = { tipos_despesa: "tipo_despesa_id", tipos_receita: "tipo_receita_id", periodos: "periodo_id" }[tabela];
    return Number(this.banco.um<Linha>(`SELECT COUNT(*) n FROM lancamentos WHERE ${col} = ?`, [id])?.n ?? 0);
  }

  excluirTipo(tabela: TabelaTipo, id: number) {
    if (this.emUso(tabela, id)) throw new Error("Este tipo está em uso em lançamentos — desative em vez de excluir.");
    this.banco.executar(`DELETE FROM ${tabela} WHERE id=?`, [id]);
  }

  private validarPeriodo(nome: string, ini: number, fim: number, id?: number) {
    const n = this.validarNome("periodos", nome, id);
    if (!(ini >= 1 && fim <= 31 && ini <= fim)) throw new Error("Intervalo inválido: o início deve ser menor ou igual ao fim (1 a 31).");
    return n;
  }

  adicionarPeriodo(nome: string, ini: number, fim: number) {
    return this.banco.executar("INSERT INTO periodos(nome, dia_inicio, dia_fim) VALUES (?,?,?)", [this.validarPeriodo(nome, ini, fim), ini, fim]).id;
  }

  atualizarPeriodo(id: number, nome: string, ini: number, fim: number) {
    this.banco.executar("UPDATE periodos SET nome=?, dia_inicio=?, dia_fim=? WHERE id=?", [this.validarPeriodo(nome, ini, fim, id), ini, fim, id]);
  }

  excluirPeriodo(id: number) {
    if (this.emUso("periodos", id)) throw new Error("Este período está em uso — reclassifique os lançamentos antes de excluir.");
    this.banco.executar("DELETE FROM periodos WHERE id=?", [id]);
  }

  diasSemPeriodo(): number[] {
    const cobertos = new Set<number>();
    for (const p of this.periodos()) for (let d = p.dia_inicio; d <= p.dia_fim; d++) cobertos.add(d);
    return Array.from({ length: 31 }, (_, i) => i + 1).filter((d) => !cobertos.has(d));
  }

  periodoDoDia(dia: number): number | null {
    const r = this.banco.um<Linha>("SELECT id FROM periodos WHERE ? BETWEEN dia_inicio AND dia_fim ORDER BY dia_inicio LIMIT 1", [dia]);
    return r ? Number(r.id) : null;
  }

  reclassificar(): number {
    return this.banco.transacao(() => {
      const ls = this.banco.todos<Linha>("SELECT id, vencimento FROM lancamentos");
      for (const l of ls) this.banco.executar("UPDATE lancamentos SET periodo_id=? WHERE id=?", [this.periodoDoDia(partes(String(l.vencimento))[2]), Number(l.id)]);
      return ls.length;
    });
  }

  // ---------------------------------------------------------------- lançamentos
  inserir(n: NovoLancamento): number[] {
    const desc = n.descricao.trim();
    if (!desc) throw new Error("Informe a descrição.");
    if (!(n.valor > 0)) throw new Error("O valor deve ser maior que zero.");
    if (!n.tipo_id) throw new Error("Escolha o tipo.");
    const repetir = Math.max(1, Math.min(120, Math.floor(n.repetir ?? 1)));
    return this.banco.transacao(() => {
      const ids: number[] = [];
      for (let i = 0; i < repetir; i++) {
        const venc = somarMeses(n.vencimento, i);
        const [a, m, d] = partes(venc);
        const per = n.periodo_id ?? this.periodoDoDia(d);
        const ef = Boolean(n.efetivado) && i === 0;
        ids.push(this.banco.executar(
          `INSERT INTO lancamentos (natureza, descricao, valor, vencimento, ano, mes, tipo_despesa_id, tipo_receita_id,
             periodo_id, efetivado, data_efetivacao, observacao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [n.natureza, repetir > 1 ? `${desc} (${i + 1}/${repetir})` : desc, n.valor, venc, a, m,
            n.natureza === "D" ? n.tipo_id : null, n.natureza === "R" ? n.tipo_id : null, per,
            ef ? 1 : 0, ef ? this.hoje() : null, n.observacao ?? ""]).id);
      }
      return ids;
    });
  }

  lancamentos(ano?: number, mes?: number): Lancamento[] {
    let sql = `SELECT l.*, COALESCE(td.nome, tr.nome) AS tipo, p.nome AS periodo
      FROM lancamentos l
      LEFT JOIN tipos_despesa td ON td.id = l.tipo_despesa_id
      LEFT JOIN tipos_receita tr ON tr.id = l.tipo_receita_id
      LEFT JOIN periodos p ON p.id = l.periodo_id WHERE 1=1`;
    const ps: number[] = [];
    if (ano) { sql += " AND l.ano = ?"; ps.push(ano); }
    if (mes) { sql += " AND l.mes = ?"; ps.push(mes); }
    return this.banco.todos<Linha>(sql + " ORDER BY l.vencimento, l.id", ps).map((r) => ({
      id: Number(r.id), natureza: r.natureza as Natureza, descricao: String(r.descricao), valor: Number(r.valor),
      vencimento: String(r.vencimento).slice(0, 10), ano: Number(r.ano), mes: Number(r.mes),
      tipo_id: (r.natureza === "D" ? r.tipo_despesa_id : r.tipo_receita_id) as number | null,
      periodo_id: (r.periodo_id ?? null) as number | null, efetivado: Boolean(r.efetivado),
      data_efetivacao: r.data_efetivacao ? String(r.data_efetivacao).slice(0, 10) : null,
      observacao: (r.observacao as string) ?? "", tipo: (r.tipo as string) ?? null, periodo: (r.periodo as string) ?? null,
    }));
  }

  lancamento(id: number): Lancamento | undefined {
    return this.lancamentos().find((l) => l.id === id);
  }

  atualizar(id: number, d: Omit<NovoLancamento, "repetir"> & { efetivado: boolean }) {
    const atual = this.banco.um<Linha>("SELECT efetivado, data_efetivacao FROM lancamentos WHERE id=?", [id]);
    if (!atual) throw new Error("Lançamento não encontrado.");
    if (!d.descricao.trim()) throw new Error("Informe a descrição.");
    if (!(d.valor > 0)) throw new Error("O valor deve ser maior que zero.");
    let dataEf = (atual.data_efetivacao as string | null) ?? null;
    if (d.efetivado && !atual.efetivado) dataEf = this.hoje();
    else if (!d.efetivado) dataEf = null;
    const [a, m, dia] = partes(d.vencimento);
    this.banco.executar(
      `UPDATE lancamentos SET natureza=?, descricao=?, valor=?, vencimento=?, ano=?, mes=?, tipo_despesa_id=?, tipo_receita_id=?,
         periodo_id=?, efetivado=?, data_efetivacao=?, observacao=? WHERE id=?`,
      [d.natureza, d.descricao.trim(), d.valor, iso(a, m, dia), a, m, d.natureza === "D" ? d.tipo_id : null,
        d.natureza === "R" ? d.tipo_id : null, d.periodo_id ?? this.periodoDoDia(dia), d.efetivado ? 1 : 0, dataEf,
        d.observacao ?? "", id]);
  }

  alternarEfetivado(id: number): boolean {
    const l = this.banco.um<Linha>("SELECT efetivado FROM lancamentos WHERE id=?", [id]);
    const novo = !l?.efetivado;
    this.banco.executar("UPDATE lancamentos SET efetivado=?, data_efetivacao=? WHERE id=?", [novo ? 1 : 0, novo ? this.hoje() : null, id]);
    return novo;
  }

  excluir(id: number) {
    this.banco.executar("DELETE FROM lancamentos WHERE id=?", [id]);
  }

  /** Apaga todos os lançamentos (mantém os cadastros). */
  apagarLancamentos(): number {
    return this.banco.executar("DELETE FROM lancamentos").alteradas;
  }

  contarLancamentos(): number {
    return Number(this.banco.um<Linha>("SELECT COUNT(*) n FROM lancamentos")?.n ?? 0);
  }

  anos(): number[] {
    const s = new Set(this.banco.todos<Linha>("SELECT DISTINCT ano FROM lancamentos").map((r) => Number(r.ano)));
    s.add(partes(this.hoje())[0]);
    return [...s].sort((a, b) => a - b);
  }

  // ---------------------------------------------------------------- dados de exemplo
  carregarExemplo(ano: number) {
    let semente = 42;
    const aleat = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
    const td = Object.fromEntries(this.tipos("tipos_despesa").map((t) => [t.nome, t.id]));
    const tr = Object.fromEntries(this.tipos("tipos_receita").map((t) => [t.nome, t.id]));
    const hoje = this.hoje();
    const [ha, hm] = partes(hoje);
    const fixas: [string, string, number, number][] = [
      ["Aluguel", "Moradia", 1800, 5], ["Condomínio", "Moradia", 520, 10], ["Energia", "Contas de consumo", 210, 15],
      ["Internet", "Contas de consumo", 120, 15], ["Supermercado", "Alimentação", 1100, 8], ["Combustível", "Transporte", 450, 20],
      ["Plano de saúde", "Saúde", 680, 12], ["Escola / curso", "Educação", 750, 10], ["Fatura do cartão", "Cartão de crédito", 1400, 25],
      ["Streaming e lazer", "Lazer", 260, 28]];
    this.banco.transacao(() => {
      for (let mes = 1; mes <= 12; mes++) {
        const v = (d: number) => iso(ano, mes, Math.min(d, 28));
        const passado = ano < ha || (ano === ha && mes < hm);
        const corrente = ano === ha && mes === hm;
        for (const [desc, valor, dia] of [["Salário", 6500, 5], ["Adiantamento", 2600, 20]] as [string, number, number][]) {
          this.inserir({ natureza: "R", descricao: desc, valor, vencimento: v(dia), tipo_id: tr["Salário"] ?? null,
            efetivado: passado || (corrente && v(dia) <= hoje) });
        }
        if (mes % 3 === 0) this.inserir({ natureza: "R", descricao: "Projeto freelance", valor: Math.round((800 + aleat() * 1400) * 100) / 100,
          vencimento: v(18), tipo_id: tr["Freelance"] ?? null, efetivado: passado });
        for (const [desc, tipo, base, dia] of fixas) {
          const valor = Math.round(base * (0.9 + aleat() * 0.22) * 100) / 100;
          this.inserir({ natureza: "D", descricao: desc, valor, vencimento: v(dia), tipo_id: td[tipo] ?? null,
            efetivado: passado || (corrente && v(dia) <= hoje && aleat() > 0.3) });
        }
        if (mes === 4) this.inserir({ natureza: "D", descricao: "IPVA", valor: 1250, vencimento: v(22), tipo_id: td["Impostos"] ?? null, efetivado: passado });
      }
    });
  }
}
