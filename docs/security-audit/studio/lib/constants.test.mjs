import test from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORY_NAMES, SEVERITY_ORDER, SEVERITY_COLORS } from './constants.mjs'

test('CATEGORY_NAMES has exactly the 12 fixed ids', () => {
  assert.deepEqual(Object.keys(CATEGORY_NAMES).map(Number).sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
})

test('SEVERITY_ORDER and SEVERITY_COLORS share the same 5 keys', () => {
  assert.equal(SEVERITY_ORDER.length, 5)
  assert.deepEqual([...SEVERITY_ORDER].sort(), Object.keys(SEVERITY_COLORS).sort())
})
