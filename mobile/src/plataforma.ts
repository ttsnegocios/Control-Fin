// Integração com o aparelho: compartilhar/salvar arquivos no app nativo (Capacitor) ou no navegador.
import { Capacitor } from "@capacitor/core";

export const ehNativo = () => Capacitor.isNativePlatform();

function paraBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Entrega um arquivo ao usuário: no app nativo abre o "Compartilhar" do sistema
 *  (salvar em Arquivos, Drive, WhatsApp…); no navegador usa o compartilhamento ou baixa o arquivo. */
export async function entregarArquivo(nome: string, conteudo: Uint8Array | string, mime: string): Promise<"compartilhado" | "baixado"> {
  const bytes = typeof conteudo === "string" ? new TextEncoder().encode(conteudo) : conteudo;
  if (ehNativo()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const r = await Filesystem.writeFile({ path: nome, data: paraBase64(bytes), directory: Directory.Cache });
    await Share.share({ title: nome, files: [r.uri] });
    return "compartilhado";
  }
  const arquivo = new File([bytes.slice().buffer], nome, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const toque = window.matchMedia?.("(pointer: coarse)").matches;
  if (toque && nav.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: nome });
      return "compartilhado";
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return "compartilhado";
    }
  }
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return "baixado";
}

/** Abre o relatório para leitura/impressão. */
export function abrirHtml(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (!w) location.href = url;
}

export function lerArquivo(arquivo: File): Promise<Uint8Array> {
  return arquivo.arrayBuffer().then((b) => new Uint8Array(b));
}

/** "1.234,56" / "1234.56" / "R$ 10" -> número */
export function lerValor(txt: string): number {
  let s = txt.replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export function valorParaCampo(v: number): string {
  return v ? v.toFixed(2).replace(".", ",") : "";
}
