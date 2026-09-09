# Audit process improvements — design

Status: approved by user 2026-09-09. Ready for implementation planning.

## Context

The `/security-audit` skill (`~/.claude/skills/security-audit/`, not in this
repo) audits any codebase against 12 fixed categories and publishes a
`findings.json` to this repo's static dashboard, "AI-ditoria"
(`docs/security-audit/studio/`, plain HTML+JS, no backend, no build step,
served by GitHub Pages).

A review of the methodology surfaced 4 category gaps and 3 process gaps.
This spec locks scope for closing all 7, split into two independent tracks.

## Track A — methodology (category coverage)

Constraint: the "12 fixed categories" count is a hard invariant, checked by
tests (`constants.test.mjs`: "CATEGORY_NAMES has exactly the 12 fixed ids")
and enforced by `validate-findings.mjs` (name must match exactly). Decision:
**expand existing categories rather than add new ones**, same pattern
already applied to category 1 (isolamento → isolamento e injeção) in commit
`3a1ac28`.

### Category renames + scope additions

| id | old name | new name | new sub-scope added |
|----|----------|----------|----------------------|
| 6  | Autenticação e sessões | Autenticação, sessões e criptografia | Cryptography misuse beyond password hashing: weak/legacy ciphers (DES, ECB mode), predictable or reused IV/nonce, home-grown crypto instead of a vetted library/primitive. |
| 8  | Integridade de escrita (CSRF/path/upload) | Integridade de escrita (CSRF/path/upload/concorrência) | Business-logic/race-condition flaws: TOCTOU on check-then-act sequences, price/quantity manipulation, multi-step actions that aren't atomic (missing transaction/lock). |
| 9  | Rate limiting e força bruta | Rate limiting, força bruta e exhaustion | Resource-exhaustion DoS: unbounded pagination/page-size params, missing upload size caps, catastrophic-backtracking regex reachable from user input. |
| 10 | Dependências e IaC | Dependências, IaC e supply-chain | Supply-chain beyond known CVEs: unpinned CI/marketplace actions (no commit SHA), postinstall/build scripts fetching remote code, typosquatting risk in recently-added dependencies. |

Category 1 (already done, reference pattern): `Banco sem tranca
(isolamento e injeção)` — isolation/RLS plus SQL/NoSQL injection via
unparameterized queries.

### Files touched per category (same 5 every time — do all 4 categories
in one pass per file, not one file per category, to avoid repeated
edits):

1. `~/.claude/skills/security-audit/reference/categories.md` — rename the
   heading, extend the bullet body with the new sub-scope, in Portuguese,
   matching the existing terse style.
2. `~/.claude/skills/security-audit/SKILL.md` — frontmatter `description`
   lists all 12 categories in English gloss; update the 4 changed ones
   (already did category 1 → "tenant isolation & injection").
3. `~/.claude/skills/security-audit/scripts/validate-findings.mjs` —
   standalone `CATEGORY_NAMES` copy; update the 4 renamed entries.
4. `docs/security-audit/studio/lib/constants.mjs` — same map, repo copy
   used by the Node test suite and `validate-findings.mjs` (lib version).
5. `docs/security-audit/studio/index.html` — inline duplicate
   `CATEGORY_NAMES` (no bundler, browser can't import the .mjs) used for
   the exec-summary bar chart labels and the findings-table category
   filter dropdown.

### What does NOT change

- `docs/security-audit/studio/lib/validate-findings.mjs` itself needs no
  logic change — it already compares `cat.name` against `CATEGORY_NAMES[cat.id]`
  generically; only the constant's string values change.
- Already-published reports (`data/amigo-secreto/...json`,
  `data/redesocialx/...json`, `samples/notely.json`) keep their original
  category names. The dashboard's `buildCategoryCoverage` renders from
  `doc.categories[]` (the JSON's own data), not from the hardcoded map, so
  old reports display correctly as historical snapshots — same precedent
  as the scans/sbom historical-shape exception already documented in
  `schema.md`. Not migrated, not rewritten.
- No test hardcodes the category name strings (confirmed by grep before
  writing this spec) — renaming is safe for the existing suite.

### Verification

- `node --test docs/security-audit/studio/lib/*.test.mjs` must still show
  26/26 passing after each file edit.
- Re-run `node ~/.claude/skills/security-audit/scripts/validate-findings.mjs`
  against a fixture with the OLD names → must print `INVALID` (proves the
  new names are actually enforced, not just decorative).

## Track B — tooling (3 independent features)

Each is independently shippable/testable/committable; no shared code
between them beyond existing helpers.

### B1 — CI gate flag on `validate-findings.mjs`

Target file: `~/.claude/skills/security-audit/scripts/validate-findings.mjs`
(the standalone script meant to run against ANY audited target's
`findings.json` in that target's own CI — this repo has no pipeline of its
own and is not the audience for this flag).

- New CLI flag: `--fail-on=<severity>` where severity ∈
  `critica|alta|media|baixa|informativa` (same `SEVERITY_ORDER` already
  defined, index 0 = most severe: critica, alta, media, baixa,
  informativa).
- Semantics: "at or above" the given severity. `--fail-on=alta` fails on
  any finding with severity `critica` or `alta`.
- Behavior: shape validation (existing) runs first and still short-circuits
  on `INVALID` (exit 1) regardless of the flag. Only once the document is
  shape-valid does the severity gate run. If it trips, print each
  offending finding's `id`, `severity`, and one-line `desc`, then exit 1.
  If the flag is absent, behavior is byte-for-byte unchanged from today
  (prints `VALID`/`INVALID`, exit 0/1 on shape only).
- No change to the repo-side `docs/security-audit/studio/lib/validate-findings.mjs`
  — that one backs the dashboard's own Node tests, not a CI gate; adding
  the flag there would be scope creep with no consumer.
- Document the flag in `SKILL.md` (a short "CI usage" note, not a new
  numbered step in the main Process — this is optional tooling, not part
  of every audit run).

### B2 — Checklist "confirmado" persistence (localStorage)

Target file: `docs/security-audit/studio/index.html`,
`buildValidationChecklist()`.

- Storage key pattern: `audit-studio-checklist/<project-slug>/<audit_date>/<finding-id>`
  → boolean. Mirrors the existing `HIDDEN_PROJECTS_KEY` localStorage
  pattern already in the file (read-modify-write a JSON blob, wrapped in
  try/catch, degrades silently to unpersisted if storage is unavailable —
  same defensive pattern as `loadHiddenSlugs`/`saveHiddenSlugs`).
- On render: each checkbox's `checked` attribute is set from the stored
  value (default unchecked if absent).
- On change: checkbox's `change` handler writes the new boolean to that
  key immediately.
- Scope explicitly excludes Notas and Responsável/Prazo — those stay
  blank `<td>` cells, pen-and-paper only, no markup change, no print CSS
  change needed.
- This is per-browser state (same ceiling as the existing hide-project
  feature) — does not sync across machines or people. That limitation is
  accepted, not a defect to fix later.

### B3 — Diff between two audit runs of the same project

New pure function in `docs/security-audit/studio/lib/report-derive.mjs`:

```js
export function diffFindings(runA, runB) {
  // key = `${finding.file}:${finding.line}:${finding.id}` — matches by
  // where the code lives, not just id (ids are per-run F1/F2/R1... and
  // are NOT stable across runs by definition, since the audit re-numbers
  // findings each time; file:line is the actual anchor of identity here,
  // id is included only to disambiguate two same-file:line findings).
  // returns { fixed: [...runA findings not matched in runB],
  //           new: [...runB findings not matched in runA],
  //           unchanged: [...findings matched in both, from runB] }
}
```

- Matching key note (important, resolve during implementation, not
  guessed here): findings are matched by `file:line` primarily since
  `id` is unstable across runs. Two runs' finding at the same `file:line`
  are treated as "the same finding" even if wording/severity changed
  slightly — `unchanged` in this sense means "still flagged here", not
  "byte-identical description". This is the same assumption a human
  reviewer would make.
- Unit tests in `report-derive.test.mjs` covering: nothing fixed/nothing
  new (identical runs), all fixed (empty runB), all new (empty runA), a
  finding whose file:line is fixed by one audit and re-introduced by a
  later one at the same location (must show as `unchanged`, not
  fixed-then-new — same location, still an open issue).

Dashboard UI (`index.html`):

- Sidebar: when a project's run list (`state.runsBySlug[slug]`) has 2+
  entries, show a "Comparar auditorias" control under that project's run
  list (alongside the existing run buttons).
- Selecting it presents two date pickers (populated from that project's
  existing run dates — no free typing) defaulting to the two most recent
  runs, oldest as A / newest as B.
- Render as a new report-page-style section (consistent with existing
  sections' visual language: eyebrow + h2, three sub-groups —
  "Corrigidos (N)", "Novos (N)", "Ainda presentes (N)" — each rendered
  like the existing findings-table rows (severity chip + file:line +
  desc), reusing existing CSS classes (`.fileref`, `.chip`,
  `table-wrap`/`table`) rather than inventing new ones.
- No new data files, no localStorage — computed client-side from the two
  already-fetched run documents (`state.runsBySlug[slug]`), which are
  already loaded when the sidebar's run list is open.

## Explicitly out of scope (deferred, not forgotten)

- CI gate does not get wired into this repo's own pipeline — there isn't
  one, and this repo isn't an audit target.
- Checklist Notas/Responsável-Prazo do not become digital fields.
- No cross-device/cross-person sync for either localStorage feature.
- 16-fixed-categories alternative was considered and rejected in favor of
  expanding existing categories.

## Open items for the implementation plan (not decided here)

- Exact wording (PT) for each expanded category's `categories.md` bullet
  — spec fixes the *scope*, plan/implementation writes the *prose*.
- Whether B1/B2/B3 become 3 separate commits or one per session — each is
  independently shippable, no ordering dependency between them; Track A
  should land as its own commit(s) separate from Track B.
