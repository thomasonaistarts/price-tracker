'use client'

import { useState } from 'react'
import type { User } from '@/types/database'
import { clsx } from 'clsx'

interface UserTableProps {
  users: User[]
}

export default function UserTable({ users: initialUsers }: UserTableProps) {
  const [users, setUsers]           = useState(initialUsers)
  const [loadingId, setLoadingId]   = useState<string | null>(null)
  const [editUser, setEditUser]     = useState<User | null>(null)
  const [password, setPassword]     = useState('')
  const [editRole, setEditRole]     = useState<'user' | 'admin'>('user')
  const [saving, setSaving]         = useState(false)
  const [editError, setEditError]   = useState('')
  const [editSuccess, setEditSuccess] = useState('')

  // ── Pasif / Aktif toggle ──────────────────────────────────────────────────
  async function toggleActive(userId: string, isActive: boolean) {
    setLoadingId(userId)
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !isActive }),
    })
    if (res.ok) {
      setUsers(u => u.map(u2 => u2.id === userId ? { ...u2, is_active: !isActive } : u2))
    }
    setLoadingId(null)
  }

  // ── Modal aç ─────────────────────────────────────────────────────────────
  function openEdit(user: User) {
    setEditUser(user)
    setEditRole(user.role)
    setPassword('')
    setEditError('')
    setEditSuccess('')
  }

  function closeEdit() {
    setEditUser(null)
    setPassword('')
    setEditError('')
    setEditSuccess('')
  }

  // ── Kaydet ───────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!editUser) return
    setEditError('')
    setEditSuccess('')

    if (password && password.length < 8) {
      setEditError('Şifre en az 8 karakter olmalı')
      return
    }

    setSaving(true)
    const body: Record<string, unknown> = { role: editRole }
    if (password) body.password = password

    const res = await fetch(`/api/users/${editUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setEditError(data.error ?? 'Bir hata oluştu')
      return
    }

    setUsers(u => u.map(u2 => u2.id === editUser.id ? { ...u2, role: editRole } : u2))
    setEditSuccess(password ? 'Şifre ve rol güncellendi.' : 'Rol güncellendi.')
    setPassword('')
  }

  return (
    <>
      {/* ── Tablo ── */}
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
                      <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-700 dark:text-blue-300 text-xs font-bold flex-shrink-0">
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
                        disabled={loadingId === user.id}
                        className={clsx(
                          'text-xs px-2.5 py-1 rounded border transition-colors disabled:opacity-50',
                          user.is_active
                            ? 'text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-900/50 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                            : 'text-green-600 dark:text-green-400 border-green-200 dark:border-green-900/50 hover:bg-green-50 dark:hover:bg-green-900/20'
                        )}
                      >
                        {loadingId === user.id ? '...' : user.is_active ? 'Pasif yap' : 'Aktif et'}
                      </button>
                      <button
                        onClick={() => openEdit(user)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-2.5 py-1 rounded border border-blue-200 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      >
                        Düzenle
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Düzenle Modal ── */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={closeEdit} />

          {/* Panel */}
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-slate-700">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Kullanıcı düzenle</h2>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{editUser.email}</p>
              </div>
              <button
                onClick={closeEdit}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              {/* Kullanıcı bilgisi (read-only) */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-700 dark:text-blue-300 text-sm font-bold flex-shrink-0">
                  {editUser.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-slate-100 text-sm">{editUser.full_name}</div>
                  <div className="text-xs text-gray-500 dark:text-slate-400">{editUser.email}</div>
                </div>
              </div>

              {/* Rol */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Rol</label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value as 'user' | 'admin')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="user">Kullanıcı</option>
                  <option value="admin">Yönetici</option>
                </select>
              </div>

              {/* Yeni şifre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  Yeni şifre
                  <span className="text-gray-400 dark:text-slate-500 font-normal ml-1">(boş bırakırsan değişmez)</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setEditError('') }}
                  placeholder="En az 8 karakter"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Hata / Başarı */}
              {editError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
                  {editError}
                </div>
              )}
              {editSuccess && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {editSuccess}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-slate-700">
              <button
                onClick={closeEdit}
                className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2"
              >
                {saving && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
