import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeWolvoxStagingDecisions,
  summarizeWolvoxStagingDecisions,
} from '../lib/integrations/wolvox-staging-decisions.ts'

test('only supported Wolvox staging decisions are retained', () => {
  assert.deepEqual(sanitizeWolvoxStagingDecisions({
    ' 100 ': 'exclude',
    '200': 'use_sku',
    '300': 'include',
    '': 'exclude',
  }), {
    '100': 'exclude',
    '200': 'use_sku',
  })
})

test('invalid records require exclusion while conflicts can use Wolvox SKU', () => {
  const summary = summarizeWolvoxStagingDecisions([
    { external_id: 'invalid-1', status: 'invalid' },
    { external_id: 'conflict-1', status: 'conflict' },
    { external_id: 'conflict-2', status: 'conflict' },
  ], {
    'invalid-1': 'exclude',
    'conflict-1': 'use_sku',
  })

  assert.deepEqual(summary, {
    invalid: 1,
    conflict: 2,
    excluded: 1,
    useSku: 1,
    unresolvedInvalid: 0,
    unresolvedConflict: 1,
  })
})
