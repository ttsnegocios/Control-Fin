#!/bin/bash
# Executável do ControleFinanceiro.app (macOS 12+).
# Na primeira execução (ou após atualização) prepara o Python 3.12 e as
# dependências em ~/Library/Application Support/ControleFinanceiro/runtime
# usando o uv embutido — requer internet só nesse momento.

RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
APP="$(cd "$RES/../.." && pwd)"
SUP="$HOME/Library/Application Support/ControleFinanceiro"
RT="$SUP/runtime"
LOG="$SUP/instalacao.log"
mkdir -p "$SUP"

# Arquivos baixados pelo navegador ficam "em quarentena"; libera o próprio app
xattr -dr com.apple.quarantine "$APP" 2>/dev/null

aviso() { osascript -e "display notification \"$1\" with title \"Controle Financeiro\"" >/dev/null 2>&1; }

case "$(uname -m)" in
  arm64) UV="$RES/bin/uv-arm64" ;;
  *)     UV="$RES/bin/uv-x86_64" ;;
esac
chmod +x "$UV" 2>/dev/null

VERSAO="$(cat "$RES/VERSION")"
if [ ! -x "$RT/venv/bin/python3" ] || [ "$(cat "$RT/VERSION" 2>/dev/null)" != "$VERSAO" ]; then
  aviso "Preparando o aplicativo (só na primeira vez, requer internet). Aguarde cerca de 1 minuto..."
  rm -rf "$RT"; mkdir -p "$RT"
  export UV_PYTHON_INSTALL_DIR="$RT/python" UV_CACHE_DIR="$RT/cache" UV_NO_PROGRESS=1
  {
    echo "=== $(date) — preparando versão $VERSAO ($(uname -m))"
    "$UV" venv "$RT/venv" --python 3.12 --python-preference only-managed &&
    "$UV" pip install --python "$RT/venv/bin/python3" -r "$RES/requirements.lock"
  } >>"$LOG" 2>&1
  if [ $? -ne 0 ]; then
    rm -rf "$RT"
    osascript -e 'display alert "Controle Financeiro" message "Não foi possível preparar o aplicativo. Verifique a conexão com a internet e abra novamente.\n\nDetalhes em: ~/Library/Application Support/ControleFinanceiro/instalacao.log" as critical' >/dev/null 2>&1
    exit 1
  fi
  rm -rf "$RT/cache"
  echo "$VERSAO" > "$RT/VERSION"
  aviso "Pronto! Abrindo no navegador..."
fi

exec "$RT/venv/bin/python3" "$RES/app/iniciar.py"
