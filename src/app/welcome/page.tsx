'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Receipt,
  Bell,
  Home,
  ArrowRight,
  Wallet,
  HandCoins,
  Calendar,
  Shield,
  Users,
  ChevronRight,
  ChevronLeft,
  Megaphone,
} from 'lucide-react'
import { LOGO_SENTRA } from '@/lib/constants'

const ONBOARDING_KEY = 'rt03:onboarding-done'

type Slide = {
  icon: React.ComponentType<{ className?: string }>
  gradient: string
  title: string
  subtitle: string
  bullets: { icon: React.ComponentType<{ className?: string }>; text: string }[]
}

const SLIDES: Slide[] = [
  {
    icon: Shield,
    gradient: 'from-teal-500 via-teal-600 to-cyan-700',
    title: 'Selamat Datang di SENTRA RT 03',
    subtitle: 'Wadah Transparan, Warga Sejahtera (Papan Cetha, Warga Raharja)',
    bullets: [
      { icon: Shield, text: 'Akses aman untuk ketua, bendahara, sekretaris, dan warga' },
      { icon: Users, text: 'Kolaborasi pengurus & warga dalam satu platform' },
      { icon: Bell, text: 'Notifikasi langsung untuk pengumuman penting' },
    ],
  },
  {
    icon: Wallet,
    gradient: 'from-emerald-500 via-teal-600 to-cyan-700',
    title: 'Kelola Kas & Iuran dengan Mudah',
    subtitle: 'Pantau transaksi, tagihan, dan pembayaran.',
    bullets: [
      { icon: Wallet, text: 'Iuran bulanan & jimpitan — status real-time' },
      { icon: HandCoins, text: 'Catat pemasukan & pengeluaran dengan rapi' },
      { icon: Shield, text: 'Setiap transaksi tercatat, tidak ada yang hilang' },
    ],
  },
  {
    icon: Calendar,
    gradient: 'from-cyan-500 via-teal-600 to-emerald-700',
    title: 'Jadwal Ronda & Pengumuman',
    subtitle: 'Tidak pernah ketinggalan jadwal ronda lagi.',
    bullets: [
      { icon: Calendar, text: 'Jadwal ronda mingguan + swap otomatis' },
      { icon: Megaphone, text: 'Pengumuman RT langsung ke HP warga' },
      { icon: Bell, text: 'Pengingat H-1 sebelum ronda' },
    ],
  },
]

export default function WelcomePage() {
  const router = useRouter()
  const [step, setStep] = useState<'opening' | 'slides' | 'done'>('opening')
  const [slideIdx, setSlideIdx] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  function startOnboarding() {
    setStep('slides')
  }

  function nextSlide() {
    if (slideIdx < SLIDES.length - 1) {
      setSlideIdx(slideIdx + 1)
    } else {
      finish()
    }
  }

  function prevSlide() {
    if (slideIdx > 0) setSlideIdx(slideIdx - 1)
  }

  function finish() {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1')
    } catch {
      // ignore
    }
    router.push('/login')
  }

  function skipToLogin() {
    finish()
  }

  if (!mounted) return null

  // =====================================================
  // OPENING SCREEN — dark blue neon + slogan + 3 fitur
  // =====================================================
  if (step === 'opening') {
    return (
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-950 flex items-center justify-center p-6">
        {/* Neon glow blobs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl -ml-32 -mb-32" />
        <div className="absolute top-1/3 left-1/4 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-yellow-500/10 rounded-full blur-3xl" />

        {/* Subtle grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative w-full max-w-sm text-center space-y-6">
          {/* Logo with neon glow ring */}
          <div className="flex justify-center pt-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-cyan-400/40 blur-2xl animate-pulse" />
              <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-cyan-400 via-teal-400 to-emerald-500 p-[3px] shadow-[0_0_40px_rgba(34,211,238,0.5)]">
                <div className="w-full h-full rounded-full bg-slate-950 overflow-hidden flex items-center justify-center">
                  <Image
                    src={LOGO_SENTRA}
                    alt="Logo SENTRA RT 03"
                    width={96}
                    height={96}
                    priority
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Title + slogan */}
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold text-white tracking-tight drop-shadow-[0_0_20px_rgba(34,211,238,0.4)]">
              SENTRA RT 03
            </h1>
            <p className="text-base font-bold text-yellow-300 drop-shadow-[0_0_10px_rgba(250,204,21,0.3)]">
              Wadah Transparan, Warga Sejahtera
            </p>
            <p className="text-sm italic text-cyan-200/90 font-medium">
              (Papan Cetha, Warga Raharja)
            </p>
            <p className="text-sm text-slate-300 pt-1">
              Solusi tata kelola komunal dalam genggaman
            </p>
          </div>

          {/* 3 Feature cards */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="bg-slate-900/60 backdrop-blur-sm border border-cyan-500/30 rounded-2xl p-3 space-y-2 shadow-[0_0_20px_rgba(34,211,238,0.15)]">
              <div className="w-10 h-10 mx-auto rounded-xl bg-cyan-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.4)]">
                <Receipt className="w-5 h-5 text-cyan-300" />
              </div>
              <p className="text-xs font-bold text-cyan-100">Transparan</p>
            </div>
            <div className="bg-slate-900/60 backdrop-blur-sm border border-yellow-500/30 rounded-2xl p-3 space-y-2 shadow-[0_0_20px_rgba(250,204,21,0.15)]">
              <div className="w-10 h-10 mx-auto rounded-xl bg-yellow-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(250,204,21,0.4)]">
                <Bell className="w-5 h-5 text-yellow-300" />
              </div>
              <p className="text-xs font-bold text-yellow-100">Terpadu</p>
            </div>
            <div className="bg-slate-900/60 backdrop-blur-sm border border-emerald-500/30 rounded-2xl p-3 space-y-2 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
              <div className="w-10 h-10 mx-auto rounded-xl bg-emerald-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                <Home className="w-5 h-5 text-emerald-300" />
              </div>
              <p className="text-xs font-bold text-emerald-100">Mudah</p>
            </div>
          </div>

          {/* Pagination dots (3 dots) */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <span className="w-8 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.6)]" />
            <span className="w-2 h-2 rounded-full bg-white/30" />
            <span className="w-2 h-2 rounded-full bg-white/30" />
          </div>

          {/* Buttons */}
          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={startOnboarding}
              className="group w-full h-14 rounded-2xl bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 text-slate-950 font-bold text-base shadow-[0_0_25px_rgba(34,211,238,0.5)] hover:shadow-[0_0_35px_rgba(34,211,238,0.7)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              Mulai Layanan
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              type="button"
              onClick={skipToLogin}
              className="w-full h-11 rounded-2xl bg-white/5 hover:bg-white/10 backdrop-blur-sm text-white/80 hover:text-white font-semibold text-sm transition-all border border-white/10"
            >
              Langsung Masuk →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // =====================================================
  // SLIDES CAROUSEL (tutorial / feature walkthrough)
  // =====================================================
  const slide = SLIDES[slideIdx]
  const isLast = slideIdx === SLIDES.length - 1

  return (
    <div className={`min-h-screen relative overflow-hidden bg-gradient-to-br ${slide.gradient} flex flex-col`}>
      <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-cyan-300/20 rounded-full blur-3xl -ml-20 -mb-20" />

      {/* Top bar with skip */}
      <div className="relative flex items-center justify-between p-5">
        <div className="w-10" />
        <div className="flex items-center justify-center w-12 h-12 bg-white/15 backdrop-blur-sm rounded-2xl">
          <slide.icon className="w-6 h-6 text-white" />
        </div>
        <button
          type="button"
          onClick={skipToLogin}
          className="text-white/80 hover:text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          Lewati
        </button>
      </div>

      {/* Main content */}
      <div className="relative flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-black/10 p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${slide.gradient} shadow-lg`}>
              <slide.icon className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 leading-tight pt-2">
              {slide.title}
            </h2>
            <p className="text-sm text-slate-500">
              {slide.subtitle}
            </p>
          </div>

          <ul className="space-y-3 pt-2">
            {slide.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-3 bg-slate-50 rounded-xl p-3.5">
                <div className={`shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br ${slide.gradient} flex items-center justify-center`}>
                  <b.icon className="w-4 h-4 text-white" />
                </div>
                <p className="text-sm text-slate-700 font-medium pt-1.5 leading-snug">
                  {b.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="relative p-6 space-y-4">
        {/* Dots */}
        <div className="flex items-center justify-center gap-2">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`transition-all rounded-full ${
                i === slideIdx ? 'w-8 h-2 bg-white' : 'w-2 h-2 bg-white/40'
              }`}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          {slideIdx > 0 ? (
            <button
              type="button"
              onClick={prevSlide}
              className="h-14 px-5 rounded-2xl bg-white/15 backdrop-blur-sm text-white font-bold border border-white/20 hover:bg-white/25 transition-all flex items-center gap-1"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-14" />
          )}
          <button
            type="button"
            onClick={nextSlide}
            className="flex-1 h-14 rounded-2xl bg-white text-teal-700 font-bold text-base shadow-xl shadow-black/10 hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            {isLast ? 'Mulai Sekarang' : 'Lanjut'}
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
