import { createAdminClient } from '@/lib/supabase/server'
import { DEFAULT_SETTINGS, type UserSettings } from '@/types/database'

export type { UserSettings }
export { DEFAULT_SETTINGS }

/** DB'den kullanıcı ayarlarını okur, eksik alanları default ile doldurur */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('user_settings')
    .select('settings')
    .eq('user_id', userId)
    .single()

  return { ...DEFAULT_SETTINGS, ...(data?.settings ?? {}) }
}

/** Kullanıcı ayarlarını kısmen günceller (upsert) */
export async function updateUserSettings(
  userId: string,
  patch: Partial<UserSettings>,
): Promise<UserSettings> {
  const current = await getUserSettings(userId)
  const merged = { ...current, ...patch }

  const supabase = createAdminClient() as any
  await supabase
    .from('user_settings')
    .upsert({ user_id: userId, settings: merged }, { onConflict: 'user_id' })

  return merged
}
