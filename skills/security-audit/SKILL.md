---
name: security-audit
description: "Audits any codebase for the 12 fixed security/RGPD-compliance categories (tenant isolation & injection, UI-only permission checks, IDOR, hardcoded secrets, XSS, auth/session handling & crypto misuse, SSRF, CSRF/path/upload/concurrency integrity, rate limiting & resource exhaustion, dependency/IaC/supply-chain hygiene, information disclosure, RGPD compliance), stack-agnostic — detects the target's language/framework/ORM/auth/frontend/deploy setup first, then maps each category to it. Writes a findings.json and updates the shared Audit Report Studio dashboard. Trigger: /security-audit."
---

# /security-audit

Audits the current repo (or a given path) against 12 fixed categories —
security + RGPD/compliance — and publishes the result to a shared,
multi-project browser dashboard.

**Scope note:** category 12 and every `rgpd_article` citation refer to the
EU Regulation (EU) 2016/679 (RGPD/GDPR) specifically — article numbers are
taken from that regulation. This does not cover other jurisdictions'
privacy laws (e.g. Brazil's LGPD, US CCPA/CPRA, Canada's PIPEDA) even
where their requirements overlap. If a target's compliance need is one of
those instead, say so explicitly rather than treating the RGPD findings as
equivalent.

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

   Optionally, a target project's own CI can gate on severity:
   `validate-findings.mjs <path> --fail-on=<critica|alta|media|baixa|informativa>`
   exits 1 (after printing which findings blocked) if any finding at or
   above that severity is present. This is unrelated to shape validation
   above and is off by default — pass it only when a project's own
   pipeline wants to fail a build on unresolved findings.

7. **Write it locally**: `docs/security-audit/<slug>/findings.json` inside
   the *target* repo, where `<slug>` = the project name lowercased,
   spaces/underscores → `-`, everything outside `[a-z0-9-]` stripped.
8. **Publish it to the shared dashboard's git repo** (the dashboard is a
   plain static site under a git repo's `docs/` folder, with zero
   dependency on any hosted runtime or remote database API; publishing
   means writing a JSON file locally and pushing it with git):
   - Read `~/.claude/skills/security-audit/STUDIO_REPO_PATH.md` for the
     local repo path (`<repo-path>`, the first non-heading line).
   - Read `<repo-path>/docs/security-audit/studio/data/index.json`. If
     it doesn't exist yet, treat it as `{"projects":[]}`.
   - Add `<slug>` to the manifest's `projects` array if it isn't already
     present (an entry is `{slug, runs: []}`), keeping `projects` sorted
     alphabetically by slug. Add `audit_date` to that project's `runs`
     array if it isn't already present, keeping `runs` sorted
     descending — a same-day re-run leaves the date as already present,
     it does not add a duplicate. Write the updated manifest back to
     `<repo-path>/docs/security-audit/studio/data/index.json`.
   - Write the findings document to
     `<repo-path>/docs/security-audit/studio/data/<slug>/<audit_date>.json`
     (same content as the local `findings.json` from step 7).
   - Publish: `git -C <repo-path> add docs/security-audit/studio/data`,
     then commit with a message naming the audited project and date,
     then `git -C <repo-path> push`. This repo already has `origin`
     configured and the user pushes here as routine operation — this
     push is the intended publish step, not a one-off decision to make
     each time.
9. **Report in chat**: the full findings list, file-by-file, line-by-line
   (same content as the JSON's `findings[]`, in prose), plus the local
   `findings.json` path (step 7) and the public dashboard URL:
   `https://lucianomilani.github.io/AI-ditoria/security-audit/studio/`
   (from `STUDIO_REPO_PATH.md`).

## Rules

- Every category not applicable to the detected stack must say so
  explicitly with a reason, never be silently omitted or faked.
- Every finding id in `findings[]` must appear in exactly one group in
  `issue_groups` (not zero, not more than one) — grouping only decides how
  findings are bundled into issues, it never decides whether a finding gets
  an issue. Group only trivially-related findings together (e.g. several
  secret-default findings on the same theme); everything else is its own
  singleton group `["id"]`, to avoid GitHub issue spam while still giving
  every finding an issue.
- Re-running same day on the same project overwrites that day's JSON
  file at `data/<slug>/<audit_date>.json` in place rather than creating
  a duplicate, and leaves `audit_date` as already present in the
  manifest's `runs` array rather than adding it twice.
