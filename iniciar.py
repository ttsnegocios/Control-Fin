"""Lançador da versão instalada (Windows/macOS).

- Guarda os dados na pasta do usuário (não na pasta do programa).
- Se o app já estiver aberto, apenas abre o navegador nele.
- Caso contrário, sobe o servidor Streamlit neste mesmo processo (sem janela
  de terminal) e abre o navegador quando ele estiver pronto.
"""
import json
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

# No executável (PyInstaller) os arquivos do app ficam em sys._MEIPASS
APP_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
NOME = "ControleFinanceiro"


def pasta_dados() -> Path:
    if os.environ.get("CF_DATA_DIR"):
        p = Path(os.environ["CF_DATA_DIR"])
    elif sys.platform == "win32":
        p = Path(os.environ.get("APPDATA", Path.home())) / NOME
    elif sys.platform == "darwin":
        p = Path.home() / "Library" / "Application Support" / NOME
    else:
        p = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / NOME
    p.mkdir(parents=True, exist_ok=True)
    return p


DADOS = pasta_dados()
ESTADO = DADOS / "servidor.json"


def servidor_ativo(porta: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{porta}/_stcore/health", timeout=1.5) as r:
            return r.status == 200
    except Exception:
        return False


def porta_livre(preferida: int = 8765) -> int:
    for porta in [preferida, *range(preferida + 1, preferida + 50)]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", porta))
                return porta
            except OSError:
                continue
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def abrir_quando_pronto(porta: int):
    for _ in range(240):
        if servidor_ativo(porta):
            webbrowser.open(f"http://localhost:{porta}")
            return
        time.sleep(0.5)


def main():
    # Já está rodando? Só abre o navegador.
    try:
        porta = json.loads(ESTADO.read_text())["porta"]
        if servidor_ativo(porta):
            webbrowser.open(f"http://localhost:{porta}")
            return
    except Exception:
        pass

    porta = porta_livre()
    ESTADO.write_text(json.dumps({"porta": porta, "pid": os.getpid()}))

    # pythonw (Windows) não tem console: manda a saída para um log
    log = open(DADOS / "app.log", "a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stderr = log

    os.environ["CF_DATA_DIR"] = str(DADOS)
    os.environ["CF_DESKTOP"] = "1"
    os.chdir(APP_DIR)
    sys.path.insert(0, str(APP_DIR))

    threading.Thread(target=abrir_quando_pronto, args=(porta,), daemon=True).start()

    from streamlit.web import cli as stcli
    sys.argv = [
        "streamlit", "run", str(APP_DIR / "app.py"),
        "--server.port", str(porta),
        "--server.address", "127.0.0.1",
        "--server.headless", "true",
        "--browser.gatherUsageStats", "false",
        "--global.developmentMode", "false",
        "--server.fileWatcherType", "none",
        "--client.toolbarMode", "minimal",
    ]
    try:
        stcli.main()
    finally:
        ESTADO.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
