export const CATALOG_ARCHIVE_TABLES = [
  'users',
  'user_settings',
  'category_thresholds',
  'products',
  'price_analyses',
  'analysis_attempts',
  'source_match_decisions',
  'product_price_changes',
] as const

export type CatalogArchiveTable = (typeof CATALOG_ARCHIVE_TABLES)[number]
export type ArchiveCounts = Partial<Record<CatalogArchiveTable, number>>

export function archiveCountsMatch(source: ArchiveCounts, archived: ArchiveCounts) {
  return CATALOG_ARCHIVE_TABLES.every(table => Number(source[table] ?? 0) === Number(archived[table] ?? 0))
}

export function totalArchiveRows(counts: ArchiveCounts) {
  return CATALOG_ARCHIVE_TABLES.reduce((total, table) => total + Number(counts[table] ?? 0), 0)
}
