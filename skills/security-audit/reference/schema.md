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
- `scans[]` item: `{tool, command, result}` — all three non-empty
  strings: the tool that was run, the actual command invoked, and a
  one-line human-readable summary of what it found. (The Notely sample
  fixture, `docs/security-audit/studio/samples/notely.json`, predates
  this canonical shape and instead uses
  `{tool, target, found, reviewed, actionable}` — that's a historical
  fixture, not to be migrated; the shape above is what real skill runs
  should produce going forward.)
- `sbom[]` item: `{name, version, type}` — all three non-empty strings:
  the dependency name, its version, and a short type/status note (e.g.
  "production", "development", "no CVE known", "EOL", "pinned"). (Same
  historical-fixture caveat as `scans[]` above — Notely uses an older,
  different shape and is a known, accepted inconsistency; do not touch
  it.)
- `issue_groups`: array of arrays of finding ids. **Coverage invariant:
  every finding id in `findings[]` must appear in exactly one group in
  `issue_groups` — not zero, not more than one.** Grouping only decides
  how findings are bundled into GitHub issues; it never decides whether
  a finding gets an issue. Group findings together ONLY when they are
  trivially related (e.g. several secret-default findings on the same
  theme) — everything else gets its own singleton group `["id"]`. Do
  not silently drop a finding from `issue_groups` just because it didn't
  seem worth grouping.

Zero speculation: every finding needs a real file:line and a verbatim
code snippet from the audited repo.
