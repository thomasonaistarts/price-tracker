import test from 'node:test'
import assert from 'node:assert/strict'
import { computeReportData, generateWeeklyEmailHtml } from '../lib/email-report.ts'

test('weekly trend is ordered by date even when history arrives out of order', () => {
  const history = [
    { run_at: '2026-02-03T12:00:00.000Z', alert: 'above_market', product_id: 'b' },
    { run_at: '2026-01-27T12:00:00.000Z', alert: 'below_market', product_id: 'a' },
  ]

  const report = computeReportData([], history, 'test@example.com')
  const expectedFirst = new Date('2026-01-26').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
  const expectedSecond = new Date('2026-02-02').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })

  assert.deepEqual(report.weeks.map(week => week.label), [expectedFirst, expectedSecond])
})

test('email footer describes the configured weekly schedule generically', () => {
  const report = computeReportData([], [], 'test@example.com')
  const html = generateWeeklyEmailHtml(report)

  assert.match(html, /belirlediğiniz haftalık programa göre/)
  assert.doesNotMatch(html, /her Pazartesi sabahı/)
})
