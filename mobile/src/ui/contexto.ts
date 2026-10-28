import { createContext, useContext } from "react";
import type { Repositorio } from "../db/repositorio";

export interface Ctx {
  repo: Repositorio;
  ano: number;
  mes: number;
  hoje: string;
  versao: number;                 // muda a cada gravação: as telas releem os dados
  alterou: (msg?: string) => void;
  aviso: (msg: string) => void;
  irPara: (aba: Aba) => void;
  setMes: (ano: number, mes: number) => void;
  novoLancamento: (natureza?: "R" | "D") => void;
  editarLancamento: (id: number) => void;
}

export type Aba = "resumo" | "lancamentos" | "painel" | "equilibrio" | "ajustes";

export const Contexto = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(Contexto);
  if (!c) throw new Error("Contexto ausente");
  return c;
};
