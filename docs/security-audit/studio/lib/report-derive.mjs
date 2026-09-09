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
