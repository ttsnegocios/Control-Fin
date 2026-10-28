# Controle Financeiro — app de celular (Android e iOS)

Versão móvel da primeira versão do Controle Financeiro, com as mesmas regras:
- lançamentos por ano e mês;
- receita e despesa, com vencimento, tipo e período do mês;
- marcação de pago/recebido;
- repetição mensal (contas fixas e parcelas);
- cadastros de tipos e períodos;
- painel, equilíbrio por período e resumo do mês com destaques e relatório.

**Roda 100% no aparelho:** os dados ficam num banco SQLite local, o app funciona sem internet e nada é enviado a servidores.

| | |
|---|---|
| Tecnologia | TypeScript + React + Vite; SQLite em WebAssembly (sql.js) gravado no IndexedDB |
| Tamanho | ~1,1 MB (≈450 KB compactado), abre instantâneo, offline |
| Android | APK nativo (Capacitor) **ou** app instalado pelo Chrome |
| iPhone / iPad | App instalado pelo Safari (sem Mac) **ou** app nativo via Xcode (precisa de Mac) |
| Compatibilidade | Mesmo esquema de banco do app de computador: o backup `.db` funciona nos dois sentidos |

## Instalar

O jeito mais simples para os dois sistemas é publicar o app no GitHub Pages, que é gratuito.
1. Envie o projeto para um repositório no GitHub.
2. Em **Settings → Pages → Source**, escolha **GitHub Actions**.
3. O workflow `Build instaladores` publica o app em `https://<usuario>.github.io/<repositorio>/`.

### Android
- **APK:** em *Actions → (última execução) → Artifacts*, baixe `android`. Copie o `ControleFinanceiro-<versão>-Android.apk` para o celular e abra o arquivo. O Android vai pedir para permitir a instalação de "fontes desconhecidas".
- **Pelo Chrome:** abra o endereço do GitHub Pages → menu ⋮ → **Instalar app**.

### iPhone / iPad
- **Sem Mac:** abra o endereço do GitHub Pages no **Safari** → botão Compartilhar → **Adicionar à Tela de Início**. O app abre em tela cheia e funciona offline.
- **App nativo (precisa de Mac com Xcode):**
  ```bash
  cd mobile
  npm ci && npm run build && npx cap sync ios
  npx cap open ios        # abre no Xcode
  ```
  No Xcode, em *Signing & Capabilities*, escolha sua conta Apple (Team), conecte o iPhone e clique em ▶︎.
  - Com uma conta Apple gratuita, o app instalado vale por 7 dias; depois é só instalar de novo pelo Xcode.
  - Para distribuir pela App Store ou pelo TestFlight, é preciso o Apple Developer Program (pago).

## Seus dados
- **Onde ficam:** no armazenamento do próprio app (IndexedDB), em `Ajustes → Sobre`.
- **Backup:** `Ajustes → Fazer backup (.db)` abre o "Compartilhar" do sistema, para salvar em Arquivos, Drive, e-mail etc.
  - Para restaurar, use `Restaurar backup`.
  - O mesmo arquivo abre no app de computador (`Backup dos dados → Restaurar`), e o backup do computador também abre no celular.
- **Sem sincronização automática:** os aparelhos não se sincronizam sozinhos. Para levar os dados de um aparelho a outro, use backup e restauração.
- **Atenção:** desinstalar o app ou limpar os dados do navegador apaga os lançamentos. Faça backups periódicos.

## Desenvolvimento

```bash
cd mobile
npm install
npm run dev        # abre em http://localhost:5173 (e no IP da rede, para testar no celular)
npm test           # testes de regras de negócio + compatibilidade com o app Python (usa python3 + pandas se houver)
npm run build      # gera dist/ (com service worker para uso offline)
npx cap sync       # copia o build para os projetos android/ e ios/
npx cap open android   # abre no Android Studio
```

### Estrutura
```
src/db/esquema.ts        esquema SQLite (idêntico ao db.py)
src/db/banco.ts          SQLite no aparelho (sql.js), transações, backup/restauração
src/db/armazenamento.ts  gravação do banco no IndexedDB
src/db/repositorio.ts    lançamentos e cadastros (equivalente ao db.py)
src/dominio/resumo.ts    indicadores, equilíbrio, destaques (equivalente ao resumo.py)
src/dominio/relatorio.ts relatório HTML do mês
src/ui/*.tsx             telas: Resumo, Lançamentos, Painel, Equilíbrio, Ajustes
src/plataforma.ts        compartilhar/salvar arquivos (nativo ou navegador)
scripts/gerar-sw.mjs     service worker com todos os arquivos (offline)
android/ ios/            projetos nativos gerados pelo Capacitor
tests/                   testes (Vitest)
```
