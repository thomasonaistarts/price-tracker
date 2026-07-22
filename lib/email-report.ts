/**
 * Haftalık fiyat raporu — veri hesaplama + HTML email üretimi
 */

// ── Tipler ────────────────────────────────────────────────────────────────────

export interface AnalysisRow {
  product_id: string
  run_at: string
  alert: string
  price_diff_percent: number | null
  market_mean: number | null
  min_price: number | null
  sources_count: number
  sources: Array<{ site: string; price: number; confidence?: string }> | null
  products: {
    sku: string
    product_name: string
    our_price: number
    brand: string | null
    category: string | null
  } | null
}

export interface HistoryItem {
  run_at: string
  alert: string
  product_id: string
}

export interface WeeklyReportData {
  userEmail: string
  generatedAt: string
  summary: {
    total: number
    above: number
    below: number
    normal: number
    insufficient: number
    avgAbovePct: number
    avgBelowPct: number
  }
  topAbove: ReportItem[]
  topBelow: ReportItem[]
  categories: CategoryItem[]
  weeks: WeekItem[]
  platforms: PlatformItem[]
}

interface ReportItem {
  sku: string
  name: string
  ourPrice: number
  marketMean: number | null
  diffPct: number
}

interface CategoryItem {
  name: string
  total: number
  above: number
  below: number
  avgDiff: number
}

interface WeekItem {
  label: string
  above: number
  below: number
  normal: number
  total: number
}

interface PlatformItem {
  site: string
  appearances: number
  cheapest: number
  avgDiff: number | null
}

// ── Yardımcı ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setUTCDate(d.getUTCDate() + diff)
  mon.setUTCHours(0, 0, 0, 0)
  return mon.toISOString().split('T')[0]
}

function weekLabel(ws: string) {
  return new Date(ws).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

// ── Veri hesaplama ────────────────────────────────────────────────────────────

export function computeReportData(
  rawAnalyses: AnalysisRow[],
  history: HistoryItem[],
  userEmail: string,
): WeeklyReportData {
  // Ürün başına en son analiz
  const seen = new Set<string>()
  const rows = rawAnalyses.filter(a => {
    if (!a.products || seen.has(a.product_id)) return false
    seen.add(a.product_id)
    return true
  })

  const above = rows.filter(r => r.alert === 'above_market')
  const below = rows.filter(r => r.alert === 'below_market')
  const normal = rows.filter(r => r.alert === 'no_alert')
  const insuff = rows.filter(r => r.alert === 'insufficient_data')

  const avgAbovePct = above.length
    ? above.reduce((s, r) => s + (r.price_diff_percent ?? 0), 0) / above.length : 0
  const avgBelowPct = below.length
    ? below.reduce((s, r) => s + (r.price_diff_percent ?? 0), 0) / below.length : 0

  // Top 10 pahalı / ucuz
  const topAbove: ReportItem[] = [...above]
    .sort((a, b) => (b.price_diff_percent ?? 0) - (a.price_diff_percent ?? 0))
    .slice(0, 10)
    .map(r => ({
      sku: r.products!.sku,
      name: r.products!.product_name,
      ourPrice: r.products!.our_price,
      marketMean: r.market_mean,
      diffPct: r.price_diff_percent ?? 0,
    }))

  const topBelow: ReportItem[] = [...below]
    .sort((a, b) => (a.price_diff_percent ?? 0) - (b.price_diff_percent ?? 0))
    .slice(0, 10)
    .map(r => ({
      sku: r.products!.sku,
      name: r.products!.product_name,
      ourPrice: r.products!.our_price,
      marketMean: r.market_mean,
      diffPct: r.price_diff_percent ?? 0,
    }))

  // Kategori özeti
  const catMap = new Map<string, AnalysisRow[]>()
  for (const r of rows) {
    const cat = r.products?.category || '(Kategori yok)'
    if (!catMap.has(cat)) catMap.set(cat, [])
    catMap.get(cat)!.push(r)
  }
  const categories: CategoryItem[] = Array.from(catMap.entries())
    .map(([name, items]) => {
      const catAbove = items.filter(r => r.alert === 'above_market').length
      const catBelow = items.filter(r => r.alert === 'below_market').length
      const withDiff = items.filter(r => r.price_diff_percent != null)
      const avg = withDiff.length
        ? withDiff.reduce((s, r) => s + r.price_diff_percent!, 0) / withDiff.length : 0
      return { name, total: items.length, above: catAbove, below: catBelow, avgDiff: avg }
    })
    .sort((a, b) => b.above - a.above)
    .slice(0, 8)

  // Haftalık trend (son 8 hafta)
  const weekProductMap = new Map<string, Map<string, string>>()
  for (const h of history) {
    const ws = getWeekStart(h.run_at)
    if (!weekProductMap.has(ws)) weekProductMap.set(ws, new Map())
    const prod = weekProductMap.get(ws)!
    if (!prod.has(h.product_id)) prod.set(h.product_id, h.alert)
  }
  const weeks: WeekItem[] = Array.from(weekProductMap.entries())
    .sort(([weekA], [weekB]) => weekA.localeCompare(weekB))
    .slice(-8)
    .map(([ws, products]) => {
      const alerts = Array.from(products.values())
      return {
        label: weekLabel(ws),
        above: alerts.filter(a => a === 'above_market').length,
        below: alerts.filter(a => a === 'below_market').length,
        normal: alerts.filter(a => a === 'no_alert').length,
        total: alerts.length,
      }
    })

  // Platform karşılaştırması
  const platMap = new Map<string, { appearances: number; cheapest: number; totalDiff: number; diffCount: number }>()
  for (const r of rows) {
    for (const s of r.sources ?? []) {
      if (!platMap.has(s.site)) platMap.set(s.site, { appearances: 0, cheapest: 0, totalDiff: 0, diffCount: 0 })
      const e = platMap.get(s.site)!
      e.appearances++
      if (r.min_price != null && Math.abs(s.price - r.min_price) < 0.01) e.cheapest++
      if (r.market_mean != null && r.market_mean > 0) {
        e.totalDiff += ((s.price - r.market_mean) / r.market_mean) * 100
        e.diffCount++
      }
    }
  }
  const platforms: PlatformItem[] = Array.from(platMap.entries())
    .map(([site, d]) => ({
      site,
      appearances: d.appearances,
      cheapest: d.cheapest,
      avgDiff: d.diffCount > 0 ? d.totalDiff / d.diffCount : null,
    }))
    .sort((a, b) => b.appearances - a.appearances)

  return {
    userEmail,
    generatedAt: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }),
    summary: {
      total: rows.length,
      above: above.length,
      below: below.length,
      normal: normal.length,
      insufficient: insuff.length,
      avgAbovePct,
      avgBelowPct,
    },
    topAbove,
    topBelow,
    categories,
    weeks,
    platforms,
  }
}

// ── HTML E-posta şablonu ──────────────────────────────────────────────────────

export function generateWeeklyEmailHtml(data: WeeklyReportData): string {
  const { summary: s } = data

  const sectionTitle = (icon: string, title: string, count?: number) => `
    <tr>
      <td style="padding: 24px 32px 8px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:15px;font-weight:700;color:#111827;border-bottom:2px solid #f3f4f6;padding-bottom:10px;">
              ${icon} ${title}${count != null ? ` <span style="font-size:12px;font-weight:400;color:#9ca3af;">(${count})</span>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>`

  const productTable = (items: ReportItem[], isAbove: boolean) => {
    if (items.length === 0) return `<tr><td style="padding:8px 32px 16px;font-size:13px;color:#9ca3af;">Veri yok</td></tr>`
    const rows = items.map(item => `
      <tr style="border-bottom:1px solid #f9fafb;">
        <td style="padding:8px 6px;font-size:12px;color:#6b7280;font-family:monospace;">${item.sku}</td>
        <td style="padding:8px 6px;font-size:12px;color:#111827;max-width:180px;">${item.name.length > 35 ? item.name.slice(0, 35) + '…' : item.name}</td>
        <td style="padding:8px 6px;font-size:12px;color:#374151;text-align:right;white-space:nowrap;">${fmt(item.ourPrice)}</td>
        <td style="padding:8px 6px;font-size:12px;color:#6b7280;text-align:right;white-space:nowrap;">${item.marketMean != null ? fmt(item.marketMean) : '—'}</td>
        <td style="padding:8px 6px;font-size:13px;font-weight:700;text-align:right;color:${isAbove ? '#dc2626' : '#16a34a'};white-space:nowrap;">
          ${isAbove ? '+' : ''}${item.diffPct.toFixed(1)}%
        </td>
      </tr>`).join('')
    return `
      <tr>
        <td style="padding:4px 32px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:6px 6px;text-align:left;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;">SKU</th>
                <th style="padding:6px 6px;text-align:left;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;">Ürün</th>
                <th style="padding:6px 6px;text-align:right;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;">Bizim</th>
                <th style="padding:6px 6px;text-align:right;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;">Piyasa</th>
                <th style="padding:6px 6px;text-align:right;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;">Fark</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </td>
      </tr>`
  }

  const categoryRows = data.categories.map(c => `
    <tr style="border-bottom:1px solid #f9fafb;">
      <td style="padding:7px 6px;font-size:12px;color:#111827;">${c.name}</td>
      <td style="padding:7px 6px;font-size:12px;color:#374151;text-align:right;">${c.total}</td>
      <td style="padding:7px 6px;font-size:12px;color:#dc2626;font-weight:${c.above > 0 ? '700' : '400'};text-align:right;">${c.above || '—'}</td>
      <td style="padding:7px 6px;font-size:12px;color:#16a34a;font-weight:${c.below > 0 ? '700' : '400'};text-align:right;">${c.below || '—'}</td>
      <td style="padding:7px 6px;font-size:12px;font-weight:600;text-align:right;color:${c.avgDiff > 0 ? '#dc2626' : c.avgDiff < 0 ? '#16a34a' : '#9ca3af'};">
        ${c.avgDiff !== 0 ? `${c.avgDiff > 0 ? '+' : ''}${c.avgDiff.toFixed(1)}%` : '—'}
      </td>
    </tr>`).join('')

  const trendRows = data.weeks.map(w => {
    const pct = (n: number) => w.total > 0 ? Math.round((n / w.total) * 100) : 0
    return `
    <tr style="border-bottom:1px solid #f9fafb;">
      <td style="padding:7px 6px;font-size:12px;color:#6b7280;white-space:nowrap;">${w.label}</td>
      <td style="padding:7px 6px;" width="200">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:3px;overflow:hidden;">
          <tr>
            <td style="background:#fca5a5;height:16px;width:${pct(w.above)}%;font-size:0;">&nbsp;</td>
            <td style="background:#86efac;height:16px;width:${pct(w.below)}%;font-size:0;">&nbsp;</td>
            <td style="background:#e5e7eb;height:16px;width:${Math.max(0, 100 - pct(w.above) - pct(w.below))}%;font-size:0;">&nbsp;</td>
          </tr>
        </table>
      </td>
      <td style="padding:7px 6px;font-size:12px;color:#dc2626;text-align:center;width:36px;">${w.above || '—'}</td>
      <td style="padding:7px 6px;font-size:12px;color:#16a34a;text-align:center;width:36px;">${w.below || '—'}</td>
      <td style="padding:7px 6px;font-size:12px;color:#6b7280;text-align:center;width:36px;">${w.total}</td>
    </tr>`
  }).join('')

  const platformRows = data.platforms.map(p => `
    <tr style="border-bottom:1px solid #f9fafb;">
      <td style="padding:7px 6px;font-size:12px;color:#111827;font-weight:600;">${p.site}</td>
      <td style="padding:7px 6px;font-size:12px;color:#374151;text-align:right;">${p.appearances}</td>
      <td style="padding:7px 6px;font-size:12px;color:#16a34a;font-weight:600;text-align:right;">${p.cheapest}</td>
      <td style="padding:7px 6px;font-size:12px;font-weight:600;text-align:right;color:${p.avgDiff == null ? '#9ca3af' : p.avgDiff > 0 ? '#dc2626' : '#16a34a'};">
        ${p.avgDiff != null ? `${p.avgDiff > 0 ? '+' : ''}${p.avgDiff.toFixed(1)}%` : '—'}
      </td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Haftalık Fiyat Raporu</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">

        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:28px 32px;">
            <p style="margin:0;font-size:11px;font-weight:600;color:#bfdbfe;text-transform:uppercase;letter-spacing:1px;">Haftalık Fiyat Raporu</p>
            <h1 style="margin:6px 0 0;font-size:22px;color:#ffffff;font-weight:700;">${data.generatedAt}</h1>
          </td>
        </tr>

        <!-- ÖZET KPI -->
        <tr>
          <td style="padding:20px 32px 8px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:12px 6px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6;">
                  <div style="font-size:11px;color:#9ca3af;margin-bottom:4px;">Toplam Ürün</div>
                  <div style="font-size:24px;font-weight:700;color:#111827;">${s.total}</div>
                </td>
                <td width="8"></td>
                <td align="center" style="padding:12px 6px;background:#fef2f2;border-radius:8px;border:1px solid #fee2e2;">
                  <div style="font-size:11px;color:#ef4444;margin-bottom:4px;">↑ Piyasa Üstü</div>
                  <div style="font-size:24px;font-weight:700;color:#dc2626;">${s.above}</div>
                  ${s.above > 0 ? `<div style="font-size:10px;color:#f87171;">ort. +${s.avgAbovePct.toFixed(1)}%</div>` : ''}
                </td>
                <td width="8"></td>
                <td align="center" style="padding:12px 6px;background:#f0fdf4;border-radius:8px;border:1px solid #dcfce7;">
                  <div style="font-size:11px;color:#22c55e;margin-bottom:4px;">↓ Piyasa Altı</div>
                  <div style="font-size:24px;font-weight:700;color:#16a34a;">${s.below}</div>
                  ${s.below > 0 ? `<div style="font-size:10px;color:#4ade80;">ort. ${s.avgBelowPct.toFixed(1)}%</div>` : ''}
                </td>
                <td width="8"></td>
                <td align="center" style="padding:12px 6px;background:#fffbeb;border-radius:8px;border:1px solid #fef3c7;">
                  <div style="font-size:11px;color:#f59e0b;margin-bottom:4px;">⚠ Veri Yok</div>
                  <div style="font-size:24px;font-weight:700;color:#d97706;">${s.insufficient}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FİYAT İNDİRMESİ -->
        ${sectionTitle('↑', 'Fiyat İndirmesi Önerilen', data.topAbove.length)}
        ${productTable(data.topAbove, true)}

        <!-- FİYAT ARTIRMA -->
        ${sectionTitle('↓', 'Fiyat Artırma Fırsatı', data.topBelow.length)}
        ${productTable(data.topBelow, false)}

        <!-- KATEGORİ -->
        ${data.categories.length > 0 ? `
        ${sectionTitle('🗂', 'Kategori Özeti')}
        <tr>
          <td style="padding:4px 32px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="padding:6px;text-align:left;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;">Kategori</th>
                  <th style="padding:6px;text-align:right;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;">Toplam</th>
                  <th style="padding:6px;text-align:right;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;">Pahalı</th>
                  <th style="padding:6px;text-align:right;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;">Ucuz</th>
                  <th style="padding:6px;text-align:right;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;">Ort. Fark</th>
                </tr>
              </thead>
              <tbody>${categoryRows}</tbody>
            </table>
          </td>
        </tr>` : ''}

        <!-- TREND -->
        ${data.weeks.length > 0 ? `
        ${sectionTitle('📈', 'Haftalık Trend')}
        <tr>
          <td style="padding:4px 32px 8px;">
            <table cellpadding="0" cellspacing="0" style="font-size:10px;color:#9ca3af;margin-bottom:6px;">
              <tr>
                <td style="padding:0 6px 0 0;"><span style="display:inline-block;width:10px;height:10px;background:#fca5a5;border-radius:2px;margin-right:3px;vertical-align:middle;"></span>Piyasa üstü</td>
                <td style="padding:0 6px;"><span style="display:inline-block;width:10px;height:10px;background:#86efac;border-radius:2px;margin-right:3px;vertical-align:middle;"></span>Piyasa altı</td>
                <td style="padding:0 6px;"><span style="display:inline-block;width:10px;height:10px;background:#e5e7eb;border-radius:2px;margin-right:3px;vertical-align:middle;"></span>Normal</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="padding:6px;text-align:left;font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Hafta</th>
                  <th style="padding:6px;" width="200"></th>
                  <th style="padding:6px;text-align:center;font-size:10px;color:#dc2626;font-weight:600;">↑</th>
                  <th style="padding:6px;text-align:center;font-size:10px;color:#16a34a;font-weight:600;">↓</th>
                  <th style="padding:6px;text-align:center;font-size:10px;color:#9ca3af;font-weight:600;">Top.</th>
                </tr>
              </thead>
              <tbody>${trendRows}</tbody>
            </table>
          </td>
        </tr>` : ''}

        <!-- PLATFORM -->
        ${data.platforms.length > 0 ? `
        ${sectionTitle('🏪', 'Platform Karşılaştırması')}
        <tr>
          <td style="padding:4px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="padding:6px;text-align:left;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;">Platform</th>
                  <th style="padding:6px;text-align:right;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;">Görünüm</th>
                  <th style="padding:6px;text-align:right;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;">En Ucuz</th>
                  <th style="padding:6px;text-align:right;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;">Piyasa vs.</th>
                </tr>
              </thead>
              <tbody>${platformRows}</tbody>
            </table>
          </td>
        </tr>` : ''}

        <!-- FOOTER -->
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
              Fiyat Takip Sistemi &nbsp;·&nbsp; Bu rapor belirlediğiniz haftalık programa göre otomatik gönderilmiştir.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}
