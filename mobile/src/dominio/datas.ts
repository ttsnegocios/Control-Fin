// Datas como texto ISO "AAAA-MM-DD" (igual ao banco), sem armadilhas de fuso horário.
export const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho",
  "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const MESES_ABREV = MESES.map((m) => m.slice(0, 3));

const p2 = (n: number) => String(n).padStart(2, "0");

export function iso(ano: number, mes: number, dia: number): string {
  return `${ano}-${p2(mes)}-${p2(dia)}`;
}

export function hojeIso(agora: Date = new Date()): string {
  return iso(agora.getFullYear(), agora.getMonth() + 1, agora.getDate());
}

export function partes(d: string): [number, number, number] {
  const [a, m, dd] = d.slice(0, 10).split("-").map(Number);
  return [a, m, dd];
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Soma meses mantendo o dia (limitado ao último dia do mês), como o app de desktop. */
export function somarMeses(d: string, n: number): string {
  const [a, m, dia] = partes(d);
  const total = m - 1 + n;
  const ano = a + Math.floor(total / 12);
  const mes = (((total % 12) + 12) % 12) + 1;
  return iso(ano, mes, Math.min(dia, diasNoMes(ano, mes)));
}

export function somarDias(d: string, n: number): string {
  const [a, m, dia] = partes(d);
  const t = new Date(Date.UTC(a, m - 1, dia + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function dataBr(d: string | null | undefined): string {
  if (!d) return "";
  const [a, m, dia] = partes(d);
  return `${p2(dia)}/${p2(m)}/${a}`;
}

export function mesAnterior(ano: number, mes: number): [number, number] {
  return mes === 1 ? [ano - 1, 12] : [ano, mes - 1];
}

export function mesSeguinte(ano: number, mes: number): [number, number] {
  return mes === 12 ? [ano + 1, 1] : [ano, mes + 1];
}

const fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (v: number) => fmtMoeda.format(v).replace(/ /g, " ");
export const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
export const brlCurto = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(1)} mi` : a >= 1e3 ? `${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)} mil` : a.toFixed(0);
  return `${v < 0 ? "-" : ""}R$ ${s.replace(".", ",")}`;
};
