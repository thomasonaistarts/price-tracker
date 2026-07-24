export async function withProductScrapeLease<T>(
  supabase: any,
  productId: string,
  job: () => Promise<T>,
  leaseSeconds = 300,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const owner = crypto.randomUUID()
  const { data, error } = await supabase.rpc('claim_scrape_job', {
    p_product_id: productId,
    p_lease_owner: owner,
    p_lease_seconds: leaseSeconds,
  })

  // Aşamalı rollout: migration henüz uygulanmamışsa mevcut işi durdurma.
  const migrationMissing = error && (
    String(error.code ?? '') === 'PGRST202'
    || String(error.message ?? '').includes('claim_scrape_job')
  )
  if (error && !migrationMissing) throw new Error('Scrape kilidi alınamadı')
  if (!migrationMissing && data !== true) return { acquired: false }

  try {
    return { acquired: true, value: await job() }
  } finally {
    if (!migrationMissing) {
      try {
        await supabase.rpc('release_scrape_job', {
          p_product_id: productId,
          p_lease_owner: owner,
        })
      } catch {
        // Lease süresi zaten sınırlıdır; release hatası ana analiz sonucunu bozmamalı.
      }
    }
  }
}
