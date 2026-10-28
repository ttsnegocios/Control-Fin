import { useMemo, useState } from "react";
import { useApp } from "./contexto";
import { Folha } from "./comum";
import { lerValor, valorParaCampo } from "../plataforma";
import { iso, partes, diasNoMes, brl } from "../dominio/datas";
import type { Natureza } from "../db/repositorio";

export function FormLancamento({ id, naturezaInicial, aoFechar }: { id?: number; naturezaInicial?: Natureza; aoFechar: () => void }) {
  const { repo, ano, mes, hoje, alterou } = useApp();
  const existente = useMemo(() => (id ? repo.lancamento(id) : undefined), [repo, id]);
  const [hA, hM, hD] = partes(hoje);
  const vencPadrao = ano === hA && mes === hM ? hoje : iso(ano, mes, Math.min(hD, diasNoMes(ano, mes)));

  const [natureza, setNatureza] = useState<Natureza>(existente?.natureza ?? naturezaInicial ?? "D");
  const [descricao, setDescricao] = useState(existente?.descricao ?? "");
  const [valor, setValor] = useState(valorParaCampo(existente?.valor ?? 0));
  const [vencimento, setVencimento] = useState(existente?.vencimento ?? vencPadrao);
  const [tipoId, setTipoId] = useState<number | null>(existente?.tipo_id ?? null);
  // "auto" = período calculado pelo dia do vencimento; número = período escolhido à mão
  const [periodoSel, setPeriodoSel] = useState<"auto" | number>(() => {
    if (!existente?.periodo_id) return "auto";
    return existente.periodo_id === repo.periodoDoDia(partes(existente.vencimento)[2]) ? "auto" : existente.periodo_id;
  });
  const [efetivado, setEfetivado] = useState(existente?.efetivado ?? false);
  const [observacao, setObservacao] = useState(existente?.observacao ?? "");
  const [repetir, setRepetir] = useState(1);
  const [erro, setErro] = useState("");

  const tabela = natureza === "D" ? "tipos_despesa" : "tipos_receita";
  const tipos = repo.tipos(tabela, true);
  // ao editar, mantém visível um tipo que foi desativado depois
  if (existente && existente.natureza === natureza && existente.tipo_id && !tipos.some((t) => t.id === existente.tipo_id)) {
    tipos.push({ id: existente.tipo_id, nome: `${existente.tipo} (inativo)`, ativo: false });
  }
  const tipoValido = tipos.some((t) => t.id === tipoId) ? tipoId : null;
  const periodos = repo.periodos();
  const periodoAuto = vencimento ? repo.periodoDoDia(partes(vencimento)[2]) : null;
  const nomeAuto = periodos.find((p) => p.id === periodoAuto)?.nome;
  const v = lerValor(valor);

  function trocarNatureza(n: Natureza) { setNatureza(n); setTipoId(null); }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    try {
      if (!vencimento) throw new Error("Informe o vencimento.");
      if (!tipoValido) throw new Error(`Escolha o tipo de ${natureza === "D" ? "despesa" : "receita"}.`);
      const dados = { natureza, descricao, valor: v, vencimento, tipo_id: tipoValido,
        periodo_id: periodoSel === "auto" ? null : periodoSel, efetivado, observacao };
      if (existente) {
        repo.atualizar(existente.id, dados);
        alterou("Lançamento atualizado.");
      } else {
        const ids = repo.inserir({ ...dados, repetir });
        alterou(ids.length > 1 ? `${ids.length} lançamentos criados (um por mês).` : `${natureza === "D" ? "Despesa" : "Receita"} salva.`);
      }
      aoFechar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  function excluir() {
    if (!existente || !confirm(`Excluir "${existente.descricao}"?`)) return;
    repo.excluir(existente.id);
    alterou("Lançamento excluído.");
    aoFechar();
  }

  return (
    <Folha titulo={existente ? "Editar lançamento" : "Novo lançamento"} aoFechar={aoFechar}>
      <form onSubmit={salvar} noValidate>
        <div className="campo">
          <div className="segmentado" role="radiogroup" aria-label="Natureza">
            {(["D", "R"] as Natureza[]).map((n) => (
              <button type="button" key={n} role="radio" aria-checked={natureza === n} className={`${n} ${natureza === n ? "ativo" : ""}`} onClick={() => trocarNatureza(n)}>
                {n === "D" ? "Despesa" : "Receita"}
              </button>
            ))}
          </div>
        </div>
        <div className="campo">
          <label htmlFor="f-valor">Valor (R$)</label>
          <input id="f-valor" className="valor-grande num" inputMode="decimal" placeholder="0,00" value={valor}
            onChange={(e) => setValor(e.target.value)} autoFocus={!existente} />
          {valor && !Number.isNaN(v) && <span className="mini num">{brl(v)}</span>}
        </div>
        <div className="campo">
          <label htmlFor="f-desc">Descrição</label>
          <input id="f-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={natureza === "D" ? "Ex.: Aluguel" : "Ex.: Salário"} enterKeyHint="next" />
        </div>
        <div className="duas">
          <div className="campo">
            <label htmlFor="f-venc">Vencimento</label>
            <input id="f-venc" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="f-tipo">Tipo</label>
            <select id="f-tipo" value={tipoValido ?? ""} onChange={(e) => setTipoId(Number(e.target.value) || null)}>
              <option value="">Escolha…</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
        </div>
        <div className="campo">
          <label htmlFor="f-per">Período do mês</label>
          <select id="f-per" value={periodoSel} onChange={(e) => setPeriodoSel(e.target.value === "auto" ? "auto" : Number(e.target.value))}>
            <option value="auto">Automático{nomeAuto ? ` — ${nomeAuto}` : " (dia sem período)"}</option>
            {periodos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <label className="interruptor">
          <span>{natureza === "D" ? "Já está pago" : "Já foi recebido"}</span>
          <input type="checkbox" checked={efetivado} onChange={(e) => setEfetivado(e.target.checked)} />
        </label>
        {!existente && (
          <div className="campo">
            <label htmlFor="f-rep">Repetir nos próximos meses</label>
            <select id="f-rep" value={repetir} onChange={(e) => setRepetir(Number(e.target.value))}>
              <option value={1}>Não repetir</option>
              {[2, 3, 4, 5, 6, 10, 12, 18, 24, 36, 48, 60].map((n) => <option key={n} value={n}>{n} meses (conta fixa / parcelas)</option>)}
            </select>
          </div>
        )}
        <div className="campo">
          <label htmlFor="f-obs">Observação</label>
          <textarea id="f-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </div>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <div className="linha-botoes">
          {existente && <button type="button" className="botao perigo" onClick={excluir}>Excluir</button>}
          <button type="submit" className="botao prim">Salvar</button>
        </div>
      </form>
    </Folha>
  );
}
