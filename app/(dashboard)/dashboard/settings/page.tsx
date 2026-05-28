import { requireAuth, getUserProfile } from '@/lib/auth'
import ProfileForm from '@/components/settings/ProfileForm'
import PasswordForm from '@/components/settings/PasswordForm'

export default async function SettingsPage() {
  const authUser = await requireAuth()
  const profile = await getUserProfile(authUser.id)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium text-gray-900 dark:text-slate-100">Ayarlar</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Hesap bilgilerinizi yönetin</p>
      </div>
      <div className="space-y-6 max-w-lg">
        <ProfileForm profile={profile} />
        <PasswordForm />
      </div>
    </div>
  )
}
