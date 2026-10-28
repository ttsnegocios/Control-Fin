import { useMemo, useState } from "react";
import { useApp } from "./contexto";
import { situacao } from "../dominio/resumo";
import { brl, dataBr, partes } from "../dominio/datas";
import { Vazio } from "./comum";
import type { Lancamento } from "../db/repositorio";

type Filtro = "todos" | "D" | "R" | "pendentes";
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function AbaLancamentos() {
  const { repo, ano, mes, hoje, versao, alterou, editarLancamento, novoLancamento } = useApp();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const todos = useMemo(() => repo.lancamentos(ano, mes), [repo, ano, mes, versao]);
  const lista = todos.filter((l) => filtro === "todos" || (filtro === "pendentes" ? !l.efetivado : l.natureza === filtro));

  const grupos = new Map<string, Lancamento[]>();
  for (const l of lista) grupos.set(l.vencimento, [...(grupos.get(l.vencimento) ?? []), l]);

  const totR = lista.filter((l) => l.natureza === "R").reduce((s, l) => s + l.valor, 0);
  const totD = lista.filter((l) => l.natureza === "D").reduce((s, l) => s + l.valor, 0);
  const conta = (f: Filtro) => todos.filter((l) => f === "todos" || (f === "pendentes" ? !l.efetivado : l.natureza === f)).length;

  function alternar(l: Lancamento) {
    const novo = repo.alternarEfetivado(l.id);
    alterou(novo ? `${l.descricao}: ${l.natureza === "D" ? "pago" : "recebido"} ✓` : `${l.descricao}: marcado como pendente`);
  }

  return (
    <>
      <div className="filtros" role="tablist">
        {([["todos", "Todos"], ["D", "Despesas"], ["R", "Receitas"], ["pendentes", "Pendentes"]] as [Filtro, string][]).map(([f, r]) => (
          <button key={f} role="tab" aria-selected={filtro === f} className={`chip ${filtro === f ? "ativo" : ""}`} onClick={() => setFiltro(f)}>
            {r} <span className="mini">{conta(f)}</span>
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="cartao"><Vazio icone="🧾">
          <p>{todos.length ? "Nada neste filtro." : "Nenhum lançamento neste mês."}</p>
          {!todos.length && <button className="botao prim" onClick={() => novoLancamento()}>Novo lançamento</button>}
        </Vazio></div>
      ) : (
        <>
          <div className="totais-lista num">
            <span>Receitas <b style={{ color: "var(--texto)" }}>{brl(totR)}</b></span>
            <span>Despesas <b style={{ color: "var(--texto)" }}>{brl(totD)}</b></span>
          </div>
          {[...grupos.entries()].map(([dia, ls]) => {
            const [a, m, d] = partes(dia);
            const sem = SEMANA[new Date(a, m - 1, d).getDay()];
            return (
              <section key={dia}>
                <div className="grupo-dia">{sem}, {dataBr(dia).slice(0, 5)}{dia === hoje ? " · hoje" : ""}</div>
                <div className="lista">
                  {ls.map((l) => {
                    const sit = situacao(l, hoje);
                    const rot = l.natureza === "D" ? (l.efetivado ? "Pago" : "Marcar como pago") : (l.efetivado ? "Recebido" : "Marcar como recebido");
                    return (
                      <div className="item" key={l.id}>
                        <span className="marca" style={{ background: l.natureza === "D" ? "var(--despesa)" : "var(--receita)" }} aria-hidden />
                        <button className={`check ${l.efetivado ? "feito" : ""}`} aria-label={`${l.descricao}: ${rot}`} aria-pressed={l.efetivado} onClick={() => alternar(l)}>
                          <span>{l.efetivado ? "✓" : ""}</span>
                        </button>
                        <div className="corpo" onClick={() => editarLancamento(l.id)}>
                          <div className="desc">{l.descricao}</div>
                          <div className="meta">{l.tipo ?? "Sem tipo"} · {l.natureza === "D" ? "Despesa" : "Receita"}{l.observacao ? ` · ${l.observacao}` : ""}</div>
                        </div>
                        <div className="direita" onClick={() => editarLancamento(l.id)}>
                          <div className="valor num">{l.natureza === "D" ? "−" : "+"} {brl(l.valor)}</div>
                          <span className={`etiqueta ${sit.replace(" ", "")}`}>{sit}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          <p className="mini" style={{ textAlign: "center" }}>Toque no círculo para marcar como pago/recebido · toque no lançamento para editar</p>
        </>
      )}
    </>
  );
}
