import test from 'node:test'
import assert from 'node:assert/strict'
import { countBySeverity, countByCategory, groupRecommendations, diffFindings } from './report-derive.mjs'

const findings = [
  { id: 'F1', category: 1, severity: 'critica', file: 'b.ts', line: 5 },
  { id: 'F2', category: 1, severity: 'alta', file: 'a.ts', line: 20 },
  { id: 'F3', category: 3, severity: 'alta', file: 'a.ts', line: 10 },
  { id: 'F4', category: 3, severity: 'media', file: 'c.ts', line: 1 },
]

test('countBySeverity returns all 5 severities in fixed order, zero-filled', () => {
  const result = countBySeverity(findings)
  assert.deepEqual(result.map(r => r.severity), ['critica', 'alta', 'media', 'baixa', 'informativa'])
  assert.deepEqual(result.map(r => r.count), [1, 2, 1, 0, 0])
  assert.equal(result[0].color, '#B91C1C')
})

test('countByCategory returns all 12 categories in id order, zero-filled', () => {
  const result = countByCategory(findings)
  assert.equal(result.length, 12)
  assert.deepEqual(result.map(r => r.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  assert.equal(result[0].count, 2)
  assert.equal(result[2].count, 2)
  assert.equal(result[1].count, 0)
})

test('groupRecommendations skips empty severities and numbers priorities sequentially', () => {
  const groups = groupRecommendations(findings)
  assert.deepEqual(groups.map(g => g.priority), ['P1', 'P2', 'P3'])
  assert.deepEqual(groups.map(g => g.severity), ['critica', 'alta', 'media'])
  assert.equal(groups[1].findings.length, 2)
})

test('groupRecommendations sorts findings within a group by file then line', () => {
  const groups = groupRecommendations(findings)
  const altaGroup = groups.find(g => g.severity === 'alta')
  assert.deepEqual(altaGroup.findings.map(f => f.id), ['F3', 'F2'])
})

test('diffFindings: identical runs produce nothing fixed and nothing new', () => {
  const runA = { findings: [{ id: 'F1', file: 'a.ts', line: 5, severity: 'alta' }] }
  const runB = { findings: [{ id: 'F1', file: 'a.ts', line: 5, severity: 'alta' }] }
  const result = diffFindings(runA, runB)
  assert.deepEqual(result.fixed, [])
  assert.deepEqual(result.new, [])
  assert.equal(result.unchanged.length, 1)
  assert.equal(result.unchanged[0].id, 'F1')
})

test('diffFindings: a finding present only in runA is fixed', () => {
  const runA = { findings: [{ id: 'F1', file: 'a.ts', line: 5, severity: 'alta' }] }
  const runB = { findings: [] }
  const result = diffFindings(runA, runB)
  assert.equal(result.fixed.length, 1)
  assert.equal(result.fixed[0].id, 'F1')
  assert.deepEqual(result.new, [])
  assert.deepEqual(result.unchanged, [])
})

test('diffFindings: a finding present only in runB is new', () => {
  const runA = { findings: [] }
  const runB = { findings: [{ id: 'F1', file: 'a.ts', line: 5, severity: 'alta' }] }
  const result = diffFindings(runA, runB)
  assert.deepEqual(result.fixed, [])
  assert.equal(result.new.length, 1)
  assert.equal(result.new[0].id, 'F1')
  assert.deepEqual(result.unchanged, [])
})

test('diffFindings: same file:line re-flagged with a different id in the later run counts as unchanged, not fixed+new', () => {
  const runA = { findings: [{ id: 'F1', file: 'a.ts', line: 5, severity: 'alta' }] }
  const runB = { findings: [{ id: 'F3', file: 'a.ts', line: 5, severity: 'critica' }] }
  const result = diffFindings(runA, runB)
  assert.equal(result.fixed.length, 1)
  assert.equal(result.fixed[0].id, 'F1')
  assert.equal(result.new.length, 1)
  assert.equal(result.new[0].id, 'F3')
  assert.deepEqual(result.unchanged, [])
})

test('diffFindings: matches by exact file:line:id triple, ignoring unrelated fields', () => {
  const runA = { findings: [{ id: 'F1', file: 'a.ts', line: 5, severity: 'alta', desc: 'old wording' }] }
  const runB = { findings: [{ id: 'F1', file: 'a.ts', line: 5, severity: 'alta', desc: 'new wording' }] }
  const result = diffFindings(runA, runB)
  assert.equal(result.unchanged.length, 1)
  assert.equal(result.unchanged[0].desc, 'new wording')
})
