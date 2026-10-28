"""Gera os pacotes de instalação do Controle Financeiro.

Uso (em Linux ou macOS, com Python 3.11+, pip, npm e makensis instalados):
    python empacotamento/build.py               # todos
    python empacotamento/build.py windows macos web

Saída em ./dist:
    ControleFinanceiro-<versão>-Windows-Setup.exe
    ControleFinanceiro-<versão>-macOS.zip
    web/                        (versão Android/PWA — publicar em HTTPS ou empacotar como APK)
"""
import json
import os
import plistlib
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
EMP = RAIZ / "empacotamento"
DIST = RAIZ / "dist"
VERSAO = (RAIZ / "VERSION").read_text().strip()
UV_VERSAO = "0.13.0"
STLITE_VERSAO = "1.11.0"
MSAL_VERSAO = "5.25.0"
ARQUIVOS_APP = ["app.py", "db.py", "resumo.py", "iniciar.py", "requirements.txt"]


def run(*cmd, **kw):
    print("$", " ".join(map(str, cmd)))
    subprocess.run(list(map(str, cmd)), check=True, **kw)


def baixar_uv(plataforma: str, destino: Path) -> Path:
    """Extrai o binário do uv do wheel oficial no PyPI."""
    tmp = Path(tempfile.mkdtemp())
    run(sys.executable, "-m", "pip", "download", f"uv=={UV_VERSAO}", "--no-deps", "--only-binary=:all:",
        "--platform", plataforma, "-d", tmp, "-q")
    whl = next(tmp.glob("*.whl"))
    nome = "uv.exe" if "win" in plataforma else "uv"
    with zipfile.ZipFile(whl) as z:
        membro = next(n for n in z.namelist() if n.endswith(f".data/scripts/{nome}"))
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(z.read(membro))
    destino.chmod(0o755)
    shutil.rmtree(tmp)
    return destino


def copiar_app(destino: Path):
    destino.mkdir(parents=True, exist_ok=True)
    for f in ARQUIVOS_APP:
        shutil.copy2(RAIZ / f, destino / f)
    shutil.copytree(RAIZ / "icones", destino / "icones", dirs_exist_ok=True)


# ------------------------------------------------------------------ Windows
def windows():
    stage = Path(tempfile.mkdtemp()) / "stage"
    copiar_app(stage / "app")
    shutil.copy2(RAIZ / "requirements.lock", stage / "requirements.lock")
    baixar_uv("win_amd64", stage / "uv.exe")
    saida = DIST / f"ControleFinanceiro-{VERSAO}-Windows-Setup.exe"
    run("makensis", "-V2", f"-DVERSAO={VERSAO}", f"-DSTAGE={stage}", f"-DSAIDA={saida}",
        EMP / "windows" / "instalador.nsi")
    shutil.rmtree(stage.parent)
    print("OK:", saida)


# ------------------------------------------------------------------ macOS
def macos():
    tmp = Path(tempfile.mkdtemp())
    app = tmp / "Controle Financeiro.app"
    cont = app / "Contents"
    res = cont / "Resources"
    copiar_app(res / "app")
    shutil.copy2(RAIZ / "requirements.lock", res / "requirements.lock")
    shutil.copy2(RAIZ / "icones" / "icone.icns", res / "icone.icns")
    (res / "VERSION").write_text(VERSAO)
    baixar_uv("macosx_11_0_arm64", res / "bin" / "uv-arm64")
    baixar_uv("macosx_10_12_x86_64", res / "bin" / "uv-x86_64")
    exe = cont / "MacOS" / "ControleFinanceiro"
    exe.parent.mkdir(parents=True)
    shutil.copy2(EMP / "macos" / "ControleFinanceiro.sh", exe)
    exe.chmod(0o755)
    with open(cont / "Info.plist", "wb") as f:
        plistlib.dump({
            "CFBundleName": "Controle Financeiro",
            "CFBundleDisplayName": "Controle Financeiro",
            "CFBundleIdentifier": "br.controlefinanceiro.app",
            "CFBundleVersion": VERSAO,
            "CFBundleShortVersionString": VERSAO,
            "CFBundlePackageType": "APPL",
            "CFBundleExecutable": "ControleFinanceiro",
            "CFBundleIconFile": "icone",
            "LSMinimumSystemVersion": "12.0",
            "LSUIElement": True,  # sem ícone no Dock: o app roda no navegador
            "LSApplicationCategoryType": "public.app-category.finance",
            "NSHighResolutionCapable": True,
        }, f)
    # instruções que vão junto no zip
    shutil.copy2(EMP / "macos" / "LEIA-ME.txt", tmp / "LEIA-ME.txt")

    saida = DIST / f"ControleFinanceiro-{VERSAO}-macOS.zip"
    saida.unlink(missing_ok=True)
    with zipfile.ZipFile(saida, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(tmp.rglob("*")):
            arc = p.relative_to(tmp).as_posix()
            info = zipfile.ZipInfo(arc + ("/" if p.is_dir() else ""))
            modo = 0o755 if (p.is_dir() or os.access(p, os.X_OK)) else 0o644
            info.external_attr = ((stat.S_IFDIR if p.is_dir() else stat.S_IFREG) | modo) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, b"" if p.is_dir() else p.read_bytes())
    shutil.rmtree(tmp)
    print("OK:", saida)


# ------------------------------------------------------------------ Web / Android
def web():
    out = DIST / "web"
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    tmp = Path(tempfile.mkdtemp())

    # stlite (Streamlit no navegador via WebAssembly), servido localmente
    run("npm", "pack", f"@stlite/browser@{STLITE_VERSAO}", "-q", cwd=tmp)
    run("tar", "xzf", next(tmp.glob("stlite-browser-*.tgz")), "-C", tmp)
    shutil.copytree(tmp / "package" / "build", out / "stlite", ignore=shutil.ignore_patterns("*.map", "*.d.ts"))

    # plotly (pure-python) empacotado junto; numpy/pandas/narwhals vêm do Pyodide
    rodas = out / "wheels"
    run(sys.executable, "-m", "pip", "download", "plotly==7.1.0", "--only-binary=:all:", "--no-deps",
        "-d", rodas, "-q")
    reqs = "[" + ", ".join(f'url("wheels/{w.name}")' for w in sorted(rodas.glob("*.whl"))) + "]"

    # MSAL (login Microsoft) para a sincronização com o OneDrive
    run("npm", "pack", f"@azure/msal-browser@{MSAL_VERSAO}", "-q", cwd=tmp)
    msal = tmp / "msal"
    msal.mkdir()
    run("tar", "xzf", next(tmp.glob("azure-msal-browser-*.tgz")), "-C", msal)
    (out / "vendor").mkdir()
    shutil.copy2(msal / "package" / "lib" / "msal-browser.min.js", out / "vendor")
    shutil.copy2(msal / "package" / "lib" / "redirect-bridge" / "msal-redirect-bridge.min.js", out / "vendor")

    copiar_app(out / "app")
    (out / "app" / "iniciar.py").unlink()
    shutil.copytree(RAIZ / "icones", out / "icones", dirs_exist_ok=True)
    client_id = os.environ.get("ONEDRIVE_CLIENT_ID", "").strip() or "__ONEDRIVE_CLIENT_ID__"
    for f in ("index.html", "sw.js", "manifest.webmanifest", "config.js", "redirect.html", "nuvem.js", "onedrive.js"):
        s = (EMP / "android" / "web" / f).read_text()
        s = (s.replace("__VERSAO__", VERSAO).replace("__REQUIREMENTS__", reqs)
              .replace("__ONEDRIVE_CLIENT_ID__", client_id))
        (out / f).write_text(s)
    (out / ".nojekyll").write_text("")
    shutil.rmtree(tmp)
    print("OK:", out)


if __name__ == "__main__":
    DIST.mkdir(exist_ok=True)
    alvos = sys.argv[1:] or ["windows", "macos", "web"]
    for a in alvos:
        {"windows": windows, "macos": macos, "web": web}[a]()
