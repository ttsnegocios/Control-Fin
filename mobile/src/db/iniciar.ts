import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import { Banco } from "./banco";
import { Repositorio } from "./repositorio";
import { gravarBanco, lerBanco, pedirPersistencia } from "./armazenamento";

/** Abre (ou cria) o banco local do aparelho. */
export async function iniciarRepositorio(): Promise<Repositorio> {
  const [SQL, bytes] = await Promise.all([initSqlJs({ locateFile: () => wasmUrl }), lerBanco()]);
  void pedirPersistencia();
  const banco = Banco.abrir(SQL, bytes, gravarBanco);
  return new Repositorio(banco);
}
