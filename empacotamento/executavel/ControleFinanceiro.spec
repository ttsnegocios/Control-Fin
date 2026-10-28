# -*- mode: python -*-
# Receita do PyInstaller: gera um executável único (Windows: ControleFinanceiro.exe)
# que já contém Python, Streamlit, pandas e Plotly — não precisa de instalação nem internet.
#
#   pip install -r requirements.lock pyinstaller
#   pyinstaller empacotamento/executavel/ControleFinanceiro.spec --noconfirm
#
# Saída: dist/ControleFinanceiro(.exe)
import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_all, copy_metadata

RAIZ = Path(SPECPATH).parent.parent
ICONE = RAIZ / "icones" / ("icone.ico" if sys.platform == "win32" else "icone.icns" if sys.platform == "darwin" else "icone.png")

datas, binaries, hidden = [], [], []
for pacote in ("streamlit", "plotly"):
    d, b, h = collect_all(pacote)
    datas += d; binaries += b; hidden += h
datas += copy_metadata("streamlit")

# código do app: é executado pelo Streamlit em tempo de execução, por isso vai como dado
datas += [(str(RAIZ / "app.py"), "."), (str(RAIZ / "db.py"), "."), (str(RAIZ / "resumo.py"), "."), (str(RAIZ / "icones"), "icones")]
# módulos importados por app.py/db.py (o PyInstaller não os enxerga sozinho)
hidden += ["sqlite3", "plotly.graph_objects", "pandas", "calendar", "db", "html"]

a = Analysis(
    [str(RAIZ / "iniciar.py")],
    pathex=[str(RAIZ)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden,
    excludes=["tkinter", "matplotlib", "IPython", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, a.binaries, a.datas, [],
    name="ControleFinanceiro",
    console=False,            # sem janela preta; a saída vai para app.log na pasta de dados
    icon=str(ICONE),
    upx=False,
    version=str(Path(SPECPATH) / "versao_windows.txt") if sys.platform == "win32" else None,
)
