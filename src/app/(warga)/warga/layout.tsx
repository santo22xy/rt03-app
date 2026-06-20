import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { headers } from 'next/headers'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LogOut, LayoutDashboard } from 'lucide-react'
import { LOGO_SENTRA } from '@/lib/constants'
import { logoutWarga } from './actions'
import { logout } from '../../(auth)/login/actions'
import { BottomNavWarga } from './bottom-nav-warga'
import { needsKyc, type KycStatus, type UserRole } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function WargaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('warga_session')?.value

  // Baca pathname (di-set oleh middleware)
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? ''
  const isKycPage = pathname === '/warga/kyc'

  const admin = createAdminClient()
  const supabase = await createClient()

  let profileId: string | null = null
  let isPengurusViewingSelf = false

  if (sessionToken) {
    // Warga login normal
    const { data: pid } = await admin.rpc('get_warga_from_session', {
      p_token: sessionToken,
    })
    if (!pid) {
      cookieStore.delete('warga_session')
      redirect('/login')
    }
    profileId = pid
  } else {
    // Dual-role: pengurus yang mengakses /warga (dengan akun sendiri)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // Cek apakah user ini pengurus
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', user.id)
        .single()

      if (profile && ['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'].includes(profile.role)) {
        // Pengurus mengakses /warga dengan profile_id-nya sendiri
        profileId = profile.id
        isPengurusViewingSelf = true
      } else {
        redirect('/login')
      }
    } else {
      redirect('/login')
    }
  }

  if (!profileId) {
    redirect('/login')
  }

  // Ambil data profile untuk header + KYC check
  const { data: profile } = await admin
    .from('profiles')
    .select('nama_kk, blok, nomor_rumah, role, login_id, kategori_tarif, is_active, kyc_status')
    .eq('id', profileId)
    .single()

  if (!profile || !profile.is_active) {
    cookieStore.delete('warga_session')
    redirect('/login')
  }

  // =====================================================
  // KYC GATE
  // Hanya WARGA yang belum VERIFIED yang wajib submit KYC.
  // Pengurus (yang akses /warga sebagai self-view) skip KYC.
  // Halaman /warga/kyc selalu boleh diakses (untuk submit form).
  // =====================================================
  if (!isKycPage && needsKyc(profile.role as UserRole, profile.kyc_status as KycStatus)) {
    redirect('/warga/kyc')
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-teal-50 via-white to-cyan-50">
      {/* Floating blobs */}
      <div className="pointer-events-none absolute top-0 right-0 w-96 h-96 bg-teal-200/30 rounded-full blur-3xl -mr-32 -mt-32" />
      <div className="pointer-events-none absolute bottom-0 left-0 w-80 h-80 bg-cyan-200/30 rounded-full blur-3xl -ml-20 -mb-20" />

      {/* TOPBAR untuk warga - gradient header (Wayconet-style) */}
      <header className="relative bg-gradient-to-r from-teal-500 via-teal-600 to-cyan-700 text-white sticky top-0 z-40 shadow-lg shadow-teal-500/20 overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl -mr-20 -mt-20" />
        <div className="relative max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 ring-2 ring-white/30 bg-white">
              <Image
                src={LOGO_SENTRA}
                alt="SENTRA RT 03"
                width={40}
                height={40}
                priority
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <p className="font-bold text-sm text-white tracking-tight">SENTRA RT 03</p>
              <p className="text-[10px] text-white/70 font-medium">
                {isPengurusViewingSelf ? 'Warga (mode pengurus)' : 'Warga'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 mr-1">
              <div className="text-right">
                <p className="text-sm font-bold leading-tight text-white">{profile.nama_kk}</p>
                <p className="text-[10px] text-white/70 leading-tight">
                  Blok {profile.blok} No. {profile.nomor_rumah}
                </p>
              </div>
              <Badge className="bg-white/20 text-white border border-white/20 text-[10px] hover:bg-white/20">
                {profile.login_id}
              </Badge>
            </div>

            {isPengurusViewingSelf && (
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors backdrop-blur-sm"
                aria-label="Kembali ke Dashboard Pengurus"
                title="Dashboard Pengurus"
              >
                <LayoutDashboard className="w-4 h-4" />
              </Link>
            )}
            <form action={isPengurusViewingSelf ? logout : logoutWarga}>
              <Button type="submit" variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-white hover:bg-white/20 hover:text-white" aria-label="Keluar">
                <LogOut className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-5xl mx-auto p-4 pb-24 md:pb-4">
        {children}
      </main>

      <footer className="text-center text-xs text-muted-foreground py-6">
        © 2026 RT 03 — Powered by I-OneTech Apps
      </footer>

      {/* Bottom Nav Mobile */}
      <BottomNavWarga />
    </div>
  )
}
