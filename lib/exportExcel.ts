/**
 * xlsx ile client-side Excel export yardımcısı.
 * Dynamic import ile kullanılır — bundle boyutunu etkilemez.
 */
export async function downloadExcel(
  rows: Record<string, unknown>[],
  filename: string,
  sheetName = 'Rapor',
) {
  const XLSX = await import('xlsx')

  const ws = XLSX.utils.json_to_sheet(rows)

  // Sütun genişliklerini içeriğe göre ayarla
  const colWidths = Object.keys(rows[0] ?? {}).map(key => {
    const maxLen = Math.max(
      key.length,
      ...rows.map(r => String(r[key] ?? '').length),
    )
    return { wch: Math.min(maxLen + 2, 50) }
  })
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
