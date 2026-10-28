import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Repositorio, Natureza } from "./db/repositorio";
import { Contexto, type Aba, type Ctx } from "./ui/contexto";
import { MESES, MESES_ABREV, hojeIso, mesAnterior, mesSeguinte, partes } from "./dominio/datas";
import { Folha, Icone } from "./ui/comum";
import { AbaResumo } from "./ui/AbaResumo";
import { AbaLancamentos } from "./ui/AbaLancamentos";
import { AbaPainel } from "./ui/AbaPainel";
import { AbaEquilibrio } from "./ui/AbaEquilibrio";
import { AbaAjustes } from "./ui/AbaAjustes";
import { FormLancamento } from "./ui/FormLancamento";
import { ehNativo } from "./plataforma";

const ABAS: { id: Aba; rotulo: string; titulo: string }[] = [
  { id: "resumo", rotulo: "Resumo", titulo: "Resumo" },
  { id: "lancamentos", rotulo: "Lançamentos", titulo: "Lançamentos" },
  { id: "painel", rotulo: "Painel", titulo: "Painel" },
  { id: "equilibrio", rotulo: "Equilíbrio", titulo: "Equilíbrio" },
  { id: "ajustes", rotulo: "Ajustes", titulo: "Ajustes" },
];

export function App({ repo }: { repo: Repositorio }) {
  const [hoje, setHoje] = useState(hojeIso());
  const [hA, hM] = partes(hoje);
  const [ano, setAno] = useState(hA);
  const [mes, setMesSel] = useState(hM);
  const [aba, setAba] = useState<Aba>("resumo");
  const [versao, setVersao] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState<{ id?: number; natureza?: Natureza } | null>(null);
  const [seletor, setSeletor] = useState(false);
  const [rolado, setRolado] = useState(false);
  const timer = useRef<number>(undefined);

  // atualiza "hoje" quando o app volta do segundo plano em outro dia
  useEffect(() => {
    const f = () => !document.hidden && setHoje(hojeIso());
    document.addEventListener("visibilitychange", f);
    const s = () => setRolado(window.scrollY > 4);
    window.addEventListener("scroll", s, { passive: true });
    return () => { document.removeEventListener("visibilitychange", f); window.removeEventListener("scroll", s); };
  }, []);

  // Botão "voltar" do Android: fecha folha/seletor, depois volta ao Resumo, depois sai do app
  const estado = useRef({ form, seletor, aba });
  estado.current = { form, seletor, aba };
  useEffect(() => {
    if (!ehNativo()) return;
    let remover: (() => void) | undefined;
    import("@capacitor/app").then(({ App: Cap }) => {
      Cap.addListener("backButton", () => {
        const e = estado.current;
        if (e.form) setForm(null);
        else if (e.seletor) setSeletor(false);
        else if (e.aba !== "resumo") { setAba("resumo"); window.scrollTo(0, 0); }
        else void Cap.exitApp();
      }).then((h) => { remover = () => void h.remove(); });
    });
    return () => remover?.();
  }, []);

  const aviso = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const ctx: Ctx = useMemo(() => ({
    repo, ano, mes, hoje, versao,
    alterou: (msg?: string) => { setVersao((v) => v + 1); if (msg) aviso(msg); },
    aviso,
    irPara: (a: Aba) => { setAba(a); window.scrollTo(0, 0); },
    setMes: (a: number, m: number) => { setAno(a); setMesSel(m); },
    novoLancamento: (natureza?: Natureza) => setForm({ natureza }),
    editarLancamento: (id: number) => setForm({ id }),
  }), [repo, ano, mes, hoje, versao, aviso]);

  const mudarMes = (d: -1 | 1) => {
    const [a, m] = d < 0 ? mesAnterior(ano, mes) : mesSeguinte(ano, mes);
    setAno(a); setMesSel(m);
  };
  const atual = ABAS.find((a) => a.id === aba)!;
  const comMes = aba !== "ajustes";

  return (
    <Contexto.Provider value={ctx}>
      <div className="app">
        <header className={`cabecalho ${rolado ? "rolado" : ""}`}>
          <div className="cab-linha">
            <div className="cab-titulo">{atual.titulo}</div>
            {comMes && (
              <div className="seletor-mes">
                <button className="seta" aria-label="Mês anterior" onClick={() => mudarMes(-1)}>‹</button>
                <button className="mes" aria-label={`Escolher mês: ${MESES[mes - 1]} de ${ano}`} onClick={() => setSeletor(true)}>
                  {aba === "painel" ? `${MESES_ABREV[mes - 1]} ${ano}` : `${MESES[mes - 1]} ${ano}`}
                </button>
                <button className="seta" aria-label="Próximo mês" onClick={() => mudarMes(1)}>›</button>
              </div>
            )}
          </div>
        </header>

        <main className="conteudo">
          {aba === "resumo" && <AbaResumo />}
          {aba === "lancamentos" && <AbaLancamentos />}
          {aba === "painel" && <AbaPainel />}
          {aba === "equilibrio" && <AbaEquilibrio />}
          {aba === "ajustes" && <AbaAjustes />}
        </main>

        {aba !== "ajustes" && <button className="fab" aria-label="Novo lançamento" onClick={() => setForm({})}>+</button>}

        <nav className="abas" aria-label="Seções">
          {ABAS.map((a) => (
            <button key={a.id} className={`aba ${aba === a.id ? "ativa" : ""}`} aria-current={aba === a.id ? "page" : undefined}
              onClick={() => { setAba(a.id); window.scrollTo(0, 0); }}>
              <Icone nome={a.id} />{a.rotulo}
            </button>
          ))}
        </nav>

        {form && <FormLancamento key={form.id ?? "novo"} id={form.id} naturezaInicial={form.natureza} aoFechar={() => setForm(null)} />}
        {seletor && <SeletorMes ano={ano} mes={mes} hoje={hoje} anos={repo.anos()} aoEscolher={(a, m) => { setAno(a); setMesSel(m); setSeletor(false); }} aoFechar={() => setSeletor(false)} />}
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </Contexto.Provider>
  );
}

function SeletorMes({ ano, mes, hoje, anos, aoEscolher, aoFechar }:
  { ano: number; mes: number; hoje: string; anos: number[]; aoEscolher: (a: number, m: number) => void; aoFechar: () => void }) {
  const [a, setA] = useState(ano);
  const [hA, hM] = partes(hoje);
  return (
    <Folha titulo="Escolher mês" aoFechar={aoFechar}>
      <div className="ano-nav">
        <button aria-label="Ano anterior" onClick={() => setA(a - 1)}>‹</button>
        <span>{a}</span>
        <button aria-label="Próximo ano" onClick={() => setA(a + 1)}>›</button>
      </div>
      <div className="grade-meses">
        {MESES.map((nome, k) => (
          <button key={nome} className={a === ano && k + 1 === mes ? "ativo" : ""} onClick={() => aoEscolher(a, k + 1)}>{nome.slice(0, 3)}</button>
        ))}
      </div>
      <div className="linha-botoes" style={{ marginTop: 14 }}>
        <button className="botao" onClick={() => aoEscolher(hA, hM)}>Ir para o mês atual</button>
      </div>
      {anos.length > 1 && <p className="mini" style={{ textAlign: "center" }}>Anos com lançamentos: {anos.join(", ")}</p>}
    </Folha>
  );
}
