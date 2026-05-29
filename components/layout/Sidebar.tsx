'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/components/theme/ThemeProvider'
import type { User, UserRole } from '@/types/database'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  exact?: boolean
}

interface SidebarProps {
  role: UserRole
  user: User | null
  isOpen?: boolean
  onClose?: () => void
}

// ── SVG İkonları ──────────────────────────────────────────────────────────────

const ic = {
  dashboard: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  analyze: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  ),
  products: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  ),
  reports: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
    </svg>
  ),
  settings: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  users: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  adminSettings: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
    </svg>
  ),
  logout: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  ),
  sun: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  ),
  moon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  ),
}

// ── Navigasyon ────────────────────────────────────────────────────────────────

const navItems: NavItem[] = [
  { href: '/dashboard',          label: 'Genel bakış',   icon: ic.dashboard, exact: true },
  { href: '/dashboard/analyze',  label: 'Fiyat analizi', icon: ic.analyze },
  { href: '/dashboard/products', label: 'Ürünler',       icon: ic.products },
  { href: '/dashboard/reports',  label: 'Raporlar',      icon: ic.reports },
  { href: '/dashboard/settings', label: 'Ayarlar',       icon: ic.settings },
]

const adminItems: NavItem[] = [
  { href: '/admin/users',    label: 'Kullanıcılar',   icon: ic.users },
  { href: '/admin/settings', label: 'Sistem ayarları', icon: ic.adminSettings },
]

function itemActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(item.href + '/')
}

// ── Bileşen ───────────────────────────────────────────────────────────────────

export default function Sidebar({ role, user, isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  function NavLink({ item }: { item: NavItem }) {
    const active = itemActive(pathname, item)
    return (
      <Link
        href={item.href}
        onClick={onClose}
        className={[
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150 group relative',
          active
            ? 'bg-white/10 text-white'
            : 'text-slate-400 hover:bg-white/6 hover:text-slate-100',
        ].join(' ')}
      >
        {active && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-400 rounded-full" />
        )}
        <span className={active ? 'text-blue-300' : 'text-slate-500 group-hover:text-slate-300'}>
          {item.icon}
        </span>
        <span className={active ? 'font-medium' : 'font-normal'}>{item.label}</span>
      </Link>
    )
  }

  return (
    <aside className={[
      'flex flex-col h-full flex-shrink-0 bg-slate-900 z-30',
      // Desktop: always visible static
      'lg:relative lg:translate-x-0 lg:w-56',
      // Mobile: fixed drawer, slides in/out
      'fixed inset-y-0 left-0 w-72',
      isOpen ? 'translate-x-0' : '-translate-x-full',
      'transition-transform duration-200 ease-in-out lg:transition-none',
    ].join(' ')}>

      {/* ── Mobile kapat butonu ── */}
      {onClose && (
        <button
          onClick={onClose}
          className="lg:hidden absolute top-3 right-3 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/10 transition-colors"
          aria-label="Menüyü kapat"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* ── Logo ── */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-900/40">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-white leading-tight">Fiyatlaa</div>
            <span className="px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[9px] font-bold tracking-wider border border-blue-500/30 leading-none">BETA</span>
          </div>
          <div className="text-[10px] text-slate-500 leading-tight">Piyasa takip paneli</div>
        </div>
      </div>

      {/* ── Navigasyon ── */}
      <nav className="flex-1 px-2.5 space-y-0.5 overflow-y-auto pb-2">

        <div className="pb-1">
          {navItems.map(item => <NavLink key={item.href} item={item} />)}
        </div>

        {role === 'admin' && (
          <>
            <div className="px-3 pt-4 pb-1.5">
              <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
                Yönetim
              </span>
            </div>
            {adminItems.map(item => <NavLink key={item.href} item={item} />)}
          </>
        )}
      </nav>

      {/* ── Kullanıcı footer ── */}
      <div className="mx-2.5 mb-3 rounded-xl bg-white/5 border border-white/8 p-3">
        <div className="flex items-center gap-2.5">
          {/* Avatar */}
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.full_name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          {/* İsim + rol */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-200 truncate leading-tight">
              {user?.full_name ?? '—'}
            </div>
            <div className="text-[10px] text-slate-500 leading-tight">
              {user?.role === 'admin' ? 'Yönetici' : 'Kullanıcı'}
            </div>
          </div>
          {/* Tema toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Gündüz moduna geç' : 'Gece moduna geç'}
            className="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/10 transition-colors"
          >
            {theme === 'dark' ? ic.sun : ic.moon}
          </button>
          {/* Çıkış */}
          <button
            onClick={handleSignOut}
            title="Çıkış yap"
            className="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/10 transition-colors"
          >
            {ic.logout}
          </button>
        </div>
      </div>

    </aside>
  )
}
