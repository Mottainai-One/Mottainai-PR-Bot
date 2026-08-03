# Mottainai PR Bot

GitHub App que automatiza o ciclo de Pull Requests na organização **Mottainai-One**:

1. **Auto-PR** — todo push em uma branch de trabalho cria automaticamente um PR para `main` (com o template padrão da organização).
2. **Validação por IA (Gemini)** — ao abrir/atualizar o PR, um chatbot analisa o diff e posta: veredito, resumo, tipo de mudança, pontos de atenção e uma descrição sugerida.
3. **Descrição sob aceite do desenvolvedor** — o autor adiciona o label `ai:apply-description` no PR e a descrição sugerida é aplicada ao corpo do PR.
4. **2 approvals + auto-merge** — quando 2 pessoas aprovam e todos os checks passam, o PR é mergeado (squash). A branch protection é configurada automaticamente para exigir os 2 approvals.

> **Requisito:** Node.js 20 LTS ou superior (recomendado). O projeto funciona em Node 18, mas as dependências oficiais exigem 20+.

---

## Como funciona (fluxo)

```
Desenvolvedor faz git push na branch feature/xyz
        │
        ▼
Bot escuta evento push (webhook)
        │
        ├─ cria PR (branch → default branch) com template
        ├─ aplica label de tipo (feature/ → type:feature)
        └─ configura branch protection (2 approvals) no repo
        │
        ▼
Evento pull_request.opened
        │
        ▼
Bot busca o diff + commits
        │
        ▼
Gemini gera review (resumo, issues, veredito, descricao)
        │
        ▼
Bot posta/atualiza comentario de review no PR
        │
        ▼
Autor adiciona o label `ai:apply-description` no PR
        │
        ▼
Bot aplica a descricao gerada pela IA no corpo do PR
        │
        ▼
2 approvals humanos + checks OK
        │
        ▼
Bot faz auto-merge (squash)
```

---

## Instalação do GitHub App

1. Acesse **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App** (na organização: *Settings da org → Developer settings → GitHub Apps*).
2. Preencha:
   - **GitHub App name**: `mottainai-pr-bot`
   - **Webhook URL**: URL pública do seu deploy + `/` (ex: `https://seu-dominio.com/`) ou use `WEBHOOK_PROXY_URL` do Smee no ambiente local.
   - **Webhook secret**: gere com `openssl rand -hex 32` e guarde.
3. **Permissions** (Repository permissions):

   | Permission | Access |
   |---|---|
   | Contents | Read and write |
   | Pull requests | Read and write |
   | Issues | Read and write |
   | Checks | Read |
   | Administration | Read and write |
   | Metadata | Read (obrigatório) |

4. **Subscribe to events**: `push`, `pull_request`, `pull_request_review`, `check_suite`.
5. Gere uma **private key** (`.pem`) e anote o **App ID**.
6. Instale o app na organização **Mottainai-One** selecionando **All repositories**.

## Configuração

```bash
cp .env.example .env
```

Preencha `.env`:

```env
APP_ID=<id do app>
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
WEBHOOK_SECRET=<secret gerado>
GITHUB_ORG=Mottainai-One
GEMINI_API_KEY=<chave do Google AI Studio>
```

> OBS: no `.env`, a chave privada deve ficar em **uma única linha**, com os `\n` literais.
> Alternativa: use `PRIVATE_KEY_PATH=path/to/key.pem`.

## Rodando

### Desenvolvimento local (com Smee)

```bash
# 1. Crie um canal do túnel e copie a URL
#    -> https://smee.io/new

# 2. Coloque a URL no .env
SMEE_URL=https://smee.io/SEU-CANAL

# 3. No GitHub App, use a mesma URL como Webhook URL:
#    https://smee.io/SEU-CANAL

# 4. Rode tudo (smee + bot):
npm run dev:smee
```

O `dev:smee` sobe o túnel do Smee e o bot juntos, com hot-reload. O GitHub entrega o webhook em `https://smee.io/SEU-CANAL`, o Smee repassa para `http://localhost:3000/`.

### Produção (Docker)

```bash
docker compose up -d --build
```

## Estrutura

```
src/
├── index.ts                # Registro dos handlers do app
├── server.ts               # Boot (run do Probot)
├── config.ts               # Variaveis de ambiente
├── ai/
│   ├── gemini.ts           # Cliente Gemini (JSON mode)
│   ├── reviewPrompt.ts     # Prompt do revisor senior
│   └── types.ts            # Tipos do resultado do review
├── github/
│   └── prTemplate.ts       # Template de PR + helpers de titulo
├── handlers/
│   ├── pushHandler.ts      # Cria PR no push
│   ├── prHandler.ts        # Roda review IA (opened/reopened/synchronize)
│   ├── labelHandler.ts      # Aplica descricao via label ai:apply-description
│   └── reviewHandler.ts    # Auto-merge apos approvals + checks
└── services/
    ├── prService.ts        # Criacao de PR e labels
    ├── reviewService.ts    # Diff -> IA -> comentario
    └── mergeService.ts     # Branch protection + condicoes de merge
```

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `APP_ID` | — | ID do GitHub App |
| `PRIVATE_KEY` | — | Chave privada PEM (uma linha) |
| `WEBHOOK_SECRET` | — | Secret do webhook |
| `GITHUB_ORG` | `Mottainai-One` | Organização |
| `MIN_APPROVALS` | `2` | Approvals exigidos para auto-merge |
| `IGNORED_REPOS` | — | Repos ignorados (ex: `.github,mottainai-hub`) |
| `PROTECTED_BRANCHES` | `main,develop` | Branches que não geram PR |
| `GEMINI_API_KEY` | — | Chave do Google AI Studio |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Modelo do Gemini |
| `PORT` | `3000` | Porta do servidor |
| `WEBHOOK_PROXY_URL` | — | URL do Smee (dev) |
