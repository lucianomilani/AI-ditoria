# Audit Report Studio — repo path

<edit this line to the absolute local path of your clone of this repo>

The skill writes findings there, under
`docs/security-audit/studio/data/<slug>/<audit_date>.json`, and updates
the manifest at `docs/security-audit/studio/data/index.json`. That
`docs/` folder is served as a static site by GitHub Pages, so once
pushed the dashboard is reachable at whatever GitHub Pages URL your
fork/clone's remote publishes to.

The public URL is informational only — the skill itself never calls it
or any Claude-specific runtime API. The value the skill actually reads
and writes to is the local repo path on the first line of this file.
