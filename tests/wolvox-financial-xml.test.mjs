import test from 'node:test'
import assert from 'node:assert/strict'
import { parseWolvoxInvoiceAnalysisXml } from '../lib/integrations/wolvox-financial-xml.ts'

const xml = `<report><table>
  <row>
    <ANALIZ_ZAMANI>22.07.2026 16:04:00</ANALIZ_ZAMANI>
    <ALIS_TUTARI>1.250,50</ALIS_TUTARI><ALIS_IADE>50,25</ALIS_IADE><NET_ALIS>1.200,25</NET_ALIS>
    <SATIS_TUTARI>2.500,75</SATIS_TUTARI><SATIS_IADE>100,25</SATIS_IADE><NET_SATIS>2.400,50</NET_SATIS>
  </row>
</table></report>`

test('invoice analysis rows become idempotent financial summaries', () => {
  const [row] = parseWolvoxInvoiceAnalysisXml(xml, '2026-07-22')
  assert.equal(row.analysis_time, '16:04:00')
  assert.equal(row.purchase_total, 1250.5)
  assert.equal(row.sales_return_total, 100.25)
  assert.equal(row.net_sales_total, 2400.5)
  assert.match(row.source_hash, /^[0-9a-f]{8}$/)
  assert.equal(
    parseWolvoxInvoiceAnalysisXml(xml, '2026-07-22')[0].source_hash,
    row.source_hash,
  )
})

test('invoice analysis rejects an ambiguous report date', () => {
  assert.throws(
    () => parseWolvoxInvoiceAnalysisXml(xml, '22.07.2026'),
    /summary_date_invalid/,
  )
})
