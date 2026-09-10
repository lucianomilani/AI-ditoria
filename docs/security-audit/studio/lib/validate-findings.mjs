import { CATEGORY_NAMES, SEVERITY_ORDER, RGPD_STATUS_VALUES } from './constants.mjs'

const REQUIRED_TOP_LEVEL = [
  'project', 'audit_date', 'scope', 'stack', 'methodology_note',
  'categories', 'findings', 'strengths', 'weaknesses', 'rgpd_panel',
  'scans', 'sbom', 'limits', 'issue_groups',
]

const CATEGORY_IDS = Object.keys(CATEGORY_NAMES).map(Number)

// High-confidence, known real-world secret formats. The dashboard these
// findings get published to is public, so any real credential quoted
// verbatim in a finding gets masked before publish — see redactSecrets().
const SECRET_PATTERNS = [
  { id: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/g },
  { id: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { id: 'gitlab-token', re: /glpat-[A-Za-z0-9_-]{20,}/g },
  { id: 'google-api-key', re: /AIza[0-9A-Za-z_-]{35}/g },
  { id: 'slack-token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { id: 'stripe-key', re: /sk_(live|test)_[A-Za-z0-9]{20,}/g },
  { id: 'openai-key', re: /sk-[A-Za-z0-9]{20,}/g },
  { id: 'private-key-block', re: /-----BEGIN[ A-Z]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z]*PRIVATE KEY-----/g },
  { id: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
]

// A quoted value assigned to a password/secret/token/key-shaped name.
// Placeholder-looking values (dev defaults, "change-this-*", etc.) are
// exactly the kind of finding this tool reports on — they must stay
// describable in prose, so they're excluded from this check.
const SECRET_ASSIGNMENT_RE = /(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|private[_-]?key)["']?\s*[:=]\s*["']([^"']{8,})["']/gi

const PLACEHOLDER_VALUE_RE = /^(change|generate|your[_-]|example|placeholder|xxx|todo|redacted|dev$|test$|<|\{|\$\{)/i

function isPlaceholderValue(value) {
  if (PLACEHOLDER_VALUE_RE.test(value)) return true
  // low-entropy values like "aaaaaaaa" or "12345678" aren't real secrets
  return new Set(value).size < 5
}

function walkStrings(node, path, cb) {
  if (typeof node === 'string') {
    cb(node, path)
  } else if (Array.isArray(node)) {
    node.forEach((item, i) => walkStrings(item, `${path}[${i}]`, cb))
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      walkStrings(value, path ? `${path}.${key}` : key, cb)
    }
  }
}

function mapStrings(node, fn) {
  if (typeof node === 'string') return fn(node)
  if (Array.isArray(node)) return node.map(item => mapStrings(item, fn))
  if (node !== null && typeof node === 'object') {
    const out = {}
    for (const [key, value] of Object.entries(node)) out[key] = mapStrings(value, fn)
    return out
  }
  return node
}

export function scanForSecrets(data) {
  const hits = []
  walkStrings(data, '', (str, path) => {
    for (const { id, re } of SECRET_PATTERNS) {
      if (new RegExp(re.source, re.flags.replace('g', '')).test(str)) hits.push({ path, rule: id })
    }
    for (const match of str.matchAll(SECRET_ASSIGNMENT_RE)) {
      const value = match[1]
      if (!isPlaceholderValue(value)) hits.push({ path, rule: 'secret-assignment' })
    }
  })
  return hits
}

// Masks real secrets/emails found anywhere in the document so the public
// dashboard never shows them, while leaving everything else — including
// placeholder/example values the finding is describing — untouched.
export function redactSecrets(data) {
  const hits = scanForSecrets(data)
  const redacted = mapStrings(data, str => {
    let out = str
    for (const { re } of SECRET_PATTERNS) out = out.replace(re, '***REDACTED***')
    out = out.replace(SECRET_ASSIGNMENT_RE, (full, value) => {
      if (isPlaceholderValue(value)) return full
      return full.replace(value, '***REDACTED***')
    })
    return out
  })
  return { redacted, hits }
}

export function validateFindings(data) {
  const errors = []

  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['root: expected an object'] }
  }

  for (const key of REQUIRED_TOP_LEVEL) {
    if (!(key in data)) errors.push(`root: missing required key "${key}"`)
  }

  if (typeof data.audit_date !== 'string' || data.audit_date.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(data.audit_date)) {
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
      if (cat.name !== CATEGORY_NAMES[cat.id]) {
        errors.push(`categories[${cat.id}]: name must be "${CATEGORY_NAMES[cat.id]}"`)
      }
      if (typeof cat.maturity !== 'number' || cat.maturity < 0 || cat.maturity > 100) {
        errors.push(`categories[${cat.id}]: maturity must be a number 0-100`)
      }
      if (typeof cat.applicable !== 'boolean') {
        errors.push(`categories[${cat.id}]: applicable must be a boolean`)
      }
      if (cat.applicable === false && (typeof cat.na_reason !== 'string' || cat.na_reason.trim().length === 0)) {
        errors.push(`categories[${cat.id}]: na_reason required (non-empty string) when applicable is false`)
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

  // Structural-only check: each scans[]/sbom[] item must be a non-empty object.
  // Deliberately lenient on specific keys, since docs/security-audit/studio/samples/notely.json
  // predates the canonical {tool,command,result}/{name,version,type} shape (reference/schema.md)
  // and uses an older, different shape that must keep validating.
  for (const arrName of ['scans', 'sbom']) {
    if (Array.isArray(data[arrName])) {
      for (const [i, item] of data[arrName].entries()) {
        if (typeof item !== 'object' || item === null || Array.isArray(item) || Object.keys(item).length === 0) {
          errors.push(`${arrName}[${i}]: expected a non-empty object`)
        }
      }
    } else {
      errors.push(`${arrName}: expected an array`)
    }
  }

  if (Array.isArray(data.issue_groups)) {
    const covered = new Map()
    for (const [i, group] of data.issue_groups.entries()) {
      if (!Array.isArray(group) || group.length === 0) {
        errors.push(`issue_groups[${i}]: expected a non-empty array of finding ids`)
        continue
      }
      for (const fid of group) {
        if (!findingIds.has(fid)) errors.push(`issue_groups[${i}]: references unknown finding id "${fid}"`)
        covered.set(fid, (covered.get(fid) || 0) + 1)
      }
    }
    for (const id of findingIds) {
      const count = covered.get(id) || 0
      if (count === 0) errors.push(`issue_groups: finding "${id}" is not covered by any group`)
      else if (count > 1) errors.push(`issue_groups: finding "${id}" appears in more than one group`)
    }
  } else {
    errors.push('issue_groups: expected an array')
  }

  return { valid: errors.length === 0, errors }
}
