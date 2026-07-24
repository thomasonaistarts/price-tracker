interface SearchHealth {
  platform: string
  status: 'success' | 'empty' | 'timeout' | 'error'
}

export function platformsEligibleForFallback(
  attemptedPlatforms: string[],
  attemptHealth: SearchHealth[],
  matchedPlatforms: Set<string>,
): string[] {
  const cleanlyCompleted = new Set(
    attemptHealth
      .filter(item => item.status === 'success' || item.status === 'empty')
      .map(item => item.platform)
  )

  // İsim/marka fallback'i yalnızca sağlayıcı çağrısı teknik olarak tamamlandıysa
  // anlamlıdır. Kota, HTTP hatası veya timeout aynı sağlayıcıyı tekrar çağırarak
  // düzelmez; bu platformlar sonraki sorgudan çıkarılır.
  return attemptedPlatforms.filter(
    platform => cleanlyCompleted.has(platform) && !matchedPlatforms.has(platform)
  )
}
