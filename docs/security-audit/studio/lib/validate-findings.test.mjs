import test from 'node:test'
import assert from 'node:assert/strict'
import { validateFindings } from './validate-findings.mjs'
import { CATEGORY_NAMES } from './constants.mjs'

function buildValidDoc() {
  const categories = Object.keys(CATEGORY_NAMES).map(Number).map(id => ({
    id, name: CATEGORY_NAMES[id], maturity: 50,
    applicable: id === 1, na_reason: id === 1 ? null : 'não se aplica ao escopo de teste',
  }))
  return {
    project: 'Fixture Co', audit_date: '2026-01-01', scope: 'teste',
    stack: [{ layer: 'Backend', detail: 'Node' }], methodology_note: 'nota',
    categories,
    findings: [{
      id: 'F1', category: 1, severity: 'alta', file: 'src/a.ts', line: 10,
      cwe: 'CWE-639', owasp: 'A01:2021', desc: 'd', code: 'c', why: 'w',
      impact: 'i', fix: 'f', acceptance: ['ok'], rgpd_article: null,
      exploitability_notes: null,
    }],
    strengths: [{ evidence: 'src/b.ts:1', note: 'ok', applies_to: ['security'] }],
    weaknesses: { security: ['x'], rgpd: [] },
    rgpd_panel: [{ id: '12.1', topic: 't', status: 'conforme', evidence: 'e' }],
    scans: [], sbom: [], limits: [], issue_groups: [['F1']],
  }
}

test('accepts a fully valid document', () => {
  const { valid, errors } = validateFindings(buildValidDoc())
  assert.equal(valid, true)
  assert.deepEqual(errors, [])
})

test('rejects a document missing a required top-level key', () => {
  const doc = buildValidDoc()
  delete doc.findings
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('findings')))
})

test('rejects an invalid severity value', () => {
  const doc = buildValidDoc()
  doc.findings[0].severity = 'urgente'
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('invalid severity')))
})

test('rejects a finding referencing an unknown category', () => {
  const doc = buildValidDoc()
  doc.findings[0].category = 99
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('unknown category')))
})

test('rejects issue_groups referencing an unknown finding id', () => {
  const doc = buildValidDoc()
  doc.issue_groups = [['F1', 'F404']]
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('F404')))
})

test('rejects a categories list missing one of the 12 fixed ids', () => {
  const doc = buildValidDoc()
  doc.categories = doc.categories.filter(c => c.id !== 12)
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('missing entry for id 12')))
})
