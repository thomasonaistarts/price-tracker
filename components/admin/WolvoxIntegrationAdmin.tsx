'use client'

import { useEffect, useMemo, useState } from 'react'
import { archiveCountsMatch, CATALOG_ARCHIVE_TABLES, totalArchiveRows, type ArchiveCounts } from '@/lib/integrations/catalog-archive'

interface UserOption {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
}

interface Connection {
  id: string
  owner_user_id: string
  display_name: string
  status: string
  wolvox_version: string | null
  company_code: string | null
  working_year: number | null
  last_heartbeat_at: string | null
  last_error: string | null
}

interface ArchiveBatch {
  id: string
  status: 'preparing' | 'verified' | 'failed'
  source_counts: ArchiveCounts
  archive_counts: ArchiveCounts
  reason: string | null
  created_at: string
  verified_at: string | null
}

interface Payload {
  counts: ArchiveCounts
  users: UserOption[]
  connections: Connection[]
  archives: ArchiveBatch[]
}

const LABELS: Record<string, string> = {
  users: 'Kullanıcılar',
  user_settings: 'Kullanıcı ayarları',
  category_thresholds: 'Kategori eşikleri',
  products: 'Ürünler',
  price_analyses: 'Fiyat analizleri',
  analysis_attempts: 'Analiz denemeleri',
  source_match_decisions: 'Kaynak kararları',
  product_price_changes: 'Fiyat değişiklikleri',
}

export default function WolvoxIntegrationAdmin() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [savingConnection, setSavingConnection] = useState(false)
  const [creatingArchive, setCreatingArchive] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/integrations/wolvox', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Entegrasyon bilgileri yüklenemedi')
      setData(payload)
      setOwnerId(current => current || payload.connections?.[0]?.owner_user_id || payload.users?.find((user: UserOption) => user.email.toLowerCase() === 'info@efe-kirtasiye.com')?.id || '')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Entegrasyon bilgileri yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const activeUsers = useMemo(() => data?.users.filter(user => user.is_active) ?? [], [data])
  const connection = data?.connections.find(item => item.owner_user_id === ownerId) ?? data?.connections[0] ?? null
  const latestArchive = data?.archives[0] ?? null

  async function assignConnection() {
    if (!ownerId) return
    setSavingConnection(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/integrations/wolvox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign_connection', owner_user_id: ownerId }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Bağlantı atanamadı')
      setMessage('Wolvox bağlantı sahipliği kaydedildi. Henüz gerçek Wolvox bağlantısı kurulmadı.')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Bağlantı atanamadı')
    } finally {
      setSavingConnection(false)
    }
  }

  async function createArchive() {
    const approved = confirm('Bu işlem tüm canlı iş verilerinin doğrulanmış arşiv kopyasını oluşturur. Canlı verileri silmez. Devam edilsin mi?')
    if (!approved) return
    setCreatingArchive(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/integrations/wolvox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_archive', reason: 'Wolvox geçişi öncesi site geneli doğrulanmış arşiv' }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Arşiv oluşturulamadı')
      setMessage('Arşiv kopyası oluşturuldu ve tablo sayımları doğrulandı. Canlı veriler değiştirilmedi.')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Arşiv oluşturulamadı')
    } finally {
      setCreatingArchive(false)
    }
  }

  if (loading && !data) return <div className="rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">Entegrasyon bilgileri yükleniyor…</div>

  return (
    <div className="max-w-5xl space-y-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">{message}</div>}

      <section className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Wolvox bağlantı sahipliği</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">Bağlantı yalnızca seçilen kullanıcının kataloğunu yönetecek. Parolalar burada saklanmaz.</p>
        </div>
        <div className="grid gap-4 px-6 py-5 md:grid-cols-[1fr_auto] md:items-end">
          <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
            Katalog sahibi
            <select value={ownerId} onChange={event => setOwnerId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100">
              <option value="">Kullanıcı seçin</option>
              {activeUsers.map(user => <option key={user.id} value={user.id}>{user.full_name} · {user.email}</option>)}
            </select>
          </label>
          <button type="button" onClick={assignConnection} disabled={!ownerId || savingConnection} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {savingConnection ? 'Kaydediliyor…' : 'Bağlantıyı bu kullanıcıya ata'}
          </button>
        </div>
        {connection && (
          <div className="mx-6 mb-5 grid gap-3 rounded-lg bg-gray-50 p-4 text-xs dark:bg-slate-700/50 sm:grid-cols-3">
            <Info label="Durum" value={connection.status === 'configuring' ? 'Kurulum bekliyor' : connection.status} />
            <Info label="Wolvox sürümü" value={connection.wolvox_version ?? 'Yarın doğrulanacak'} />
            <Info label="Son bağlantı" value={connection.last_heartbeat_at ? new Date(connection.last_heartbeat_at).toLocaleString('tr-TR') : 'Henüz bağlantı yok'} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Site geneli arşiv hazırlığı</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">Tüm kullanıcıların mevcut iş verilerini geri alınabilir bir kopyaya taşır; canlı kayıtları silmez.</p>
          </div>
          <button type="button" onClick={createArchive} disabled={creatingArchive || !data} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
            {creatingArchive ? 'Arşivleniyor…' : 'Doğrulanmış arşiv oluştur'}
          </button>
        </div>
        <div className="grid gap-2 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
          {CATALOG_ARCHIVE_TABLES.map(table => (
            <div key={table} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-700/40">
              <div className="text-[11px] text-gray-500 dark:text-slate-400">{LABELS[table]}</div>
              <div className="mt-0.5 text-lg font-semibold text-gray-900 dark:text-slate-100">{Number(data?.counts[table] ?? 0).toLocaleString('tr-TR')}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 px-6 py-4 text-xs dark:border-slate-700">
          {latestArchive ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className={archiveCountsMatch(latestArchive.source_counts, latestArchive.archive_counts) && latestArchive.status === 'verified' ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'font-semibold text-red-600 dark:text-red-400'}>
                  {latestArchive.status === 'verified' ? '✓ Son arşiv doğrulandı' : 'Son arşiv doğrulanamadı'}
                </span>
                <span className="ml-2 text-gray-400 dark:text-slate-500">{new Date(latestArchive.created_at).toLocaleString('tr-TR')}</span>
              </div>
              <span className="text-gray-500 dark:text-slate-400">{totalArchiveRows(latestArchive.archive_counts).toLocaleString('tr-TR')} satır</span>
            </div>
          ) : (
            <p className="text-gray-500 dark:text-slate-400">Henüz arşiv kopyası oluşturulmadı.</p>
          )}
        </div>
      </section>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        Bu ekranda canlı katalog silme işlemi bulunmaz. Katalog temizliği ancak Wolvox staging verisi doğrulandıktan ve ayrıca onaylandıktan sonra geliştirilecek.
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-gray-400 dark:text-slate-500">{label}</div><div className="mt-0.5 font-medium text-gray-700 dark:text-slate-200">{value}</div></div>
}
