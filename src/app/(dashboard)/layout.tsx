import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard,
  Users,
  Wallet,
  Receipt,
  Megaphone,
  Calendar,
  LogOut,
  ShieldCheck,
  HandCoins,
  Smartphone,
} from 'lucide-react'
import { logout } from '../(auth)/login/actions'
import { BottomNavPengurus } from './dashboard/bottom-nav-pengurus'
import { Unauthorized } from './unauthorized'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Pakai admin client (service_role) untuk bypass RLS — auth.uid() di
  // session yang baru di-set oleh signIn belum tentu match di layout ini
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, nama_kk, blok, nomor_rumah, id, login_id')
    .eq('id', user.id)
    .single()

  // FIX: WARGA / role lain yang nyasar ke /dashboard → render 403 inline
  // (sebelumnya redirect ke /login, tapi middleware auto-redirect balik ke /dashboard → LOOP)
  if (!profile || !['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'].includes(profile.role)) {
    return (
      <Unauthorized
        userRole={profile?.role ?? 'TIDAK DIKETAHUI'}
        userName={profile?.nama_kk ?? null}
        userBlok={profile?.blok ?? null}
        userNomorRumah={profile?.nomor_rumah ?? null}
      />
    )
  }

  const roleLabel: Record<string, string> = {
    KETUA_RT: 'Ketua RT',
    BENDAHARA: 'Bendahara',
    SEKRETARIS: 'Sekretaris',
    PENGURUS: 'Pengurus',
    SUPERADMIN: 'Superadmin',
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/dashboard/warga', label: 'Warga', icon: Users },
    { href: '/dashboard/iuran', label: 'Iuran Bulanan', icon: Wallet },
    { href: '/dashboard/kas', label: 'Kas & Transaksi', icon: Receipt },
    { href: '/dashboard/jimpitan', label: 'Jimpitan', icon: HandCoins },
    { href: '/dashboard/pengumuman', label: 'Pengumuman', icon: Megaphone },
    { href: '/dashboard/ronda', label: 'Jadwal Ronda', icon: Calendar },
  ]

  return (
    <div className="min-h-screen flex bg-muted/30">
      {/* SIDEBAR */}
      <aside className="hidden md:flex w-64 flex-col bg-card border-r overflow-y-auto">
        <div className="p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">SENTRA RT 03</p>
              <p className="text-xs text-muted-foreground">Dashboard Pengurus</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground transition-colors"
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t space-y-2 sticky bottom-0 bg-card z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="px-3 py-2">
            <p className="text-sm font-medium">{profile.nama_kk}</p>
            <p className="text-xs text-muted-foreground">
              Blok {profile.blok} No. {profile.nomor_rumah} · {profile.login_id}
            </p>
            <div className="flex gap-1 mt-1.5">
              <Badge variant="secondary" className="text-xs">
                {roleLabel[profile.role] ?? profile.role}
              </Badge>
              {/* Tanda pengurus juga warga */}
              <Link href="/warga" className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors" title="Buka tampilan warga (akun Anda sendiri)">
                <Smartphone className="w-3 h-3" />
                Warga
              </Link>
            </div>
          </div>
          <form action={logout}>
            <Button type="submit" variant="ghost" className="w-full justify-start" size="sm">
              <LogOut className="w-4 h-4" />
              Keluar
            </Button>
          </form>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOPBAR Mobile - STICKY */}
        <header className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/30">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">SENTRA RT 03</p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                {roleLabel[profile.role] ?? 'Pengurus'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/warga"
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
              aria-label="Tampilan Warga"
              title="Buka tampilan warga"
            >
              <Smartphone className="w-4 h-4" />
            </Link>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="icon" className="h-9 w-9 rounded-xl" aria-label="Keluar">
                <LogOut className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </header>

        <main id="main-content" className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-auto">
          {children}
        </main>

        {/* Bottom Nav Mobile */}
        <BottomNavPengurus />
      </div>
    </div>
  )
}