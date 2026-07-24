import { parseWolvoxNumber } from './wolvox-catalog.ts'
import { parseWolvoxReportXml } from './wolvox-report-xml.ts'

export interface WolvoxFinancialSummaryRow {
  summary_date: string
  analysis_time: string | null
  purchase_total: number
  purchase_return_total: number
  net_purchase_total: number
  sales_total: number
  sales_return_total: number
  net_sales_total: number
  source_hash: string
}

export function parseWolvoxInvoiceAnalysisXml(
  xml: string,
  summaryDate: string,
): WolvoxFinancialSummaryRow[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(summaryDate)) {
    throw new Error('wolvox_financial_summary_date_invalid')
  }
  const parsed = parseWolvoxReportXml(xml)
  return parsed.rows.map(row => {
    const analysisTime = normalizeTime(row.ANALIZ_ZAMANI)
    const values = {
      purchase_total: money(row.ALIS_TUTARI),
      purchase_return_total: money(row.ALIS_IADE),
      net_purchase_total: money(row.NET_ALIS),
      sales_total: money(row.SATIS_TUTARI),
      sales_return_total: money(row.SATIS_IADE),
      net_sales_total: money(row.NET_SATIS),
    }
    return {
      summary_date: summaryDate,
      analysis_time: analysisTime,
      ...values,
      source_hash: stableFingerprint([
        summaryDate,
        analysisTime ?? '',
        ...Object.values(values),
      ]),
    }
  })
}

export function stableFingerprint(values: Array<string | number | null>) {
  const input = values.map(value => String(value ?? '')).join('\u001f')
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function money(value: unknown) {
  return parseWolvoxNumber(value) ?? 0
}

function normalizeTime(value?: string) {
  if (!value?.trim()) return null
  const match = value.trim().match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3] ?? 0)
  if (hour > 23 || minute > 59 || second > 59) return null
  return [hour, minute, second].map(part => String(part).padStart(2, '0')).join(':')
}
