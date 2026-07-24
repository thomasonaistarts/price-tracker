import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  isAutomaticMatchEligible,
  matchProduct,
} from '../lib/scrapers/similarity.ts'

const cases = JSON.parse(
  fs.readFileSync(path.resolve('tests/fixtures/scraper-match-cases.json'), 'utf8'),
)

for (const fixture of cases) {
  test(`scraper identity fixture: ${fixture.name}`, () => {
    const result = matchProduct(fixture.query, fixture.candidate)
    assert.equal(isAutomaticMatchEligible(result.confidence), fixture.accepted)
  })
}
