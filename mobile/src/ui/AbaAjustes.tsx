import { useEffect, useRef, useState } from "react";
import { useApp } from "./contexto";
import { Folha } from "./comum";
import { entregarArquivo, lerArquivo, ehNativo } from "../plataforma";
import { ErroBackup } from "../db/banco";
import type { Periodo, TabelaTipo, Tipo } from "../db/repositorio";

type Tela = "menu" | TabelaTipo | "periodos";
const VERSAO = "1.0.0";

export function AbaAjustes() {
  const [tela, setTela] = useState<Tela>("menu");
  if (tela === "tipos_despesa" || tela === "tipos_receita") return <CadastroTipos tabela={tela} voltar={() => setTela("menu")} />;
  if (tela === "periodos") return <CadastroPeriodos voltar={() => setTela("menu")} />;
  return <Menu abrir={setTela} />;
}

function Menu({ abrir }: { abrir: (t: Tela) => void }) {
  const { repo, ano, hoje, versao, alterou, aviso } = useApp();
  const arquivo = useRef<HTMLInputElement>(null);
  const [persistente, setPersistente] = useState<boolean | null>(null);
  const total = repo.contarLancamentos();
  const instalado = ehNativo() || window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
  useEffect(() => { navigator.storage?.persisted?.().then(setPersistente).catch(() => {}); }, [versao]);

  async function backup() {
    try {
      const r = await entregarArquivo(`financeiro_backup_${hoje}.db`, repo.banco.exportar(), "application/x-sqlite3");
      aviso(r === "baixado" ? "Backup salvo em Downloads." : "Backup pronto para salvar ou enviar.");
    } catch (e) { aviso(`Falha no backup: ${(e as Error).message}`); }
  }

  async function restaurar(f: File | undefined) {
    if (!f) return;
    if (!confirm(`Substituir TODOS os dados deste aparelho pelos do arquivo "${f.name}"?`)) return;
    try {
      repo.banco.restaurar(await lerArquivo(f));
      alterou(`Backup restaurado: ${repo.contarLancamentos()} lançamentos.`);
    } catch (e) { aviso(e instanceof ErroBackup ? e.message : `Falha: ${(e as Error).message}`); }
    finally { if (arquivo.current) arquivo.current.value = ""; }
  }

  return (
    <>
      <div className="titulo-secao">Cadastros</div>
      <div className="menu">
        <button onClick={() => abrir("tipos_despesa")}><span className="ic-menu" style={{ background: "var(--despesa)" }}>−</span>Tipos de despesa<span className="seta">›</span></button>
        <button onClick={() => abrir("tipos_receita")}><span className="ic-menu" style={{ background: "var(--receita)" }}>+</span>Tipos de receita<span className="seta">›</span></button>
        <button onClick={() => abrir("periodos")}><span className="ic-menu" style={{ background: "#7a6ad8" }}>⏷</span>Períodos do mês<span className="seta">›</span></button>
      </div>

      <div className="titulo-secao">Dados</div>
      <div className="menu">
        <button onClick={backup}><span className="ic-menu" style={{ background: "var(--ok)" }}>⇩</span>Fazer backup (.db)<span className="seta">›</span></button>
        <label><span className="ic-menu" style={{ background: "#8a8984" }}>⇧</span>Restaurar backup
          <input ref={arquivo} type="file" accept=".db,application/x-sqlite3,application/octet-stream" hidden onChange={(e) => restaurar(e.target.files?.[0])} />
          <span className="seta">›</span></label>
        <button onClick={() => { repo.carregarExemplo(ano); alterou(`Dados de exemplo carregados em ${ano}.`); }}>
          <span className="ic-menu" style={{ background: "var(--atencao)" }}>★</span>Carregar dados de exemplo ({ano})<span className="seta">›</span></button>
        <button className="perigo" disabled={!total} onClick={() => {
          if (confirm(`Apagar os ${total} lançamentos deste aparelho? Os cadastros são mantidos.`) && confirm("Tem certeza? Não dá para desfazer (a não ser com um backup).")) {
            repo.apagarLancamentos(); alterou("Lançamentos apagados.");
          }
        }}><span className="ic-menu" style={{ background: "var(--alerta)" }}>✕</span>Apagar todos os lançamentos</button>
      </div>
      <p className="mini" style={{ margin: "0 4px" }}>
        O backup é o mesmo arquivo usado pelo app de computador: dá para levar os dados do celular para o PC e vice-versa.
      </p>

      <div className="titulo-secao">Sobre</div>
      <div className="cartao" style={{ display: "grid", gap: 8 }}>
        <div><b>Controle Financeiro</b> <span className="mini">versão {VERSAO}</span></div>
        <div className="sub">Funciona sem internet. Seus {total} lançamentos ficam gravados somente neste aparelho — nada é enviado para servidores.</div>
        {persistente === false && !instalado && <div className="sub" style={{ color: "var(--atencao)" }}>
          O navegador ainda não garantiu o armazenamento permanente. Instale o app na tela inicial e faça backups periódicos.</div>}
        {!instalado && <div className="sub"><b>Instalar:</b> no Android (Chrome) use ⋮ → <i>Instalar app</i>; no iPhone (Safari) use
          Compartilhar → <i>Adicionar à Tela de Início</i>.</div>}
      </div>
    </>
  );
}

function CadastroTipos({ tabela, voltar }: { tabela: TabelaTipo; voltar: () => void }) {
  const { repo, versao, alterou } = useApp();
  const [editando, setEditando] = useState<Tipo | "novo" | null>(null);
  void versao;
  const tipos = repo.tipos(tabela);
  const titulo = tabela === "tipos_despesa" ? "Tipos de despesa" : "Tipos de receita";
  return (
    <>
      <button className="voltar" onClick={voltar}>‹ Ajustes</button>
      <div className="cab-titulo">{titulo}</div>
      <div className="lista">
        {tipos.map((t) => (
          <div className="cad-item" key={t.id}>
            <span className={`nome ${t.ativo ? "" : "inativo"}`}>{t.nome}</span>
            {!t.ativo && <span className="mini">inativo</span>}
            <button onClick={() => setEditando(t)}>Editar</button>
          </div>
        ))}
      </div>
      <button className="botao prim" onClick={() => setEditando("novo")}>Adicionar tipo</button>
      <p className="mini">Tipos inativos não aparecem ao lançar, mas continuam nos lançamentos antigos.</p>
      {editando && <FormTipo tabela={tabela} tipo={editando === "novo" ? undefined : editando} aoFechar={() => setEditando(null)} alterou={alterou} />}
    </>
  );
}

function FormTipo({ tabela, tipo, aoFechar, alterou }: { tabela: TabelaTipo; tipo?: Tipo; aoFechar: () => void; alterou: (m?: string) => void }) {
  const { repo } = useApp();
  const [nome, setNome] = useState(tipo?.nome ?? "");
  const [ativo, setAtivo] = useState(tipo?.ativo ?? true);
  const [erro, setErro] = useState("");
  const uso = tipo ? repo.emUso(tabela, tipo.id) : 0;
  const tentar = (fn: () => void) => { try { fn(); aoFechar(); } catch (e) { setErro((e as Error).message); } };
  return (
    <Folha titulo={tipo ? "Editar tipo" : "Novo tipo"} aoFechar={aoFechar}>
      <form onSubmit={(e) => { e.preventDefault(); tentar(() => { tipo ? repo.atualizarTipo(tabela, tipo.id, nome, ativo) : repo.adicionarTipo(tabela, nome); alterou("Cadastro salvo."); }); }}>
        <div className="campo"><label htmlFor="t-nome">Nome</label><input id="t-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></div>
        {tipo && <label className="interruptor"><span>Ativo</span><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /></label>}
        {tipo && <p className="mini">Usado em {uso} lançamento(s).{uso ? " Para tirar da lista, desative em vez de excluir." : ""}</p>}
        {erro && <p className="erro" role="alert">{erro}</p>}
        <div className="linha-botoes">
          {tipo && !uso && <button type="button" className="botao perigo" onClick={() => confirm(`Excluir "${tipo.nome}"?`) && tentar(() => { repo.excluirTipo(tabela, tipo.id); alterou("Tipo excluído."); })}>Excluir</button>}
          <button className="botao prim" type="submit">Salvar</button>
        </div>
      </form>
    </Folha>
  );
}

function CadastroPeriodos({ voltar }: { voltar: () => void }) {
  const { repo, versao, alterou } = useApp();
  const [editando, setEditando] = useState<Periodo | "novo" | null>(null);
  void versao;
  const periodos = repo.periodos();
  const faltando = repo.diasSemPeriodo();
  return (
    <>
      <button className="voltar" onClick={voltar}>‹ Ajustes</button>
      <div className="cab-titulo">Períodos do mês</div>
      <p className="sub" style={{ margin: 0 }}>Dividem o mês em faixas de dias. Cada lançamento entra no período do dia do vencimento — é a base do Equilíbrio.</p>
      <div className="lista">
        {periodos.map((p) => (
          <div className="cad-item" key={p.id}>
            <span className="nome">{p.nome}<div className="mini">dias {p.dia_inicio} a {p.dia_fim}</div></span>
            <button onClick={() => setEditando(p)}>Editar</button>
          </div>
        ))}
      </div>
      {faltando.length > 0 && <p className="erro">Dias sem período: {faltando.join(", ")}.</p>}
      <button className="botao prim" onClick={() => setEditando("novo")}>Adicionar período</button>
      <button className="botao" onClick={() => {
        if (confirm("Recalcular o período de todos os lançamentos pelo dia do vencimento?")) alterou(`${repo.reclassificar()} lançamento(s) reclassificado(s).`);
      }}>Reclassificar lançamentos</button>
      {editando && <FormPeriodo periodo={editando === "novo" ? undefined : editando} aoFechar={() => setEditando(null)} alterou={alterou} />}
    </>
  );
}

function FormPeriodo({ periodo, aoFechar, alterou }: { periodo?: Periodo; aoFechar: () => void; alterou: (m?: string) => void }) {
  const { repo } = useApp();
  const [nome, setNome] = useState(periodo?.nome ?? "");
  const [ini, setIni] = useState(periodo?.dia_inicio ?? 1);
  const [fim, setFim] = useState(periodo?.dia_fim ?? 15);
  const [erro, setErro] = useState("");
  const tentar = (fn: () => void) => { try { fn(); aoFechar(); } catch (e) { setErro((e as Error).message); } };
  const dias = Array.from({ length: 31 }, (_, i) => i + 1);
  return (
    <Folha titulo={periodo ? "Editar período" : "Novo período"} aoFechar={aoFechar}>
      <form onSubmit={(e) => { e.preventDefault(); tentar(() => { periodo ? repo.atualizarPeriodo(periodo.id, nome, ini, fim) : repo.adicionarPeriodo(nome, ini, fim); alterou("Período salvo."); }); }}>
        <div className="campo"><label htmlFor="p-nome">Nome</label><input id="p-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: 1ª quinzena" /></div>
        <div className="duas">
          <div className="campo"><label htmlFor="p-ini">Do dia</label><select id="p-ini" value={ini} onChange={(e) => setIni(Number(e.target.value))}>{dias.map((d) => <option key={d}>{d}</option>)}</select></div>
          <div className="campo"><label htmlFor="p-fim">Até o dia</label><select id="p-fim" value={fim} onChange={(e) => setFim(Number(e.target.value))}>{dias.map((d) => <option key={d}>{d}</option>)}</select></div>
        </div>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <div className="linha-botoes">
          {periodo && <button type="button" className="botao perigo" onClick={() => confirm(`Excluir "${periodo.nome}"?`) && tentar(() => { repo.excluirPeriodo(periodo.id); alterou("Período excluído."); })}>Excluir</button>}
          <button className="botao prim" type="submit">Salvar</button>
        </div>
      </form>
    </Folha>
  );
}
