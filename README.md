# Controle Financeiro Pessoal

Aplicação em Python + Streamlit com dados em SQLite. Duas formas de uso:

| | Versão web + OneDrive (recomendada) | Instaladores Windows/macOS |
|---|---|---|
| Aparelhos | PC, Mac, Android, iPhone (qualquer navegador moderno) | o computador onde foi instalado |
| Dados | cópia local em cada aparelho + `financeiro.db` no **seu OneDrive**, sincronizado | só no computador |
| Offline | sim (sincroniza ao voltar a conexão) | sim |
| Instalação | abrir o endereço e "Instalar app" | instalador |

## App de celular (Android e iOS) — pasta `mobile/`

Versão móvel da primeira versão, reescrita em TypeScript para rodar **direto no aparelho**, offline, com os dados num
SQLite local. Usa o mesmo esquema de banco: o backup `.db` passa do celular para o computador e vice-versa.
Tem as mesmas regras e telas (resumo do mês com destaques, lançamentos, painel, equilíbrio por período, cadastros,
backup e relatório). Instalação no Android (APK ou Chrome) e no iPhone (Safari ou Xcode): veja `mobile/README.md`.

## Telas da versão local

- **Dashboard** — receita x despesa, despesas por tipo, saldo mensal, % da despesa sobre a receita, % pagas.
- **Resumo do mês** — visão geral consolidada do mês selecionado: indicadores (receitas, despesas,
  saldo previsto/realizado, comprometimento, pagas, a pagar, a receber, vencimentos dos próximos 7 dias),
  comparativo com o mês anterior, **destaques automáticos** (saldo, comprometimento, falta de caixa por
  período, vencidas, maior grupo de despesa), **equilíbrio por período** e **analíticos** de receitas e
  despesas (por tipo e lançamento a lançamento). Botão **🖨️ Baixar relatório** gera um HTML pronto para
  imprimir ou salvar em PDF.
- **Lançamentos**, **Equilíbrio por período** e **Cadastros**.

## Versão web com sincronização no OneDrive

O mesmo app (stlite: Streamlit rodando no navegador) fica publicado no GitHub Pages.
O site contém apenas o programa — **seus dados nunca passam por ele**: ficam no aparelho
e no seu OneDrive, na pasta `Aplicativos/<nome do app>/financeiro.db`, acessada só com o
seu login Microsoft (permissão restrita a essa pasta: `Files.ReadWrite.AppFolder`).

### Como a sincronização funciona
- Cada aparelho trabalha numa cópia local (funciona offline) e envia as alterações
  ao OneDrive ~3 segundos depois de cada gravação; também verifica novidades ao abrir,
  ao voltar para o app e a cada minuto. O botão ☁️ (canto inferior direito) mostra a situação.
- Alterações feitas em outro aparelho aparecem sozinhas na tela.
- O envio só acontece se o arquivo no OneDrive ainda for a versão que o aparelho conhece.
  Se dois aparelhos alterarem os dados sem sincronizar entre si (ex.: um deles offline),
  o app pergunta qual versão manter, e **a outra é guardada** no OneDrive como
  `financeiro-conflito-<data>-<aparelho>.db` (dá para baixar e restaurar em "Backup dos dados").
- Dica: evite usar dois aparelhos ao mesmo tempo offline.

### Configuração (uma vez, ~15 minutos)

**1. Publicar o app no GitHub Pages**
1. Crie um repositório no GitHub e envie esta pasta.
2. **Settings → Pages → Source: GitHub Actions**.
3. Aguarde o workflow terminar. O endereço será `https://<seu-usuario>.github.io/<repositorio>/`.

**2. Registrar o app na Microsoft** (gratuito)
1. Acesse <https://entra.microsoft.com> (ou portal.azure.com) com sua conta Microsoft.
   Se for uma conta pessoal (Outlook/Hotmail) e o portal disser que você não tem diretório,
   crie uma **conta gratuita do Azure** — isso cria o diretório. Registrar apps não tem custo.
2. **Identidade → Aplicativos → Registros de aplicativo → Novo registro**:
   - Nome: `Controle Financeiro` (vira o nome da pasta no OneDrive)
   - Tipos de conta: **Contas em qualquer diretório organizacional e contas Microsoft pessoais**
   - URI de redirecionamento: plataforma **Aplicativo de página única (SPA)** e o endereço
     `https://<seu-usuario>.github.io/<repositorio>/redirect.html`
3. Copie o **ID do aplicativo (cliente)**.
4. **Permissões de API → Adicionar → Microsoft Graph → Permissões delegadas →
   `Files.ReadWrite.AppFolder`**. (`User.Read` já vem incluída.)

**3. Informar o ID ao app** — uma das opções:
- GitHub: **Settings → Secrets and variables → Actions → Variables → New variable**
  `ONEDRIVE_CLIENT_ID` = o ID copiado, e rode o workflow de novo (Actions → Run workflow); ou
- No próprio app: botão ☁️ → cole o ID → Salvar (fica gravado só naquele aparelho).

**4. Usar em cada aparelho**
- Abra o endereço → ☁️ → **Entrar com conta Microsoft** (autorize o acesso à pasta do app).
- Instale como aplicativo: Chrome/Edge no PC ou Android → menu ⋮ → **Instalar app**;
  iPhone (Safari) → Compartilhar → **Adicionar à Tela de Início**.
- O primeiro aparelho que entrar envia os dados dele; os seguintes baixam do OneDrive.
  Se você já tinha dados nos instaladores Windows/macOS, faça antes um backup lá e
  restaure na versão web do primeiro aparelho.

Para testar localmente: `python empacotamento/build.py web`, sirva `dist/web`
(`python -m http.server 8000 -d dist/web`) e cadastre também
`http://localhost:8000/redirect.html` como URI de redirecionamento SPA.

## Executável único para Windows (dados só no computador)

`ControleFinanceiro-<versão>-Windows.exe` — um arquivo só (~120 MB) que já contém Python,
Streamlit, pandas e Plotly. **Não instala nada e não precisa de internet**: dê dois cliques,
o app abre no navegador. Pode ficar num pendrive. Os dados ficam em
`%APPDATA%\ControleFinanceiro\financeiro.db` (os mesmos do instalador, se você usar os dois).
- Por não ser assinado, o Windows pode avisar "O Windows protegeu o computador":
  **Mais informações → Executar assim mesmo**. Alguns antivírus analisam o arquivo na
  primeira execução, o que pode atrasar a abertura em alguns segundos.
- Para fechar: **⏻ Encerrar aplicativo** na barra lateral.

Como gerar:
- **GitHub Actions** (job `executavel-windows`): compila num Windows real, testa se o
  executável abre e responde, e publica em *Artifacts* (e na Release, ao criar tag `v*`).
- **Num Windows com Python 3.12**: dê dois cliques em `empacotamento\executavel\gerar_exe.bat`.
  Saída em `dist\ControleFinanceiro.exe`.
- Receita: `empacotamento/executavel/ControleFinanceiro.spec` (PyInstaller).

## Instaladores Windows e macOS (dados só no computador)

### Windows 10/11 — `ControleFinanceiro-<versão>-Windows-Setup.exe`
1. Execute o instalador. Como ele não é assinado digitalmente, o Windows pode mostrar
   "O Windows protegeu o computador": clique em **Mais informações → Executar assim mesmo**.
2. Não precisa ser administrador. Durante a instalação são baixados o Python 3.12 e os
   componentes (~120 MB) — **precisa de internet nesse momento**.
3. Atalhos são criados na Área de Trabalho e no Menu Iniciar. O app abre no navegador.
4. Para fechar: botão **⏻ Encerrar aplicativo** na barra lateral.
- Programa: `%LOCALAPPDATA%\Programs\ControleFinanceiro`
- Dados: `%APPDATA%\ControleFinanceiro\financeiro.db`
- Desinstalar: Configurações → Aplicativos, ou Menu Iniciar → Controle Financeiro → Desinstalar
  (pergunta se deve apagar os dados; o padrão é mantê-los).

### macOS 12+ (Apple Silicon e Intel) — `ControleFinanceiro-<versão>-macOS.zip`
1. Descompacte e arraste **Controle Financeiro.app** para Aplicativos.
2. Primeira abertura: o macOS bloqueia apps não assinados. Vá em **Ajustes do Sistema →
   Privacidade e Segurança → Abrir Mesmo Assim** (detalhes no `LEIA-ME.txt` do zip).
3. Na primeira vez o app prepara o Python e os componentes (~1 min, precisa de internet)
   e avisa por notificação. Depois abre direto no navegador.
- Dados: `~/Library/Application Support/ControleFinanceiro/financeiro.db`

### Android — APK (somente local)
O Streamlit não roda nativamente no Android, então a versão Android usa o **stlite**
(o mesmo código Python rodando dentro do navegador, via WebAssembly). Os dados ficam
gravados **no próprio aparelho** (IndexedDB).

Para sincronizar com o OneDrive no Android, use a versão web instalada pelo Chrome (acima).
O APK (`ControleFinanceiro-<versão>-Android.apk`, gerado pelo GitHub Actions) guarda os dados
só no aparelho — o login Microsoft não funciona dentro dele.

Na primeira abertura são baixados ~40 MB (precisa de internet); depois funciona offline.
Leva alguns segundos para abrir em celulares mais simples. **Faça backups** pelo menu
"Backup dos dados" — limpar os dados do app/navegador apaga os lançamentos.
Observação: no APK, o botão de baixar backup pode não funcionar (limitação do WebView);
na versão PWA pelo Chrome funciona normalmente.

## Backup e migração entre aparelhos
Barra lateral → **Backup dos dados** → *Baixar backup (.db)*. Para restaurar em outro
computador/celular: *Restaurar backup* e escolha o arquivo `.db`.

## Desenvolvimento

```bash
pip install -r requirements.txt     # Python 3.11+ (instala/atualiza Streamlit, pandas e Plotly)
streamlit run app.py                 # dados em ./dados/financeiro.db
```

O app funciona a partir do Streamlit 1.40 e do Plotly 5.x (adapta-se à versão instalada),
mas as versões testadas são as do `requirements.txt`. Para conferir a sua:
`python -c "import streamlit, plotly; print(streamlit.__version__, plotly.__version__)"`.
Ao baixar uma versão nova do projeto, rode o `pip install -r requirements.txt` de novo.

- `app.py` – interface (Streamlit + HTML/CSS dos cartões)
- `db.py` – esquema e acesso ao SQLite (`CF_DATA_DIR` define a pasta dos dados)
- `resumo.py` – cálculos do Resumo do mês e relatório HTML
- `iniciar.py` – lançador da versão instalada (Windows/macOS)
- `requirements.lock` – versões fixas usadas pelos instaladores
- `empacotamento/` – scripts dos instaladores
- `empacotamento/android/web/onedrive.js` – motor de sincronização com o OneDrive
- `empacotamento/android/web/nuvem.js` – login Microsoft (MSAL), botão ☁️ e janela de conflito
- `empacotamento/testes/sincronizacao.test.mjs` – testes da sincronização (`node …`)
- `.github/workflows/build.yml` – gera tudo no GitHub

## Gerar os instaladores

### Localmente (Linux ou macOS)
Requer Python 3.11+, npm e `makensis` (NSIS: `apt install nsis` / `brew install makensis`).

```bash
python empacotamento/build.py            # windows, macos e web
python empacotamento/build.py windows    # só um alvo
```
Saída em `dist/`. O APK precisa do Android SDK — use o GitHub Actions.

### No GitHub (recomendado — gera também o APK)
1. Crie um repositório e envie esta pasta (`git push`).
2. Em **Settings → Pages**, em *Source* escolha **GitHub Actions** (para publicar a PWA).
3. Cada push na `main` roda o workflow; os arquivos ficam em **Actions → execução → Artifacts**.
4. Para uma versão oficial: altere `VERSION`, crie a tag (`git tag v1.0.1 && git push --tags`)
   e os instaladores são anexados a uma **Release**.

### Atualizar dependências
Edite `requirements.txt` e regenere o lock:
```bash
uv pip compile requirements.txt --universal --python-version 3.12 --only-binary :all: -o requirements.lock
```
