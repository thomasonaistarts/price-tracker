export type WolvoxReadinessCheckId =
  | 'connection_assigned'
  | 'archive_verified'
  | 'catalog_received'
  | 'sync_succeeded'
  | 'records_valid'
  | 'conflicts_resolved'
  | 'counts_consistent'

export interface WolvoxCutoverInput {
  connectionAssigned: boolean
  archiveVerified: boolean
  stagingTotal: number
  matched: number
  newProducts: number
  conflicts: number
  invalid: number
  classifiedConflicts?: number
  classifiedInvalid?: number
  latestSyncStatus: 'running' | 'succeeded' | 'failed' | 'cancelled' | null
}

export interface WolvoxReadinessCheck {
  id: WolvoxReadinessCheckId
  label: string
  passed: boolean
  detail: string
}

export function evaluateWolvoxCutoverReadiness(input: WolvoxCutoverInput) {
  const catalogReceived = input.stagingTotal > 0
  const classifiedConflicts = input.classifiedConflicts ?? input.conflicts
  const classifiedInvalid = input.classifiedInvalid ?? input.invalid
  const checks: WolvoxReadinessCheck[] = [
    {
      id: 'connection_assigned',
      label: 'Wolvox katalog sahibi atandı',
      passed: input.connectionAssigned,
      detail: input.connectionAssigned ? 'Bağlantı bir kullanıcı kataloğuna bağlı.' : 'Önce bağlantı sahibi seçilmeli.',
    },
    {
      id: 'archive_verified',
      label: 'Site geneli arşiv doğrulandı',
      passed: input.archiveVerified,
      detail: input.archiveVerified ? 'Canlı iş verilerinin geri alınabilir kopyası var.' : 'Doğrulanmış arşiv olmadan geçiş yapılamaz.',
    },
    {
      id: 'catalog_received',
      label: 'Wolvox kataloğu staging alanına alındı',
      passed: catalogReceived,
      detail: catalogReceived ? `${input.stagingTotal.toLocaleString('tr-TR')} ürün alındı.` : 'İlk gerçek Wolvox katalog okuması bekleniyor.',
    },
    {
      id: 'sync_succeeded',
      label: 'Son katalog okuması başarılı',
      passed: catalogReceived && input.latestSyncStatus === 'succeeded',
      detail: input.latestSyncStatus === 'failed' ? 'Son okuma başarısız; hata giderilip yeniden çalıştırılmalı.' : input.latestSyncStatus === 'running' ? 'Katalog okuması sürüyor.' : input.latestSyncStatus === 'succeeded' ? 'Son okuma tamamlandı.' : 'Henüz katalog okuması yok.',
    },
    {
      id: 'records_valid',
      label: 'Hatalı staging kaydı yok',
      passed: catalogReceived && input.invalid === 0,
      detail: catalogReceived ? (input.invalid === 0 ? 'Tüm kayıtlar temel doğrulamadan geçti.' : `${input.invalid.toLocaleString('tr-TR')} hatalı kayıt düzeltilmeli.`) : 'Katalog gelince doğrulanacak.',
    },
    {
      id: 'conflicts_resolved',
      label: 'Barkod/SKU çakışması yok',
      passed: catalogReceived && input.conflicts === 0,
      detail: catalogReceived ? (input.conflicts === 0 ? 'Ürün anahtarları benzersiz.' : `${input.conflicts.toLocaleString('tr-TR')} çakışan kayıt çözülmeli.`) : 'Katalog gelince kontrol edilecek.',
    },
    {
      id: 'counts_consistent',
      label: 'Staging sayımları tutarlı',
      passed: catalogReceived && input.matched + input.newProducts + classifiedConflicts + classifiedInvalid === input.stagingTotal,
      detail: catalogReceived ? 'Önizleme kayıtları eksiksiz sınıflandırıldı.' : 'Katalog gelince sayımlar karşılaştırılacak.',
    },
  ]

  return {
    ready: checks.every(check => check.passed),
    passedCount: checks.filter(check => check.passed).length,
    totalCount: checks.length,
    checks,
  }
}
