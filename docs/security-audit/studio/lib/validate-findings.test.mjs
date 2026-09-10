import test from 'node:test'
import assert from 'node:assert/strict'
import { validateFindings, scanForSecrets, redactSecrets } from './validate-findings.mjs'
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

test('rejects a finding missing from all issue_groups', () => {
  const doc = buildValidDoc()
  doc.findings.push({
    id: 'F2', category: 1, severity: 'baixa', file: 'src/c.ts', line: 5,
    cwe: 'CWE-1', owasp: 'A01:2021', desc: 'd', code: 'c', why: 'w',
    impact: 'i', fix: 'f', acceptance: ['ok'], rgpd_article: null,
    exploitability_notes: null,
  })
  // issue_groups still only covers F1, not F2
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('finding "F2" is not covered by any group')))
})

test('rejects a finding appearing in two issue_groups', () => {
  const doc = buildValidDoc()
  doc.issue_groups = [['F1'], ['F1']]
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('finding "F1" appears in more than one group')))
})

test('accepts full issue_groups coverage with one finding per group', () => {
  const doc = buildValidDoc()
  // buildValidDoc already gives exactly one finding (F1) covered by exactly one group
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, true)
  assert.deepEqual(errors, [])
})

test('rejects a scans[] item that is an empty object', () => {
  const doc = buildValidDoc()
  doc.scans = [{}]
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('scans[0]: expected a non-empty object')))
})

test('rejects a sbom[] item that is not an object', () => {
  const doc = buildValidDoc()
  doc.sbom = ['react']
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('sbom[0]: expected a non-empty object')))
})

test('accepts scans[]/sbom[] items in either the canonical or the historical (Notely) shape', () => {
  const doc = buildValidDoc()
  doc.scans = [{ tool: 'npm audit', command: 'npm audit --json', result: '0 vulns' }]
  doc.sbom = [{ name: 'react', version: '19.2.1', type: 'production' }]
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, true)
  assert.deepEqual(errors, [])
})

test('rejects an empty audit_date', () => {
  const doc = buildValidDoc()
  doc.audit_date = ''
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('audit_date')))
})

test('rejects a null audit_date', () => {
  const doc = buildValidDoc()
  doc.audit_date = null
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('audit_date')))
})

test('rejects an empty-string na_reason on a non-applicable category', () => {
  const doc = buildValidDoc()
  const cat1 = doc.categories.find(c => c.id === 1)
  cat1.applicable = false
  cat1.na_reason = '   '
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('na_reason required (non-empty string)')))
})

test('rejects a category whose name does not match the fixed CATEGORY_NAMES entry', () => {
  const doc = buildValidDoc()
  doc.categories.find(c => c.id === 2).name = 'Wrong Name'
  const { valid, errors } = validateFindings(doc)
  assert.equal(valid, false)
  assert.ok(errors.some(e => e.includes('categories[2]: name must be')))
})

test('redactSecrets masks a real-looking AWS access key, keeping the document valid', () => {
  const doc = buildValidDoc()
  doc.findings[0].code = 'const key = "AKIAIOSFODNN7EXAMPLE123"'
  const { redacted, hits } = redactSecrets(doc)
  assert.ok(hits.some(h => h.path === 'findings[0].code' && h.rule === 'aws-access-key'))
  assert.ok(!redacted.findings[0].code.includes('AKIAIOSFODNN7EXAMPLE123'))
  assert.ok(redacted.findings[0].code.includes('***REDACTED***'))
  assert.equal(validateFindings(redacted).valid, true)
})

test('redactSecrets masks a PEM private key block entirely', () => {
  const doc = buildValidDoc()
  doc.findings[0].code = '-----BEGIN RSA PRIVATE KEY-----\nMIIExample\n-----END RSA PRIVATE KEY-----'
  const { redacted, hits } = redactSecrets(doc)
  assert.ok(hits.some(h => h.rule === 'private-key-block'))
  assert.ok(!redacted.findings[0].code.includes('MIIExample'))
})

test('redactSecrets masks a non-placeholder password assignment, keeping the field name', () => {
  const doc = buildValidDoc()
  doc.findings[0].code = 'password = "Tr0ub4dor&3xtra"'
  const { redacted, hits } = redactSecrets(doc)
  assert.ok(hits.some(h => h.rule === 'secret-assignment'))
  assert.equal(redacted.findings[0].code, 'password = "***REDACTED***"')
})

test('redactSecrets masks a real email address', () => {
  const doc = buildValidDoc()
  doc.rgpd_panel[0].evidence = 'DPO contact: dpo@empresa-real.pt'
  const { redacted, hits } = redactSecrets(doc)
  assert.ok(hits.some(h => h.rule === 'email'))
  assert.equal(redacted.rgpd_panel[0].evidence, 'DPO contact: ***REDACTED***')
})

test('redactSecrets leaves an obvious dev-placeholder default untouched', () => {
  const doc = buildValidDoc()
  doc.findings[0].code = 'secret_key: str = "change-this-api-secret"\npostgres_password: str = "rede_social_techx_dev"'
  const { redacted, hits } = redactSecrets(doc)
  assert.deepEqual(hits, [])
  assert.equal(redacted.findings[0].code, doc.findings[0].code)
})

test('scanForSecrets reports the JSON path of the offending field', () => {
  const doc = buildValidDoc()
  doc.findings[0].desc = 'token: "AIzaSyD-abcdefghijklmnopqrstuvwxyz12345"'
  const hits = scanForSecrets(doc)
  assert.ok(hits.some(h => h.path === 'findings[0].desc' && h.rule === 'google-api-key'))
})
