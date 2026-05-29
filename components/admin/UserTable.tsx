'use client'

import { useState } from 'react'
import type { User } from '@/types/database'
import { clsx } from 'clsx'

interface UserTableProps {
  users: User[]
}

export default function UserTable({ users: initialUsers }: UserTableProps) {
  const [users, setUsers] = useState(initialUsers)
  const [loading, setLoading] = useState<string | null>(null)

  async function toggleActive(userId: string, isActive: boolean) {
    setLoading(userId)
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !isActive }),
    })
    if (res.ok) {
      setUsers(u => u.map(user => user.id === userId ? { ...user, is_active: !isActive } : user))
    }
    setLoading(null)
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50">
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">Kullanıcı</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">Rol</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">Son giriş</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">Kayıt tarihi</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">Durum</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
          {users.map(user => (
            <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-blue-900/40 flex items-center justify-center text-brand-700 dark:text-blue-300 text-xs font-medium flex-shrink-0">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-slate-100">{user.full_name}</div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">{user.email}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={clsx(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                  user.role === 'admin'
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300'
                )}>
                  {user.role === 'admin' ? 'Yönetici' : 'Kullanıcı'}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs">
                {user.last_login ? new Date(user.last_login).toLocaleString('tr-TR') : '—'}
              </td>
              <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs">
                {new Date(user.created_at).toLocaleDateString('tr-TR')}
              </td>
              <td className="px-4 py-3">
                <span className={clsx(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                  user.is_active
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                )}>
                  {user.is_active ? 'Aktif' : 'Pasif'}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => toggleActive(user.id, user.is_active)}
                    disabled={loading === user.id}
                    className="text-xs text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-100 px-2.5 py-1 rounded border border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 transition-colors disabled:opacity-50"
                  >
                    {loading === user.id ? '...' : user.is_active ? 'Pasif yap' : 'Aktif et'}
                  </button>
                  <a
                    href={`/admin/users/${user.id}`}
                    className="text-xs text-brand-600 dark:text-blue-400 hover:text-brand-800 dark:hover:text-blue-300 px-2.5 py-1 rounded border border-brand-200 dark:border-blue-900/50 hover:border-brand-300 transition-colors"
                  >
                    Düzenle
                  </a>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
