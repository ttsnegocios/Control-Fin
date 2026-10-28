@echo off
rem Gera dist\ControleFinanceiro.exe (executavel unico, sem instalacao).
rem Requer Python 3.12 instalado (python.org) e internet durante a geracao.
cd /d "%~dp0..\.."
py -3.12 -m venv .venv-exe || goto erro
.venv-exe\Scripts\python -m pip install --upgrade pip
.venv-exe\Scripts\pip install -r requirements.lock pyinstaller==6.22.3 || goto erro
.venv-exe\Scripts\pyinstaller empacotamento\executavel\ControleFinanceiro.spec --noconfirm || goto erro
echo.
echo Pronto: %CD%\dist\ControleFinanceiro.exe
pause
exit /b 0
:erro
echo Falha ao gerar o executavel.
pause
exit /b 1
