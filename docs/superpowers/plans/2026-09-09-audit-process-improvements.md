# Audit Process Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 4 methodology gaps in the `/security-audit` skill's fixed category list, and ship 3 independent dashboard/tooling features (CI-gate exit code, checklist confirm-checkbox persistence, diff between two audit runs).

**Architecture:** Two independent tracks. Track A renames/expands 4 of the skill's 12 fixed categories (crypto misuse → 6, race conditions/business logic → 8, resource-exhaustion DoS → 9, supply-chain → 10) across the 3 skill files that live outside this git repo plus the 2 repo files that duplicate the same constant. Track B adds three unrelated features entirely inside this repo: a `--fail-on` severity gate on the skill's standalone validator, `localStorage` persistence for the checklist's confirm checkbox, and a pure `diffFindings()` function plus a dashboard view that compares two runs of the same project.

**Tech Stack:** Plain Node.js (`node --test`, ES modules, zero dependencies) for the dashboard's `lib/`; a single dependency-free HTML file (`index.html`) with inline `<script>`/`<style>`, no bundler, no framework; Markdown skill files read by Claude Code, not executed.

**Spec:** `docs/superpowers/specs/2026-09-09-audit-process-improvements-design.md`

## Global Constraints

- Exactly 12 fixed category ids (1-12), never add or remove one — enforced by `constants.test.mjs` ("CATEGORY_NAMES has exactly the 12 fixed ids") and by `validate-findings.mjs`'s exact-name check. Track A only edits the *string value* for ids 6, 8, 9, 10 — never the id, never the count.
- Three copies of `CATEGORY_NAMES` must always hold byte-identical string values per id: `docs/security-audit/studio/lib/constants.mjs` (repo), `docs/security-audit/studio/index.html` inline copy (repo), `~/.claude/skills/security-audit/scripts/validate-findings.mjs` (skill, NOT in this git repo).
- `~/.claude/skills/security-audit/` is not a git repository — never run `git add`/`git commit` against files there. Only paths under `/var/home/lmilani/Documentos/IDE/auditoria` get committed.
- After every task that touches `docs/security-audit/studio/lib/*.mjs` or `index.html`, run `node --test docs/security-audit/studio/lib/*.test.mjs` from `docs/security-audit/studio/` and confirm all tests pass (26 at the start of this plan; Task 5 adds more).
- Every git commit message ends with the trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` on its own line.
- `localStorage` reads/writes follow the existing `loadHiddenSlugs`/`saveHiddenSlugs` pattern in `index.html`: wrap in `try/catch`, degrade to an empty/no-op result on failure, never throw.
- Already-published `findings.json` files under `docs/security-audit/studio/data/` are historical snapshots and are never edited to match a renamed category — same precedent as the existing scans/sbom historical-shape exception in `reference/schema.md`.

---

### Task 1: Rename categories 6, 8, 9, 10 in the skill's own files

**Files:**
- Modify: `~/.claude/skills/security-audit/reference/categories.md`
- Modify: `~/.claude/skills/security-audit/SKILL.md` (frontmatter `description` line only)
- Modify: `~/.claude/skills/security-audit/scripts/validate-findings.mjs`

**Interfaces:**
- Consumes: nothing from another task.
- Produces: the 4 new category name strings, which Task 2 copies verbatim into the repo:
  - id 6 → `Autenticação, sessões e criptografia`
  - id 8 → `Integridade de escrita (CSRF/path/upload/concorrência)`
  - id 9 → `Rate limiting, força bruta e exhaustion`
  - id 10 → `Dependências, IaC e supply-chain`

- [ ] **Step 1: Edit `categories.md` — expand category 6**

In `~/.claude/skills/security-audit/reference/categories.md`, replace:

```markdown
6. **Autenticação e sessões** — hashing de palavra-passe, MFA em contas
   privilegiadas, tokens de reset com entropia/rate limit adequados.
```

with:

```markdown
6. **Autenticação, sessões e criptografia** — hashing de palavra-passe, MFA
   em contas privilegiadas, tokens de reset com entropia/rate limit
   adequados. Cobre também **uso indevido de criptografia**: cifra fraca ou
   legada (DES, modo ECB), IV/nonce previsível ou reutilizado, e crypto
   caseira em vez de uma lib/primitiva validada.
```

- [ ] **Step 2: Edit `categories.md` — expand category 8**

Replace:

```markdown
8. **Integridade de escrita (CSRF/path/upload)** — CORS+cookies sem
   proteção CSRF; nome de ficheiro de upload sem normalização (path
   traversal/zip-slip).
```

with:

```markdown
8. **Integridade de escrita (CSRF/path/upload/concorrência)** —
   CORS+cookies sem proteção CSRF; nome de ficheiro de upload sem
   normalização (path traversal/zip-slip). Cobre também **race
   conditions/lógica de negócio**: TOCTOU em sequências check-then-act,
   manipulação de preço/quantidade, ações multi-passo sem
   transação/lock que as torne atómicas.
```

- [ ] **Step 3: Edit `categories.md` — expand category 9**

Replace:

```markdown
9. **Rate limiting e força bruta** — login/reset/endpoints sensíveis sem
   limite de tentativas.
```

with:

```markdown
9. **Rate limiting, força bruta e exhaustion** — login/reset/endpoints
   sensíveis sem limite de tentativas. Cobre também **exhaustion de
   recursos**: paginação/page-size sem limite máximo, upload sem tamanho
   máximo, regex com backtracking catastrófico alcançável por input do
   utilizador.
```

- [ ] **Step 4: Edit `categories.md` — expand category 10**

Replace:

```markdown
10. **Dependências e IaC** — CVEs alcançáveis, imagens sem pin/digest,
    recursos de infraestrutura (buckets, etc.) com exposição indevida.
```

with:

```markdown
10. **Dependências, IaC e supply-chain** — CVEs alcançáveis, imagens sem
    pin/digest, recursos de infraestrutura (buckets, etc.) com exposição
    indevida. Cobre também **supply-chain além de CVE conhecido**:
    GitHub Actions/CI steps sem pin por SHA, scripts de build/postinstall
    que buscam código remoto, dependências recém-adicionadas com risco de
    typosquatting.
```

- [ ] **Step 5: Update `SKILL.md`'s frontmatter description**

In `~/.claude/skills/security-audit/SKILL.md`, the `description:` line currently reads (line 3):

```
description: "Audits any codebase for the 12 fixed security/RGPD-compliance categories (tenant isolation & injection, UI-only permission checks, IDOR, hardcoded secrets, XSS, auth/session handling, SSRF, CSRF/path/upload integrity, rate limiting, dependency/IaC hygiene, information disclosure, RGPD compliance), stack-agnostic — detects the target's language/framework/ORM/auth/frontend/deploy setup first, then maps each category to it. Writes a findings.json and updates the shared Audit Report Studio dashboard. Trigger: /security-audit."
```

Replace the parenthetical category list with:

```
description: "Audits any codebase for the 12 fixed security/RGPD-compliance categories (tenant isolation & injection, UI-only permission checks, IDOR, hardcoded secrets, XSS, auth/session handling & crypto misuse, SSRF, CSRF/path/upload/concurrency integrity, rate limiting & resource exhaustion, dependency/IaC/supply-chain hygiene, information disclosure, RGPD compliance), stack-agnostic — detects the target's language/framework/ORM/auth/frontend/deploy setup first, then maps each category to it. Writes a findings.json and updates the shared Audit Report Studio dashboard. Trigger: /security-audit."
```

- [ ] **Step 6: Update `CATEGORY_NAMES` in the skill's standalone validator**

In `~/.claude/skills/security-audit/scripts/validate-findings.mjs`, the `CATEGORY_NAMES` object currently has (around line 8):

```js
const CATEGORY_NAMES = {
  1: 'Banco sem tranca (isolamento e injeção)',
  2: 'Permissão definida no navegador',
  3: 'IDOR',
  4: 'Chaves expostas',
  5: 'Inputs sem tratamento (XSS)',
  6: 'Autenticação e sessões',
  7: 'SSRF',
  8: 'Integridade de escrita (CSRF/path/upload)',
  9: 'Rate limiting e força bruta',
  10: 'Dependências e IaC',
  11: 'Vazamento de informação',
  12: 'Compliance RGPD',
}
```

Replace lines for ids 6, 8, 9, 10 (leave 1, 2, 3, 4, 5, 7, 11, 12 untouched — id 11's `'Vazamento de informação'` is a pre-existing, unrelated drift from the repo's `'Fuga de informação'` and is out of scope for this plan):

```js
const CATEGORY_NAMES = {
  1: 'Banco sem tranca (isolamento e injeção)',
  2: 'Permissão definida no navegador',
  3: 'IDOR',
  4: 'Chaves expostas',
  5: 'Inputs sem tratamento (XSS)',
  6: 'Autenticação, sessões e criptografia',
  7: 'SSRF',
  8: 'Integridade de escrita (CSRF/path/upload/concorrência)',
  9: 'Rate limiting, força bruta e exhaustion',
  10: 'Dependências, IaC e supply-chain',
  11: 'Vazamento de informação',
  12: 'Compliance RGPD',
}
```

- [ ] **Step 7: Verify the skill's validator still runs cleanly**

Run:

```bash
node -e "import('/var/home/lmilani/.claude/skills/security-audit/scripts/validate-findings.mjs')" 2>&1 | tail -5
```

Expected: no output and no error (the module has a top-level `import.meta.url === file://process.argv[1]` guard that is false under `node -e`, so nothing executes; a syntax error would print a `SyntaxError` here — that's the failure this step catches).

No commit yet — Task 1 has no git-tracked files (the skill directory is not a repo). Proceed directly to Task 2.

---

### Task 2: Sync the repo's two `CATEGORY_NAMES` copies and verify enforcement

**Files:**
- Modify: `docs/security-audit/studio/lib/constants.mjs`
- Modify: `docs/security-audit/studio/index.html` (inline `CATEGORY_NAMES` block, around line 385)
- Test: `docs/security-audit/studio/lib/constants.test.mjs` (existing, run only — no changes needed)

**Interfaces:**
- Consumes: the 4 exact new name strings decided in Task 1 (copy verbatim, do not reword):
  - id 6 → `Autenticação, sessões e criptografia`
  - id 8 → `Integridade de escrita (CSRF/path/upload/concorrência)`
  - id 9 → `Rate limiting, força bruta e exhaustion`
  - id 10 → `Dependências, IaC e supply-chain`
- Produces: nothing consumed by a later task — Track A ends here.

- [ ] **Step 1: Update `docs/security-audit/studio/lib/constants.mjs`**

Current content of the `CATEGORY_NAMES` export:

```js
export const CATEGORY_NAMES = {
  1: 'Banco sem tranca (isolamento e injeção)',
  2: 'Permissão definida no navegador',
  3: 'IDOR',
  4: 'Chaves expostas',
  5: 'Inputs sem tratamento (XSS)',
  6: 'Autenticação e sessões',
  7: 'SSRF',
  8: 'Integridade de escrita (CSRF/path/upload)',
  9: 'Rate limiting e força bruta',
  10: 'Dependências e IaC',
  11: 'Fuga de informação',
  12: 'Compliance RGPD',
}
```

Replace with:

```js
export const CATEGORY_NAMES = {
  1: 'Banco sem tranca (isolamento e injeção)',
  2: 'Permissão definida no navegador',
  3: 'IDOR',
  4: 'Chaves expostas',
  5: 'Inputs sem tratamento (XSS)',
  6: 'Autenticação, sessões e criptografia',
  7: 'SSRF',
  8: 'Integridade de escrita (CSRF/path/upload/concorrência)',
  9: 'Rate limiting, força bruta e exhaustion',
  10: 'Dependências, IaC e supply-chain',
  11: 'Fuga de informação',
  12: 'Compliance RGPD',
}
```

- [ ] **Step 2: Update the inline copy in `index.html`**

Around line 385, `index.html` has an inline duplicate (comment above it reads "PORTED CONSTANTS (verbatim from docs/security-audit/studio/lib/constants.mjs)"):

```js
  const CATEGORY_NAMES = {
    1: 'Banco sem tranca (isolamento e injeção)',
    2: 'Permissão definida no navegador',
    3: 'IDOR',
    4: 'Chaves expostas',
    5: 'Inputs sem tratamento (XSS)',
    6: 'Autenticação e sessões',
    7: 'SSRF',
    8: 'Integridade de escrita (CSRF/path/upload)',
    9: 'Rate limiting e força bruta',
    10: 'Dependências e IaC',
    11: 'Fuga de informação',
    12: 'Compliance RGPD',
  };
```

Replace with:

```js
  const CATEGORY_NAMES = {
    1: 'Banco sem tranca (isolamento e injeção)',
    2: 'Permissão definida no navegador',
    3: 'IDOR',
    4: 'Chaves expostas',
    5: 'Inputs sem tratamento (XSS)',
    6: 'Autenticação, sessões e criptografia',
    7: 'SSRF',
    8: 'Integridade de escrita (CSRF/path/upload/concorrência)',
    9: 'Rate limiting, força bruta e exhaustion',
    10: 'Dependências, IaC e supply-chain',
    11: 'Fuga de informação',
    12: 'Compliance RGPD',
  };
```

- [ ] **Step 3: Run the existing test suite**

```bash
cd /var/home/lmilani/Documentos/IDE/auditoria/docs/security-audit/studio
node --test lib/*.test.mjs
```

Expected: `tests 26`, `pass 26`, `fail 0` (no test hardcodes a category name string, so the rename alone doesn't change this count).

- [ ] **Step 4: Prove the new names are actually enforced, not decorative**

Create a fixture with the OLD name for category 6 but everything else valid, and confirm the (already-updated) skill validator rejects it:

```bash
cat > /tmp/track-a-enforcement-check.json <<'EOF'
{
  "project": "smoke-test", "audit_date": "2026-01-01", "scope": "fixture",
  "stack": [], "methodology_note": "fixture for category-rename enforcement check",
  "categories": [
    {"id": 1, "name": "Banco sem tranca (isolamento e injeção)", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 2, "name": "Permissão definida no navegador", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 3, "name": "IDOR", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 4, "name": "Chaves expostas", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 5, "name": "Inputs sem tratamento (XSS)", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 6, "name": "Autenticação e sessões", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 7, "name": "SSRF", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 8, "name": "Integridade de escrita (CSRF/path/upload/concorrência)", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 9, "name": "Rate limiting, força bruta e exhaustion", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 10, "name": "Dependências, IaC e supply-chain", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 11, "name": "Fuga de informação", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 12, "name": "Compliance RGPD", "maturity": 50, "applicable": false, "na_reason": "n/a"}
  ],
  "findings": [], "strengths": [], "weaknesses": {"security": [], "rgpd": []},
  "rgpd_panel": [], "scans": [], "sbom": [], "limits": [], "issue_groups": []
}
EOF
node ~/.claude/skills/security-audit/scripts/validate-findings.mjs /tmp/track-a-enforcement-check.json
```

Expected output:

```
INVALID:
categories[6]: name must be "Autenticação, sessões e criptografia"
```

Exit code must be `1` (check with `echo $?` if not obvious from the harness).

- [ ] **Step 5: Clean up the scratch fixture**

```bash
rm /tmp/track-a-enforcement-check.json
```

- [ ] **Step 6: Commit**

```bash
cd /var/home/lmilani/Documentos/IDE/auditoria
git add docs/security-audit/studio/lib/constants.mjs docs/security-audit/studio/index.html
git commit -m "$(cat <<'EOF'
feat(studio): expand categories 6/8/9/10 to close methodology gaps

Category 6 now also covers crypto misuse (weak ciphers, predictable
IV, home-grown crypto), category 8 covers race conditions/business
logic (TOCTOU, price/quantity manipulation), category 9 covers
resource-exhaustion DoS (unbounded pagination, upload size, regex
backtracking), category 10 covers supply-chain beyond known CVEs
(unpinned CI actions, postinstall scripts, typosquatting). Same
pattern as category 1's isolation+injection expansion. Matching
rename already applied to the security-audit skill's own files
(categories.md, SKILL.md, validate-findings.mjs — outside this repo).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

### Task 3: `--fail-on` severity gate on the skill's validator

**Files:**
- Modify: `~/.claude/skills/security-audit/scripts/validate-findings.mjs` (CLI entrypoint block only, bottom of file)

**Interfaces:**
- Consumes: nothing from another task (independent of Track A and the rest of Track B).
- Produces: a `--fail-on=<severity>` CLI flag; no other task depends on it.

- [ ] **Step 1: Replace the CLI entrypoint block**

At the bottom of `~/.claude/skills/security-audit/scripts/validate-findings.mjs`, this block currently exists:

```js
if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs/promises')
  const path = process.argv[2]
  if (!path) { console.error('usage: node validate-findings.mjs <findings.json>'); process.exit(2) }
  const data = JSON.parse(await fs.readFile(path, 'utf8'))
  const { valid, errors } = validateFindings(data)
  console.log(valid ? 'VALID' : `INVALID:\n${errors.join('\n')}`)
  process.exit(valid ? 0 : 1)
}
```

Replace it with:

```js
if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs/promises')
  const args = process.argv.slice(2)
  const path = args.find(a => !a.startsWith('--'))
  const failOnArg = args.find(a => a.startsWith('--fail-on='))
  if (!path) { console.error('usage: node validate-findings.mjs <findings.json> [--fail-on=<severity>]'); process.exit(2) }
  const data = JSON.parse(await fs.readFile(path, 'utf8'))
  const { valid, errors } = validateFindings(data)
  if (!valid) {
    console.log(`INVALID:\n${errors.join('\n')}`)
    process.exit(1)
  }
  console.log('VALID')
  if (failOnArg) {
    const severity = failOnArg.slice('--fail-on='.length)
    if (!SEVERITY_ORDER.includes(severity)) {
      console.error(`--fail-on: "${severity}" must be one of ${SEVERITY_ORDER.join('|')}`)
      process.exit(2)
    }
    const threshold = SEVERITY_ORDER.indexOf(severity)
    const blocking = data.findings.filter(f => SEVERITY_ORDER.indexOf(f.severity) <= threshold)
    if (blocking.length > 0) {
      console.log(`FAIL-ON-${severity.toUpperCase()}:`)
      for (const f of blocking) console.log(`  ${f.id} [${f.severity}] ${f.desc}`)
      process.exit(1)
    }
  }
  process.exit(0)
}
```

(`SEVERITY_ORDER` is already defined earlier in this same file as `['critica', 'alta', 'media', 'baixa', 'informativa']` — index 0 is most severe, so `indexOf(f.severity) <= threshold` means "at or above the requested severity".)

- [ ] **Step 2: Verify unchanged behavior with no flag**

```bash
cat > /tmp/fail-on-check-clean.json <<'EOF'
{
  "project": "smoke-test", "audit_date": "2026-01-01", "scope": "fixture",
  "stack": [], "methodology_note": "fixture with zero findings",
  "categories": [
    {"id": 1, "name": "Banco sem tranca (isolamento e injeção)", "maturity": 80, "applicable": true},
    {"id": 2, "name": "Permissão definida no navegador", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 3, "name": "IDOR", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 4, "name": "Chaves expostas", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 5, "name": "Inputs sem tratamento (XSS)", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 6, "name": "Autenticação, sessões e criptografia", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 7, "name": "SSRF", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 8, "name": "Integridade de escrita (CSRF/path/upload/concorrência)", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 9, "name": "Rate limiting, força bruta e exhaustion", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 10, "name": "Dependências, IaC e supply-chain", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 11, "name": "Vazamento de informação", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 12, "name": "Compliance RGPD", "maturity": 50, "applicable": false, "na_reason": "n/a"}
  ],
  "findings": [], "strengths": [], "weaknesses": {"security": [], "rgpd": []},
  "rgpd_panel": [], "scans": [], "sbom": [], "limits": [], "issue_groups": []
}
EOF
node ~/.claude/skills/security-audit/scripts/validate-findings.mjs /tmp/fail-on-check-clean.json
echo "exit=$?"
```

Expected: prints `VALID` and `exit=0` (no `--fail-on`, so behavior is exactly as before this task).

- [ ] **Step 3: Verify `--fail-on` passes when nothing meets the threshold**

```bash
node ~/.claude/skills/security-audit/scripts/validate-findings.mjs /tmp/fail-on-check-clean.json --fail-on=critica
echo "exit=$?"
```

Expected: prints `VALID` only (no `FAIL-ON-CRITICA` block, since `findings` is empty) and `exit=0`.

- [ ] **Step 4: Verify `--fail-on` trips on a matching finding**

```bash
cat > /tmp/fail-on-check-critical.json <<'EOF'
{
  "project": "smoke-test", "audit_date": "2026-01-01", "scope": "fixture",
  "stack": [], "methodology_note": "fixture with one critical finding",
  "categories": [
    {"id": 1, "name": "Banco sem tranca (isolamento e injeção)", "maturity": 40, "applicable": true},
    {"id": 2, "name": "Permissão definida no navegador", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 3, "name": "IDOR", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 4, "name": "Chaves expostas", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 5, "name": "Inputs sem tratamento (XSS)", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 6, "name": "Autenticação, sessões e criptografia", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 7, "name": "SSRF", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 8, "name": "Integridade de escrita (CSRF/path/upload/concorrência)", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 9, "name": "Rate limiting, força bruta e exhaustion", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 10, "name": "Dependências, IaC e supply-chain", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 11, "name": "Vazamento de informação", "maturity": 50, "applicable": false, "na_reason": "n/a"},
    {"id": 12, "name": "Compliance RGPD", "maturity": 50, "applicable": false, "na_reason": "n/a"}
  ],
  "findings": [{
    "id": "F1", "category": 1, "severity": "critica", "file": "app.py", "line": 10,
    "cwe": "CWE-89", "owasp": "A03:2021", "desc": "SQL injection via string concat",
    "code": "query = \"SELECT * WHERE id=\" + user_id", "why": "unparameterized query",
    "impact": "full DB read/write", "fix": "use parameterized query",
    "acceptance": ["query uses placeholders"], "rgpd_article": null, "exploitability_notes": null
  }],
  "strengths": [], "weaknesses": {"security": [], "rgpd": []},
  "rgpd_panel": [], "scans": [], "sbom": [], "limits": [], "issue_groups": [["F1"]]
}
EOF
node ~/.claude/skills/security-audit/scripts/validate-findings.mjs /tmp/fail-on-check-critical.json --fail-on=alta
echo "exit=$?"
```

Expected output:

```
VALID
FAIL-ON-ALTA:
  F1 [critica] SQL injection via string concat
exit=1
```

(`critica` ranks above `alta`, so `--fail-on=alta` correctly also blocks on `critica`.)

- [ ] **Step 5: Verify a bad `--fail-on` value is rejected**

```bash
node ~/.claude/skills/security-audit/scripts/validate-findings.mjs /tmp/fail-on-check-clean.json --fail-on=urgent
echo "exit=$?"
```

Expected: prints `VALID` then `--fail-on: "urgent" must be one of critica|alta|media|baixa|informativa` on stderr, `exit=2`.

- [ ] **Step 6: Clean up scratch fixtures**

```bash
rm /tmp/fail-on-check-clean.json /tmp/fail-on-check-critical.json
```

- [ ] **Step 7: Document the flag in `SKILL.md`**

In `~/.claude/skills/security-audit/SKILL.md`, after the existing step 6 of the numbered Process list (`**Validate it**: ...`), add a short standalone note (not a new numbered step — this is optional tooling, not part of every audit run). Find this line:

```
6. **Validate it**: `node ~/.claude/skills/security-audit/scripts/validate-findings.mjs <path-to-findings.json>` — must print `VALID` before continuing. Fix and re-run if not.
```

Add immediately after it, still inside the numbered list item (as a continuation paragraph, indented to match):

```
   Optionally, a target project's own CI can gate on severity:
   `validate-findings.mjs <path> --fail-on=<critica|alta|media|baixa|informativa>`
   exits 1 (after printing which findings blocked) if any finding at or
   above that severity is present. This is unrelated to shape validation
   above and is off by default — pass it only when a project's own
   pipeline wants to fail a build on unresolved findings.
```

- [ ] **Step 8: Commit**

This task has no git-tracked files (the skill directory is not a repo) — nothing to commit. Proceed directly to Task 4.

---

### Task 4: Checklist "confirmado" checkbox persists per browser

**Files:**
- Modify: `docs/security-audit/studio/index.html` (near `HIDDEN_PROJECTS_KEY`/`loadHiddenSlugs`/`saveHiddenSlugs`, around line 544-561, and inside `buildValidationChecklist`, around line 1025-1033)

**Interfaces:**
- Consumes: `state.activeSlug` (already set by `selectRun(slug, run)` before `renderReport(doc)` — and thus before `buildValidationChecklist(doc)` — runs) and `doc.audit_date`/`f.id` (already present on every finding).
- Produces: nothing consumed by another task.

- [ ] **Step 1: Add the checklist localStorage helpers**

Immediately after the existing `saveHiddenSlugs` function (ends around line 561 with `}`) and before `const state = {` (line 563), insert:

```js
  const CHECKLIST_STATE_KEY = 'audit-studio-checklist';

  /** Confirm-checkbox state for the printable validation checklist, keyed by
   * `${slug}/${auditDate}/${findingId}` → boolean. Per-browser only, same
   * ceiling as loadHiddenSlugs/saveHiddenSlugs — there is no backend to
   * sync this across machines or people. */
  function loadChecklistState() {
    try {
      return JSON.parse(localStorage.getItem(CHECKLIST_STATE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveChecklistState(state) {
    try {
      localStorage.setItem(CHECKLIST_STATE_KEY, JSON.stringify(state));
    } catch {}
  }

  function checklistKey(slug, auditDate, findingId) {
    return `${slug}/${auditDate}/${findingId}`;
  }
```

- [ ] **Step 2: Add `checklistState` to the global `state` object**

The `state` object (around line 563) currently reads:

```js
  const state = {
    manifest: null, slugs: [], runsBySlug: {}, runErrors: {},
    openSlug: null, activeSlug: null, activeRunId: null,
    hiddenSlugs: loadHiddenSlugs(),
  };
```

Change to:

```js
  const state = {
    manifest: null, slugs: [], runsBySlug: {}, runErrors: {},
    openSlug: null, activeSlug: null, activeRunId: null,
    hiddenSlugs: loadHiddenSlugs(),
    checklistState: loadChecklistState(),
  };
```

- [ ] **Step 3: Wire the checkbox to read and write that state**

Inside `buildValidationChecklist(doc)`, the `tbody` is currently built as:

```js
  function buildValidationChecklist(doc) {
    const tbody = el('tbody', {}, doc.findings.map(f => el('tr', {}, [
      el('td', { class: 'checklist-check' }, [el('input', { type: 'checkbox', 'aria-label': `Achado confirmado: ${f.id}` })]),
      el('td', {}, [el('span', { class: 'chip', style: `background:${SEVERITY_COLORS[f.severity]}`, text: SEVERITY_LABELS[f.severity] })]),
      el('td', { class: 'fileref' }, [el('span', { class: 'fid', text: f.id }), ' · ', `${f.file}:${f.line}`, ' — ', f.desc]),
      el('td', { text: f.fix }),
      el('td', { class: 'checklist-notes' }),
      el('td', { class: 'checklist-notes' }),
    ])));
```

Replace the `tbody` construction with:

```js
  function buildValidationChecklist(doc) {
    const tbody = el('tbody', {}, doc.findings.map(f => {
      const key = checklistKey(state.activeSlug, doc.audit_date, f.id);
      const checkbox = el('input', { type: 'checkbox', 'aria-label': `Achado confirmado: ${f.id}` });
      checkbox.checked = Boolean(state.checklistState[key]);
      checkbox.addEventListener('change', () => {
        state.checklistState[key] = checkbox.checked;
        saveChecklistState(state.checklistState);
      });
      return el('tr', {}, [
        el('td', { class: 'checklist-check' }, [checkbox]),
        el('td', {}, [el('span', { class: 'chip', style: `background:${SEVERITY_COLORS[f.severity]}`, text: SEVERITY_LABELS[f.severity] })]),
        el('td', { class: 'fileref' }, [el('span', { class: 'fid', text: f.id }), ' · ', `${f.file}:${f.line}`, ' — ', f.desc]),
        el('td', { text: f.fix }),
        el('td', { class: 'checklist-notes' }),
        el('td', { class: 'checklist-notes' }),
      ]);
    }));
```

(Everything else in `buildValidationChecklist` — the `table`, `printChecklistBtn`, and the returned `section` — is unchanged.)

- [ ] **Step 4: Manual verification**

```bash
cd /var/home/lmilani/Documentos/IDE/auditoria/docs/security-audit/studio
python3 -m http.server 8794 &
sleep 1
```

Open `http://localhost:8794/index.html` in a browser (or drive it with the Playwright pattern used earlier in this session: launch chromium, `page.goto`, click a project, click a run). Check the first finding's checkbox in the "Lista de Validação" section. Reload the page, re-select the same project and run. Expected: that same checkbox is still checked. Open the browser's dev tools → Application → Local Storage → confirm a key `audit-studio-checklist` exists with a JSON value containing an entry like `"<slug>/<audit_date>/F1": true`.

```bash
kill %1
```

- [ ] **Step 5: Run the regression suite**

```bash
node --test docs/security-audit/studio/lib/*.test.mjs
```

Expected: `tests 26`, `pass 26`, `fail 0` (this task only touches `index.html`, which the Node test suite doesn't import).

- [ ] **Step 6: Commit**

```bash
cd /var/home/lmilani/Documentos/IDE/auditoria
git add docs/security-audit/studio/index.html
git commit -m "$(cat <<'EOF'
feat(studio): persist checklist confirm-checkbox per browser

The printable Lista de Validação's confirm checkbox now saves to
localStorage (audit-studio-checklist, keyed by
slug/audit_date/finding-id) and restores on reload, same pattern as
the existing hidden-projects feature. Notas/Responsável-Prazo stay
pen-and-paper only, unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

### Task 5: `diffFindings()` pure function

**Files:**
- Modify: `docs/security-audit/studio/lib/report-derive.mjs`
- Modify: `docs/security-audit/studio/lib/report-derive.test.mjs`

**Interfaces:**
- Consumes: nothing from another task.
- Produces: `diffFindings(runA, runB)` — exported from `report-derive.mjs`. Signature: takes two run documents (each shaped like a `findings.json`, i.e. an object with a `findings` array of `{id, file, line, severity, category, desc, ...}`), returns `{ fixed: Finding[], new: Finding[], unchanged: Finding[] }` where a finding's identity is `${file}:${line}:${id}`. Task 6 imports this function by this exact name and return shape.

- [ ] **Step 1: Write the failing tests**

Append to `docs/security-audit/studio/lib/report-derive.test.mjs` (add the import to the existing `import { countBySeverity, countByCategory, groupRecommendations } from './report-derive.mjs'` line at the top, changing it to also import `diffFindings`):

```js
import { countBySeverity, countByCategory, groupRecommendations, diffFindings } from './report-derive.mjs'
```

Then append these tests at the end of the file:

```js
test('diffFindings: identical runs produce nothing fixed and nothing new', () => {
  const runA = { findings: [{ id: 'F1', file: 'a.ts', line: 5, severity: 'alta' }] }
  const runB = { findings: [{ id: 'F1', file: 'a.ts', line: 5, severity: 'alta' }] }
  const result = diffFindings(runA, runB)
  assert.deepEqual(result.fixed, [])
  assert.deepEqual(result.new, [])
  assert.equal(result.unchanged.length, 1)
  assert.equal(result.unchanged[0].id, 'F1')
})

test('diffFindings: a finding present only in runA is fixed', () => {
  const runA = { findings: [{ id: 'F1', file: 'a.ts', line: 5, severity: 'alta' }] }
  const runB = { findings: [] }
  const result = diffFindings(runA, runB)
  assert.equal(result.fixed.length, 1)
  assert.equal(result.fixed[0].id, 'F1')
  assert.deepEqual(result.new, [])
  assert.deepEqual(result.unchanged, [])
})

test('diffFindings: a finding present only in runB is new', () => {
  const runA = { findings: [] }
  const runB = { findings: [{ id: 'F1', file: 'a.ts', line: 5, severity: 'alta' }] }
  const result = diffFindings(runA, runB)
  assert.deepEqual(result.fixed, [])
  assert.equal(result.new.length, 1)
  assert.equal(result.new[0].id, 'F1')
  assert.deepEqual(result.unchanged, [])
})

test('diffFindings: same file:line re-flagged with a different id in the later run counts as unchanged, not fixed+new', () => {
  const runA = { findings: [{ id: 'F1', file: 'a.ts', line: 5, severity: 'alta' }] }
  const runB = { findings: [{ id: 'F3', file: 'a.ts', line: 5, severity: 'critica' }] }
  const result = diffFindings(runA, runB)
  assert.deepEqual(result.fixed, [])
  assert.deepEqual(result.new, [])
  assert.equal(result.unchanged.length, 0)
})

test('diffFindings: matches by exact file:line:id triple, ignoring unrelated fields', () => {
  const runA = { findings: [{ id: 'F1', file: 'a.ts', line: 5, severity: 'alta', desc: 'old wording' }] }
  const runB = { findings: [{ id: 'F1', file: 'a.ts', line: 5, severity: 'alta', desc: 'new wording' }] }
  const result = diffFindings(runA, runB)
  assert.equal(result.unchanged.length, 1)
  assert.equal(result.unchanged[0].desc, 'new wording')
})
```

(The fourth test above documents the deliberate limitation named in the spec: `id` is not stable across runs, so a finding that keeps its `file:line` but gets renumbered from `F1` to `F3` is NOT recognized as the same finding by this matching key — it is correctly reported as both fixed (old id/file/line combo gone) and new (new id/file/line combo appeared), even though a human would see it as "still the same bug, just renumbered." This is a known, accepted limitation, not a bug to fix in this task.)

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /var/home/lmilani/Documentos/IDE/auditoria/docs/security-audit/studio
node --test lib/report-derive.test.mjs
```

Expected: `FAIL` — `diffFindings is not a function` (or similar `TypeError`), since it doesn't exist yet.

- [ ] **Step 3: Implement `diffFindings`**

Append to `docs/security-audit/studio/lib/report-derive.mjs`:

```js
function findingKey(f) {
  return `${f.file}:${f.line}:${f.id}`
}

export function diffFindings(runA, runB) {
  const findingsA = runA.findings || []
  const findingsB = runB.findings || []
  const keysA = new Set(findingsA.map(findingKey))
  const keysB = new Set(findingsB.map(findingKey))
  return {
    fixed: findingsA.filter(f => !keysB.has(findingKey(f))),
    new: findingsB.filter(f => !keysA.has(findingKey(f))),
    unchanged: findingsB.filter(f => keysA.has(findingKey(f))),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test lib/report-derive.test.mjs
```

Expected: all tests in this file pass, including the 5 new ones.

- [ ] **Step 5: Run the full suite**

```bash
node --test lib/*.test.mjs
```

Expected: `tests 31`, `pass 31`, `fail 0` (26 existing + 5 new).

- [ ] **Step 6: Commit**

```bash
cd /var/home/lmilani/Documentos/IDE/auditoria
git add docs/security-audit/studio/lib/report-derive.mjs docs/security-audit/studio/lib/report-derive.test.mjs
git commit -m "$(cat <<'EOF'
feat(studio): add diffFindings() to compare two audit runs

Matches findings by file:line:id (ids are not stable across runs, so
a finding whose id changes between runs is reported as both fixed and
new — documented as a known limitation, not a bug). Returns
{fixed, new, unchanged}, ready for a dashboard compare-runs view.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

### Task 6: Compare-runs dashboard view

**Files:**
- Modify: `docs/security-audit/studio/index.html` (imports/inline copy of `diffFindings`, sidebar rendering, a new render function, CSS)

**Interfaces:**
- Consumes: `diffFindings(runA, runB)` from Task 5 — but `index.html` has no bundler and cannot `import` from `report-derive.mjs`, so this task adds an inline copy of the two functions (`findingKey`, `diffFindings`), verbatim, next to the other "PORTED CONSTANTS" comment block, following the file's existing porting convention.
- Also consumes: `state.runsBySlug[slug]` (already populated by `ensureRunsLoaded`/`loadRuns` — array of run documents, each `{ _id, audit_date, findings, project, ... }`), `SEVERITY_COLORS`, `SEVERITY_LABELS`, the `.chip`/`.fileref`/`.table-wrap`/`table` CSS classes and the `el()` helper (all already defined earlier in the file).
- Produces: nothing consumed by another task — this is the last task in the plan.

- [ ] **Step 1: Port `diffFindings` into `index.html`**

Find the line `const state = {` (by Task 6 time this is preceded by Task 4's `checklistKey` function, not the original constants block directly — that's expected, ignore whatever sits immediately above it). Insert the new ported-function block directly before that `const state = {` line, regardless of what currently precedes it:

```js
  /* =====================================================================
   * PORTED FUNCTION (verbatim from docs/security-audit/studio/lib/report-derive.mjs)
   * ===================================================================== */
  function findingKey(f) {
    return `${f.file}:${f.line}:${f.id}`;
  }
  function diffFindings(runA, runB) {
    const findingsA = runA.findings || [];
    const findingsB = runB.findings || [];
    const keysA = new Set(findingsA.map(findingKey));
    const keysB = new Set(findingsB.map(findingKey));
    return {
      fixed: findingsA.filter(f => !keysB.has(findingKey(f))),
      new: findingsB.filter(f => !keysA.has(findingKey(f))),
      unchanged: findingsB.filter(f => keysA.has(findingKey(f))),
    };
  }
```

- [ ] **Step 2: Add compare-mode state**

In the global `state` object (already extended by Task 4 with `checklistState`), add two more fields:

```js
  const state = {
    manifest: null, slugs: [], runsBySlug: {}, runErrors: {},
    openSlug: null, activeSlug: null, activeRunId: null,
    hiddenSlugs: loadHiddenSlugs(),
    checklistState: loadChecklistState(),
    compareSlug: null, compareDates: null,
  };
```

- [ ] **Step 3: Add the "Comparar auditorias" control to the sidebar**

Inside `renderSidebar()`, the block that appends the run list when a project is open currently ends with:

```js
        item.appendChild(runList);
      }
      list.appendChild(item);
    }
  }
```

Change it to also append a compare control when there are 2+ runs, right after `item.appendChild(runList);`:

```js
        item.appendChild(runList);
        if (!state.runErrors[slug] && runs.length >= 2) {
          const compareBtn = el('button', {
            class: 'btn no-print', type: 'button', style: 'margin:6px 0 6px 26px;font-size:12px;padding:5px 10px;',
            onclick: () => openCompare(slug),
          }, ['Comparar auditorias']);
          item.appendChild(compareBtn);
        }
      }
      list.appendChild(item);
    }
  }
```

- [ ] **Step 4: Add `openCompare` and the compare-selection/report functions**

Immediately after `selectRun` (which ends around line 695 with `}`), insert:

```js
  /** Opens the compare-runs view for `slug`, defaulting to its two most
   * recent runs (index 0 = newest, per loadRuns' descending sort). */
  function openCompare(slug) {
    const runs = state.runsBySlug[slug] || [];
    if (runs.length < 2) return;
    state.compareSlug = slug;
    state.compareDates = { a: runs[1]._id, b: runs[0]._id };
    state.activeSlug = null;
    state.activeRunId = null;
    renderSidebar();
    renderCompare();
  }

  function renderCompareRowList(title, findings) {
    if (findings.length === 0) {
      return el('div', {}, [
        el('h3', { style: 'font-size:14px;margin:16px 0 8px;', text: `${title} (0)` }),
        el('p', { style: 'color:var(--text-muted);font-size:13px;', text: 'Nenhum.' }),
      ]);
    }
    const tbody = el('tbody', {}, findings.map(f => el('tr', {}, [
      el('td', {}, [el('span', { class: 'chip', style: `background:${SEVERITY_COLORS[f.severity]}`, text: SEVERITY_LABELS[f.severity] })]),
      el('td', { class: 'fileref' }, [el('span', { class: 'fid', text: f.id }), ' · ', `${f.file}:${f.line}`]),
      el('td', { text: f.desc }),
    ])));
    const table = el('table', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Severidade' }), el('th', { text: 'Ficheiro : linha' }), el('th', { text: 'Descrição' }),
      ])]),
      tbody,
    ]);
    return el('div', {}, [
      el('h3', { style: 'font-size:14px;margin:16px 0 8px;', text: `${title} (${findings.length})` }),
      el('div', { class: 'table-wrap' }, [table]),
    ]);
  }

  function renderCompare() {
    const slug = state.compareSlug;
    const runs = state.runsBySlug[slug] || [];
    document.getElementById('toolbar-info').innerHTML = '';
    document.getElementById('toolbar-info').appendChild(
      el('span', {}, [el('strong', { text: slug }), ` — comparar auditorias`])
    );

    const dateOptions = runs.map(r => el('option', { value: r._id, text: r.audit_date || r._id }));
    const selectA = el('select', { 'aria-label': 'Auditoria A (mais antiga)' }, dateOptions.map(o => o.cloneNode(true)));
    selectA.value = state.compareDates.a;
    selectA.addEventListener('change', () => { state.compareDates.a = selectA.value; renderCompare(); });
    const selectB = el('select', { 'aria-label': 'Auditoria B (mais recente)' }, dateOptions.map(o => o.cloneNode(true)));
    selectB.value = state.compareDates.b;
    selectB.addEventListener('change', () => { state.compareDates.b = selectB.value; renderCompare(); });

    const runA = runs.find(r => r._id === state.compareDates.a);
    const runB = runs.find(r => r._id === state.compareDates.b);
    const root = document.getElementById('report-root');
    root.innerHTML = '';
    if (!runA || !runB) {
      root.appendChild(el('p', { text: 'Escolhe duas auditorias para comparar.' }));
      return;
    }
    const diff = diffFindings(runA, runB);
    root.appendChild(el('section', { class: 'report-page' }, [
      el('div', { class: 'section-eyebrow', text: 'Comparação' }),
      el('h2', { class: 'section-title', text: `${slug}: comparar auditorias` }),
      el('div', { class: 'no-print', style: 'display:flex;gap:16px;align-items:center;margin-bottom:18px;' }, [
        el('label', {}, ['A (mais antiga): ', selectA]),
        el('label', {}, ['B (mais recente): ', selectB]),
      ]),
      renderCompareRowList('Corrigidos', diff.fixed),
      renderCompareRowList('Novos', diff.new),
      renderCompareRowList('Ainda presentes', diff.unchanged),
    ]));
  }
```

- [ ] **Step 5: Manual verification**

```bash
cd /var/home/lmilani/Documentos/IDE/auditoria/docs/security-audit/studio
python3 -m http.server 8795 &
sleep 1
```

Open `http://localhost:8795/index.html`. Every existing sample project has only one run each (`amigo-secreto`, `redesocialx`), so the "Comparar auditorias" button won't appear on real data yet — that's expected, not a bug (spec requires 2+ runs). To verify the view itself renders correctly, temporarily duplicate a run for a manual check only (do not commit this data change):

```bash
cp data/redesocialx/2026-09-09.json data/redesocialx/2026-09-10.json
python3 -c "
import json
d = json.load(open('data/redesocialx/2026-09-10.json'))
d['audit_date'] = '2026-09-10'
d['findings'] = d['findings'][:-1]  # drop the last finding, to get a non-empty 'fixed' list
json.dump(d, open('data/redesocialx/2026-09-10.json', 'w'))
"
python3 -c "
import json
idx = json.load(open('data/index.json'))
for p in idx['projects']:
    if p['slug'] == 'redesocialx':
        p['runs'].append('2026-09-10')
json.dump(idx, open('data/index.json', 'w'))
"
```

Reload the browser, open `redesocialx` in the sidebar. Expected: "Comparar auditorias" button now appears under its two runs. Click it. Expected: the report area switches to a "Comparar auditorias" view with two date dropdowns (defaulting to the two runs) and three sub-lists — "Corrigidos" should show exactly the one finding that was dropped from the `2026-09-10` fixture, "Novos" should be empty, "Ainda presentes" should list the rest.

```bash
kill %1
git checkout -- data/index.json
rm data/redesocialx/2026-09-10.json
```

(The `git checkout`/`rm` above are mandatory cleanup — this step must never leave the fixture-duplication changes in the working tree.)

- [ ] **Step 6: Run the regression suite**

```bash
node --test lib/*.test.mjs
```

Expected: `tests 31`, `pass 31`, `fail 0` (this task only touches `index.html`).

- [ ] **Step 7: Confirm the working tree is clean of the manual-verification fixture**

```bash
cd /var/home/lmilani/Documentos/IDE/auditoria
git status
```

Expected: only `docs/security-audit/studio/index.html` shows as modified — nothing under `docs/security-audit/studio/data/`.

- [ ] **Step 8: Commit**

```bash
git add docs/security-audit/studio/index.html
git commit -m "$(cat <<'EOF'
feat(studio): compare-runs view for projects with 2+ audits

Adds a "Comparar auditorias" control under a project's run list
(shown once it has 2+ runs) that renders fixed/new/unchanged findings
between any two of its runs, using diffFindings() ported inline
(index.html has no bundler and can't import lib/report-derive.mjs).
Purely client-side — no new data files, computed from the run
documents already fetched for the sidebar.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```
