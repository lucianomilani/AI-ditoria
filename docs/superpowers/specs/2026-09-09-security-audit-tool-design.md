# Security & RGPD Audit Tool — Design

Date: 2026-09-09
Status: approved by user, pending spec review gate

## Problem

The current `auditoria/` project is a one-off: a prompt (v1 security-only,
then v2 with RGPD/compliance added) that was run once against a fictional
project ("Notely") and produced a Python data file (`docs/security-audit/data.py`)
plus a PDF built with reportlab/matplotlib. The PDF-generation script that
read `data.py` is missing. Nothing here is reusable across other codebases
without copy-pasting and re-adapting the whole pipeline by hand.

Goal: turn this into a tool usable across many different programs, sites,
and systems — audit any target repo, accumulate results over time, view a
polished report in a browser.

## Constraints

- Real code auditing (stack detection, file-by-file review) requires full
  repo access. This can only happen inside a Claude Code session with
  filesystem tools — not inside a browser sandbox. Confirmed with user.
- The browser side is a report generator/viewer/exporter, not an analyzer.
- Must support many independent audit targets (multi-project), not just one.

## Architecture

Two components:

1. **Skill `security-audit`** — installed globally at
   `~/.claude/skills/security-audit/SKILL.md`, so it is available in any
   project Claude Code opens, not just this one.
2. **Artifact "Audit Report Studio"** — a single published HTML page with
   the `db` runtime capability, acting as a persistent multi-project
   dashboard. One artifact, many audits inside it (one DB document per
   audit run).

The two are connected by a JSON contract (below): the skill produces it,
the artifact consumes it.

## Data schema (skill → artifact contract)

```jsonc
{
  "project": "string",
  "audit_date": "YYYY-MM-DD",
  "scope": "string — what was audited, in one or two sentences",
  "stack": [{ "layer": "Backend", "detail": "Express 4.18 / Node 18" }],
  "methodology_note": "string — how the 12 categories were mapped to this stack",
  "categories": [
    { "id": 1, "name": "Isolamento de tenant/dono", "maturity": 0, "applicable": true, "na_reason": null }
    // ids 1..12 fixed, same taxonomy as v2 prompt; category 12 = RGPD/compliance
  ],
  "findings": [
    {
      "id": "F1", "category": 1, "severity": "critica|alta|media|baixa|informativa",
      "file": "path/relative/to/repo", "line": 42,
      "cwe": "CWE-639", "owasp": "A01:2021",
      "desc": "string", "code": "string (verbatim snippet)",
      "why": "string — why it's exploitable", "impact": "string",
      "fix": "string", "acceptance": ["checklist item", "..."],
      "rgpd_article": "Art. 7|null",
      "exploitability_notes": "string|null — feature flags / config needed, or null"
    }
  ],
  "strengths": [
    { "evidence": "file:line — what was verified correct", "note": "why it matters", "applies_to": ["security", "rgpd"] }
  ],
  "weaknesses": { "security": ["string", "..."], "rgpd": ["string", "..."] },
  "rgpd_panel": [
    { "id": "12.1", "topic": "Base legal e consentimento (Art. 6, 7)", "status": "conforme|nao_conforme|nao_verificada|nao_aplicavel", "evidence": "string" }
  ],
  "scans": [{ "tool": "gitleaks", "target": "string", "found": 14, "reviewed": 3, "actionable": 1 }],
  "sbom": [{ "dep": "next", "version": "13.4.19", "note": "string", "action_needed": true }],
  "limits": ["string", "..."],
  "issue_groups": [["F1"], ["R1", "R4"]]
}
```

Rules carried over from the v2 prompt:
- Zero speculation — every finding backed by a real file:line and snippet.
- When a category doesn't apply to the detected stack (e.g. no frontend →
  parts of category 5 don't apply), set `applicable: false` with
  `na_reason` instead of forcing a finding.
- `severity` and the 5-color palette are fixed: crítica `#B91C1C`, alta
  `#EA580C`, média `#D97706`, baixa `#2563EB`, ponto forte `#059669`.

## Skill: `security-audit`

- Location: `~/.claude/skills/security-audit/SKILL.md` — a personal skill,
  global, not tied to this project directory.
- Instructions body = the current v2 prompt (stack detection first, 12
  categories incl. RGPD, file-by-file/zero-speculation rule, capture
  strengths as well as weaknesses), rewritten to be stack-agnostic (no
  hardcoded assumption of Express/Prisma/Next.js — those become examples,
  not requirements).
- On completion, the skill:
  1. Writes `docs/security-audit/<project-slug>/findings.json` inside the
     *target* project's own repo (so the raw data travels with that repo).
  2. Publishes/updates the shared "Audit Report Studio" Artifact via
     `write_db`, collection `audits/<project-slug>`, one document per run
     keyed by `audit_date`.
  3. Still prints the full findings list in chat (file-by-file, line-by-
     line) as today, plus the Artifact URL.
- Idempotent per day: re-running the skill the same day on the same
  project overwrites that day's document (`set`, not `update`), so re-runs
  don't pile up duplicate partial entries.

## Artifact: "Audit Report Studio"

- Single HTML page, capability `db` declared (loads
  `artifact-capabilities` skill before writing, per its own rules).
- **Sidebar**: list of all `audits/*` projects, and inside each, its runs
  by date — this is the multi-system view that's the actual point of the
  request.
- **Detail view** per selected run, sections in order:
  1. Cover — project name, audit date, scope, methodology note.
  2. Executive summary — counts by severity, SVG donut chart by severity,
     bar chart by category, using the fixed palette (light/dark aware).
  3. Strengths / weaknesses.
  4. Findings table — filterable by severity and category, columns
     Severity | Arquivo:linha | Descrição, colored severity chip.
  5. RGPD panel table (rendered only when `rgpd_panel` is non-empty for
     that run).
  6. Recommendations, auto-grouped into P1 (crítica), P2 (alta), P3
     (média/baixa), derived from `severity` — no separate field needed.
  7. "Issues para o GitHub" — one collapsible block per `issue_groups`
     entry, full markdown text, copy-to-clipboard button.
- **Export**: `@media print` stylesheet, A4 layout with header/footer
  (report name + page number via CSS counters) — replaces reportlab.
  Browser's native print-to-PDF is the delivery mechanism; no server-side
  PDF generation.
- No dependency on the old Python/reportlab pipeline going forward. The
  existing `docs/security-audit/{data.py, requirements.txt, *.pdf}` stay
  as historical/reference artifacts and are not migrated automatically as
  part of this build (out of scope — see below).

## Data flow

1. User opens any target project in Claude Code, runs `/security-audit`.
2. Claude detects stack, audits file-by-file per the skill's rules, fills
   the schema.
3. Skill writes the local JSON in that repo and pushes the run into the
   shared Artifact's database.
4. Claude reports the findings in chat + hands back the dashboard URL
   (already showing the new run).
5. User opens the link, filters/reads/export-to-PDF/copies GitHub issues.

## Out of scope (explicitly not building now)

- Migrating the existing `data.py` (Notely sample) into the new schema —
  will be done manually as the first validation step, not as part of the
  tool itself.
- Any in-browser code analysis (pasting snippets for Claude to analyze
  live) — user confirmed the browser side is view/export only.
- Auth/access control on the Artifact — it starts private by default;
  sharing is a manual decision the user makes later, not built here.
- Auto-creating GitHub issues via API — the tool produces copy-paste-ready
  markdown blocks, it does not call the GitHub API.

## Testing / validation plan

1. Hand-convert `docs/security-audit/data.py` (Notely sample, already has
   both security and RGPD findings) into the new JSON schema once, load it
   into the Artifact via `write_db`, and confirm every section renders
   correctly (charts, filters, RGPD panel, issue blocks, print layout) —
   this validates the artifact independent of the skill.
2. Run the real `security-audit` skill against `amigo-secreto/` (smallest
   of the four real projects, no backend) to validate end-to-end: stack
   detection, `applicable: false` handling for categories that don't
   apply (no backend → most of categories 1/3/6/7/9 not applicable there),
   JSON written to the target repo, Artifact updated, chat output correct.
3. Only after both pass, consider running it against the remaining three
   projects (gestaomeet, gestaotour, perfex_crm) — not part of this build,
   left for a follow-up request.
