'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useFormState, useFormStatus } from 'react-dom'
import {
  loginWarga,
  registerWarga,
  type LoginState
} from './actions'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  KeyRound,
  UserPlus,
  Mail,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  Home,
  Wifi,
  Shield,
  User,
  Phone,
  MessageCircle,
  CheckCircle2,
} from 'lucide-react'
import { LOGO_SENTRA } from '@/lib/constants'

const initialState: LoginState = {}

// =========================================================
// PasswordInput — dengan icon prefix + toggle eye
// =========================================================
function PasswordInput({
  name,
  placeholder,
  maxLength,
  pattern,
  inputMode,
  autoComplete,
}: {
  name: string
  placeholder?: string
  maxLength?: number
  pattern?: string
  inputMode?: 'numeric' | 'text' | 'tel' | 'email' | 'url' | 'search' | 'none' | 'decimal'
  autoComplete?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <Input
        name={name}
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        maxLength={maxLength}
        pattern={pattern}
        inputMode={inputMode}
        autoComplete={autoComplete}
        required
        className="h-12 pl-11 pr-11 rounded-xl bg-slate-50 border-slate-100 focus:bg-white focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        tabIndex={-1}
        aria-label={show ? 'Sembunyikan' : 'Tampilkan'}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-teal-600 rounded-md transition-colors"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

// =========================================================
// TextInput dengan icon prefix
// =========================================================
function TextInput({
  name,
  type = 'text',
  placeholder,
  icon: Icon,
  maxLength,
  pattern,
  inputMode,
  autoComplete,
}: {
  name: string
  type?: string
  placeholder?: string
  icon: React.ComponentType<{ className?: string }>
  maxLength?: number
  pattern?: string
  inputMode?: 'numeric' | 'text' | 'tel' | 'email' | 'url' | 'search' | 'none' | 'decimal'
  autoComplete?: string
}) {
  return (
    <div className="relative">
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <Input
        name={name}
        type={type}
        placeholder={placeholder}
        maxLength={maxLength}
        pattern={pattern}
        inputMode={inputMode}
        autoComplete={autoComplete}
        required
        className="h-12 pl-11 rounded-xl bg-slate-50 border-slate-100 focus:bg-white focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all"
      />
    </div>
  )
}

// =========================================================
// SubmitButton — gradient teal/cyan
// =========================================================
function SubmitButton({
  icon: Icon,
  label,
  pendingLabel,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  pendingLabel: string
  loading?: boolean
}) {
  const { pending } = useFormStatus()
  const isLoading = pending || !!loading
  return (
    <Button
      type="submit"
      className="w-full h-12 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-bold shadow-lg shadow-teal-500/30 transition-all active:scale-[0.98] disabled:opacity-60"
      size="lg"
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        <>
          <Icon className="w-4 h-4" />
          {label}
        </>
      )}
    </Button>
  )
}

// =========================================================
// LoginPage — gaya Wayconet (gradient + floating card)
// =========================================================
export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'daftar'>('login')
  const [pengurusOpen, setPengurusOpen] = useState(false)
  const tapCount = useRef(0)
  const tapTimer = useRef<NodeJS.Timeout | null>(null)

  // FIX: Login pengurus pakai client-side Supabase call (bukan server action)
  // Alasan: server action redirect() kadang tidak propagate cookies sb-* ke
  // browser di Next.js 14, sehingga middleware redirect balik ke /login.
  // Client-side signInWithPassword set cookies di document.cookie langsung.
  const router = useRouter()
  const supabaseBrowser = createClient()
  const [pengurusError, setPengurusError] = useState<string | null>(null)
  const [pengurusLoading, setPengurusLoading] = useState(false)

  async function handlePengurusLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPengurusError(null)
    setPengurusLoading(true)

    try {
      const fd = new FormData(e.currentTarget)
      const email = String(fd.get('email') ?? '').trim().toLowerCase()
      const password = String(fd.get('password') ?? '')

      if (!email || !password) {
        setPengurusError('Email dan password wajib diisi')
        return
      }

      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      })

      if (error || !data.user) {
        setPengurusError(error?.message ?? 'Email atau password salah')
        return
      }

      // signInWithPassword sukses — cookies sb-* sudah ditulis ke document.cookie
      // oleh @supabase/ssr. Middleware & layout akan validasi session valid.
      // Layout (dashboard)/layout.tsx akan render 403 (Unauthorized) kalau
      // role bukan pengurus.
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setPengurusError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setPengurusLoading(false)
    }
  }

  const [loginState, loginAction] = useFormState(loginWarga, initialState)
  const [registerState, registerAction] = useFormState(registerWarga, initialState)

  // Easter egg: 5x tap logo dalam 2 detik
  function handleLogoTap() {
    tapCount.current += 1
    if (tapTimer.current) clearTimeout(tapTimer.current)
    tapTimer.current = setTimeout(() => { tapCount.current = 0 }, 2000)
    if (tapCount.current >= 5) {
      setPengurusOpen(true)
      tapCount.current = 0
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-teal-500 via-teal-600 to-cyan-700">
      {/* Floating blobs background */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-cyan-300/20 rounded-full blur-3xl -ml-20 -mb-20" />
      <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-emerald-300/10 rounded-full blur-3xl" />

      {/* Centered content */}
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo & Brand */}
          <div className="text-center mb-6">
            <button
              type="button"
              onClick={handleLogoTap}
              className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-3xl shadow-2xl mb-4 active:scale-95 transition-transform overflow-hidden ring-4 ring-white/20"
              aria-label="Logo SENTRA"
            >
              <Image
                src={LOGO_SENTRA}
                alt="Logo SENTRA RT 03"
                width={80}
                height={80}
                priority
                className="w-full h-full object-cover"
              />
            </button>
            <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm">
              SENTRA RT 03
            </h1>
            <p className="text-sm text-white/80 mt-1.5">
              Transparan kasnya, guyub warganya.
            </p>
          </div>

          {/* Floating Card */}
          <div className="bg-white rounded-3xl shadow-2xl shadow-black/10 overflow-hidden">
            {/* Toggle Login / Daftar */}
            <div className="grid grid-cols-2 gap-1 bg-slate-50 p-1.5 m-4 mb-0 rounded-2xl">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${
                  mode === 'login'
                    ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-md shadow-teal-500/30'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                Masuk
              </button>
              <button
                type="button"
                onClick={() => setMode('daftar')}
                className={`py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${
                  mode === 'daftar'
                    ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-md shadow-teal-500/30'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                Daftar
              </button>
            </div>

            <div className="p-6 pt-4 space-y-4">
              {/* FORM LOGIN */}
              {mode === 'login' && (
                <form action={loginAction} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                      Alamat Rumah
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative">
                        <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <select
                          name="blok"
                          required
                          defaultValue="A"
                          className="h-12 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-100 text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all appearance-none cursor-pointer"
                        >
                          <option value="A">Blok A</option>
                          <option value="B">Blok B</option>
                          <option value="C">Blok C</option>
                          <option value="D">Blok D</option>
                        </select>
                      </div>
                      <Input
                        name="nomorRumah"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="No. Rumah"
                        maxLength={3}
                        required
                        className="flex-1 h-12 rounded-xl bg-slate-50 border-slate-100 focus:bg-white focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                      PIN Akses
                    </Label>
                    <PasswordInput
                      name="pin"
                      placeholder="Masukkan 6 digit PIN"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      inputMode="numeric"
                      autoComplete="current-password"
                    />
                  </div>

                  {loginState.error && (
                    <div className="space-y-2">
                      <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-3 flex items-start gap-2">
                        <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{loginState.error}</span>
                      </div>

                      {/* Bantuan Aktivasi via WhatsApp */}
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2.5">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div className="text-xs text-emerald-800 leading-relaxed">
                            <p className="font-semibold mb-1">Belum bisa login?</p>
                            <p>
                              Untuk aktivasi akun baru atau reset PIN, silakan hubungi
                              Admin RT 03 via WhatsApp.
                            </p>
                            <p className="mt-1.5">
                              <span className="font-semibold">Siapkan:</span> foto Kartu
                              Keluarga (KK) dan KTP untuk verifikasi identitas.
                            </p>
                          </div>
                        </div>
                        <a
                          href="https://wa.me/6285328815155?text=Halo%20Admin%20RT%2003%2C%20saya%20ingin%20aktivasi%20akun%2Freset%20PIN%20SENTRA.%20Berikut%20data%20saya%3A%0A%0A%E2%9C%85%20Nama%3A%20%0A%E2%9C%85%20Blok%2FNo%20Rumah%3A%20%0A%E2%9C%85%20No%20HP%3A%20%0A%0ASaya%20sudah%20menyiapkan%20foto%20KK%20dan%20KTP%20untuk%20verifikasi.%20Mohon%20bantuannya%2C%20terima%20kasih."
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors shadow-sm"
                        >
                          <MessageCircle className="w-4 h-4" />
                          Chat Admin untuk Aktivasi
                        </a>
                        <p className="text-[10px] text-center text-emerald-700/80">
                          via WhatsApp · 0853-2881-5155
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="pt-2">
                    <SubmitButton
                      icon={KeyRound}
                      label="Masuk Aplikasi"
                      pendingLabel="Memverifikasi..."
                    />
                  </div>

                  <div className="text-center pt-1">
                    <a
                      href="https://wa.me/6285328815155?text=Halo%20Admin%20RT%2003%2C%20saya%20ingin%20minta%20bantuan%20reset%20PIN%20RUKUN"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-teal-600 hover:text-teal-700"
                    >
                      Lupa PIN?
                    </a>
                  </div>
                </form>
              )}

              {/* FORM DAFTAR */}
              {mode === 'daftar' && (
                <form action={registerAction} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                      Alamat Rumah
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative">
                        <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <select
                          name="blok"
                          required
                          defaultValue="A"
                          className="h-12 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-100 text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all appearance-none cursor-pointer"
                        >
                          <option value="A">Blok A</option>
                          <option value="B">Blok B</option>
                          <option value="C">Blok C</option>
                          <option value="D">Blok D</option>
                        </select>
                      </div>
                      <Input
                        name="nomorRumah"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="No. Rumah"
                        maxLength={3}
                        required
                        className="flex-1 h-12 rounded-xl bg-slate-50 border-slate-100 focus:bg-white focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                      Nama Kepala Keluarga
                    </Label>
                    <TextInput
                      name="nama"
                      placeholder="Nama lengkap"
                      icon={User}
                      autoComplete="name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                      Nomor WhatsApp
                    </Label>
                    <TextInput
                      name="noWA"
                      type="tel"
                      placeholder="08xxxxxxxxxx"
                      icon={Phone}
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                      PIN Baru (6 Digit)
                    </Label>
                    <PasswordInput
                      name="pin"
                      placeholder="Buat PIN baru"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      inputMode="numeric"
                      autoComplete="new-password"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                      Konfirmasi PIN
                    </Label>
                    <PasswordInput
                      name="pinConfirm"
                      placeholder="Ulangi PIN"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      inputMode="numeric"
                      autoComplete="new-password"
                    />
                  </div>

                  {registerState.error && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-3 flex items-start gap-2">
                      <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{registerState.error}</span>
                    </div>
                  )}

                  <div className="pt-2">
                    <SubmitButton
                      icon={UserPlus}
                      label="Daftar Sekarang"
                      pendingLabel="Mendaftarkan..."
                    />
                  </div>

                  <p className="text-xs text-center text-slate-500 pt-1">
                    Pastikan data Anda benar. PIN digunakan untuk login.
                  </p>
                </form>
              )}
            </div>
          </div>

          {/* Footer hint */}
          <p className="text-center text-xs text-white/70 mt-6 flex items-center justify-center gap-1.5">
            <Wifi className="w-3 h-3" />
            Secured with HTTPS encryption
          </p>
          <p className="text-center text-xs text-white/60 mt-2">
            © 2026 RT 03 — Powered by I-OneTech Apps
          </p>
        </div>
      </div>

      {/* DIALOG PENGURUS (Easter egg) */}
      <Dialog open={pengurusOpen} onOpenChange={setPengurusOpen}>
        <DialogContent className="rounded-3xl border-0 overflow-hidden p-0 max-w-md">
          {/* Gradient header */}
          <div className="bg-gradient-to-br from-teal-500 via-teal-600 to-cyan-700 px-6 pt-6 pb-8 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16" />
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Lock className="w-5 h-5" />
                Akses Pengurus
              </DialogTitle>
              <DialogDescription className="text-white/80">
                Hanya untuk ketua, bendahara, sekretaris, dan pengurus RT.
              </DialogDescription>
            </DialogHeader>
          </div>

          <form onSubmit={handlePengurusLogin} className="space-y-4 p-6 -mt-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                Email
              </Label>
              <TextInput
                name="email"
                type="email"
                placeholder="nama@rt03.id"
                icon={Mail}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                Password
              </Label>
              <PasswordInput
                name="password"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {pengurusError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-3 flex items-start gap-2">
                <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{pengurusError}</span>
              </div>
            )}

            <SubmitButton
              icon={Mail}
              label="Masuk Dashboard"
              pendingLabel="Masuk..."
              loading={pengurusLoading}
            />
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}