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
