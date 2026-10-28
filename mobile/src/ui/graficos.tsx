import { useState } from "react";
import { brl, brlCurto } from "../dominio/datas";

interface Serie { nome: string; cor: string; valores: number[] }

/** Colunas agrupadas (uma escala só) com toque para ver os valores. Saldo opcional como linha. */
export function Colunas({ categorias, series, linha, destaque, altura = 190 }:
  { categorias: string[]; series: Serie[]; linha?: Serie; destaque?: number; altura?: number }) {
  const [sel, setSel] = useState<number | null>(destaque ?? null);
  const L = 340, esq = 40, dir = 6, topo = 10, base = 22;
  const todos = [...series.flatMap((s) => s.valores), ...(linha?.valores ?? []), 0];
  let max = Math.max(...todos), min = Math.min(...todos);
  if (max === min) max = min + 1;
  const passo = escalaPasso((max - min) / 4);
  max = Math.ceil(max / passo) * passo; min = Math.floor(min / passo) * passo;
  const h = altura - topo - base;
  const y = (v: number) => topo + ((max - v) / (max - min)) * h;
  const larg = (L - esq - dir) / categorias.length;
  const gap = Math.max(2, larg * 0.22);
  const bw = Math.max(2, (larg - gap) / series.length - (series.length > 1 ? 1.5 : 0));
  const marcas: number[] = [];
  for (let v = min; v <= max + 1e-9; v += passo) marcas.push(v);
  const i = sel ?? -1;

  return (
    <div>
      <svg className="grafico" viewBox={`0 0 ${L} ${altura}`} role="img"
        aria-label={series.map((s) => `${s.nome}: ${s.valores.map((v, k) => `${categorias[k]} ${brl(v)}`).join(", ")}`).join(". ")}>
        {marcas.map((m) => (
          <g key={m}>
            <line className={m === 0 ? "zero" : "grade"} x1={esq} x2={L - dir} y1={y(m)} y2={y(m)} />
            <text x={esq - 4} y={y(m) + 3} textAnchor="end">{brlCurto(m).replace("R$ ", "")}</text>
          </g>
        ))}
        {i >= 0 && <rect className="sel" x={esq + i * larg} y={topo} width={larg} height={h} rx={4} />}
        {categorias.map((c, k) => (
          <g key={c + k}>
            {series.map((s, j) => {
              const v = s.valores[k], y0 = y(Math.max(v, 0)), y1 = y(Math.min(v, 0));
              return <rect key={s.nome} x={esq + k * larg + gap / 2 + j * (bw + 1.5)} y={y0} width={bw} height={Math.max(y1 - y0, v ? 1 : 0)}
                rx={Math.min(3, bw / 2)} fill={typeof s.cor === "string" && s.cor.startsWith("cond:") ? (v >= 0 ? s.cor.split(":")[1] : s.cor.split(":")[2]) : s.cor} />;
            })}
            <text x={esq + k * larg + larg / 2} y={altura - 6} textAnchor="middle" style={{ fontWeight: k === i ? 700 : 400 }}>{c}</text>
            <rect x={esq + k * larg} y={0} width={larg} height={altura} fill="transparent" onClick={() => setSel(k === sel ? null : k)} style={{ cursor: "pointer" }} />
          </g>
        ))}
        {linha && (
          <>
            <polyline fill="none" stroke={linha.cor} strokeWidth={2} points={linha.valores.map((v, k) => `${esq + k * larg + larg / 2},${y(v)}`).join(" ")} />
            {linha.valores.map((v, k) => <circle key={k} cx={esq + k * larg + larg / 2} cy={y(v)} r={4} fill={linha.cor} stroke="var(--cartao)" strokeWidth={2} pointerEvents="none" />)}
          </>
        )}
      </svg>
      {i >= 0 ? (
        <div className="dica num"><b>{categorias[i]}</b>
          {[...series, ...(linha ? [linha] : [])].map((s) => <span key={s.nome}>{s.nome}: <b>{brl(s.valores[i])}</b></span>)}
        </div>
      ) : <div className="mini" style={{ marginTop: 6 }}>Toque numa coluna para ver os valores.</div>}
    </div>
  );
}

function escalaPasso(bruto: number) {
  const p = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
  const n = bruto / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
