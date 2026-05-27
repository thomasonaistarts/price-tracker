'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'
import type { UserRole } from '@/types/database'

interface SidebarProps {
  role: UserRole
}

const navItems = [
  { href: '/dashboard',          label: 'Genel bakış',   icon: '◻' },
  { href: '/dashboard/analyze',  label: 'Fiyat analizi', icon: '🔍' },
  { href: '/dashboard/products', label: 'Ürünler',       icon: '📦' },
  { href: '/dashboard/reports',  label: 'Raporlar',      icon: '📊' },
  { href: '/dashboard/settings', label: 'Ayarlar',       icon: '⚙️' },
]

const adminItems = [
  { href: '/admin/users',    label: 'Kullanıcılar', icon: '👥' },
  { href: '/admin/settings', label: 'Sistem ayarları', icon: '🛠' },
]

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">Fiyat İzleme</span>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname === item.href || pathname.startsWith(item.href + '/')
                ? 'bg-brand-50 text-brand-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        {role === 'admin' && (
          <>
            <div className="pt-3 pb-1 px-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Admin</span>
            </div>
            {adminItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                  pathname.startsWith(item.href)
                    ? 'bg-brand-50 text-brand-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>
    </aside>
  )
}
