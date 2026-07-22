const DEFAULT_PAGE_SIZE = 1000

interface SupabasePage<T> {
  data: T[] | null
  error: unknown
}

export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => Promise<SupabasePage<T>>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) throw error

    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}
