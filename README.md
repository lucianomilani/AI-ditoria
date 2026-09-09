# gestaudit

Repositório do **Audit Report Studio** — a base onde ficam guardados e
publicados os relatórios de auditoria de segurança + RGPD gerados pelo
skill `/security-audit`.

Não é uma app com backend, não tem `npm install` gigante, não tem
segredos escondidos. É JSON, HTML puro e um dashboard estático servido
pelo GitHub Pages. Simples de propósito.

## O fluxo, em português normal

1. Corres `/security-audit` (ou `/security-audit <caminho>`) num
   projeto qualquer — pode ser React, PHP, o que for.
2. O skill detecta a stack desse projeto, audita-o linha a linha contra
   **12 categorias fixas** (isolamento multi-tenant, permissões só no
   frontend, IDOR, chaves expostas, XSS, auth/sessões, SSRF,
   CSRF/path/upload, rate limiting, dependências/IaC, fuga de
   informação, e compliance RGPD).
3. Gera um `findings.json` com tudo o que encontrou — achados, pontos
   fortes, painel RGPD, cobertura por categoria — e valida esse ficheiro
   com um script (`validate-findings.mjs`) antes de aceitar nada.
4. Escreve esse JSON aqui, dentro de
   `docs/security-audit/studio/data/<projeto>/<data>.json`, atualiza o
   índice (`data/index.json`) e faz commit + push.
5. O GitHub Pages serve a pasta `docs/` como site, e o dashboard fica
   disponível em:

   **https://lucianomilani.github.io/gestaudit/security-audit/studio/**

Ou seja: cada auditoria feita em qualquer PC, para qualquer projeto,
acaba num único sítio central — sem servidor, sem base de dados, só
ficheiros estáticos e git.

## O dashboard, em imagens

Visão geral — sidebar com os projetos auditados, capa da auditoria:

![Visão geral do AI-ditoria](screenshots/00-overview.png)

Sumário executivo — achados por severidade e categoria:

![Resumo executivo](screenshots/01-resumo-executivo.png)

Cobertura por categoria — maturidade estimada em cada uma das 12 categorias:

![Cobertura por categoria](screenshots/02-cobertura.png)

Detalhe dos achados, filtrável por severidade e categoria:

![Achados](screenshots/03-achados.png)

Issues geradas prontas a colar no GitHub:

![Issues para o GitHub](screenshots/04-issues-github.png)

Lista de Validação imprimível, para a reunião com o cliente:

![Lista de Validação](screenshots/05-checklist.png)

## Onde está cada coisa

```
docs/
  security-audit/
    studio/                  ← o dashboard em si (o "Audit Report Studio")
      index.html             ← toda a app (sem framework, JS puro)
      lib/                   ← lógica partilhada (validação, derivação, testes)
      data/                  ← os relatórios publicados (index.json + um JSON por auditoria)
    data.py                  ← script antigo de amostra, anterior a este fluxo (não é o gerador atual)
    requirements.txt         ← dependências desse script antigo
  superpowers/
    plans/, specs/           ← desenho original desta ferramenta (v1 → v2)
```

A parte que efetivamente gera os relatórios — o skill `/security-audit`
— **não vive neste repo**. Fica em `~/.claude/skills/security-audit/`
(config local do Claude Code), porque precisa de correr sobre *qualquer*
outro projeto, não só este. O que este repo guarda é o resultado
publicado, não a ferramenta que o produz.

## O dashboard

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
  mão.

## Como correr os testes

Sem npm, sem build step — o Node já tem test runner embutido:

```bash
node --test docs/security-audit/studio/lib/*.test.mjs
```

## Compliance RGPD — nota importante

A categoria 12 e o campo `rgpd_article` de cada achado referem-se
especificamente ao **Regulamento (UE) 2016/679** (o RGPD europeu, dito
GDPR em inglês). Não é uma "lei global de privacidade" — essa lei não
existe. Se o projeto auditado precisar de LGPD (Brasil), CCPA (EUA) ou
outra legislação equivalente, isso é escopo diferente e o skill diz
isso explicitamente em vez de fingir que é a mesma coisa.

## Correr esta ferramenta noutro PC

O skill vive fora deste repo, em `~/.claude/skills/security-audit/`.
Para o teres noutra máquina:

1. Copia essa pasta para o `~/.claude/skills/` do PC novo.
2. Clona este repo (`gestaudit`) nesse PC.
3. Edita a primeira linha de `STUDIO_REPO_PATH.md` (dentro da pasta do
   skill) para apontar para o caminho local desse clone.

Sem isso, o skill funciona à mesma para auditar código — só não sabe
onde publicar o resultado.
