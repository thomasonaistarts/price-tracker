'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { archiveCountsMatch, CATALOG_ARCHIVE_TABLES, totalArchiveRows, type ArchiveCounts } from '@/lib/integrations/catalog-archive'
import { evaluateWolvoxCutoverReadiness } from '@/lib/integrations/wolvox-cutover'
import { mergeWolvoxInventory, parseWolvoxInventoryXml } from '@/lib/integrations/wolvox-inventory-xml'
import type { WolvoxStagingDecision } from '@/lib/integrations/wolvox-staging-decisions'
import { parseWolvoxStockXml } from '@/lib/integrations/wolvox-stock-xml'

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

interface StagingPreviewRow {
  external_id: string
  sku: string | null
  barcode: string | null
  product_name: string | null
  sales_price: number | null
  stock_quantity: number | null
  status: 'matched' | 'new' | 'conflict' | 'invalid'
  method: 'barcode' | 'sku' | null
  current_product_name: string | null
  validation_errors: string[]
  decision?: WolvoxStagingDecision | null
}

interface StagingPayload {
  connection: { id: string; owner_user_id: string; display_name: string; status: string } | null
  total: number
  live_product_count?: number
  summary: { matched: number; new: number; conflict: number; invalid: number }
  preview: StagingPreviewRow[]
  issues: StagingPreviewRow[]
  resolution: {
    invalid: number
    conflict: number
    excluded: number
    useSku: number
    unresolvedInvalid: number
    unresolvedConflict: number
  }
  cutover_plan: {
    ready: boolean
    archive_batch_id: string | null
    archive_verified: boolean
    delete_count: number
    insert_count: number
    excluded_count: number
    rejected_count: number
    cleared_barcode_count: number
    owner_user_id: string
    confirmation_code: string
  }
  latest_run: {
    id: string
    status: 'running' | 'succeeded' | 'failed' | 'cancelled'
    received_count: number
    valid_count: number
    invalid_count: number
    started_at: string
    finished_at: string | null
    error_message: string | null
  } | null
}

interface StagingUploadProgress {
  phase: 'reading' | 'parsing' | 'uploading' | 'finalizing'
  uploaded: number
  total: number
}

const STAGING_UPLOAD_CHUNK_SIZE = 500

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
  const [staging, setStaging] = useState<StagingPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [savingConnection, setSavingConnection] = useState(false)
  const [creatingArchive, setCreatingArchive] = useState(false)
  const [catalogFile, setCatalogFile] = useState<File | null>(null)
  const [inventoryFile, setInventoryFile] = useState<File | null>(null)
  const [uploadingStaging, setUploadingStaging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<StagingUploadProgress | null>(null)
  const [issueDecisions, setIssueDecisions] = useState<Record<string, WolvoxStagingDecision>>({})
  const [savingDecisions, setSavingDecisions] = useState(false)
  const [cutoverConfirmation, setCutoverConfirmation] = useState('')
  const [executingCutover, setExecutingCutover] = useState(false)
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

      if (payload.connections?.[0]?.id) {
        const stagingResponse = await fetch(`/api/admin/integrations/wolvox/staging?connection_id=${encodeURIComponent(payload.connections[0].id)}`, { cache: 'no-store' })
        const stagingPayload = await stagingResponse.json()
        if (!stagingResponse.ok) throw new Error(stagingPayload.error ?? 'Staging önizlemesi yüklenemedi')
        setStaging(stagingPayload)
        setIssueDecisions(Object.fromEntries(
          (stagingPayload.issues ?? [])
            .filter((issue: StagingPreviewRow) => issue.decision)
            .map((issue: StagingPreviewRow) => [issue.external_id, issue.decision]),
        ))
      } else {
        setStaging(null)
        setIssueDecisions({})
      }
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
  const cutoverReadiness = useMemo(() => evaluateWolvoxCutoverReadiness({
    connectionAssigned: Boolean(connection),
    archiveVerified: Boolean(latestArchive && latestArchive.status === 'verified' && archiveCountsMatch(latestArchive.source_counts, latestArchive.archive_counts)),
    stagingTotal: staging?.total ?? 0,
    matched: staging?.summary.matched ?? 0,
    newProducts: staging?.summary.new ?? 0,
    invalid: staging?.resolution.unresolvedInvalid ?? staging?.summary.invalid ?? 0,
    conflicts: staging?.resolution.unresolvedConflict ?? staging?.summary.conflict ?? 0,
    classifiedInvalid: staging?.summary.invalid ?? 0,
    classifiedConflicts: staging?.summary.conflict ?? 0,
    latestSyncStatus: staging?.latest_run?.status ?? null,
  }), [connection, latestArchive, staging])

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

  async function uploadWolvoxStaging() {
    if (!connection || !catalogFile || !inventoryFile) return

    setUploadingStaging(true)
    setUploadProgress({ phase: 'reading', uploaded: 0, total: 0 })
    setError('')
    setMessage('')

    try {
      await yieldToBrowser()
      const [catalogXml, inventoryXml] = await Promise.all([catalogFile.text(), inventoryFile.text()])

      setUploadProgress({ phase: 'parsing', uploaded: 0, total: 0 })
      await yieldToBrowser()
      const catalog = parseWolvoxStockXml(catalogXml)
      const inventory = parseWolvoxInventoryXml(inventoryXml)
      const merged = mergeWolvoxInventory(catalog.products, inventory.records)
      const total = merged.products.length

      const approved = confirm(
        `${total.toLocaleString('tr-TR')} Wolvox ürünü ve ${inventory.sourceRowCount.toLocaleString('tr-TR')} depo kaydı işlendi.\n\n` +
        `${merged.summary.matchedProducts.toLocaleString('tr-TR')} üründe depo verisi eşleşti; ` +
        `${merged.summary.catalogWithoutInventory.toLocaleString('tr-TR')} ürün stok 0 kabul edilecek.\n\n` +
        'Veriler yalnızca staging alanına aktarılacak. Canlı ürünler değişmeyecek. Devam edilsin mi?',
      )
      if (!approved) return

      const started = await postStaging({
        action: 'start',
        connection_id: connection.id,
        expected_count: total,
      })
      const syncRunId = String(started.sync_run_id)
      setUploadProgress({ phase: 'uploading', uploaded: 0, total })

      for (let from = 0; from < total; from += STAGING_UPLOAD_CHUNK_SIZE) {
        const products = merged.products.slice(from, from + STAGING_UPLOAD_CHUNK_SIZE)
        await postStaging({
          action: 'append',
          connection_id: connection.id,
          sync_run_id: syncRunId,
          row_offset: from,
          products,
        })
        setUploadProgress({ phase: 'uploading', uploaded: Math.min(from + products.length, total), total })
        await yieldToBrowser()
      }

      setUploadProgress({ phase: 'finalizing', uploaded: total, total })
      const finalized = await postStaging({
        action: 'finalize',
        connection_id: connection.id,
        sync_run_id: syncRunId,
      })

      setMessage(
        `Wolvox staging kataloğu doğrulandı: ${Number(finalized.valid_count).toLocaleString('tr-TR')} geçerli, ` +
        `${Number(finalized.invalid_count).toLocaleString('tr-TR')} hatalı kayıt. Canlı ürünler değiştirilmedi.`,
      )
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Wolvox staging aktarımı tamamlanamadı')
    } finally {
      setUploadingStaging(false)
      setUploadProgress(null)
    }
  }

  function setIssueDecision(externalId: string, decision: WolvoxStagingDecision | null) {
    setIssueDecisions(current => {
      const next = { ...current }
      if (decision) next[externalId] = decision
      else delete next[externalId]
      return next
    })
  }

  function excludeAllInvalidRecords() {
    if (!staging) return
    setIssueDecisions(current => {
      const next = { ...current }
      for (const issue of staging.issues) {
        if (issue.status === 'invalid') next[issue.external_id] = 'exclude'
      }
      return next
    })
  }

  async function saveIssueDecisions() {
    if (!connection || !staging?.latest_run) return
    setSavingDecisions(true)
    setError('')
    setMessage('')
    try {
      const payload = await postStaging({
        action: 'save_decisions',
        connection_id: connection.id,
        sync_run_id: staging.latest_run.id,
        decisions: issueDecisions,
      })
      setMessage(
        `Staging kararları kaydedildi: ${Number(payload.resolution.excluded).toLocaleString('tr-TR')} kayıt hariç, ` +
        `${Number(payload.resolution.useSku).toLocaleString('tr-TR')} kayıt WOLVOX stok koduyla korunacak.`,
      )
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Staging kararları kaydedilemedi')
    } finally {
      setSavingDecisions(false)
    }
  }

  async function executeCutover() {
    const plan = staging?.cutover_plan
    if (!connection || !staging?.latest_run || !plan?.ready) return
    if (cutoverConfirmation !== plan.confirmation_code) {
      setError('Canlı geçiş onay kodu eşleşmiyor')
      return
    }

    const approved = confirm(
      `SON ONAY\n\n${plan.delete_count.toLocaleString('tr-TR')} mevcut ürün ve bağlı canlı analiz kayıtları kaldırılacak.\n` +
      `${plan.insert_count.toLocaleString('tr-TR')} WOLVOX ürünü Efe Kırtasiye hesabına kurulacak.\n\n` +
      'Doğrulanmış arşiv korunacak. İşlem tek veritabanı transaction’ında uygulanacak. Devam edilsin mi?',
    )
    if (!approved) return

    setExecutingCutover(true)
    setError('')
    setMessage('')
    try {
      const payload = await postStaging({
        action: 'execute_cutover',
        connection_id: connection.id,
        sync_run_id: staging.latest_run.id,
        expected_delete_count: plan.delete_count,
        expected_insert_count: plan.insert_count,
        confirmation_code: cutoverConfirmation,
      })
      const result = payload.result ?? {}
      setMessage(
        `Canlı geçiş tamamlandı: ${Number(result.deleted_product_count).toLocaleString('tr-TR')} eski ürün kaldırıldı, ` +
        `${Number(result.inserted_product_count).toLocaleString('tr-TR')} WOLVOX ürünü kuruldu.`,
      )
      setCutoverConfirmation('')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Canlı WOLVOX geçişi tamamlanamadı')
    } finally {
      setExecutingCutover(false)
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
            <Info label="Wolvox sürümü" value={connection.wolvox_version ?? 'WOLVOX 26 · bağlantı kaydı bekliyor'} />
            <Info label="Son bağlantı" value={connection.last_heartbeat_at ? new Date(connection.last_heartbeat_at).toLocaleString('tr-TR') : 'Henüz bağlantı yok'} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Wolvox staging kataloğu</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">Wolvox kayıtları önce burada doğrulanır ve mevcut katalogla eşleştirilir; canlı ürünler değişmez.</p>
          </div>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
            WOLVOX 26 veri sözleşmesi hazır
          </span>
        </div>

        <div className="border-b border-gray-100 px-6 py-5 dark:border-slate-700">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <FilePicker
              id="wolvox-catalog-file"
              label="Wolvox stok listesi"
              hint="stock-list-….xml"
              file={catalogFile}
              disabled={uploadingStaging}
              onChange={setCatalogFile}
            />
            <FilePicker
              id="wolvox-inventory-file"
              label="Wolvox depo envanteri"
              hint="depot-inventory-….xml"
              file={inventoryFile}
              disabled={uploadingStaging}
              onChange={setInventoryFile}
            />
            <button
              type="button"
              onClick={uploadWolvoxStaging}
              disabled={!connection || !catalogFile || !inventoryFile || uploadingStaging}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadingStaging ? 'Staging hazırlanıyor…' : 'XML verilerini staging’e aktar'}
            </button>
          </div>
          <p className="mt-3 text-[11px] text-gray-500 dark:text-slate-400">
            Katalog ve depo XML’i tarayıcınızda birleştirilir; ürünler 500 kayıtlık doğrulamalı parçalar hâlinde staging’e gönderilir.
          </p>
          {uploadProgress && <StagingProgress progress={uploadProgress} />}
        </div>

        <div className="grid gap-2 px-6 py-5 sm:grid-cols-2 lg:grid-cols-5">
          <StagingMetric label="Toplam staging" value={staging?.total ?? 0} tone="default" />
          <StagingMetric label="Eşleşen" value={staging?.summary.matched ?? 0} tone="success" />
          <StagingMetric label="Yeni ürün" value={staging?.summary.new ?? 0} tone="info" />
          <StagingMetric label="Çakışma" value={staging?.summary.conflict ?? 0} tone="warning" />
          <StagingMetric label="Hatalı kayıt" value={staging?.summary.invalid ?? 0} tone="danger" />
        </div>

        {staging?.preview.length ? (
          <div className="border-t border-gray-100 px-6 py-4 dark:border-slate-700">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-gray-700 dark:text-slate-200">İlk {Math.min(staging.preview.length, 50)} kayıt önizlemesi</span>
              <span className="text-gray-500 dark:text-slate-400">Canlı katalog: {Number(staging.live_product_count ?? 0).toLocaleString('tr-TR')} ürün</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-slate-700">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 dark:bg-slate-700/50 dark:text-slate-400">
                  <tr><th className="px-3 py-2">Wolvox ürünü</th><th className="px-3 py-2">Barkod / SKU</th><th className="px-3 py-2">Fiyat</th><th className="px-3 py-2">Stok</th><th className="px-3 py-2">Eşleme</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {staging.preview.slice(0, 10).map(row => (
                    <tr key={row.external_id}>
                      <td className="px-3 py-2 font-medium text-gray-800 dark:text-slate-200">{row.product_name ?? 'Ürün adı eksik'}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-slate-400">{row.barcode ?? row.sku ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-slate-300">{row.sales_price === null ? '—' : money(row.sales_price)}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-slate-300">{row.stock_quantity ?? '—'}</td>
                      <td className="px-3 py-2"><StagingStatus row={row} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="border-t border-gray-100 px-6 py-4 text-xs text-gray-500 dark:border-slate-700 dark:text-slate-400">
            {connection
              ? 'Staging alanı hazır. Gerçek stok listesi ve depo envanteri XML dosyalarını yukarıdan seçerek ilk aktarımı başlatın.'
              : 'Önce Wolvox bağlantısını Efe Kırtasiye kullanıcısına atayın.'}
          </div>
        )}

        {staging?.issues.length ? (
          <div className="border-t border-gray-100 px-6 py-4 dark:border-slate-700">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  Geçişten önce karar verilecek {staging.issues.length.toLocaleString('tr-TR')} kayıt
                </h3>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                  Hatalı kayıtlar bu geçişte hariç tutulabilir. Çakışan kayıtlar hariç tutulabilir veya barkodu yok sayılarak WOLVOX stok koduyla ayrı ürün olarak korunabilir.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={excludeAllInvalidRecords} disabled={savingDecisions} className="rounded-md border border-amber-300 px-3 py-1.5 text-[11px] font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-900/20">
                  {staging.summary.invalid.toLocaleString('tr-TR')} hatalı kaydı hariç tut
                </button>
                <button type="button" onClick={saveIssueDecisions} disabled={savingDecisions || !staging.latest_run} className="rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {savingDecisions ? 'Kararlar kaydediliyor…' : 'Kararları kaydet'}
                </button>
              </div>
            </div>
            <div className="max-h-96 overflow-auto rounded-lg border border-amber-100 dark:border-amber-900/60">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <tr>
                    <th className="px-3 py-2">Wolvox kimliği</th>
                    <th className="px-3 py-2">Ürün</th>
                    <th className="px-3 py-2">Barkod / SKU</th>
                    <th className="px-3 py-2">Sorun</th>
                    <th className="px-3 py-2">Geçiş kararı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100 dark:divide-amber-900/50">
                  {staging.issues.map(row => (
                    <tr key={row.external_id}>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-500 dark:text-slate-400">{row.external_id}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 dark:text-slate-200">{row.product_name ?? 'Ürün adı eksik'}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-slate-300">{row.barcode ?? row.sku ?? '—'}</td>
                      <td className="px-3 py-2 text-amber-700 dark:text-amber-300">{stagingIssueText(row)}</td>
                      <td className="px-3 py-2">
                        <div className="flex min-w-52 flex-wrap gap-1.5">
                          <DecisionButton
                            active={issueDecisions[row.external_id] === 'exclude'}
                            tone="danger"
                            onClick={() => setIssueDecision(row.external_id, issueDecisions[row.external_id] === 'exclude' ? null : 'exclude')}
                          >
                            Hariç tut
                          </DecisionButton>
                          {row.status === 'conflict' && (
                            <DecisionButton
                              active={issueDecisions[row.external_id] === 'use_sku'}
                              tone="info"
                              onClick={() => setIssueDecision(row.external_id, issueDecisions[row.external_id] === 'use_sku' ? null : 'use_sku')}
                            >
                              SKU ile ayrı tut
                            </DecisionButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-slate-400">
              <span>Hariç tutulacak: {Object.values(issueDecisions).filter(value => value === 'exclude').length}</span>
              <span>SKU ile korunacak: {Object.values(issueDecisions).filter(value => value === 'use_sku').length}</span>
              <span>Karar bekleyen: {staging.issues.length - Object.keys(issueDecisions).length}</span>
            </div>
          </div>
        ) : null}

        {staging?.latest_run && (
          <div className="border-t border-gray-100 px-6 py-3 text-[11px] text-gray-500 dark:border-slate-700 dark:text-slate-400">
            Son staging çalışması: {new Date(staging.latest_run.started_at).toLocaleString('tr-TR')} · {staging.latest_run.status === 'succeeded' ? 'Başarılı' : staging.latest_run.status}
            {' · '}{staging.latest_run.valid_count} geçerli / {staging.latest_run.invalid_count} hatalı
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

      <section className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Canlı geçiş güvenlik kilidi</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">Katalog temizliği ancak bütün kontroller geçtikten ve ayrıca yönetici onayı verildikten sonra mümkün olacak.</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${cutoverReadiness.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300'}`}>
            {cutoverReadiness.ready ? 'Ön koşullar hazır' : `Kilitli · ${cutoverReadiness.passedCount}/${cutoverReadiness.totalCount}`}
          </span>
        </div>
        <div className="grid gap-2 px-6 py-5 md:grid-cols-2">
          {cutoverReadiness.checks.map(check => (
            <div key={check.id} className={`rounded-lg border px-3 py-3 ${check.passed ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-900/10' : 'border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-700/30'}`}>
              <div className={`text-xs font-semibold ${check.passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-slate-200'}`}>
                {check.passed ? '✓' : '○'} {check.label}
              </div>
              <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">{check.detail}</div>
            </div>
          ))}
        </div>
        {staging?.cutover_plan && (
          <div className="mx-6 mb-5 rounded-lg border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-900/10">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold text-blue-800 dark:text-blue-300">Onaylı canlı geçiş önizlemesi</h3>
                <p className="mt-1 text-[11px] text-blue-700/80 dark:text-blue-300/80">
                  İşlem tek transaction içinde eski kataloğu kaldırıp WOLVOX ürünlerini Efe Kırtasiye hesabına kuracak.
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${staging.cutover_plan.ready ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                {staging.cutover_plan.ready ? 'Önizleme hazır' : 'Kararlar tamamlanmalı'}
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <CutoverMetric label="Silinecek eski ürün" value={staging.cutover_plan.delete_count} />
              <CutoverMetric label="Kurulacak WOLVOX ürünü" value={staging.cutover_plan.insert_count} />
              <CutoverMetric label="Hariç tutulan" value={staging.cutover_plan.excluded_count} />
              <CutoverMetric label="Temizlenen ortak barkod" value={staging.cutover_plan.cleared_barcode_count} />
              <CutoverMetric label="Reddedilen aday" value={staging.cutover_plan.rejected_count} />
            </div>
            {staging.cutover_plan.ready && (
              <div className="mt-4 border-t border-blue-100 pt-4 dark:border-blue-900">
                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                  Son çalıştırma kodu: <span className="font-mono font-semibold text-gray-700 dark:text-slate-200">{staging.cutover_plan.confirmation_code}</span>
                </p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={cutoverConfirmation}
                    onChange={event => setCutoverConfirmation(event.target.value.trim())}
                    placeholder="Onay kodunu aynen yazın"
                    disabled={executingCutover}
                    className="min-w-0 flex-1 rounded-md border border-red-300 bg-white px-3 py-2 font-mono text-xs text-gray-800 outline-none focus:border-red-500 dark:border-red-900 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={executeCutover}
                    disabled={executingCutover || cutoverConfirmation !== staging.cutover_plan.confirmation_code}
                    className="rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {executingCutover ? 'Canlı geçiş uygulanıyor…' : 'Eski kataloğu kaldır ve WOLVOX’u kur'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="border-t border-gray-100 px-6 py-3 text-[11px] text-gray-500 dark:border-slate-700 dark:text-slate-400">
          Canlı geçiş yalnızca tüm kontroller geçince, tam onay kodu yazılınca ve son tarayıcı onayı verildiğinde çalışır.
        </div>
      </section>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        Canlı geçişten önce <span className="font-mono">supabase-wolvox-cutover-migration.sql</span> dosyası Supabase SQL Editor’da bir kez çalıştırılmalıdır.
      </div>
    </div>
  )
}

function FilePicker({
  id,
  label,
  hint,
  file,
  disabled,
  onChange,
}: {
  id: string
  label: string
  hint: string
  file: File | null
  disabled: boolean
  onChange: (file: File | null) => void
}) {
  return (
    <label htmlFor={id} className="text-xs font-medium text-gray-700 dark:text-slate-300">
      {label}
      <input
        id={id}
        type="file"
        accept=".xml,text/xml,application/xml"
        disabled={disabled}
        onChange={event => onChange(event.target.files?.[0] ?? null)}
        className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-xs file:font-medium file:text-blue-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:file:bg-blue-900/30 dark:file:text-blue-300"
      />
      <span className="mt-1 block font-normal text-gray-400 dark:text-slate-500">
        {file ? `${file.name} · ${formatFileSize(file.size)}` : hint}
      </span>
    </label>
  )
}

function DecisionButton({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean
  tone: 'danger' | 'info'
  onClick: () => void
  children: ReactNode
}) {
  const colors = tone === 'danger'
    ? active
      ? 'border-red-600 bg-red-600 text-white'
      : 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20'
    : active
      ? 'border-blue-600 bg-blue-600 text-white'
      : 'border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/20'
  return (
    <button type="button" onClick={onClick} className={`rounded border px-2 py-1 text-[10px] font-medium ${colors}`}>
      {active ? '✓ ' : ''}{children}
    </button>
  )
}

function StagingProgress({ progress }: { progress: StagingUploadProgress }) {
  const percent = progress.total > 0 ? Math.round((progress.uploaded / progress.total) * 100) : 0
  const labels = {
    reading: 'XML dosyaları okunuyor',
    parsing: 'Katalog ve depo kayıtları birleştiriliyor',
    uploading: `${progress.uploaded.toLocaleString('tr-TR')} / ${progress.total.toLocaleString('tr-TR')} ürün staging’e gönderildi`,
    finalizing: 'Sunucudaki kayıt sayısı ve doğrulama sonuçları kontrol ediliyor',
  }

  return (
    <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-3 dark:border-blue-900 dark:bg-blue-900/10">
      <div className="flex items-center justify-between gap-3 text-[11px] text-blue-700 dark:text-blue-300">
        <span>{labels[progress.phase]}</span>
        {progress.total > 0 && <span className="font-semibold">%{percent}</span>}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100 dark:bg-slate-700">
        <div
          className={`h-full rounded-full bg-blue-600 transition-all ${progress.total === 0 ? 'w-1/3 animate-pulse' : ''}`}
          style={progress.total > 0 ? { width: `${percent}%` } : undefined}
        />
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-gray-400 dark:text-slate-500">{label}</div><div className="mt-0.5 font-medium text-gray-700 dark:text-slate-200">{value}</div></div>
}

function StagingMetric({ label, value, tone }: { label: string; value: number; tone: 'default' | 'success' | 'info' | 'warning' | 'danger' }) {
  const colors = {
    default: 'text-gray-900 dark:text-slate-100',
    success: 'text-emerald-600 dark:text-emerald-400',
    info: 'text-blue-600 dark:text-blue-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
  }
  return <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-700/40"><div className="text-[11px] text-gray-500 dark:text-slate-400">{label}</div><div className={`mt-0.5 text-lg font-semibold ${colors[tone]}`}>{value.toLocaleString('tr-TR')}</div></div>
}

function CutoverMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-blue-100 bg-white/70 px-3 py-2 dark:border-blue-900 dark:bg-slate-800/60">
      <div className="text-[10px] text-gray-500 dark:text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-slate-100">{value.toLocaleString('tr-TR')}</div>
    </div>
  )
}

function StagingStatus({ row }: { row: StagingPreviewRow }) {
  const labels = { matched: row.method === 'barcode' ? 'Barkodla eşleşti' : 'SKU ile eşleşti', new: 'Yeni ürün', conflict: 'Çakışma', invalid: 'Doğrulama hatası' }
  const colors = { matched: 'text-emerald-600 dark:text-emerald-400', new: 'text-blue-600 dark:text-blue-400', conflict: 'text-amber-600 dark:text-amber-400', invalid: 'text-red-600 dark:text-red-400' }
  return <span className={`font-medium ${colors[row.status]}`} title={row.validation_errors.join(', ')}>{labels[row.status]}</span>
}

function stagingIssueText(row: StagingPreviewRow) {
  if (row.status === 'conflict') return 'Aynı barkod/SKU birden fazla Wolvox kaydında bulunuyor'
  const labels: Record<string, string> = {
    external_id_missing: 'Wolvox ürün kimliği eksik',
    external_id_duplicate: 'Wolvox ürün kimliği tekrarlanıyor',
    sku_or_barcode_missing: 'Barkod ve stok kodu eksik',
    product_name_missing: 'Ürün adı eksik',
    sales_price_invalid: 'Satış fiyatı okunamadı',
    sales_price_negative: 'Satış fiyatı negatif',
    sales_price_missing: 'Satış fiyatı eksik',
    sales_price_non_positive: 'Satış fiyatı sıfır',
    purchase_cost_invalid: 'Alış maliyeti okunamadı',
    purchase_cost_negative: 'Alış maliyeti negatif',
    vat_rate_out_of_range: 'KDV oranı geçersiz',
    vat_rate_missing: 'KDV oranı eksik',
    stock_quantity_invalid: 'Stok miktarı okunamadı',
  }
  return row.validation_errors.map(error => labels[error] ?? error).join(' · ')
}

function money(value: number) {
  return value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })
}

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`
}

async function postStaging(body: Record<string, unknown>) {
  const response = await fetch('/api/admin/integrations/wolvox/staging', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'Wolvox staging isteği başarısız')
  return payload
}

function yieldToBrowser() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}
