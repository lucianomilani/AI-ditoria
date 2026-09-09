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
