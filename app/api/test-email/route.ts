import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requireAdmin } from '@/lib/auth'

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_your_api_key_here') {
    return NextResponse.json({ error: 'RESEND_API_KEY tanımlı değil' }, { status: 503 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM ?? 'Fiyatlaa <onboarding@resend.dev>'

  const { data, error } = await resend.emails.send({
    from,
    to: 'ahmetzotkaci@gmail.com',
    subject: '✅ Fiyatlaa — E-posta testi',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#1e293b;margin-bottom:8px">E-posta testi başarılı 🎉</h2>
        <p style="color:#64748b;font-size:14px">
          Bu e-posta <strong>Fiyatlaa</strong> sisteminden gönderildi.<br/>
          Resend entegrasyonu düzgün çalışıyor.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
        <p style="color:#94a3b8;font-size:12px">
          Gönderen: ${from}<br/>
          Zaman: ${new Date().toLocaleString('tr-TR')}
        </p>
      </div>
    `,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, id: data?.id, from, to: 'ahmetzotkaci@gmail.com' })
}
