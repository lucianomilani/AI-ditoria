# AI-ditoria - (AI-dict)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Dashboard live](https://img.shields.io/badge/dashboard-live-brightgreen.svg)](https://lucianomilani.github.io/AI-ditoria/security-audit/studio/)
[![Tests: node --test](https://img.shields.io/badge/tests-node--test-blue.svg)](#como-correr-os-testes)

🇵🇹 [Português](#português) · 🇬🇧 [English](#english)

---

## Português

Repositório do **Audit Report Studio** — a base onde ficam guardados e
publicados os relatórios de auditoria de segurança + RGPD gerados pelo
skill `/security-audit`.

Não é uma app com backend, não tem `npm install` gigante, não tem
segredos escondidos. É JSON, HTML puro e um dashboard estático servido
pelo GitHub Pages. Simples de propósito.

### Objetivo e foco principal

O foco deste projeto **não é o dashboard** — é a **skill** `/security-audit`
em si: uma metodologia de auditoria de segurança + RGPD, stack-agnostic,
repetível e consistente entre projetos diferentes. O dashboard existe só
para dar um sítio central e comparável a esse trabalho (histórico por
projeto, comparar auditorias, gerar issues) — sem ele, a skill continua a
auditar código na mesma.

A skill é feita de **ficheiros simples e portáteis**: um `SKILL.md`
(instruções em markdown), docs de referência em `reference/*.md`, e um
único script Node sem dependências (`validate-findings.mjs`) que valida e
mascara segredos antes de publicar. Nada disto depende de APIs
proprietárias — é o formato de "skill" que o Claude Code usa
(`~/.claude/skills/<nome>/`), mas a lógica em si funciona em qualquer
agente de coding com um conceito equivalente de skill/prompt reutilizável
(ex.: OpenCode, ou outro agente que suporte pastas de skills). Adaptar
para outro agente é essencialmente copiar a pasta e apontar o trigger —
não é preciso reescrever a metodologia.

### Quickstart

```bash
# 1. num projeto qualquer (React, PHP, o que for), corre o skill
/security-audit

# 2. commit + push acontece automaticamente no passo 4 do skill

# 3. abre o dashboard
open https://lucianomilani.github.io/AI-ditoria/security-audit/studio/
```

Isto só funciona se já tiveres a skill instalada e o dashboard configurado — ver a secção seguinte.

### Instalação e utilização

Três passos: instalar a skill no teu sistema, usá-la num projeto, e
(opcional) teres o teu próprio dashboard público em vez de publicares
no deste repo.

#### 1. Instalar a skill

A fonte da skill vive neste repo, em `skills/security-audit/`. O
Claude Code só a reconhece se estiver em `~/.claude/skills/`. Duas
formas de a instalar:

**A — clone completo** (traz também o dashboard, útil se vais publicar
os teus relatórios neste repo ou num fork):

```bash
git clone https://github.com/<o-teu-user>/AI-ditoria.git
cp -r AI-ditoria/skills/security-audit ~/.claude/skills/security-audit
```

(usa symlink em vez de `cp` se quiseres apanhar updates da skill com um
simples `git pull` no clone, sem repetir a cópia.)

**B — só a pasta da skill** (não queres o dashboard nem o histórico de
relatórios, só a metodologia de auditoria):

```bash
git clone --filter=blob:none --sparse https://github.com/<o-teu-user>/AI-ditoria.git
cd AI-ditoria
git sparse-checkout set skills/security-audit
cp -r skills/security-audit ~/.claude/skills/security-audit
```

Sem `git` disponível, uma alternativa de uma linha (via subversion,
que o GitHub expõe para qualquer repo público):

```bash
svn export https://github.com/<o-teu-user>/AI-ditoria/trunk/skills/security-audit ~/.claude/skills/security-audit
```

Nos dois casos, o resultado é o mesmo: a pasta `security-audit/`
dentro de `~/.claude/skills/`, pronta a usar.

Depois edita a 1ª linha de
`~/.claude/skills/security-audit/STUDIO_REPO_PATH.md` para o caminho
absoluto desse clone (ex.: `/home/tu/AI-ditoria`) — é ali que a skill
vai escrever e publicar os relatórios.

#### 2. Usar a skill

Dentro de **qualquer** projeto que queiras auditar (não precisa de ser
este repo nem estar relacionado com ele):

```bash
cd /caminho/do/projeto/a/auditar
/security-audit
```

Segue o fluxo descrito na secção seguinte: deteta a stack, audita
linha a linha, gera e valida o `findings.json`, publica no dashboard
apontado em `STUDIO_REPO_PATH.md` e faz commit + push aí automaticamente.

#### 3. Teres o teu próprio dashboard (fork)

Por omissão, o passo 8 da skill publica no clone apontado em
`STUDIO_REPO_PATH.md` e corre `git push` — isso vai para o `origin`
configurado *nesse* clone. Se clonaste o repo original, esse `origin`
é `lucianomilani/AI-ditoria` e não vais ter permissão de push. Para
teres o teu próprio dashboard público:

1. **Fork** este repo no GitHub (botão *Fork*, canto superior direito).
2. Clona o **teu fork**, não o original:
   `git clone https://github.com/<o-teu-user>/AI-ditoria.git`
3. Aponta o `STUDIO_REPO_PATH.md` (passo 1 acima) para este clone do
   teu fork.
4. No GitHub, no teu fork: **Settings → Pages → Source: Deploy from a
   branch → Branch: `main`, pasta `/docs` → Save**. (Precisa do repo
   ser público, a menos que tenhas GitHub Pro/Enterprise.)
5. Ao fim de uns minutos o teu dashboard fica em
   `https://<o-teu-user>.github.io/AI-ditoria/security-audit/studio/`.
6. Corre a skill num projeto qualquer — o commit + push do passo 8 vai
   para o teu fork, o GitHub Pages faz redeploy automático, e o
   dashboard atualiza sozinho.

Sem este passo 3, a skill continua a auditar código na mesma — só não
tens onde ver o resultado publicado (ou publicas sem querer no repo
errado, se `STUDIO_REPO_PATH.md` ainda apontar para outro clone).

### O fluxo: analisar e gerar relatórios bem estruturados

1. Corres `/security-audit` (ou `/security-audit <caminho>`) num
   projeto qualquer — pode ser React, PHP, o que for.
2. O skill detecta a stack desse projeto, audita-o linha a linha contra
   **13 categorias fixas**: isolamento multi-tenant e SQL/NoSQL injection,
   permissões só no frontend, IDOR, chaves expostas, XSS, auth/sessões e
   uso indevido de criptografia, SSRF, CSRF/path/upload e race
   conditions/lógica de negócio, rate limiting e exhaustion de recursos,
   dependências/IaC e supply-chain, fuga de informação, compliance RGPD, e
   código malicioso/backdoor.
3. Gera um `findings.json` com tudo o que encontrou — achados, pontos fortes, painel RGPD, cobertura por categoria — e valida esse ficheiro com um script (`validate-findings.mjs`) antes de aceitar nada.
4. Escreve esse JSON aqui, dentro de
   `docs/security-audit/studio/data/<projeto>/<data>.json`, atualiza o índice (`data/index.json`) e faz commit + push.
5. O GitHub Pages serve a pasta `docs/` como site, e o dashboard fica disponível em:

   **https://lucianomilani.github.io/AI-ditoria/security-audit/studio/**

Ou seja: cada auditoria feita em qualquer PC, para qualquer projeto, acaba num único sítio central — sem servidor, sem base de dados, só ficheiros estáticos e git.

### O dashboard, em imagens

Visão geral — sidebar com os projetos auditados, capa da auditoria:

![Visão geral do AI-ditoria](screenshots/00-overview.png)

Sumário executivo — achados por severidade e categoria:

![Resumo executivo](screenshots/01-resumo-executivo.png)

Cobertura por categoria — maturidade estimada em cada uma das 13 categorias:

![Cobertura por categoria](screenshots/02-cobertura.png)

Detalhe dos achados, filtrável por severidade e categoria:

![Achados](screenshots/03-achados.png)

Issues geradas prontas a colar no GitHub:

![Issues para o GitHub](screenshots/04-issues-github.png)

Lista de Validação imprimível, para a reunião com o cliente:

![Lista de Validação](screenshots/05-checklist.png)

Comparar duas auditorias do mesmo projeto — corrigidos, novos, ainda presentes:

![Comparar auditorias](screenshots/06-comparar-auditorias.png)

> Nota: estas capturas podem ficar desatualizadas em relação à UI live — o [dashboard](https://lucianomilani.github.io/AI-ditoria/security-audit/studio/) é sempre a fonte de verdade.

### Onde está cada coisa

```
docs/
  security-audit/
    studio/                  ← o dashboard em si (o "Audit Report Studio")
      index.html             ← toda a app (sem framework, JS puro)
      lib/                   ← lógica partilhada (validação, derivação, testes)
      data/                  ← os relatórios publicados (index.json + um JSON por auditoria)
skills/
  security-audit/            ← o skill em si — copia isto para ~/.claude/skills/
    SKILL.md                 ← instruções que o Claude Code segue
    reference/                ← docs de referência (categorias, schema)
    scripts/validate-findings.mjs  ← validador + máscara de segredos
    STUDIO_REPO_PATH.md       ← edita a 1ª linha para o caminho local do teu clone
```

A parte que efetivamente gera os relatórios — o skill `/security-audit`
— vive neste repo em [`skills/security-audit/`](skills/security-audit/),
mas **corre** a partir de `~/.claude/skills/security-audit/` (config
local do Claude Code), porque precisa de correr sobre *qualquer* outro
projeto, não só este. Este repo guarda a fonte do skill e o resultado
publicado; instalar é copiar a pasta para o sítio certo (ver
["Instalação e utilização"](#instalação-e-utilização) acima).

### O dashboard

`docs/security-audit/studio/index.html` é a app que lês no browser:
- Sidebar com a lista de projetos auditados (com botão para "esconder"
  um projeto localmente — não apaga os dados, só tira da vista nesse
  browser, porque é uma página estática sem permissão de escrita no
  disco).
- Um relatório completo por auditoria: capa, sumário executivo,
  cobertura por categoria, pontos fortes/fracos, painel RGPD,
  recomendações, e um gerador de issues para colar direto no GitHub.
- Uma **Lista de Validação** imprimível — uma tabela pensada para
  levares numa reunião com o cliente e ires marcando achado a achado à
  mão. A caixa "confirmado" fica guardada no browser (localStorage) —
  se reabrires o mesmo projeto/auditoria nesse browser, o que já
  marcaste continua marcado. Notas e Responsável/Prazo continuam só
  para imprimir e preencher à mão.
- **Comparar auditorias**: quando um projeto tem 2+ auditorias
  publicadas, aparece um botão na sidebar para escolheres duas datas e
  ver corrigidos / novos / ainda presentes entre elas — útil para
  confirmar que uma correção realmente aconteceu, ou apanhar
  regressões.
- **Exportar PDF**: botão que aciona `window.print()` do browser — gera
  um PDF do relatório completo direto do dashboard, sem serviço externo.

### Gate para CI

O `validate-findings.mjs` do skill (o que corre no passo 6 do processo
de auditoria) aceita um `--fail-on=<severidade>`:

```bash
node ~/.claude/skills/security-audit/scripts/validate-findings.mjs findings.json --fail-on=alta
```

Falha (exit 1) se existir algum achado nessa severidade ou acima
(`critica`, `alta`, `media`, `baixa`, `informativa` — critica é a mais
grave). Sem a flag, o comportamento é o mesmo de sempre: só valida a
forma do JSON. Isto corre no CI do projeto *auditado*, não deste repo
— o AI-ditoria em si não tem pipeline própria.

Exemplo de workflow GitHub Actions no projeto auditado. `~/.claude/skills/`
só existe na máquina de quem tem a skill instalada — não num runner do
GitHub Actions — por isso o passo faz checkout deste repo (AI-ditoria) à
parte e corre o validador de lá:

```yaml
# .github/workflows/security-audit-gate.yml
name: Security audit gate
on: [pull_request]
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          repository: lucianomilani/AI-ditoria
          path: ai-ditoria
      - run: node ai-ditoria/docs/security-audit/studio/lib/validate-findings.mjs findings.json --fail-on=alta
```

### Redação automática de segredos

O dashboard é público (GitHub Pages, sem autenticação) — logo o
`validate-findings.mjs` também mascara automaticamente qualquer chave de
API, password real ou email encontrado no texto de um achado, antes de
gravar o ficheiro:

```
REDACTED 2 secret(s)/email(s) before publishing (dashboard is public):
  findings[2].code [aws-access-key]
  findings[5].code [email]
```

O valor real é substituído por `***REDACTED***` diretamente no
`findings.json`; a categoria, severidade, ficheiro:linha e o resto da
explicação do achado continuam publicados normalmente — só o valor
sensível some. Defaults de exemplo/placeholder (`"change-this-*"`,
`"your-api-key"`, etc.) não são tocados, porque são precisamente o que
o achado está a descrever. Isto corre sempre, sem flag — não há opção
de publicar sem mascarar.

### Como correr os testes

Sem npm, sem build step — o Node já tem test runner embutido:

```bash
node --test docs/security-audit/studio/lib/*.test.mjs
```

### Compliance RGPD — nota importante

A categoria 12 e o campo `rgpd_article` de cada achado referem-se
especificamente ao **Regulamento (UE) 2016/679** (o RGPD europeu, dito
GDPR em inglês). Não é uma "lei global de privacidade" — essa lei não
existe. Se o projeto auditado precisar de LGPD (Brasil), CCPA (EUA) ou
outra legislação equivalente, isso é escopo diferente e o skill diz
isso explicitamente em vez de fingir que é a mesma coisa.

### Licença

Código e conteúdo deste repositório sob **MIT** — usa, copia, modifica,
redistribui e usa comercialmente à vontade, desde que mantenhas o aviso
de copyright. Ver [LICENSE](LICENSE).

---

## English

Repository for the **Audit Report Studio** — the home where security
+ GDPR audit reports generated by the `/security-audit` skill are
stored and published.

Not a backend app, no giant `npm install`, no hidden secrets. It's
JSON, plain HTML, and a static dashboard served by GitHub Pages.
Simple by design.

### Purpose and main focus

The focus of this project is **not the dashboard** — it's the
`/security-audit` **skill** itself: a stack-agnostic, repeatable, consistent
security + GDPR audit methodology across different projects. The dashboard
only exists to give that work a central, comparable home (per-project
history, compare audits, generate issues) — without it, the skill still
audits code just fine.

The skill is made of **plain, portable files**: a `SKILL.md` (markdown
instructions), reference docs in `reference/*.md`, and a single
dependency-free Node script (`validate-findings.mjs`) that validates and
redacts secrets before publishing. None of it depends on proprietary APIs —
it uses the "skill" format Claude Code expects
(`~/.claude/skills/<name>/`), but the logic itself works under any coding
agent with an equivalent skill/reusable-prompt concept (e.g. OpenCode, or
any other agent that supports skill folders). Porting it to another agent
is essentially copying the folder and wiring the trigger — not rewriting
the methodology.

### Quickstart

```bash
# 1. in any project (React, PHP, whatever), run the skill
/security-audit

# 2. commit + push happens automatically in the skill's step 4

# 3. open the dashboard
open https://lucianomilani.github.io/AI-ditoria/security-audit/studio/
```

This only works once the skill is installed and the dashboard is set
up — see the next section.

### Installation and usage

Three steps: install the skill on your system, use it on a project,
and (optionally) get your own public dashboard instead of publishing
into this repo.

#### 1. Install the skill

The skill's source lives in this repo, under `skills/security-audit/`.
Claude Code only recognizes it in `~/.claude/skills/`. Two ways to
install it:

**A — full clone** (also gets you the dashboard, useful if you'll
publish your own reports into this repo or a fork):

```bash
git clone https://github.com/<your-user>/AI-ditoria.git
cp -r AI-ditoria/skills/security-audit ~/.claude/skills/security-audit
```

(use a symlink instead of `cp` if you want skill updates to arrive
with a plain `git pull` on the clone, without re-copying.)

**B — just the skill folder** (you don't want the dashboard or the
report history, only the audit methodology):

```bash
git clone --filter=blob:none --sparse https://github.com/<your-user>/AI-ditoria.git
cd AI-ditoria
git sparse-checkout set skills/security-audit
cp -r skills/security-audit ~/.claude/skills/security-audit
```

No `git` available? A one-liner alternative (via subversion, which
GitHub exposes for any public repo):

```bash
svn export https://github.com/<your-user>/AI-ditoria/trunk/skills/security-audit ~/.claude/skills/security-audit
```

Either way, the result is the same: the `security-audit/` folder
inside `~/.claude/skills/`, ready to use.

Then edit the first line of
`~/.claude/skills/security-audit/STUDIO_REPO_PATH.md` to the absolute
path of that clone (e.g. `/home/you/AI-ditoria`) — that's where the
skill writes and publishes reports.

#### 2. Use the skill

Inside **any** project you want to audit (it doesn't need to be this
repo, or related to it):

```bash
cd /path/to/the/project/to/audit
/security-audit
```

It follows the flow described in the next section: detects the stack,
audits line by line, generates and validates `findings.json`,
publishes to the dashboard pointed at by `STUDIO_REPO_PATH.md`, and
commits + pushes there automatically.

#### 3. Get your own dashboard (fork)

By default, the skill's step 8 publishes into the clone pointed at by
`STUDIO_REPO_PATH.md` and runs `git push` — that goes to whatever
`origin` is configured on *that* clone. If you cloned the original
repo, that `origin` is `lucianomilani/AI-ditoria`, and you won't have
push access. To get your own public dashboard:

1. **Fork** this repo on GitHub (the *Fork* button, top right).
2. Clone **your fork**, not the original:
   `git clone https://github.com/<your-user>/AI-ditoria.git`
3. Point `STUDIO_REPO_PATH.md` (step 1 above) at this clone of your
   fork.
4. On GitHub, in your fork: **Settings → Pages → Source: Deploy from a
   branch → Branch: `main`, folder `/docs` → Save**. (Requires the
   repo to be public, unless you're on GitHub Pro/Enterprise.)
5. After a few minutes your dashboard is live at
   `https://<your-user>.github.io/AI-ditoria/security-audit/studio/`.
6. Run the skill on any project — the commit + push from step 8 goes
   to your fork, GitHub Pages redeploys automatically, and the
   dashboard updates on its own.

Without this step 3, the skill still audits code just fine — you just
have nowhere to see the published result (or you might publish into
the wrong repo by accident, if `STUDIO_REPO_PATH.md` still points at a
different clone).

### The flow: analyze and generate well-structured reports

1. Run `/security-audit` (or `/security-audit <path>`) on any project
   — React, PHP, whatever it is.
2. The skill detects that project's stack and audits it line by line
   against **13 fixed categories**: multi-tenant isolation and
   SQL/NoSQL injection, frontend-only permission checks, IDOR, exposed
   secrets, XSS, auth/session handling and crypto misuse, SSRF,
   CSRF/path/upload and race conditions/business logic, rate limiting
   and resource exhaustion, dependency/IaC/supply-chain hygiene,
   information disclosure, GDPR compliance, and malicious code/backdoors.
3. It generates a `findings.json` with everything it found —
   findings, strengths, GDPR panel, per-category coverage — and
   validates that file with a script (`validate-findings.mjs`) before
   accepting anything.
4. It writes that JSON here, under
   `docs/security-audit/studio/data/<project>/<date>.json`, updates
   the index (`data/index.json`), and commits + pushes.
5. GitHub Pages serves the `docs/` folder as a site, and the dashboard
   is available at:

   **https://lucianomilani.github.io/AI-ditoria/security-audit/studio/**

In other words: every audit run on any machine, for any project, ends
up in a single central place — no server, no database, just static
files and git.

### The dashboard, in pictures

See the screenshots in the [Português](#o-dashboard-em-imagens)
section above — same images, same dashboard.

> Note: these screenshots may drift from the live UI — the
> [dashboard](https://lucianomilani.github.io/AI-ditoria/security-audit/studio/)
> is always the source of truth.

### Where everything lives

```
docs/
  security-audit/
    studio/                  ← the dashboard itself (the "Audit Report Studio")
      index.html             ← the whole app (no framework, plain JS)
      lib/                   ← shared logic (validation, derivation, tests)
      data/                  ← published reports (index.json + one JSON per audit)
skills/
  security-audit/            ← the skill itself — copy this into ~/.claude/skills/
    SKILL.md                 ← instructions Claude Code follows
    reference/                ← reference docs (categories, schema)
    scripts/validate-findings.mjs  ← validator + secret redaction
    STUDIO_REPO_PATH.md       ← edit line 1 to your clone's local path
```

The part that actually generates the reports — the `/security-audit`
skill — lives in this repo at
[`skills/security-audit/`](skills/security-audit/), but it **runs**
from `~/.claude/skills/security-audit/` (local Claude Code config),
because it needs to run against *any* project, not just this one. This
repo holds the skill's source and the published result; installing it
means copying the folder into place (see
["Installation and usage"](#installation-and-usage) above).

### The dashboard

`docs/security-audit/studio/index.html` is the app you read in the
browser:
- Sidebar with the list of audited projects (with a button to "hide" a
  project locally — it doesn't delete the data, just removes it from
  view in that browser, since it's a static page with no disk write
  permission).
- A full report per audit: cover, executive summary, per-category
  coverage, strengths/weaknesses, GDPR panel, recommendations, and an
  issue generator to paste straight into GitHub.
- A printable **Validation Checklist** — a table meant for a client
  meeting, to check off finding by finding by hand. The "confirmed"
  checkbox is stored in the browser (localStorage) — reopening the
  same project/audit in that browser keeps what you already checked.
  Notes and Owner/Deadline stay print-and-fill-by-hand only.
- **Compare audits**: when a project has 2+ published audits, a
  sidebar button appears to pick two dates and see fixed / new / still
  present between them — useful to confirm a fix actually happened, or
  catch regressions.
- **Export PDF**: a button that triggers the browser's `window.print()`
  — generates a PDF of the full report straight from the dashboard, no
  external service.

### CI gate

The skill's `validate-findings.mjs` (run in step 6 of the audit
process) accepts a `--fail-on=<severity>`:

```bash
node ~/.claude/skills/security-audit/scripts/validate-findings.mjs findings.json --fail-on=alta
```

Fails (exit 1) if any finding exists at that severity or above
(`critica`, `alta`, `media`, `baixa`, `informativa` — critica is most
severe). Without the flag, behavior is the same as always: only
validates the JSON shape. This runs in the *audited* project's CI, not
this repo's — AI-ditoria itself has no pipeline of its own.

Example GitHub Actions workflow in the audited project. `~/.claude/skills/`
only exists on a machine that has the skill installed — not on a GitHub
Actions runner — so this step checks out this repo (AI-ditoria) separately
and runs the validator from there:

```yaml
# .github/workflows/security-audit-gate.yml
name: Security audit gate
on: [pull_request]
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          repository: lucianomilani/AI-ditoria
          path: ai-ditoria
      - run: node ai-ditoria/docs/security-audit/studio/lib/validate-findings.mjs findings.json --fail-on=alta
```

### Automatic secret redaction

The dashboard is public (GitHub Pages, no auth) — so
`validate-findings.mjs` also automatically masks any real API key,
password, or email found in a finding's text before saving the file:

```
REDACTED 2 secret(s)/email(s) before publishing (dashboard is public):
  findings[2].code [aws-access-key]
  findings[5].code [email]
```

The real value is replaced with `***REDACTED***` directly in
`findings.json`; the category, severity, file:line, and the rest of
the finding's explanation stay published as normal — only the
sensitive value disappears. Example/placeholder defaults
(`"change-this-*"`, `"your-api-key"`, etc.) are left untouched, since
they're exactly what the finding is describing. This always runs, no
flag — there's no option to publish without masking.

### Running the tests

No npm, no build step — Node already has a built-in test runner:

```bash
node --test docs/security-audit/studio/lib/*.test.mjs
```

### GDPR compliance — important note

Category 12 and each finding's `rgpd_article` field refer specifically
to **Regulation (EU) 2016/679** (the European GDPR). It is not a
"global privacy law" — no such thing exists. If the audited project
needs LGPD (Brazil), CCPA (US), or other equivalent legislation, that
is a different scope, and the skill says so explicitly instead of
pretending it's the same thing.

### License

Code and content in this repository are under **MIT** — use, copy,
modify, redistribute, and use commercially, as long as you keep the
copyright notice. See [LICENSE](LICENSE).
