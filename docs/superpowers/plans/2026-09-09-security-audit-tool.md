# Security & RGPD Audit Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the one-off Notely audit prompt into a reusable pair — a global Claude Code skill that audits any target repo for the 12 fixed security/RGPD categories, and a browser Artifact ("Audit Report Studio") that stores and renders every audit run across every project.

**Architecture:** Pure-logic pieces (schema validation, chart/report derivation, GitHub-issue markdown generation) are built and unit-tested in Node first (`docs/security-audit/studio/lib/`), then ported into the Artifact's inline `<script>` (Artifacts can't import local ES modules — only CDN scripts are allowed by the publish CSP) and duplicated, self-contained, into the skill's bundled validator so the skill works standalone in any repo, on any machine, without depending on this `auditoria/` project existing.

**Tech Stack:** Node.js (built-in `node:test` + `node:assert/strict`, no external deps) for the lib layer; a single static HTML/CSS/vanilla-JS file for the Artifact; Markdown + YAML frontmatter for the Claude Code skill.

**Spec:** `docs/superpowers/specs/2026-09-09-security-audit-tool-design.md`

## Precondition

This plan assumes the user has run `git init` (and committed the existing
`docs/security-audit/{data.py,requirements.txt,*.pdf,.gitignore}` if
desired) in `/var/home/lmilani/Documentos/IDE/auditoria` before Task 1
starts — the user said they'd do this themselves. If no repo exists yet
when a task's commit step runs, stop and ask before running `git init`
unprompted.

`~/.claude/skills/` is **not** a git repository. Task 6 writes files there
but has no commit step — just Write/Edit, verified by re-reading the file.

## Global Constraints

- Zero speculation in findings — every finding backed by a real file:line
  and a verbatim code snippet. (from spec)
- Severity enum is exactly `critica | alta | media | baixa | informativa`.
  (from spec)
- Fixed severity/strength color palette: crítica `#B91C1C`, alta
  `#EA580C`, média `#D97706`, baixa `#2563EB`, ponto forte `#059669`.
  (from spec) `informativa` has no palette color from the source prompt;
  this plan assigns `#6B7280` (neutral gray) as the missing 5th color —
  call this out to the user as a judgment call, not a spec requirement.
- The 12 categories are fixed, in this exact order and these exact names
  (verbatim from the original v2 prompt / `data.py`'s `CATEGORIES`):
  1 Banco sem tranca (isolamento), 2 Permissão definida no navegador,
  3 IDOR, 4 Chaves expostas, 5 Inputs sem tratamento (XSS),
  6 Autenticação e sessões, 7 SSRF,
  8 Integridade de escrita (CSRF/path/upload), 9 Rate limiting e força
  bruta, 10 Dependências e IaC, 11 Vazamento de informação,
  12 Compliance RGPD. (from spec, matches `data.py`)
- No server-side PDF generation — export is the browser's native
  print-to-PDF via `@media print`. (from spec)
- The browser side never analyzes code; it only renders/exports data
  produced by a Claude Code session. (from spec, user-confirmed)

---

## Task 1: Shared constants and findings validator

**Files:**
- Create: `docs/security-audit/studio/lib/constants.mjs`
- Create: `docs/security-audit/studio/lib/constants.test.mjs`
- Create: `docs/security-audit/studio/lib/validate-findings.mjs`
- Create: `docs/security-audit/studio/lib/validate-findings.test.mjs`

**Interfaces:**
- Produces: `CATEGORY_NAMES` (object, keys `1`..`12` → Portuguese name
  strings), `SEVERITY_ORDER` (array of 5 severity strings, fixed order
  critica→informativa), `SEVERITY_COLORS` (object, same keys as
  `SEVERITY_ORDER`, hex strings), `STRENGTH_COLOR` (hex string),
  `RGPD_STATUS_VALUES` (array of 4 status strings) — all from
  `constants.mjs`, all consumed by Tasks 2, 3, 5.
- Produces: `validateFindings(data)` from `validate-findings.mjs` →
  `{ valid: boolean, errors: string[] }` — consumed by Task 4 (validate
  the sample fixture) and Task 6 (bundled standalone copy in the skill).

- [ ] **Step 1: Write `constants.mjs`**

```js
export const CATEGORY_NAMES = {
  1: 'Banco sem tranca (isolamento)',
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

export const SEVERITY_ORDER = ['critica', 'alta', 'media', 'baixa', 'informativa']

export const SEVERITY_COLORS = {
  critica: '#B91C1C',
  alta: '#EA580C',
  media: '#D97706',
  baixa: '#2563EB',
  informativa: '#6B7280',
}

export const STRENGTH_COLOR = '#059669'

export const RGPD_STATUS_VALUES = ['conforme', 'nao_conforme', 'nao_verificada', 'nao_aplicavel']
```

- [ ] **Step 2: Write the failing test for `constants.mjs`**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORY_NAMES, SEVERITY_ORDER, SEVERITY_COLORS } from './constants.mjs'

test('CATEGORY_NAMES has exactly the 12 fixed ids', () => {
  assert.deepEqual(Object.keys(CATEGORY_NAMES).map(Number).sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
})

test('SEVERITY_ORDER and SEVERITY_COLORS share the same 5 keys', () => {
  assert.equal(SEVERITY_ORDER.length, 5)
  assert.deepEqual([...SEVERITY_ORDER].sort(), Object.keys(SEVERITY_COLORS).sort())
})
```

- [ ] **Step 3: Run it to confirm it passes (constants has no logic to get wrong, this is a smoke test)**

Run: `node --test docs/security-audit/studio/lib/constants.test.mjs`
Expected: 2 tests pass.

- [ ] **Step 4: Write the failing tests for `validate-findings.mjs` first**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { validateFindings } from './validate-findings.mjs'
import { CATEGORY_NAMES } from './constants.mjs'

function buildValidDoc() {
  const categories = Object.keys(CATEGORY_NAMES).map(Number).map(id => ({
    id, name: CATEGORY_NAMES[id], maturity: 50,
    applicable: id === 1, na_reason: id === 1 ? null : 'não se aplica ao escopo de teste',
  }))
  return {
    project: 'Fixture Co', audit_date: '2026-01-01', scope: 'teste',
    stack: [{ layer: 'Backend', detail: 'Node' }], methodology_note: 'nota',
    categories,
    findings: [{
      id: 'F1', category: 1, severity: 'alta', file: 'src/a.ts', line: 10,
      cwe: 'CWE-639', owasp: 'A01:2021', desc: 'd', code: 'c', why: 'w',
      impact: 'i', fix: 'f', acceptance: ['ok'], rgpd_article: null,
      exploitability_notes: null,
    }],
    strengths: [{ evidence: 'src/b.ts:1', note: 'ok', applies_to: ['security'] }],
    weaknesses: { security: ['x'], rgpd: [] },
    rgpd_panel: [{ id: '12.1', topic: 't', status: 'conforme', evidence: 'e' }],
    scans: [], sbom: [], limits: [], issue_groups: [['F1']],
  }
}

test('accepts a fully valid document', () => {
  const { valid, errors } = validateFindings(buildValidDoc())
  assert.equal(valid, true)
  assert.deepEqual(errors, [])
})

test('rejects a document missing a required top-level key', () => {
  const doc = buildValidDoc()
  delete doc.findings
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('findings')))
})

test('rejects an invalid severity value', () => {
  const doc = buildValidDoc()
  doc.findings[0].severity = 'urgente'
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('invalid severity')))
})

test('rejects a finding referencing an unknown category', () => {
  const doc = buildValidDoc()
  doc.findings[0].category = 99
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('unknown category')))
})

test('rejects issue_groups referencing an unknown finding id', () => {
  const doc = buildValidDoc()
  doc.issue_groups = [['F1', 'F404']]
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('F404')))
})

test('rejects a categories list missing one of the 12 fixed ids', () => {
  const doc = buildValidDoc()
  doc.categories = doc.categories.filter(c => c.id !== 12)
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('missing entry for id 12')))
})
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `node --test docs/security-audit/studio/lib/validate-findings.test.mjs`
Expected: FAIL — `validate-findings.mjs` does not exist yet.

- [ ] **Step 6: Write `validate-findings.mjs`**

```js
import { CATEGORY_NAMES, SEVERITY_ORDER, RGPD_STATUS_VALUES } from './constants.mjs'

const REQUIRED_TOP_LEVEL = [
  'project', 'audit_date', 'scope', 'stack', 'methodology_note',
  'categories', 'findings', 'strengths', 'weaknesses', 'rgpd_panel',
  'scans', 'sbom', 'limits', 'issue_groups',
]

const CATEGORY_IDS = Object.keys(CATEGORY_NAMES).map(Number)

export function validateFindings(data) {
  const errors = []

  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['root: expected an object'] }
  }

  for (const key of REQUIRED_TOP_LEVEL) {
    if (!(key in data)) errors.push(`root: missing required key "${key}"`)
  }

  if (data.audit_date && !/^\d{4}-\d{2}-\d{2}$/.test(data.audit_date)) {
    errors.push(`audit_date: "${data.audit_date}" must match YYYY-MM-DD`)
  }

  if (Array.isArray(data.categories)) {
    const seen = new Set()
    for (const cat of data.categories) {
      if (!CATEGORY_IDS.includes(cat.id)) {
        errors.push(`categories: unknown id ${cat.id}`)
        continue
      }
      seen.add(cat.id)
      if (typeof cat.maturity !== 'number' || cat.maturity < 0 || cat.maturity > 100) {
        errors.push(`categories[${cat.id}]: maturity must be a number 0-100`)
      }
      if (typeof cat.applicable !== 'boolean') {
        errors.push(`categories[${cat.id}]: applicable must be a boolean`)
      }
      if (cat.applicable === false && typeof cat.na_reason !== 'string') {
        errors.push(`categories[${cat.id}]: na_reason required (string) when applicable is false`)
      }
    }
    for (const id of CATEGORY_IDS) {
      if (!seen.has(id)) errors.push(`categories: missing entry for id ${id} (${CATEGORY_NAMES[id]})`)
    }
  } else {
    errors.push('categories: expected an array')
  }

  const findingIds = new Set()
  if (Array.isArray(data.findings)) {
    for (const f of data.findings) {
      const tag = f.id ?? '(no id)'
      if (!f.id) errors.push('findings: entry missing "id"')
      else findingIds.add(f.id)
      if (!CATEGORY_IDS.includes(f.category)) errors.push(`findings[${tag}]: unknown category ${f.category}`)
      if (!SEVERITY_ORDER.includes(f.severity)) errors.push(`findings[${tag}]: invalid severity "${f.severity}"`)
      if (typeof f.file !== 'string' || f.file.length === 0) errors.push(`findings[${tag}]: file must be a non-empty string`)
      if (typeof f.line !== 'number' || f.line <= 0) errors.push(`findings[${tag}]: line must be a positive number`)
      for (const strField of ['cwe', 'owasp', 'desc', 'code', 'why', 'impact', 'fix']) {
        if (typeof f[strField] !== 'string' || f[strField].length === 0) {
          errors.push(`findings[${tag}]: ${strField} must be a non-empty string`)
        }
      }
      if (!Array.isArray(f.acceptance) || f.acceptance.length === 0) {
        errors.push(`findings[${tag}]: acceptance must be a non-empty array`)
      }
      if (f.rgpd_article !== null && typeof f.rgpd_article !== 'string') {
        errors.push(`findings[${tag}]: rgpd_article must be a string or null`)
      }
      if (f.exploitability_notes !== null && typeof f.exploitability_notes !== 'string') {
        errors.push(`findings[${tag}]: exploitability_notes must be a string or null`)
      }
    }
  } else {
    errors.push('findings: expected an array')
  }

  if (Array.isArray(data.strengths)) {
    for (const [i, s] of data.strengths.entries()) {
      if (typeof s.evidence !== 'string' || !s.evidence) errors.push(`strengths[${i}]: evidence must be a non-empty string`)
      if (typeof s.note !== 'string' || !s.note) errors.push(`strengths[${i}]: note must be a non-empty string`)
      if (!Array.isArray(s.applies_to) || s.applies_to.some(v => !['security', 'rgpd'].includes(v))) {
        errors.push(`strengths[${i}]: applies_to must be an array of "security"/"rgpd"`)
      }
    }
  } else {
    errors.push('strengths: expected an array')
  }

  if (typeof data.weaknesses === 'object' && data.weaknesses !== null) {
    for (const key of ['security', 'rgpd']) {
      if (!Array.isArray(data.weaknesses[key])) errors.push(`weaknesses.${key}: expected an array`)
    }
  } else {
    errors.push('weaknesses: expected an object with security[] and rgpd[]')
  }

  if (Array.isArray(data.rgpd_panel)) {
    for (const [i, p] of data.rgpd_panel.entries()) {
      if (!RGPD_STATUS_VALUES.includes(p.status)) errors.push(`rgpd_panel[${i}]: invalid status "${p.status}"`)
    }
  } else {
    errors.push('rgpd_panel: expected an array')
  }

  if (Array.isArray(data.issue_groups)) {
    for (const [i, group] of data.issue_groups.entries()) {
      if (!Array.isArray(group) || group.length === 0) {
        errors.push(`issue_groups[${i}]: expected a non-empty array of finding ids`)
        continue
      }
      for (const fid of group) {
        if (!findingIds.has(fid)) errors.push(`issue_groups[${i}]: references unknown finding id "${fid}"`)
      }
    }
  } else {
    errors.push('issue_groups: expected an array')
  }

  return { valid: errors.length === 0, errors }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test docs/security-audit/studio/lib/validate-findings.test.mjs`
Expected: all 6 tests pass.

- [ ] **Step 8: Commit**

```bash
git add docs/security-audit/studio/lib/constants.mjs docs/security-audit/studio/lib/constants.test.mjs docs/security-audit/studio/lib/validate-findings.mjs docs/security-audit/studio/lib/validate-findings.test.mjs
git commit -m "feat: add shared constants and findings schema validator"
```

---

## Task 2: Report-derivation functions (severity/category counts, recommendation grouping)

**Files:**
- Create: `docs/security-audit/studio/lib/report-derive.mjs`
- Create: `docs/security-audit/studio/lib/report-derive.test.mjs`

**Interfaces:**
- Consumes: `CATEGORY_NAMES`, `SEVERITY_ORDER`, `SEVERITY_COLORS` from
  `./constants.mjs` (Task 1).
- Produces: `countBySeverity(findings)` → array of 5
  `{severity, count, color}`, `countByCategory(findings)` → array of 12
  `{id, name, count}`, `groupRecommendations(findings)` → array of
  `{priority: 'P1'|'P2'|..., severity, findings}` — all consumed by Task 5
  (Artifact page).

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { countBySeverity, countByCategory, groupRecommendations } from './report-derive.mjs'

const findings = [
  { id: 'F1', category: 1, severity: 'critica', file: 'b.ts', line: 5 },
  { id: 'F2', category: 1, severity: 'alta', file: 'a.ts', line: 20 },
  { id: 'F3', category: 3, severity: 'alta', file: 'a.ts', line: 10 },
  { id: 'F4', category: 3, severity: 'media', file: 'c.ts', line: 1 },
]

test('countBySeverity returns all 5 severities in fixed order, zero-filled', () => {
  const result = countBySeverity(findings)
  assert.deepEqual(result.map(r => r.severity), ['critica', 'alta', 'media', 'baixa', 'informativa'])
  assert.deepEqual(result.map(r => r.count), [1, 2, 1, 0, 0])
  assert.equal(result[0].color, '#B91C1C')
})

test('countByCategory returns all 12 categories in id order, zero-filled', () => {
  const result = countByCategory(findings)
  assert.equal(result.length, 12)
  assert.deepEqual(result.map(r => r.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  assert.equal(result[0].count, 2)
  assert.equal(result[2].count, 2)
  assert.equal(result[1].count, 0)
})

test('groupRecommendations skips empty severities and numbers priorities sequentially', () => {
  const groups = groupRecommendations(findings)
  assert.deepEqual(groups.map(g => g.priority), ['P1', 'P2', 'P3'])
  assert.deepEqual(groups.map(g => g.severity), ['critica', 'alta', 'media'])
  assert.equal(groups[1].findings.length, 2)
})

test('groupRecommendations sorts findings within a group by file then line', () => {
  const groups = groupRecommendations(findings)
  const altaGroup = groups.find(g => g.severity === 'alta')
  assert.deepEqual(altaGroup.findings.map(f => f.id), ['F3', 'F2'])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test docs/security-audit/studio/lib/report-derive.test.mjs`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `report-derive.mjs`**

```js
import { CATEGORY_NAMES, SEVERITY_ORDER, SEVERITY_COLORS } from './constants.mjs'

export function countBySeverity(findings) {
  const counts = Object.fromEntries(SEVERITY_ORDER.map(s => [s, 0]))
  for (const f of findings) counts[f.severity] += 1
  return SEVERITY_ORDER.map(severity => ({
    severity, count: counts[severity], color: SEVERITY_COLORS[severity],
  }))
}

export function countByCategory(findings) {
  const counts = Object.fromEntries(Object.keys(CATEGORY_NAMES).map(id => [Number(id), 0]))
  for (const f of findings) counts[f.category] += 1
  return Object.keys(CATEGORY_NAMES).map(Number).map(id => ({
    id, name: CATEGORY_NAMES[id], count: counts[id],
  }))
}

export function groupRecommendations(findings) {
  const groups = []
  let priorityIndex = 1
  for (const severity of SEVERITY_ORDER) {
    const matches = findings
      .filter(f => f.severity === severity)
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    if (matches.length === 0) continue
    groups.push({ priority: `P${priorityIndex}`, severity, findings: matches })
    priorityIndex += 1
  }
  return groups
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test docs/security-audit/studio/lib/report-derive.test.mjs`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add docs/security-audit/studio/lib/report-derive.mjs docs/security-audit/studio/lib/report-derive.test.mjs
git commit -m "feat: add report-derivation functions for charts and recommendations"
```

---

## Task 3: GitHub-issue markdown generator

**Files:**
- Create: `docs/security-audit/studio/lib/issue-markdown.mjs`
- Create: `docs/security-audit/studio/lib/issue-markdown.test.mjs`

**Interfaces:**
- Consumes: nothing from prior tasks (pure function of `findings` +
  `issue_groups` shapes already fixed by the schema).
- Produces: `buildIssueMarkdown(groupIds, findingsById, index)` → string,
  `buildAllIssues(issueGroups, findings)` → array of strings — consumed by
  Task 5 (Artifact page's "Issues para o GitHub" section).

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildIssueMarkdown, buildAllIssues } from './issue-markdown.mjs'

const f1 = {
  id: 'F1', category: 1, severity: 'critica', file: 'a.ts', line: 42,
  desc: 'Listagem sem filtro de tenant', code: 'findMany({})', why: 'sem where',
  impact: 'vazamento cross-tenant', fix: 'adicionar where: {spaceId}',
  acceptance: ['retorna 0 de outros spaces'], rgpd_article: null,
}
const r1 = {
  id: 'R1', category: 12, severity: 'media', file: 'b.tsx', line: 12,
  desc: 'Checkbox pre-marcada', code: 'checked={true}', why: 'sem opt-in',
  impact: 'base legal invalida', fix: 'desmarcar por padrao',
  acceptance: ['checkbox desmarcada'], rgpd_article: 'Art. 7',
}

test('buildIssueMarkdown wraps a single finding in numbered delimiters', () => {
  const md = buildIssueMarkdown(['F1'], new Map([['F1', f1]]), 1)
  assert.ok(md.startsWith('--- ISSUE 1 ---'))
  assert.ok(md.trim().endsWith('--- FIM ISSUE 1 ---'))
  assert.ok(md.includes('**Labels:** security, critica'))
  assert.ok(md.includes('- [ ] retorna 0 de outros spaces'))
})

test('buildIssueMarkdown adds the rgpd label when any finding in the group cites an article', () => {
  const md = buildIssueMarkdown(['R1'], new Map([['R1', r1]]), 2)
  assert.ok(md.includes('**Labels:** security, media, rgpd'))
})

test('buildIssueMarkdown groups multiple findings into one issue with both ids in the title', () => {
  const map = new Map([['F1', f1], ['R1', r1]])
  const md = buildIssueMarkdown(['F1', 'R1'], map, 3)
  assert.ok(md.includes('F1, R1'))
  assert.ok(md.includes('#### F1'))
  assert.ok(md.includes('#### R1'))
})

test('buildAllIssues numbers issues sequentially starting at 1', () => {
  const issues = buildAllIssues([['F1'], ['R1']], [f1, r1])
  assert.equal(issues.length, 2)
  assert.ok(issues[0].startsWith('--- ISSUE 1 ---'))
  assert.ok(issues[1].startsWith('--- ISSUE 2 ---'))
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test docs/security-audit/studio/lib/issue-markdown.test.mjs`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `issue-markdown.mjs`**

```js
import { SEVERITY_ORDER } from './constants.mjs'

export function buildIssueMarkdown(groupIds, findingsById, index) {
  const group = groupIds.map(id => findingsById.get(id))
  const severities = group.map(f => f.severity)
  const worstSeverity = SEVERITY_ORDER.find(s => severities.includes(s))
  const labels = ['security', worstSeverity]
  if (group.some(f => f.rgpd_article)) labels.push('rgpd')

  const title = group.length === 1
    ? group[0].desc.slice(0, 80)
    : `${group.length} achados relacionados: ${group.map(f => f.id).join(', ')}`

  const sections = group.map(f => [
    `#### ${f.id} — ${f.file}:${f.line}`,
    '',
    `**Descrição:** ${f.desc}`,
    '',
    '**Evidência:**',
    '```',
    f.code,
    '```',
    '',
    `**Por que é explorável:** ${f.why}`,
    '',
    `**Impacto:** ${f.impact}`,
    '',
    `**Sugestão de correção:** ${f.fix}`,
    '',
    '**Critérios de aceite:**',
    ...f.acceptance.map(a => `- [ ] ${a}`),
  ].join('\n'))

  return [
    `--- ISSUE ${index} ---`,
    `## [Segurança] ${title}`,
    '',
    `**Labels:** ${labels.join(', ')}`,
    '',
    ...sections,
    '',
    `--- FIM ISSUE ${index} ---`,
  ].join('\n')
}

export function buildAllIssues(issueGroups, findings) {
  const findingsById = new Map(findings.map(f => [f.id, f]))
  return issueGroups.map((group, i) => buildIssueMarkdown(group, findingsById, i + 1))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test docs/security-audit/studio/lib/issue-markdown.test.mjs`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add docs/security-audit/studio/lib/issue-markdown.mjs docs/security-audit/studio/lib/issue-markdown.test.mjs
git commit -m "feat: add GitHub-issue markdown generator"
```

---

## Task 4: Notely sample fixture (validation data)

**Files:**
- Create: `docs/security-audit/studio/samples/notely.json`

**Interfaces:**
- Consumes: `validateFindings` from `./lib/validate-findings.mjs` (Task 1),
  to check this file at the end of the task.
- Produces: a schema-valid audit document consumed by Task 5 (seeded into
  the Artifact's DB to validate rendering end-to-end).

- [ ] **Step 1: Write `docs/security-audit/studio/samples/notely.json`**

Hand-converted from `docs/security-audit/data.py` (the prior "Notely"
sample run) into the new schema. `heat` fields from the source are
dropped (not part of the new schema — maturity now lives on `categories`,
not per-finding).

```json
{
  "project": "Notely",
  "audit_date": "2026-09-01",
  "scope": "Aplicacao SaaS de notas e espacos colaborativos - backend Express/Prisma, frontend Next.js, deploy Docker/Terraform (AWS eu-west-1).",
  "stack": [
    { "layer": "Backend", "detail": "TypeScript 5.3 / Node.js 18 LTS / Express 4.18" },
    { "layer": "ORM / DB", "detail": "Prisma 5.6 (PostgreSQL 15)" },
    { "layer": "Autenticacao", "detail": "JWT RS256 (JWKS) + RBAC custom (roles: admin, member)" },
    { "layer": "Frontend", "detail": "Next.js 13.4 (App Router) + React 18 + Tailwind" },
    { "layer": "Sanitizacao", "detail": "DOMPurify presente no package.json, NAO aplicado" },
    { "layer": "Deploy / IaC", "detail": "Docker + docker-compose + Terraform (AWS eu-west-1) + GitHub Actions" },
    { "layer": "Dados pessoais", "detail": "PII: email, nome, notas, activity log, health form (Art. 9), telemetria" },
    { "layer": "Terceiros", "detail": "PostHog (analytics), Sentry (crash), Resend (e-mail), Cloudflare (CDN)" }
  ],
  "methodology_note": "Isolamento mapeado para filtro manual por spaceId nas queries Prisma (sem RLS, sem middleware de tenant); papeis mapeados para RBAC custom (middleware requireRole ausente em mutacoes); demais categorias mapeadas 1:1 a stack Express/Next.js/Terraform detectada.",
  "categories": [
    { "id": 1, "name": "Banco sem tranca (isolamento)", "maturity": 55, "applicable": true, "na_reason": null },
    { "id": 2, "name": "Permissão definida no navegador", "maturity": 40, "applicable": true, "na_reason": null },
    { "id": 3, "name": "IDOR", "maturity": 35, "applicable": true, "na_reason": null },
    { "id": 4, "name": "Chaves expostas", "maturity": 60, "applicable": true, "na_reason": null },
    { "id": 5, "name": "Inputs sem tratamento (XSS)", "maturity": 65, "applicable": true, "na_reason": null },
    { "id": 6, "name": "Autenticação e sessões", "maturity": 30, "applicable": true, "na_reason": null },
    { "id": 7, "name": "SSRF", "maturity": 50, "applicable": true, "na_reason": null },
    { "id": 8, "name": "Integridade de escrita (CSRF/path/upload)", "maturity": 45, "applicable": true, "na_reason": null },
    { "id": 9, "name": "Rate limiting e força bruta", "maturity": 40, "applicable": true, "na_reason": null },
    { "id": 10, "name": "Dependências e IaC", "maturity": 55, "applicable": true, "na_reason": null },
    { "id": 11, "name": "Vazamento de informação", "maturity": 50, "applicable": true, "na_reason": null },
    { "id": 12, "name": "Compliance RGPD", "maturity": 60, "applicable": true, "na_reason": null }
  ],
  "findings": [
    { "id": "F1", "category": 1, "severity": "critica", "file": "apps/api/src/routes/notes.ts", "line": 42, "cwe": "CWE-639", "owasp": "A01:2021", "desc": "Listagem de notas nao filtra por spaceId/usuario: devolve todas as notas de todos os espacos.", "code": "const notes = await prisma.note.findMany({});  // sem filtro de tenant", "why": "Qualquer usuario autenticado lista notas de outros inquilinos ao chamar GET /api/notes.", "impact": "Exposicao transversal de dados (cross-tenant) de todos os clientes.", "fix": "Injetar scope obrigatorio: prisma.note.findMany({ where: { spaceId: session.spaceId } }).", "acceptance": ["GET /api/notes retorna 0 notas de outros spaces", "Teste com 2 contas em spaces distintos"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F2", "category": 1, "severity": "alta", "file": "apps/api/src/routes/team.ts", "line": 88, "cwe": "CWE-639", "owasp": "A01:2021", "desc": "Exportacao CSV de atividade agrega registros de todos os tenants sem WHERE por inquilino.", "code": "SELECT * FROM activity WHERE space_id = ANY(...)  // agrega todos", "why": "O endpoint /api/teams/export recebe ?spaceIds= e nao valida pertencimento de cada id.", "impact": "Exfiltracao de dados de atividade (PII) de outras organizacoes.", "fix": "Validar pertencimento de cada spaceId antes de agregar; adicionar filtro de tenant no SQL.", "acceptance": ["Export contendo espaco de outro tenant retorna erro", "Query SQL final tem WHERE tenant_id"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F3", "category": 2, "severity": "critica", "file": "apps/web/src/pages/settings/TeamSettings.tsx", "line": 15, "cwe": "CWE-862", "owasp": "A01:2021", "desc": "O botao de excluir time fica escondido para nao-admins na UI, mas DELETE /api/teams/:id nao valida papel.", "code": "{isAdmin && <DeleteTeamButton/>}  // gate apenas na UI", "why": "apps/api/src/routes/team.ts:120 registra router.delete('/:id', auth, handler) sem requireRole('admin').", "impact": "Qualquer membro pode excluir/alterar configuracoes do time (escrita privilegiada).", "fix": "Adicionar middleware de autorizacao requireRole('admin') em todas as mutacoes de team.", "acceptance": ["DELETE sem papel admin retorna 403", "Teste automatizado cobre rota com role member"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F4", "category": 3, "severity": "critica", "file": "apps/api/src/routes/notes.ts", "line": 66, "cwe": "CWE-639", "owasp": "A01:2021", "desc": "Exclusao de nota por ID sem verificar se a nota pertence ao usuario/space do chamador.", "code": "router.delete('/:id', auth, async (req, res) => { await prisma.note.delete({ where: { id } }); });", "why": "Nao ha where:{ ownerId } nem verificacao de posse antes do delete.", "impact": "Delecao/IDOR: qualquer usuario apaga recursos de qualquer outro usuario.", "fix": "Buscar nota com ownerId do token; 404/403 se nao pertencer; excluir com where composto.", "acceptance": ["Deletar nota alheia retorna 404", "Notas de outros users permanecem no banco"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F5", "category": 3, "severity": "alta", "file": "apps/api/src/routes/team.ts", "line": 55, "cwe": "CWE-639", "owasp": "A01:2021", "desc": "Lista de membros de um time sem validar que o chamador pertence ao time.", "code": "router.get('/:teamId/members', auth, async (req, res) => { ... });", "why": "apps/api/src/middleware/team.ts valida posse apenas em GET /api/teams/:id, nao no sub-recurso members.", "impact": "Vazamento de PII (nomes/e-mails de membros) de times privados de outras empresas.", "fix": "Aplicar middleware de membership no sub-recurso /:teamId/* com verificacao de posse.", "acceptance": ["GET members de time alheio retorna 403", "Middleware aplicado a todas as rotas /:teamId/*"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F6", "category": 4, "severity": "alta", "file": "docker-compose.yml", "line": 12, "cwe": "CWE-798", "owasp": "A07:2021", "desc": "Segredo de assinatura JWT com default publico e sem validacao de startup que rejeite o default.", "code": "JWT_SECRET=${JWT_SECRET:-dev-secret-notely}  # default publico", "why": "Se JWT_SECRET nao for injetado, producao assina tokens com 'dev-secret-notely' conhecido.", "impact": "Forjar tokens JWT e acessar qualquer conta com papel admin.", "fix": "Remover default; falhar no boot se a env nao existir; usar secrets manager.", "acceptance": ["Boot falha sem JWT_SECRET", "gitleaks nao encontra o default no repo"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F7", "category": 4, "severity": "alta", "file": "apps/api/.env (git history, commit a1b2c3d)", "line": 1, "cwe": "CWE-798", "owasp": "A07:2021", "desc": "Chave real de producao commitada em .env e removida depois; ainda acessivel no git history.", "code": "STRIPE_API_KEY=sk_live_51N3x...  // removida do HEAD mas presente no historico", "why": "gitleaks localizou a chave no commit a1b2c3d; quem tiver acesso ao repo pode extraí-la.", "impact": "Fraude/comprometimento de pagamentos; chave precisa ser rotacionada.", "fix": "Rotacionar chave; purgar historico (filter-repo); adicionar gitleaks no pre-commit e CI.", "acceptance": ["Chave revogada na Stripe", "gitleaks limpo no reflog/historico filtrado"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F8", "category": 5, "severity": "alta", "file": "apps/web/src/components/NoteContent.tsx", "line": 9, "cwe": "CWE-79", "owasp": "A03:2021", "desc": "Conteudo de nota (HTML do usuario) renderizado sem sanitizacao apesar de DOMPurify estar no package.json.", "code": "<div dangerouslySetInnerHTML={{ __html: note.content }} />  // sem DOMPurify", "why": "Outro usuario pode criar nota com <img src=x onerror=alert(document.cookie)>.", "impact": "XSS persistente entre usuarios (roubo de sessao, execucao no contexto admin).", "fix": "Sanitizar com DOMPurify no client e com lib equivalente no servidor antes de persistir.", "acceptance": ["Payload XSS nao renderiza script", "DOMPurify aplicado ao render"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F9", "category": 5, "severity": "media", "file": "apps/api/src/services/mailer.ts", "line": 31, "cwe": "CWE-80", "owasp": "A03:2021", "desc": "Nome do usuario interpolado em e-mail HTML sem escape/espacao.", "code": "`<p>Ola, ${user.name}</p>`  // interpolacao sem escape", "why": "Nome controlado por usuario com <b>/<script> quebra o template e pode virar phishing/XSS no cliente de e-mail.", "impact": "Phishing direcionado e injecao em template de e-mail.", "fix": "Escape de HTML ou uso de template engine com autoescape para campos do usuario.", "acceptance": ["Nome com <script> e exibido literalmente", "Teste unitario do template"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F10", "category": 6, "severity": "critica", "file": "apps/api/src/lib/password.ts", "line": 8, "cwe": "CWE-916", "owasp": "A02:2021", "desc": "Senhas armazenadas com SHA-256 simples, sem salt e sem algoritmo de derivacao lento.", "code": "crypto.createHash('sha256').update(pw).digest('hex')  // hash sem sal e rapido", "why": "Banco vazado permite brute-force offline imediato de senhas (sem custo computacional).", "impact": "Comprometimento em massa de contas com senhas recuperaveis.", "fix": "Migrar para argon2id/bcrypt com salt por usuario; rehash em login.", "acceptance": ["Nenhuma senha SHA-256 em repouso", "Migracao backfill executada e verificada"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F11", "category": 6, "severity": "media", "file": "apps/api/src/routes/auth.ts", "line": 40, "cwe": "CWE-287", "owasp": "A07:2021", "desc": "Login de administradores sem exigencia de segundo fator.", "code": "router.post('/login', loginHandler)  // sem MFA/2FA", "why": "Credenciais vazadas (F6/F10) bastam para acesso admin; nao ha TOTP/WebAuthn.", "impact": "Account takeover de administradores com impacto total no produto.", "fix": "Exigir MFA para funcoes privilegiadas (admin, suporte) e eventos sensiveis.", "acceptance": ["Admin sem 2FA nao acessa area administrativa", "Configuracao de MFA documentada"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F12", "category": 6, "severity": "alta", "file": "apps/api/src/routes/auth.ts", "line": 120, "cwe": "CWE-640", "owasp": "A07:2021", "desc": "Token de reset de senha numerico de 6 digitos sem tentativa de limite/rate limit.", "code": "token = Math.floor(100000 + Math.random()*900000)  // 6 digitos, 5 min", "why": "Espaco de 1e6 combinacoes; forca bruta online (categoria 9) viabiliza takeover.", "impact": "Account takeover via reset de senha.", "fix": "Token aleatorio de alta entropia, expiracao, invalidacao pos-uso e limitacao de tentativas.", "acceptance": ["Reset com token errado bloqueia apos 5 tentativas", "Token e UUID/256 bits"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F13", "category": 7, "severity": "alta", "file": "apps/api/src/services/import.ts", "line": 33, "cwe": "CWE-918", "owasp": "A10:2021", "desc": "URL de usuario buscada pelo servidor (preview de link) sem allowlist/denylist de hosts, sem bloqueio de IP interno e seguindo redirects.", "code": "const resp = await fetch(userUrl);  // preview de link, sem allowlist", "why": "SSRF: URL pode apontar para 169.254.169.254 (metadata AWS) ou servicos internos; resposta pode ser refletida ao usuario.", "impact": "Acesso ao metadata da nuvem e a servicos internos; exfiltracao via resposta.", "fix": "Allowlist de dominios, bloqueio de IPs internos/link-local, proibicao de redirects, timeout e validacao de protocolo.", "acceptance": ["URL para 169.254.169.254 bloqueada", "Redirect a IP interno bloqueado"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F14", "category": 8, "severity": "media", "file": "apps/api/src/routes/webhook.ts", "line": 19, "cwe": "CWE-352", "owasp": "A01:2021", "desc": "Cookies de API com SameSite=None e mutacoes sem token CSRF nem verificacao de Origin.", "code": "app.use(cors({ origin: true, credentials: true }))  // cookies SameSite=None", "why": "Sites maliciosos podem disparar mutacoes cross-origin com credenciais do usuario (CSRF).", "impact": "Acoes nao autorizadas em nome do usuario (CSRF).", "fix": "Restringir CORS a origem confiavel, SameSite=Lax/Strict e validar Origin/CSRF token em mutacoes.", "acceptance": ["Requisicao cross-origin sem token retorna 403", "cors() com origem permitida explicita"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F15", "category": 8, "severity": "alta", "file": "apps/api/src/routes/import.ts", "line": 60, "cwe": "CWE-22", "owasp": "A01:2021", "desc": "Nome de arquivo enviado pelo usuario interpolado no caminho sem normalizacao nem validacao de conteudo.", "code": "const dest = path.join(UPLOAD_DIR, file.originalname);", "why": "originalname pode conter ../../ e sobrescrever arquivos arbitrarios (path traversal / zip-slip).", "impact": "Escrita arbitraria no servidor; potencial RCE via configuracao sobrescrita.", "fix": "Gerar nome aleatorio, validar tipo por conteudo (sniffing), limite de tamanho e armazenar fora da raiz publica.", "acceptance": ["Upload com ../../ nao escreve fora do diretorio", "HTML/SVG com script rejeitado"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F16", "category": 9, "severity": "alta", "file": "apps/api/src/routes/auth.ts", "line": 12, "cwe": "CWE-307", "owasp": "A07:2021", "desc": "Endpoints de login/reset sem rate limiting no codigo (depende de nginx com limite fixo nao documentado).", "code": "router.post('/login', loginHandler)  // sem rate limit no app", "why": "A categoria 12 (token de reset) e brutavel e credenciais podem ser testadas em massa.", "impact": "Brute force e credential stuffing contra contas.", "fix": "Rate limit por IP e por conta com backoff exponencial; lockout temporario.", "acceptance": ["10 falhas de login por conta/IP bloqueiam por 15 min", "Teste automatizado de rate limit"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F17", "category": 10, "severity": "media", "file": "package.json", "line": 45, "cwe": "CWE-1035", "owasp": "A06:2021", "desc": "Dependencia com CVE alcancavel e imagem base sem pin, ambas alem da politica de EOL.", "code": "\"next\": \"13.4.19\"  // CVE-2023-44487 (HTTP/2 DoS); Dockerfile: FROM node:18 (latest)", "why": "next@13.4.19 possui CVE conhecida; FROM node:18 sem tag especifica instala versoes imprevisiveis.", "impact": "DoS e builds nao reproduziveis com superficie de vulnerabilidades desconhecida.", "fix": "Atualizar dependencias, pin de imagem base com digest, habilitar Dependabot/CI de auditoria.", "acceptance": ["npm audit sem criticas", "Imagem base com digest fixado"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F18", "category": 10, "severity": "alta", "file": "terraform/main.tf", "line": 22, "cwe": "CWE-269", "owasp": "A01:2021", "desc": "Bucket S3 de exportacoes criado com ACL publica.", "code": "acl = \"public-read\"  # bucket de exportacoes", "why": "Exportacoes contem PII (relatorio CSV, categoria 1) e ficam legiveis publicamente.", "impact": "Vazamento publico de dados de clientes.", "fix": "Remover ACL publica, usar private + bucket policy restrita, verificar com checkov no CI.", "acceptance": ["Bucket sem ACL publica", "checkov limpo para o modulo de storage"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "F19", "category": 11, "severity": "media", "file": "apps/api/src/app.ts", "line": 10, "cwe": "CWE-209", "owasp": "A04:2021", "desc": "Stack trace completo em respostas de erro em producao e ausencia de headers de seguranca (CSP, HSTS).", "code": "app.use((err, req, res, next) => res.status(500).json({ error: err.stack }))  // + sem helmet", "why": "Detalhes internos e versoes auxiliam atacantes; sem CSP o XSS da categoria 5 amplifica.", "impact": "Reconhecimento facilitado e mitigacao de XSS prejudicada.", "fix": "Erros genericos em producao, helmet/secureHeaders com CSP e HSTS.", "acceptance": ["Resposta 500 nao contem stack", "Headers de seguranca presentes"], "rgpd_article": null, "exploitability_notes": null },
    { "id": "R1", "category": 12, "severity": "media", "file": "apps/web/src/components/forms/SignupForm.tsx", "line": 12, "cwe": "CWE-359", "owasp": "A04:2021", "desc": "Checkbox de marketing pre-marcada e sem registro de consentimento (timestamp, versao, finalidade).", "code": "<input type=\"checkbox\" checked={true} /> Marketing", "why": "RGPD Art. 7 exige opt-in explicito, nao pre-marcado, e registro auditavel do consentimento.", "impact": "Base legal de marketing invalida; risco de sancao (ate 4% do faturamento global).", "fix": "Opt-in desmarcado por padrao; persistir consentimento (quem, quando, versao, finalidade) e fluxo de retirada.", "acceptance": ["Checkbox desmarcada por padrao", "Tabela consent_log populada ao salvar"], "rgpd_article": "Art. 7", "exploitability_notes": null },
    { "id": "R2", "category": 12, "severity": "alta", "file": "apps/api/src/routes/users.ts", "line": 77, "cwe": "CWE-359", "owasp": "A04:2021", "desc": "'Excluir conta' so marca deletedAt: notas, activity, backups e logs continuam armazenando dados pessoais.", "code": "user.deletedAt = new Date();  // soft-delete apenas; notas/activity/backups ficam", "why": "RGPD Art. 17 exige apagamento efetivo; soft-delete nao atende ao direito ao esquecimento.", "impact": "Direito de apagamento inaplicavel; dados permanecem sob controle do controlador sem base.", "fix": "Apagar/anonimizar dados em cascata (tabelas, cache, logs, backups) ou anonimizacao irreversivel.", "acceptance": ["Apos exclusao, dados do usuario ausentes em todas as tabelas", "Backup restaurado nao contem PII ativa"], "rgpd_article": "Art. 17", "exploitability_notes": null },
    { "id": "R3", "category": 12, "severity": "media", "file": "apps/api/src/middleware/logger.ts", "line": 9, "cwe": "CWE-212", "owasp": "A09:2021", "desc": "Logs registram corpo completo de requisicoes contendo e-mail/CPF, sem expiracao.", "code": "logger.info('request', req.body)  // loga e-mail e corpo inteiro", "why": "Minimizacao (Art. 5(1)(c)) e retencao (Art. 5(1)(e)) violadas; logs sao coleta desnecessaria.", "impact": "Retencao de PII sem prazo; aumento de superficie em caso de vazamento de logs.", "fix": "Logar apenas metadados (id, rota, status), mascarar PII e aplicar retencao automatica.", "acceptance": ["Log nao contem corpo da requisicao", "Rotacao de logs com TTL configurada"], "rgpd_article": "Art. 5", "exploitability_notes": null },
    { "id": "R4", "category": 12, "severity": "media", "file": "apps/web/src/lib/analytics.ts", "line": 5, "cwe": "CWE-359", "owasp": "A04:2021", "desc": "Script de analytics (PostHog) carregado na primeira pagina sem banner/consentimento previo.", "code": "posthog.init('phc_xxx', { load: () => track_all() })  // carrega antes do consentimento", "why": "Cookies nao essenciais nao podem ser instalados antes de consentimento (ePrivacy/Art. 7).", "impact": "Rastreamento sem base legal; multa por cookies nao consentidos.", "fix": "Banner de cookies com gestao de preferencias; carregar trackers apenas apos opt-in.", "acceptance": ["Analytics nao inicia sem consentimento", "Preferencia de cookies persistida e reutilizada"], "rgpd_article": "Art. 7", "exploitability_notes": null },
    { "id": "R5", "category": 12, "severity": "baixa", "file": "apps/api/src/lib/expunge.ts", "line": 1, "cwe": "CWE-212", "owasp": "A04:2021", "desc": "Politica de retencao documentada, mas nenhum job de expurgo/expiracao implementado.", "code": "// TODO: job de expurgo nao implementado", "why": "Art. 5(1)(e): dados nao podem ser mantidos indefinidamente sem prazo.", "impact": "Acumulo de dados alem do necessario; risco incremental.", "fix": "Implementar job agendado de expurgo por idade e categoria, com metricas e alerta.", "acceptance": ["Job executa em staging e apaga registros vencidos", "Retencao configuravel por categoria"], "rgpd_article": "Art. 5", "exploitability_notes": null },
    { "id": "R6", "category": 12, "severity": "baixa", "file": "apps/web/src/app/privacy/page.tsx", "line": 3, "cwe": "CWE-359", "owasp": "A04:2021", "desc": "Politica de privacidade desatualizada e contradiz o que o codigo realmente faz (terceiros reais).", "code": "'Nao compartilhamos dados com terceiros'  // contradiz PostHog/Sentry/Resend", "why": "Art. 12-13 exigem informacao precisa; inconsistencia gera risco de enforcement e dano reputacional.", "impact": "Informacao enganosa ao titular; sancao por transparencia.", "fix": "Revisar politica com inventario real de dados, finalidades, terceiros e direitos.", "acceptance": ["Politica lista todos os processadores reais", "Data de revisao atualizada"], "rgpd_article": "Art. 12-13", "exploitability_notes": null },
    { "id": "R7", "category": 12, "severity": "alta", "file": "apps/web/src/components/forms/HealthForm.tsx", "line": 7, "cwe": "CWE-359", "owasp": "A04:2021", "desc": "Coleta de dados sensiveis (saude) como dado comum, sem consentimento explicito nem finalidade especifica.", "code": "// coleta condicoes de saude sem base legal especifica (Art. 9)", "why": "Art. 9 proibe tratamento de categorias especiais sem base propria; falha gera multa maxima.", "impact": "Tratamento ilicito de dados sensiveis; alto risco a direitos fundamentais.", "fix": "Consentimento explicito e destacado, minimizacao, DPIA e armazenamento com protecao adicional.", "acceptance": ["Campo de saude bloqueado sem consentimento explicito", "DPIA documentada para o modulo"], "rgpd_article": "Art. 9", "exploitability_notes": null },
    { "id": "R8", "category": 12, "severity": "media", "file": "apps/api/src/services/score.ts", "line": 22, "cwe": "CWE-359", "owasp": "A04:2021", "desc": "Pontuacao de credito/risco gerada por modelo sem fluxo de intervencao humana, explicacao ou revisao.", "code": "score = model.predict(features(user))  // decisao automatizada sem revisao humana", "why": "Art. 22: decisao automatizada com efeitos significativos exige direito a intervencao humana e explicacao.", "impact": "Titulares sem recurso efetivo contra decisoes automatizadas.", "fix": "Prever endpoint de revisao humana, explicacao e contestacao da decisao.", "acceptance": ["Titular pode solicitar revisao humana", "Decisao expoe explicacao ao titular"], "rgpd_article": "Art. 22", "exploitability_notes": null }
  ],
  "strengths": [
    { "evidence": "apps/api/src/middleware/auth.ts:14 - Middleware de autenticacao valida assinatura RS256, expiracao e emissor (JWKS) e e aplicado em todas as rotas sob /api.", "note": "Categoria 2/3: a autenticacao em si esta correta; o problema sao as rotas que a ignoram.", "applies_to": ["security", "rgpd"] },
    { "evidence": "apps/web/src/lib/session.ts:22 - Cookies de sessao com HttpOnly, Secure e SameSite=Lax.", "note": "Mitiga roubo de sessao por XSS (parcialmente, ate a categoria 5 ser corrigida).", "applies_to": ["security", "rgpd"] },
    { "evidence": "apps/api/src/routes/notes.ts:21 - Inputs de criacao de nota validados com schema zod (tamanho e tipo).", "note": "Categoria 5: reduz a superficie de injecao estrutural.", "applies_to": ["security", "rgpd"] },
    { "evidence": "apps/api/src/middleware/team.ts:31 - GET /api/teams/:id valida pertencimento do chamador ao time.", "note": "Categoria 3: padrao correto a ser replicado nos sub-recursos.", "applies_to": ["security", "rgpd"] },
    { "evidence": "terraform/main.tf:41 - Volumes de banco criados com encryption_at_rest habilitado (AWS KMS).", "note": "RGPD Art. 32: criptografia em repouso dos dados pessoais.", "applies_to": ["rgpd"] },
    { "evidence": "docs/incidentes/runbook.md - Runbook de resposta a incidente com notificacao a autoridade em ate 72h e registro de violacoes.", "note": "RGPD Art. 33-34: processo documentado.", "applies_to": ["rgpd"] }
  ],
  "weaknesses": {
    "security": [
      "Isolamento e posse fragilizados: rotas de listagem/exclusao/exportacao operam sem escopo de tenant ou dono (F1, F2, F4, F5).",
      "Autorizacao fragil: papel validado apenas na UI e nao no servidor em acoes privilegiadas (F3).",
      "Gestao de credenciais precaria: senhas SHA-256, secrets com default publico e chave real no historico git (F6, F7, F10)."
    ],
    "rgpd": [
      "Conformidade RGPD incompleta: consentimento invalido, exclusao soft-only, rastreamento sem opt-in e retencao indefinida (R1-R5)."
    ]
  },
  "rgpd_panel": [
    { "id": "12.1", "topic": "Base legal e consentimento (Art. 6, 7)", "status": "nao_conforme", "evidence": "SignupForm.tsx:12" },
    { "id": "12.2", "topic": "Cookies e rastreamento (ePrivacy)", "status": "nao_conforme", "evidence": "analytics.ts:5" },
    { "id": "12.3", "topic": "Direitos dos titulares (Art. 15-22)", "status": "nao_conforme", "evidence": "users.ts:77" },
    { "id": "12.4", "topic": "Minimizacao e retencao (Art. 5(1)(c),(e))", "status": "nao_conforme", "evidence": "logger.ts:9 / expunge.ts:1" },
    { "id": "12.5", "topic": "Seguranca e pseudonimizacao (Art. 32)", "status": "conforme", "evidence": "TLS 1.2+, KMS em repouso" },
    { "id": "12.6", "topic": "Transferencias internacionais (Art. 44-49)", "status": "conforme", "evidence": "eu-west-1 + SCC" },
    { "id": "12.7", "topic": "Processadores e terceiros (Art. 28)", "status": "nao_verificada", "evidence": "Sem DPA com Resend" },
    { "id": "12.8", "topic": "Notificacao de violacao (Art. 33-34)", "status": "conforme", "evidence": "runbook.md" },
    { "id": "12.9", "topic": "Privacidade por design e DPIA (Art. 25, 35)", "status": "conforme", "evidence": "Perfis privados por padrao" },
    { "id": "12.10", "topic": "Politica de privacidade (Art. 12-13)", "status": "nao_conforme", "evidence": "privacy/page.tsx:3" },
    { "id": "12.11", "topic": "Menores (Art. 8)", "status": "nao_aplicavel", "evidence": "B2B" },
    { "id": "12.12", "topic": "PII em locais indevidos", "status": "nao_verificada", "evidence": "Bundle nao rastreado" },
    { "id": "12.13", "topic": "Dados sensiveis (Art. 9)", "status": "nao_conforme", "evidence": "HealthForm.tsx:7" },
    { "id": "12.14", "topic": "Decisao automatizada e perfilagem (Art. 22)", "status": "nao_conforme", "evidence": "score.ts:22" },
    { "id": "12.15", "topic": "Trilha de auditoria de acesso a PII", "status": "nao_conforme", "evidence": "lib/audit.ts vazio" },
    { "id": "12.16", "topic": "Canais nao-code de exercicio de direitos", "status": "conforme", "evidence": "privacidade@notely.app + SLA 30d" }
  ],
  "scans": [
    { "tool": "gitleaks", "target": "git history", "found": 14, "reviewed": 3, "actionable": 1 },
    { "tool": "npm audit", "target": "package-lock.json", "found": 5, "reviewed": 2, "actionable": 1 },
    { "tool": "trivy", "target": "Dockerfile", "found": 8, "reviewed": 2, "actionable": 1 },
    { "tool": "checkov", "target": "terraform/", "found": 6, "reviewed": 2, "actionable": 1 },
    { "tool": "bundle scan", "target": "dist/", "found": 2, "reviewed": 0, "actionable": 0 }
  ],
  "sbom": [
    { "dep": "next", "version": "13.4.19", "note": "CVE-2023-44487 (media)", "action_needed": true },
    { "dep": "express", "version": "4.18.2", "note": "Sem CVE critica", "action_needed": false },
    { "dep": "argon2", "version": "nao presente", "note": "SUBSTITUIR SHA-256 (F10)", "action_needed": true },
    { "dep": "imagem base node", "version": "18 (latest)", "note": "Sem pin/digest (F17)", "action_needed": true },
    { "dep": "PostHog", "version": "SDK web", "note": "Carregado sem consentimento (R4)", "action_needed": true },
    { "dep": "Sentry", "version": "SDK web", "note": "OK", "action_needed": false },
    { "dep": "Resend", "version": "e-mail transacional", "note": "Sem DPA assinado (12.7)", "action_needed": true },
    { "dep": "Cloudflare", "version": "CDN", "note": "OK", "action_needed": false }
  ],
  "limits": [
    "Nenhum teste ativo de rede, forca bruta ou exploracao fora do ambiente local de desenvolvimento.",
    "Analise majoritariamente estatica; PoCs de alta/critica nao executadas contra ambiente real.",
    "Nao verificada a integridade de backups fisicos (restauracao) nem a configuracao do provedor de e-mail.",
    "A superficie de terceiros (12.7) depende de DPA que nao esta no repositorio."
  ],
  "issue_groups": [
    ["R1", "R4"], ["R3", "R5"],
    ["F1"], ["F2"], ["F3"], ["F4"], ["F5"], ["F6"], ["F7"], ["F8"], ["F9"],
    ["F10"], ["F11"], ["F12"], ["F13"], ["F14"], ["F15"], ["F16"], ["F17"],
    ["F18"], ["F19"], ["R2"], ["R6"], ["R7"], ["R8"]
  ]
}
```

- [ ] **Step 2: Validate it against the schema**

Run:
```bash
node -e "
import('./docs/security-audit/studio/lib/validate-findings.mjs').then(async ({ validateFindings }) => {
  const data = JSON.parse(await (await import('node:fs/promises')).readFile('docs/security-audit/studio/samples/notely.json', 'utf8'))
  const { valid, errors } = validateFindings(data)
  console.log(valid ? 'VALID' : 'INVALID:\n' + errors.join('\n'))
  process.exit(valid ? 0 : 1)
})
"
```
Expected: prints `VALID`. If it prints errors, fix the JSON (most likely a
typo'd category id or a missing field) and re-run until valid.

- [ ] **Step 3: Commit**

```bash
git add docs/security-audit/studio/samples/notely.json
git commit -m "test: add Notely sample fixture converted to the new audit schema"
```

---

## Task 5: Artifact "Audit Report Studio"

**Files:**
- Create: `docs/security-audit/studio/index.html`
- Create: `docs/security-audit/studio/ARTIFACT_URL.md`

**Interfaces:**
- Consumes: the ported (inlined, not imported — Artifacts can't load
  local ES modules) logic from `countBySeverity`, `countByCategory`,
  `groupRecommendations` (Task 2) and `buildAllIssues` (Task 3); the
  fixture from Task 4 as seed data; `CATEGORY_NAMES`, `SEVERITY_ORDER`,
  `SEVERITY_COLORS`, `STRENGTH_COLOR` (Task 1) ported the same way.
- Produces: a published Artifact URL, written to `ARTIFACT_URL.md` —
  consumed by Task 6 (the skill needs this URL to push future audit runs
  into the same dashboard).

This task's DB layout:
- Collection `meta`, doc `projects` → `{ slugs: string[] }` — the index of
  every audited project's slug.
- Collection `audits/<slug>/runs`, one doc per audit keyed by
  `audit_date` → the full schema document from Task 4/the skill.

A project's slug is `project` lowercased, spaces/underscores replaced
with `-`, anything outside `[a-z0-9-]` stripped.

- [ ] **Step 1: Load the required skills before writing the page**

Before writing `index.html`, invoke (in this order):
1. `Skill({ skill: 'artifact-capabilities' })` — read its current
   contract for declaring the `db` capability (exact `capabilities`
   object shape may have changed since this plan was written; follow
   what that skill says, not a guess baked into this plan).
2. `Skill({ skill: 'artifact-design' })` — calibrate visual design effort
   for a multi-section report/dashboard page.

- [ ] **Step 2: Write `docs/security-audit/studio/index.html`**

Build a single-file page with these pieces (exact logic ported from Tasks
1-3; UI chrome/spacing/typography follow whatever `artifact-design`
recommended in Step 1):

*Ported constants and functions* (top of the page's inline `<script>`,
verbatim ports of the tested Node modules — copy the bodies from Tasks
1-3's `.mjs` files, dropping the `export`/`import` keywords since this is
a single non-module inline script):

```js
const CATEGORY_NAMES = { /* same object as constants.mjs */ }
const SEVERITY_ORDER = ['critica', 'alta', 'media', 'baixa', 'informativa']
const SEVERITY_COLORS = { /* same object as constants.mjs */ }
const STRENGTH_COLOR = '#059669'

function countBySeverity(findings) { /* body identical to report-derive.mjs */ }
function countByCategory(findings) { /* body identical to report-derive.mjs */ }
function groupRecommendations(findings) { /* body identical to report-derive.mjs */ }
function buildIssueMarkdown(groupIds, findingsById, index) { /* body identical to issue-markdown.mjs */ }
function buildAllIssues(issueGroups, findings) { /* body identical to issue-markdown.mjs */ }

function slugify(project) {
  return project.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '')
}
```

*Data loading:*
```js
async function loadProjectSlugs() {
  const res = await window.claude.readDb({ op: 'get', collection: 'meta', docId: 'projects' })
  return res?.data?.slugs ?? []
}

async function loadRuns(slug) {
  const res = await window.claude.readDb({
    op: 'query', collection: `audits/${slug}/runs`,
    query: { order_by: { field: 'audit_date', direction: 'desc' } },
  })
  return res?.docs ?? []
}
```
(The exact call shape for reading the DB from inside the page —
`window.claude.readDb` above is illustrative — must match whatever
`artifact-capabilities` specified in Step 1; adjust to the real API
before shipping.)

*Sections to render, in order, for the selected run's document* (`doc`):
1. **Sidebar** — list `loadProjectSlugs()`, and for the expanded one,
   `loadRuns(slug)` sorted desc; clicking a run loads its `doc` into the
   detail view.
2. **Cover** — `doc.project`, `doc.audit_date`, `doc.scope`,
   `doc.methodology_note`.
3. **Executive summary** — `countBySeverity(doc.findings)` as an SVG
   donut (five `<circle>` arcs via `stroke-dasharray`, colored per
   `SEVERITY_COLORS`, with a count+percentage legend) and
   `countByCategory(doc.findings)` as an SVG/CSS bar chart (one bar per
   of the 12 categories, height proportional to `count`).
4. **Strengths / weaknesses** — render `doc.strengths` (color-marked with
   `STRENGTH_COLOR`) and `doc.weaknesses.security`/`.rgpd`.
5. **Findings table** — columns Severity (colored chip using
   `SEVERITY_COLORS[f.severity]`) | Arquivo:linha | Descrição; two
   `<select>` filters (severity, category) that hide non-matching rows
   client-side (no re-fetch).
6. **RGPD panel** — render `doc.rgpd_panel` as a table (id, topic,
   status, evidence) only when `doc.rgpd_panel.length > 0`.
7. **Recommendations** — `groupRecommendations(doc.findings)`, one
   `<section>` per priority group, listing each finding's `id`, `file:line`
   and `fix`.
8. **Issues para o GitHub** — `buildAllIssues(doc.issue_groups, doc.findings)`,
   one `<pre>` block per issue with a "copiar" button
   (`navigator.clipboard.writeText`).

*Print stylesheet:*
```css
@media print {
  @page { size: A4; margin: 2cm; }
  .no-print { display: none; }
  body { counter-reset: page; }
  .report-page::after {
    content: "Relatório de Auditoria de Segurança — " attr(data-project) " · página " counter(page);
    counter-increment: page;
  }
}
```

- [ ] **Step 3: Publish the artifact**

Call the `Artifact` tool: `action: "publish"`, `file_path:
"docs/security-audit/studio/index.html"`, a `title` (e.g. "Audit Report
Studio"), a one-sentence `description`, a `favicon` (e.g. "🛡️"), and the
`capabilities` object exactly as `artifact-capabilities` specified in
Step 1 (must declare `db`).

- [ ] **Step 4: Write the resulting URL to `ARTIFACT_URL.md`**

```markdown
# Audit Report Studio — Artifact URL

<the URL returned by the publish call in Step 3>

Do not change this file's first non-heading line without also updating
`~/.claude/skills/security-audit/STUDIO_URL.md` (Task 6) — the skill
reads its own copy, not this one, since it must work standalone.
```

- [ ] **Step 5: Seed the Notely sample and verify rendering**

Two `write_db` calls against the published URL:
```
Artifact({ action: "write_db", url: "<the URL>", db_op: "set",
  collection: "meta", doc_id: "projects",
  data: { slugs: ["notely"] } })

Artifact({ action: "write_db", url: "<the URL>", db_op: "set",
  collection: "audits/notely/runs", doc_id: "2026-09-01",
  file_path: "docs/security-audit/studio/samples/notely.json" })
```
Then `Artifact({ action: "read", url: "<the URL>" })` and visually confirm,
section by section: sidebar shows "notely" with one run dated
2026-09-01; donut chart shows 4 crítica / 12 alta / 9 média / 2 baixa / 0
informativa (count directly from the fixture's severities — verify
against `docs/security-audit/studio/samples/notely.json` if in doubt,
this is the authoritative count, not the number itself); category bar chart shows
12 bars; strengths list has 6 items; findings table has 27 rows and the
severity/category filters actually hide rows; RGPD panel shows 16 rows;
recommendations show P1..P4 (crítica, alta, media, baixa all present in
the fixture); issues section renders 25 blocks
(`--- ISSUE 1 ---` .. `--- ISSUE 25 ---`) and the copy button works.
Fix any rendering defect found, then republish (same `file_path`, same
session → same URL).

- [ ] **Step 6: Commit**

```bash
git add docs/security-audit/studio/index.html docs/security-audit/studio/ARTIFACT_URL.md
git commit -m "feat: add Audit Report Studio artifact, seeded with the Notely sample"
```

---

## Task 6: `security-audit` Skill

**Files:**
- Create: `~/.claude/skills/security-audit/SKILL.md`
- Create: `~/.claude/skills/security-audit/reference/schema.md`
- Create: `~/.claude/skills/security-audit/reference/categories.md`
- Create: `~/.claude/skills/security-audit/scripts/validate-findings.mjs`
- Create: `~/.claude/skills/security-audit/STUDIO_URL.md`

**Interfaces:**
- Consumes: `docs/security-audit/studio/ARTIFACT_URL.md` (Task 5) — copy
  its URL into `STUDIO_URL.md` here.
- Consumes (by duplication, not import): the validation rules from
  `validate-findings.mjs` (Task 1) — re-implemented as one self-contained
  file with the constants inlined, since this skill must run standalone
  in arbitrary target repos that don't have `auditoria/` on disk.
- Produces: nothing consumed by a later task in this plan — Task 7 uses
  this skill directly by invoking it.

No git commit step here — `~/.claude/skills/` is not a git repository (see
Precondition section above). Verify by re-reading each file after writing
it instead.

- [ ] **Step 1: Copy the Studio URL**

Read `docs/security-audit/studio/ARTIFACT_URL.md` (Task 5) and write its
URL into:

```markdown
# Audit Report Studio URL

<the URL from docs/security-audit/studio/ARTIFACT_URL.md>
```
to `~/.claude/skills/security-audit/STUDIO_URL.md`.

- [ ] **Step 2: Write the standalone validator**

```js
#!/usr/bin/env node
// Standalone copy of docs/security-audit/studio/lib/{constants,validate-findings}.mjs
// from the auditoria project. Duplicated on purpose: this skill must
// validate findings.json in ANY target repo, without depending on
// auditoria/ existing on this machine.

const CATEGORY_NAMES = {
  1: 'Banco sem tranca (isolamento)',
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
const SEVERITY_ORDER = ['critica', 'alta', 'media', 'baixa', 'informativa']
const RGPD_STATUS_VALUES = ['conforme', 'nao_conforme', 'nao_verificada', 'nao_aplicavel']
const REQUIRED_TOP_LEVEL = [
  'project', 'audit_date', 'scope', 'stack', 'methodology_note',
  'categories', 'findings', 'strengths', 'weaknesses', 'rgpd_panel',
  'scans', 'sbom', 'limits', 'issue_groups',
]
const CATEGORY_IDS = Object.keys(CATEGORY_NAMES).map(Number)

export function validateFindings(data) {
  // identical body to docs/security-audit/studio/lib/validate-findings.mjs
  // in the auditoria project (Task 1) — keep the two in sync by hand if
  // the schema ever changes.
  const errors = []
  if (typeof data !== 'object' || data === null) return { valid: false, errors: ['root: expected an object'] }
  for (const key of REQUIRED_TOP_LEVEL) if (!(key in data)) errors.push(`root: missing required key "${key}"`)
  if (data.audit_date && !/^\d{4}-\d{2}-\d{2}$/.test(data.audit_date)) errors.push(`audit_date: "${data.audit_date}" must match YYYY-MM-DD`)
  if (Array.isArray(data.categories)) {
    const seen = new Set()
    for (const cat of data.categories) {
      if (!CATEGORY_IDS.includes(cat.id)) { errors.push(`categories: unknown id ${cat.id}`); continue }
      seen.add(cat.id)
      if (typeof cat.maturity !== 'number' || cat.maturity < 0 || cat.maturity > 100) errors.push(`categories[${cat.id}]: maturity must be a number 0-100`)
      if (typeof cat.applicable !== 'boolean') errors.push(`categories[${cat.id}]: applicable must be a boolean`)
      if (cat.applicable === false && typeof cat.na_reason !== 'string') errors.push(`categories[${cat.id}]: na_reason required (string) when applicable is false`)
    }
    for (const id of CATEGORY_IDS) if (!seen.has(id)) errors.push(`categories: missing entry for id ${id} (${CATEGORY_NAMES[id]})`)
  } else errors.push('categories: expected an array')
  const findingIds = new Set()
  if (Array.isArray(data.findings)) {
    for (const f of data.findings) {
      const tag = f.id ?? '(no id)'
      if (!f.id) errors.push('findings: entry missing "id"'); else findingIds.add(f.id)
      if (!CATEGORY_IDS.includes(f.category)) errors.push(`findings[${tag}]: unknown category ${f.category}`)
      if (!SEVERITY_ORDER.includes(f.severity)) errors.push(`findings[${tag}]: invalid severity "${f.severity}"`)
      if (typeof f.file !== 'string' || f.file.length === 0) errors.push(`findings[${tag}]: file must be a non-empty string`)
      if (typeof f.line !== 'number' || f.line <= 0) errors.push(`findings[${tag}]: line must be a positive number`)
      for (const strField of ['cwe', 'owasp', 'desc', 'code', 'why', 'impact', 'fix']) {
        if (typeof f[strField] !== 'string' || f[strField].length === 0) errors.push(`findings[${tag}]: ${strField} must be a non-empty string`)
      }
      if (!Array.isArray(f.acceptance) || f.acceptance.length === 0) errors.push(`findings[${tag}]: acceptance must be a non-empty array`)
      if (f.rgpd_article !== null && typeof f.rgpd_article !== 'string') errors.push(`findings[${tag}]: rgpd_article must be a string or null`)
      if (f.exploitability_notes !== null && typeof f.exploitability_notes !== 'string') errors.push(`findings[${tag}]: exploitability_notes must be a string or null`)
    }
  } else errors.push('findings: expected an array')
  if (Array.isArray(data.strengths)) {
    for (const [i, s] of data.strengths.entries()) {
      if (typeof s.evidence !== 'string' || !s.evidence) errors.push(`strengths[${i}]: evidence must be a non-empty string`)
      if (typeof s.note !== 'string' || !s.note) errors.push(`strengths[${i}]: note must be a non-empty string`)
      if (!Array.isArray(s.applies_to) || s.applies_to.some(v => !['security', 'rgpd'].includes(v))) errors.push(`strengths[${i}]: applies_to must be an array of "security"/"rgpd"`)
    }
  } else errors.push('strengths: expected an array')
  if (typeof data.weaknesses === 'object' && data.weaknesses !== null) {
    for (const key of ['security', 'rgpd']) if (!Array.isArray(data.weaknesses[key])) errors.push(`weaknesses.${key}: expected an array`)
  } else errors.push('weaknesses: expected an object with security[] and rgpd[]')
  if (Array.isArray(data.rgpd_panel)) {
    for (const [i, p] of data.rgpd_panel.entries()) if (!RGPD_STATUS_VALUES.includes(p.status)) errors.push(`rgpd_panel[${i}]: invalid status "${p.status}"`)
  } else errors.push('rgpd_panel: expected an array')
  if (Array.isArray(data.issue_groups)) {
    for (const [i, group] of data.issue_groups.entries()) {
      if (!Array.isArray(group) || group.length === 0) { errors.push(`issue_groups[${i}]: expected a non-empty array of finding ids`); continue }
      for (const fid of group) if (!findingIds.has(fid)) errors.push(`issue_groups[${i}]: references unknown finding id "${fid}"`)
    }
  } else errors.push('issue_groups: expected an array')
  return { valid: errors.length === 0, errors }
}

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

- [ ] **Step 3: Write `reference/categories.md`**

```markdown
# 12 categorias (fixas, mesma ordem sempre)

Para cada categoria: detecte primeiro o mecanismo equivalente na stack do
projeto alvo, depois audite. Se a stack não tiver a superfície da
categoria, marque `applicable: false` com `na_reason` — nunca force um
achado.

1. **Banco sem tranca (isolamento)** — em Supabase é RLS ausente; em APIs
   próprias são queries de listagem/busca/agregação/exportação sem filtro
   por usuário/organização/tenant. Identifique o mecanismo de isolamento
   real (RLS, middleware de tenant, filtro manual por user_id) antes de
   apontar onde falha.
2. **Permissão definida no navegador** — UI esconde ação por papel
   (isAdmin, canEdit) mas o servidor não valida o mesmo privilégio. Cruze
   cada gate de frontend com o endpoint correspondente.
3. **IDOR** — rota busca/altera/deleta objeto por ID sem verificar posse
   do chamador. Percorra TODOS os handlers, não uma amostra.
4. **Chaves expostas** — segredos hardcoded em código, configs,
   docker-compose, CI, docs; atenção a defaults públicos
   (`${VAR:-default}`) sem validação de startup; cheque histórico git e
   bundle do frontend.
5. **Inputs sem tratamento (XSS)** — frontend: innerHTML/equivalentes,
   markdown/HTML sem sanitização, `javascript:` em href/src, eval. Backend:
   input do usuário em HTML de e-mail/templates sem escape. Confirme se
   existe lib de sanitização e se é de fato aplicada.
6. **Autenticação e sessões** — hashing de senha, MFA em contas
   privilegiadas, tokens de reset com entropia/rate limit adequados.
7. **SSRF** — URL fornecida pelo usuário buscada pelo servidor sem
   allowlist, sem bloqueio de IP interno/link-local, seguindo redirects.
8. **Integridade de escrita (CSRF/path/upload)** — CORS+cookies sem
   proteção CSRF; nome de arquivo de upload sem normalização (path
   traversal/zip-slip).
9. **Rate limiting e força bruta** — login/reset/endpoints sensíveis sem
   limite de tentativas.
10. **Dependências e IaC** — CVEs alcançáveis, imagens sem pin/digest,
    recursos de infraestrutura (buckets, etc.) com exposição indevida.
11. **Vazamento de informação** — stack traces em produção, ausência de
    headers de segurança (CSP, HSTS).
12. **Compliance RGPD** — consentimento (Art. 6-7), direitos dos titulares
    (Art. 15-22, especialmente apagamento efetivo Art. 17), minimização e
    retenção (Art. 5), dados sensíveis (Art. 9), decisão automatizada
    (Art. 22), transparência (Art. 12-13), notificação de violação
    (Art. 33-34), processadores/terceiros (Art. 28).
```

- [ ] **Step 4: Write `reference/schema.md`**

```markdown
# findings.json schema

See `../scripts/validate-findings.mjs` for the authoritative, executable
version of these rules. Summary:

- Top level: `project`, `audit_date` (YYYY-MM-DD), `scope`, `stack[]`
  ({layer, detail}), `methodology_note`, `categories[]` (all 12 fixed
  ids, each `{id, name, maturity 0-100, applicable, na_reason}`),
  `findings[]`, `strengths[]`, `weaknesses` ({security[], rgpd[]}),
  `rgpd_panel[]`, `scans[]`, `sbom[]`, `limits[]`, `issue_groups[][]`.
- `findings[]` item: `id` (e.g. "F1", "R1" for RGPD-specific),
  `category` (1-12), `severity` (`critica|alta|media|baixa|informativa`),
  `file`, `line`, `cwe`, `owasp`, `desc`, `code` (verbatim snippet),
  `why`, `impact`, `fix`, `acceptance[]` (checklist strings),
  `rgpd_article` (string or null), `exploitability_notes` (string or
  null — feature flags/config needed to trigger it, or null).
- `strengths[]` item: `evidence` ("file:line - what was verified
  correct"), `note`, `applies_to` (subset of `["security","rgpd"]`).
- `rgpd_panel[]` item: `id`, `topic`, `status`
  (`conforme|nao_conforme|nao_verificada|nao_aplicavel`), `evidence`.
- `issue_groups`: array of arrays of finding ids — group only trivially
  related findings (e.g. several secret-default findings on the same
  theme) to avoid issue spam.

Zero speculation: every finding needs a real file:line and a verbatim
code snippet from the audited repo.
```

- [ ] **Step 5: Write `SKILL.md`**

```markdown
---
name: security-audit
description: "Audits any codebase for the 12 fixed security/RGPD-compliance categories (tenant isolation, UI-only permission checks, IDOR, hardcoded secrets, XSS, auth/session handling, SSRF, CSRF/path/upload integrity, rate limiting, dependency/IaC hygiene, information disclosure, RGPD compliance), stack-agnostic — detects the target's language/framework/ORM/auth/frontend/deploy setup first, then maps each category to it. Writes a findings.json and updates the shared Audit Report Studio dashboard. Trigger: /security-audit."
---

# /security-audit

Audits the current repo (or a given path) against 12 fixed categories —
security + RGPD/compliance — and publishes the result to a shared,
multi-project browser dashboard.

## Usage

```
/security-audit                 # audit the current project
/security-audit <path>           # audit a specific path
```

## Process

1. **Detect the stack**: language, framework, ORM/query builder, auth
   mechanism, frontend framework (if any), deploy files (Docker/CI/Helm/
   Terraform). State this explicitly before auditing.
2. **Read `reference/categories.md`** and map each of the 12 categories
   to this stack's concrete equivalent. If a category's surface doesn't
   exist here (e.g. no frontend → most of category 2 doesn't apply), say
   so explicitly — don't force a finding.
3. **Audit file-by-file, line-by-line.** Zero speculation: every finding
   needs a real file:line and a verbatim snippet. For IDOR (category 3),
   walk every route handler, not a sample.
4. **Record what's correct too** — strengths, with evidence, not just
   weaknesses.
5. **Build the findings document** per `reference/schema.md`. Compute
   `maturity` per category (0-100, your judgment given what you found).
6. **Validate it**: `node ~/.claude/skills/security-audit/scripts/validate-findings.mjs <path-to-findings.json>` — must print `VALID` before continuing. Fix and re-run if not.
7. **Write it locally**: `docs/security-audit/<slug>/findings.json` inside
   the *target* repo, where `<slug>` = the project name lowercased,
   spaces/underscores → `-`, everything outside `[a-z0-9-]` stripped.
8. **Push it to the shared dashboard**:
   - Read `~/.claude/skills/security-audit/STUDIO_URL.md` for the URL.
   - `Artifact({ action: "read_db", url, db_op: "get", collection: "meta", doc_id: "projects" })` to get the current slug list.
   - If `<slug>` isn't in it, `Artifact({ action: "write_db", url, db_op: "update", collection: "meta", doc_id: "projects", data: { slugs: [...existing, slug] } })`.
   - `Artifact({ action: "write_db", url, db_op: "set", collection: `audits/${slug}/runs`, doc_id: audit_date, file_path: "<path-to-findings.json>" })`.
9. **Report in chat**: the full findings list, file-by-file, line-by-line
   (same content as the JSON's `findings[]`, in prose), plus the
   dashboard URL from `STUDIO_URL.md`.

## Rules

- Every category not applicable to the detected stack must say so
  explicitly with a reason, never be silently omitted or faked.
- Group only trivially-related findings when building `issue_groups` — one
  issue per real finding otherwise, to avoid GitHub issue spam.
- Re-running same day on the same project overwrites that day's dashboard
  entry (`db_op: "set"`, not `"update"`) rather than creating duplicates.
```

- [ ] **Step 6: Verify by re-reading each file**

Read back `SKILL.md`, `reference/categories.md`, `reference/schema.md`,
`scripts/validate-findings.mjs`, `STUDIO_URL.md` and confirm each has the
content written above (no truncation, correct URL substituted in
`STUDIO_URL.md`).

- [ ] **Step 7: Smoke-test the bundled validator standalone**

```bash
node ~/.claude/skills/security-audit/scripts/validate-findings.mjs docs/security-audit/studio/samples/notely.json
```
Expected: prints `VALID` (same fixture as Task 4, now validated through
the skill's standalone copy — confirms the duplication in Step 2 didn't
drift from Task 1's rules).

---

## Task 7: End-to-end validation run against `amigo-secreto`

**Files:**
- Create (by the skill, not by hand): `../amigo-secreto/docs/security-audit/amigo-secreto/findings.json`

**Interfaces:**
- Consumes: the finished `security-audit` skill (Task 6) and the
  published Studio artifact (Task 5).
- Produces: nothing consumed by a later task — this is the plan's final
  acceptance check, matching the spec's testing plan step 2.

- [ ] **Step 1: Invoke the skill against the smallest real project**

Run the `security-audit` skill (`Skill({ skill: 'security-audit', args:
'/var/home/lmilani/Documentos/IDE/amigo-secreto' })`) against
`amigo-secreto/` — chosen because it has no backend, so it validates the
`applicable: false` path for categories 1/3/6/7/9 (which need a backend
to exist at all).

- [ ] **Step 2: Verify the local JSON**

```bash
node ~/.claude/skills/security-audit/scripts/validate-findings.mjs /var/home/lmilani/Documentos/IDE/amigo-secreto/docs/security-audit/amigo-secreto/findings.json
```
Expected: `VALID`.
Also confirm by reading the file that categories 1, 3, 6, 7, 9 have
`applicable: false` with a non-empty `na_reason` (amigo-secreto is a
localStorage-only SPA — no server, so no tenant isolation/IDOR/auth/SSRF/
rate-limit surface).

- [ ] **Step 3: Verify the dashboard was updated**

```
Artifact({ action: "read_db", url: "<STUDIO_URL>", db_op: "get", collection: "meta", doc_id: "projects" })
```
Expected: `slugs` now includes `"amigo-secreto"` alongside `"notely"`.

```
Artifact({ action: "read_db", url: "<STUDIO_URL>", db_op: "list", collection: "audits/amigo-secreto/runs" })
```
Expected: one document, keyed by today's date.

- [ ] **Step 4: Verify the chat output**

Confirm the skill's chat response listed findings (or explicit
non-applicability) file-by-file, line-by-line, and included the
dashboard URL — matching the spec's "reporte também no chat" rule.

- [ ] **Step 5: Open the dashboard and visually confirm the new project renders**

`Artifact({ action: "read", url: "<STUDIO_URL>" })` — confirm the sidebar
now lists two projects (notely, amigo-secreto) and switching between them
correctly swaps every section (cover, charts, table, recommendations,
issues) without stale data from the other project.

No commit for this task — it produces data inside `amigo-secreto/`, a
separate project the user did not ask to have touched by a commit here;
mention the new file to the user instead of committing it on their
behalf.
