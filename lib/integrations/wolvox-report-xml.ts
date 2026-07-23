export interface WolvoxXmlRow {
  [field: string]: string
}

export interface WolvoxReportXmlResult {
  rows: WolvoxXmlRow[]
  sourceFields: string[]
}

export function parseWolvoxReportXml(xml: string): WolvoxReportXmlResult {
  if (!/<report(?:\s|>)/i.test(xml) || !/<table(?:\s|>)/i.test(xml)) {
    throw new Error('wolvox_report_xml_invalid_root')
  }

  const rows: WolvoxXmlRow[] = []
  const sourceFields = new Set<string>()
  const rowPattern = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowPattern.exec(xml)) !== null) {
    const source = parseSourceRow(rowMatch[1])
    for (const field of Object.keys(source)) sourceFields.add(field)
    rows.push(source)
  }

  if (!rows.length) throw new Error('wolvox_report_xml_empty')
  return { rows, sourceFields: Array.from(sourceFields) }
}

function parseSourceRow(rowXml: string) {
  const source: WolvoxXmlRow = {}
  const fieldPattern = /<([A-Z0-9_]+)(?:\s[^>]*)?>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/\1>/gi
  let fieldMatch: RegExpExecArray | null
  while ((fieldMatch = fieldPattern.exec(rowXml)) !== null) {
    source[fieldMatch[1].toUpperCase()] = decodeXmlText(fieldMatch[2] ?? fieldMatch[3] ?? '').trim()
  }
  return source
}

function decodeXmlText(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hexadecimal: string) => String.fromCodePoint(Number.parseInt(hexadecimal, 16)))
}
