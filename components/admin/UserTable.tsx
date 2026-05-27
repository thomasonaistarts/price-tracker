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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Kullanıcı</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Rol</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Son giriş</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Kayıt tarihi</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Durum</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {users.map(user => (
            <tr key={user.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-medium flex-shrink-0">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{user.full_name}</div>
                    <div className="text-xs text-gray-500">{user.email}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={clsx(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                  user.role === 'admin'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-600'
                )}>
                  {user.role === 'admin' ? 'Yönetici' : 'Kullanıcı'}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {user.last_login ? new Date(user.last_login).toLocaleString('tr-TR') : '—'}
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {new Date(user.created_at).toLocaleDateString('tr-TR')}
              </td>
              <td className="px-4 py-3">
                <span className={clsx(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                  user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                )}>
                  {user.is_active ? 'Aktif' : 'Pasif'}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => toggleActive(user.id, user.is_active)}
                    disabled={loading === user.id}
                    className="text-xs text-gray-500 hover:text-gray-800 px-2.5 py-1 rounded border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50"
                  >
                    {loading === user.id ? '...' : user.is_active ? 'Pasif yap' : 'Aktif et'}
                  </button>
                  <a
                    href={`/admin/users/${user.id}`}
                    className="text-xs text-brand-600 hover:text-brand-800 px-2.5 py-1 rounded border border-brand-200 hover:border-brand-300 transition-colors"
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
  )
}
