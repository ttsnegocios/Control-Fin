; Instalador Windows — Controle Financeiro
; Compilar (Linux/Windows):  makensis -DVERSAO=1.0.0 -DSTAGE=<pasta preparada> -DSAIDA=<arquivo.exe> instalador.nsi
;
; Não exige administrador: instala em %LOCALAPPDATA%\Programs\ControleFinanceiro.
; Durante a instalação, o uv (embutido) baixa o Python 3.12 e as dependências
; para dentro da pasta do programa — é preciso internet nesse momento.
; Os dados do usuário ficam em %APPDATA%\ControleFinanceiro.

Unicode true
SetCompressor /SOLID lzma

!define NOME "Controle Financeiro"
!define ID "ControleFinanceiro"
!define EDITOR "Controle Financeiro"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${ID}"

!include "MUI2.nsh"
!include "LogicLib.nsh"

Name "${NOME}"
OutFile "${SAIDA}"
InstallDir "$LOCALAPPDATA\Programs\${ID}"
InstallDirRegKey HKCU "Software\${ID}" "InstallDir"
RequestExecutionLevel user
ShowInstDetails show
ShowUninstDetails show
BrandingText "${NOME} ${VERSAO}"

VIProductVersion "${VERSAO}.0"
VIAddVersionKey "ProductName" "${NOME}"
VIAddVersionKey "FileDescription" "Instalador do ${NOME}"
VIAddVersionKey "FileVersion" "${VERSAO}"
VIAddVersionKey "ProductVersion" "${VERSAO}"
VIAddVersionKey "LegalCopyright" "${EDITOR}"

!define MUI_ICON "${STAGE}\app\icones\icone.ico"
!define MUI_UNICON "${STAGE}\app\icones\icone.ico"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TEXT "Este assistente instalará o ${NOME} ${VERSAO}.$\r$\n$\r$\nDurante a instalação serão baixados o Python e os componentes necessários (cerca de 120 MB). Mantenha o computador conectado à internet.$\r$\n$\r$\nSeus lançamentos ficam gravados somente neste computador."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o ${NOME} agora"
!define MUI_FINISHPAGE_RUN_FUNCTION AbrirApp
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"

; Encerra o app se estiver aberto (processos Python que rodam a partir da pasta do programa)
!macro FecharApp
  nsExec::ExecToLog `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -like '$INSTDIR\*' } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
  Pop $0
!macroend

Function AbrirApp
  ExecShell "" "$INSTDIR\.venv\Scripts\pythonw.exe" '"$INSTDIR\app\iniciar.py"'
FunctionEnd

Section "Programa" SecPrincipal
  SectionIn RO
  SetOutPath "$INSTDIR"
  !insertmacro FecharApp

  ; Atualização: remove o código anterior (dados do usuário ficam em %APPDATA% e não são tocados)
  RMDir /r "$INSTDIR\app"

  DetailPrint "Copiando arquivos do aplicativo..."
  File /r "${STAGE}\*.*"

  ; Python e dependências ficam dentro da pasta do programa
  System::Call 'Kernel32::SetEnvironmentVariable(t "UV_PYTHON_INSTALL_DIR", t "$INSTDIR\python")'
  System::Call 'Kernel32::SetEnvironmentVariable(t "UV_CACHE_DIR", t "$TEMP\${ID}-uv-cache")'
  System::Call 'Kernel32::SetEnvironmentVariable(t "UV_NO_PROGRESS", t "1")'

  DetailPrint "Baixando o Python 3.12 (pode levar alguns minutos)..."
  RMDir /r "$INSTDIR\.venv"
  nsExec::ExecToLog '"$INSTDIR\uv.exe" venv "$INSTDIR\.venv" --python 3.12 --python-preference only-managed'
  Pop $0
  ${If} $0 != 0
    Goto falha
  ${EndIf}

  DetailPrint "Instalando componentes (Streamlit, pandas, Plotly)..."
  nsExec::ExecToLog '"$INSTDIR\uv.exe" pip install --python "$INSTDIR\.venv\Scripts\python.exe" -r "$INSTDIR\requirements.lock"'
  Pop $0
  ${If} $0 != 0
    Goto falha
  ${EndIf}

  RMDir /r "$TEMP\${ID}-uv-cache"

  ; Atalhos
  CreateDirectory "$SMPROGRAMS\${NOME}"
  CreateShortCut "$SMPROGRAMS\${NOME}\${NOME}.lnk" "$INSTDIR\.venv\Scripts\pythonw.exe" '"$INSTDIR\app\iniciar.py"' "$INSTDIR\app\icones\icone.ico" 0
  CreateShortCut "$SMPROGRAMS\${NOME}\Pasta de dados.lnk" "$APPDATA\${ID}"
  CreateShortCut "$SMPROGRAMS\${NOME}\Desinstalar.lnk" "$INSTDIR\Desinstalar.exe"
  CreateShortCut "$DESKTOP\${NOME}.lnk" "$INSTDIR\.venv\Scripts\pythonw.exe" '"$INSTDIR\app\iniciar.py"' "$INSTDIR\app\icones\icone.ico" 0
  CreateDirectory "$APPDATA\${ID}"

  ; Registro em "Aplicativos instalados"
  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  WriteRegStr HKCU "Software\${ID}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${NOME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSAO}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${EDITOR}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\app\icones\icone.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  DetailPrint "Instalação concluída."
  Return

  falha:
    RMDir /r "$TEMP\${ID}-uv-cache"
    MessageBox MB_ICONSTOP "Não foi possível baixar os componentes necessários.$\r$\n$\r$\nVerifique a conexão com a internet e execute o instalador novamente."
    Abort "Falha ao preparar o ambiente Python."
SectionEnd

Section "Uninstall"
  !insertmacro FecharApp
  Delete "$DESKTOP\${NOME}.lnk"
  RMDir /r "$SMPROGRAMS\${NOME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\${ID}"
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Deseja apagar também os seus dados (lançamentos e cadastros)?$\r$\n$\r$\nPasta: $APPDATA\${ID}$\r$\n$\r$\nEscolha NÃO para mantê-los (recomendado se for reinstalar)." IDNO manter
    RMDir /r "$APPDATA\${ID}"
  manter:
SectionEnd
