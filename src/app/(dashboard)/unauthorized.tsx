import Link from 'next/link'
import { ShieldOff, Home, LayoutDashboard, LogOut } from 'lucide-react'
import { logout } from '../(auth)/login/actions'

interface UnauthorizedProps {
  userRole: string
  userName?: string | null
  userBlok?: string | null
  userNomorRumah?: string | null
}

/**
 * Komponen 403 - untuk user yang login tapi tidak punya akses ke halaman pengurus.
 * Ditampilkan inline di (dashboard)/layout.tsx saat WARGA nyasar ke /dashboard.
 *
 * Kenapa tidak redirect?
 * - Redirect ke /login → middleware auto-redirect balik ke /dashboard (karena user masih login) → LOOP
 * - Solusi: tampilkan pesan jelas + tombol navigasi
 */
export function Unauthorized({
  userRole,
  userName,
  userBlok,
  userNomorRumah,
}: UnauthorizedProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-red-50 p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 text-center space-y-5">
          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-100 to-orange-100 mx-auto flex items-center justify-center">
            <ShieldOff className="w-10 h-10 text-red-600" />
          </div>

          {/* Title */}
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">
              Akses Ditolak
            </h1>
            <p className="text-sm text-slate-600">
              Halaman ini hanya untuk pengurus RT.
            </p>
          </div>

          {/* User info */}
          <div className="bg-slate-50 rounded-2xl p-4 text-left space-y-1.5 border border-slate-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Anda login sebagai
            </p>
            <p className="text-sm font-semibold text-slate-900">
              {userName ?? 'Pengguna'}
              {userBlok && userNomorRumah && (
                <span className="text-slate-500 font-normal">
                  {' '}· Blok {userBlok} No. {userNomorRumah}
                </span>
              )}
            </p>
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 mt-1">
              Role: {userRole}
            </Badge>
          </div>

          <p className="text-xs text-slate-500">
            Jika Anda pengurus RT dan melihat pesan ini, kemungkinan akun Anda
            belum disetup dengan role pengurus. Hubungi superadmin.
          </p>

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <Link
              href="/warga"
              className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 font-semibold text-sm transition-colors"
            >
              <Home className="w-4 h-4" />
              Buka Tampilan Warga
            </Link>
            <Link
              href="/"
              className="flex items-center justify-center gap-2 w-full bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-3 font-semibold text-sm transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Halaman Utama
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="flex items-center justify-center gap-2 w-full text-red-600 hover:bg-red-50 rounded-xl py-3 font-semibold text-sm transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Keluar / Ganti Akun
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          © 2026 RT 03 — Powered by I-OneTech Apps
        </p>
      </div>
    </div>
  )
}

// Helper karena Badge dipakai di komponen ini
function Badge({
  children, className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${className}`}>
      {children}
    </span>
  )
}
