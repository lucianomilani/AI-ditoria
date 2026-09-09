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
