import Link from 'next/link'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createAdminClient } from '@/lib/supabase/server'
import {
  Users, Wallet, Megaphone,
  TrendingUp, AlertCircle, CheckCircle2, Clock,
  Activity, Sparkles, HandCoins, Shield, ChevronRight,
} from 'lucide-react'
import { formatRupiah, getMonthName } from '@/lib/format'
import { NextJadwalCard } from './next-jadwal-card'

type RecentPayment = {
  id: string
  tanggal: string
  total_pendapatan: number
  status: string
  profile: {
    nama_kk: string
    login_id: string
    blok: string
    nomor_rumah: number
  }[] | null
}

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // Pakai admin client (bypass RLS) supaya dashboard sync dengan database.
  // createClient() di sini kena RLS read policy yang kadang membuat count jadi 0
  // untuk sekretaris/bendahara yang belum match dengan auth.uid context.
  const admin = createAdminClient()

  const today = new Date()
  // FIX timezone: pakai local-date formatter (jangan .toISOString() yg konversi ke UTC)
  // Contoh bug: 2026-06-01 00:00 WIB → toISOString() → '2026-05-31T17:00:00Z' → slice(0,10) → '2026-05-31'
  // Akibatnya query.eq('periode_bulan', currentMonthStr) salah cari bulan (1 hari lebih awal).
  const _yyyy = today.getFullYear()
  const _mm = String(today.getMonth() + 1).padStart(2, '0')
  const _lastYyyy = today.getMonth() === 0 ? _yyyy - 1 : _yyyy
  const _lastMm = today.getMonth() === 0 ? '12' : String(today.getMonth()).padStart(2, '0')
  const currentMonthStr = `${_yyyy}-${_mm}-01`
  const lastMonthStr = `${_lastYyyy}-${_lastMm}-01`
  // currentMonth Date object tetap dipakai untuk getMonthName() / toLocaleString() (aman)
  const currentMonth = new Date(_yyyy, today.getMonth(), 1)
  void currentMonth // hanya untuk debugging

  // Fetch all data in parallel
  // CATATAN: sumber data finansial adalah jimpitan_tagihan & jimpitan_sesi
  // - jimpitan_tagihan.status: LUNAS | CICIL | BELUM (dinormalisasi script 27)
  // - jimpitan_sesi.status:     DRAFT | ACC | REJECTED (schema 21)
  // - jimpitan_sesi.total_pendapatan (schema 21, bukan total_nominal)
  const [
    wargaRes, pengurusRes,
    tagihanCurrentRes,
    jimpitanCurrentRes, jimpitanLastRes,
    jimpitanLunasRes, jimpitanSebagianRes, jimpitanBelumRes,
    announcementRes,
    recentPaymentRes,
    jimpitanPendingRes, jimpitanMonthRes,
    nextJadwalRes, jimpitanWindowRes,
  ] = await Promise.all([
    // WARGA AKTIF: semua profile aktif KECUALI X-0 (superadmin placeholder, bukan alamat rumah nyata)
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true).neq('login_id', 'X-0'),
    admin.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN']),
    // Tagihan iuran bulan ini (jimpitan_tagihan, status: BELUM | CICIL | LUNAS)
    admin.from('jimpitan_tagihan').select('nominal_tagihan, total_terbayar, status').eq('periode_bulan', currentMonthStr),
    // Total pendapatan jimpitan ACC bulan ini vs bulan lalu
    admin.from('jimpitan_sesi').select('tanggal, total_pendapatan').eq('status', 'ACC').gte('tanggal', currentMonthStr),
    admin.from('jimpitan_sesi').select('tanggal, total_pendapatan').eq('status', 'ACC').gte('tanggal', lastMonthStr).lt('tanggal', currentMonthStr),
    // Count by status bulan ini
    admin.from('jimpitan_tagihan').select('id', { count: 'exact', head: true }).eq('status', 'LUNAS').eq('periode_bulan', currentMonthStr),
    admin.from('jimpitan_tagihan').select('id', { count: 'exact', head: true }).eq('status', 'CICIL').eq('periode_bulan', currentMonthStr),
    admin.from('jimpitan_tagihan').select('id', { count: 'exact', head: true }).eq('status', 'BELUM').eq('periode_bulan', currentMonthStr),
    admin.from('info_pengumuman').select('id', { count: 'exact', head: true }).eq('is_published', true),
    // Sesi jimpitan yang sudah disetujui (pembayaran terbaru)
    admin.from('jimpitan_sesi').select(`
      id, tanggal, total_pendapatan, status,
      profile:profiles!jimpitan_sesi_profile_id_petugas_fkey(nama_kk, login_id, blok, nomor_rumah)
    `).eq('status', 'ACC').order('tanggal', { ascending: false }).limit(5),
    admin.from('jimpitan_sesi').select('id', { count: 'exact', head: true }).eq('status', 'DRAFT'),
    admin.from('jimpitan_sesi').select('tanggal, total_pendapatan').eq('status', 'ACC').gte('tanggal', currentMonthStr),
    // FIX timezone: pakai local-date formatter (lihat comment line 33-36 untuk penjelasan bug)
    admin.from('v_penjaga_efektif').select('tanggal, profile_efektif_id, nama_efektif, is_swapped, nama_asli, profile_asli_id, minggu_ke').gte('tanggal', `${_yyyy}-${_mm}-${String(today.getDate()).padStart(2, '0')}`).order('tanggal', { ascending: true }).limit(1).maybeSingle(),
    admin.rpc('is_jimpitan_window_open'),
  ])

  const isJimpitanWindowOpen = !!jimpitanWindowRes.data
  const nextJadwal = nextJadwalRes.data
  const jimpitanMonthTotal = (jimpitanMonthRes.data ?? []).reduce((s, x) => s + Number(x.total_pendapatan), 0)

  // Ambil anggota kelompok untuk next jadwal (untuk expandable "Lihat anggota")
  let nextJadwalAnggota: Array<{
    id: string; kelompok_id: string; profile_id: string;
    login_id: string; nama_kk_snapshot: string;
    role_kelompok: string; urutan: number
  }> = []
  if (nextJadwal?.minggu_ke) {
    const { data: anggota } = await admin
      .from('ronda_kelompok')
      .select('id, kelompok_id, profile_id, login_id, nama_kk_snapshot, role_kelompok, urutan')
      .eq('is_active', true)
      .eq('kelompok_id', `K${nextJadwal.minggu_ke}`)
      .order('urutan', { ascending: true })
    nextJadwalAnggota = (anggota ?? []) as typeof nextJadwalAnggota
  }

  // Hitung aggregat
  const tagihanCurrent = tagihanCurrentRes.data ?? []

  const totalTagihanCurrent = tagihanCurrent.reduce((s, t) => s + Number(t.nominal_tagihan), 0)
  const totalTerbayarCurrent = tagihanCurrent.reduce((s, t) => s + Number(t.total_terbayar), 0)
  const totalSisaCurrent = totalTagihanCurrent - totalTerbayarCurrent

  const jimpitanCurrent = jimpitanCurrentRes.data ?? []
  const totalJimpitanCurrent = jimpitanCurrent.reduce((s, p) => s + Number(p.total_pendapatan), 0)

  const jimpitanLast = jimpitanLastRes.data ?? []
  const totalJimpitanLast = jimpitanLast.reduce((s, p) => s + Number(p.total_pendapatan), 0)

  // Trend pembayaran bulan ini vs bulan lalu
  const paymentTrend = totalJimpitanLast > 0
    ? Math.round(((totalJimpitanCurrent - totalJimpitanLast) / totalJimpitanLast) * 100)
    : 0

  // Statistik utama dengan gradient
  const stats = [
    {
      label: 'Warga Aktif',
      value: wargaRes.count ?? 0,
      sublabel: `${pengurusRes.count ?? 0} pengurus`,
      icon: Users,
      gradient: 'from-teal-500 via-teal-600 to-cyan-700',
      iconBg: 'bg-white/20',
      textColor: 'text-white',
      href: '/dashboard/warga',
    },
    {
      label: 'Iuran Bulan Ini',
      value: formatRupiah(totalJimpitanCurrent),
      sublabel: `Trend ${paymentTrend >= 0 ? '+' : ''}${paymentTrend}% vs lalu`,
      icon: Wallet,
      gradient: 'from-cyan-500 via-teal-600 to-emerald-600',
      iconBg: 'bg-white/20',
      textColor: 'text-white',
      href: '/dashboard/jimpitan',
    },
    {
      label: 'Sisa Tagihan',
      value: formatRupiah(totalSisaCurrent),
      sublabel: `${jimpitanBelumRes.count ?? 0} belum + ${jimpitanSebagianRes.count ?? 0} cicil`,
      icon: AlertCircle,
      gradient: 'from-amber-500 via-orange-500 to-rose-500',
      iconBg: 'bg-white/20',
      textColor: 'text-white',
      href: '/dashboard/iuran',
    },
    {
      label: 'Pengumuman',
      value: announcementRes.count ?? 0,
      sublabel: 'Aktif dipublikasi',
      icon: Megaphone,
      gradient: 'from-violet-500 via-purple-600 to-fuchsia-600',
      iconBg: 'bg-white/20',
      textColor: 'text-white',
      href: '/dashboard/pengumuman',
    },
  ]

  // Bar chart: progress lunas bulan ini
  const lunasPct = tagihanCurrent.length > 0
    ? Math.round(tagihanCurrent.filter(t => t.status === 'LUNAS').length / tagihanCurrent.length * 100)
    : 0
  const sebagianPct = tagihanCurrent.length > 0
    ? Math.round(tagihanCurrent.filter(t => t.status === 'CICIL').length / tagihanCurrent.length * 100)
    : 0
  const belumPct = 100 - lunasPct - sebagianPct

  return (
    <div className="space-y-6 md:space-y-8 pb-8">
      {/* ====== HERO HEADER (gradient teal/cyan) ====== */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-500 via-teal-600 to-cyan-700 p-6 md:p-8 shadow-xl shadow-teal-500/20 text-white">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -ml-16 -mb-16" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">
                Dashboard Pengurus
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold leading-tight">
              Ringkasan RT 03
            </h1>
            <p className="text-sm text-white/80 mt-1.5">
              {getMonthName(currentMonth.toISOString().slice(0, 10))} · Pantau aktivitas warga dan iuran
            </p>
          </div>
          <div className="hidden md:flex items-center justify-center w-14 h-14 bg-white/15 backdrop-blur-sm rounded-2xl shrink-0">
            <Shield className="w-7 h-7 text-white" />
          </div>
        </div>
      </div>

      {/* ====== 4 STATS CARDS dengan gradient ====== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${s.gradient} p-4 md:p-5 shadow-lg shadow-black/5 hover:shadow-xl hover:scale-[1.02] active:scale-[0.99] transition-all duration-200 cursor-pointer group`}
          >
            {/* Decorative circles */}
            <div className="absolute -top-8 -right-8 w-24 h-24 bg-white/10 rounded-full" />
            <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-white/5 rounded-full" />

            <div className="relative">
              <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl ${s.iconBg} backdrop-blur-sm flex items-center justify-center mb-3`}>
                <s.icon className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <p className={`text-[11px] md:text-xs font-semibold uppercase tracking-wider ${s.textColor} opacity-90`}>
                {s.label}
              </p>
              <p className={`text-xl md:text-2xl lg:text-3xl font-bold leading-tight mt-1 ${s.textColor} truncate`}>
                {s.value}
              </p>
              <p className={`text-[10px] md:text-xs ${s.textColor} opacity-80 mt-1.5 truncate`}>
                {s.sublabel}
              </p>
              <ChevronRight className={`absolute top-3 right-3 w-4 h-4 ${s.textColor} opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all`} />
            </div>
          </Link>
        ))}
      </div>

      {/* ====== RONDA & JIMPITAN ====== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Jadwal Ronda Mendatang */}
        <NextJadwalCard
          nextJadwal={nextJadwal ? {
            tanggal: nextJadwal.tanggal,
            profile_efektif_id: nextJadwal.profile_efektif_id,
            nama_efektif: nextJadwal.nama_efektif,
            is_swapped: !!nextJadwal.is_swapped,
            nama_asli: nextJadwal.nama_asli ?? null,
            profile_asli_id: nextJadwal.profile_asli_id,
            minggu_ke: nextJadwal.minggu_ke ?? null,
          } : null}
          anggota={nextJadwalAnggota}
        />

        {/* Jimpitan Status */}
        <Card className="overflow-hidden border-0 shadow-md ring-1 ring-emerald-200/60">
          <div className="relative bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-3 border-b border-emerald-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HandCoins className="w-4 h-4 text-emerald-600" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                  Jimpitan
                </span>
              </div>
              <Link href="/dashboard/jimpitan" className="text-[10px] text-emerald-600 hover:underline font-semibold">
                Lihat →
              </Link>
            </div>
          </div>
          <CardContent className="p-4 space-y-2">
            {isJimpitanWindowOpen && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-emerald-100 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-xs font-semibold text-emerald-700">
                  Window buka - warga bisa daftar
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-amber-50 rounded-lg p-2.5 text-center">
                <p className="text-[9px] font-bold uppercase text-amber-700">Pending ACC</p>
                <p className="text-xl font-bold text-amber-700 mt-0.5">
                  {jimpitanPendingRes.count ?? 0}
                </p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-2.5 text-center">
                <p className="text-[9px] font-bold uppercase text-emerald-700">Bulan Ini</p>
                <p className="text-base font-bold text-emerald-700 mt-0.5 truncate">
                  {formatRupiah(jimpitanMonthTotal)}
                </p>
              </div>
            </div>
            {(jimpitanPendingRes.count ?? 0) > 0 && (
              <Link
                href="/dashboard/kas"
                className="flex items-center justify-center gap-1.5 w-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                ACC Sekarang
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ====== DESKTOP: 2-col (progress + recent) ====== */}
      <div className="hidden lg:grid lg:grid-cols-2 gap-6">
        {/* Progress Iuran */}
        <Card className="overflow-hidden border-0 shadow-md ring-1 ring-slate-200/60">
          <div className="relative bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 px-6 py-4 border-b border-emerald-100">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-200/30 to-transparent rounded-bl-full" />
            <div className="relative flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                    Progress Iuran
                  </span>
                </div>
                <CardTitle className="text-lg">
                  {getMonthName(currentMonthStr)}
                </CardTitle>
                <CardDescription className="mt-0.5">
                  Status pembayaran warga bulan ini
                </CardDescription>
              </div>
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-xs font-bold shadow-sm">
                {lunasPct}% Lunas
              </Badge>
            </div>
          </div>
          <CardContent className="p-6 space-y-5">
            {/* Bar chart stacked dengan shadow */}
            <div className="flex h-10 rounded-xl overflow-hidden border-2 border-white shadow-inner bg-slate-100">
              {lunasPct > 0 && (
                <div
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold transition-all"
                  style={{ width: `${lunasPct}%` }}
                >
                  {lunasPct > 10 && `${lunasPct}%`}
                </div>
              )}
              {sebagianPct > 0 && (
                <div
                  className="bg-gradient-to-r from-amber-500 to-amber-600 flex items-center justify-center text-white text-xs font-bold transition-all"
                  style={{ width: `${sebagianPct}%` }}
                >
                  {sebagianPct > 10 && `${sebagianPct}%`}
                </div>
              )}
              {belumPct > 0 && (
                <div
                  className="bg-gradient-to-r from-slate-300 to-slate-400 flex items-center justify-center text-slate-700 text-xs font-bold transition-all"
                  style={{ width: `${belumPct}%` }}
                >
                  {belumPct > 10 && `${belumPct}%`}
                </div>
              )}
            </div>

            {/* Legend dengan icon */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Lunas</p>
                </div>
                <p className="text-2xl font-bold text-emerald-700">{jimpitanLunasRes.count ?? 0}</p>
                <p className="text-[10px] text-emerald-600 mt-0.5">{lunasPct}% dari total</p>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Cicil</p>
                </div>
                <p className="text-2xl font-bold text-amber-700">{jimpitanSebagianRes.count ?? 0}</p>
                <p className="text-[10px] text-amber-600 mt-0.5">{sebagianPct}% dari total</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="w-4 h-4 text-slate-500" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Belum</p>
                </div>
                <p className="text-2xl font-bold text-slate-700">{jimpitanBelumRes.count ?? 0}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{belumPct}% dari total</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total nominal</span>
                <span className="font-bold text-slate-700">{formatRupiah(totalTagihanCurrent)}</span>
              </div>
              <div className="h-px bg-slate-200" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sudah dibayar</span>
                <span className="font-bold text-emerald-600">+ {formatRupiah(totalTerbayarCurrent)}</span>
              </div>
              <div className="h-px bg-slate-200" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sisa</span>
                <span className="font-bold text-amber-600">{formatRupiah(totalSisaCurrent)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="overflow-hidden border-0 shadow-md ring-1 ring-slate-200/60">
          <div className="relative bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-6 py-4 border-b border-blue-100">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-200/30 to-transparent rounded-bl-full" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-700">
                  Aktivitas
                </span>
              </div>
              <CardTitle className="text-lg">Pembayaran Terbaru</CardTitle>
              <CardDescription className="mt-0.5">5 transaksi terakhir</CardDescription>
            </div>
          </div>
          <CardContent className="p-4">
            {recentPaymentRes.data && recentPaymentRes.data.length > 0 ? (
              <div className="space-y-2">
                {recentPaymentRes.data.map((p: RecentPayment) => {
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200/60 hover:border-slate-300 hover:shadow-sm transition-all"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                        {p.profile?.[0]?.blok}{p.profile?.[0]?.nomor_rumah}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{p.profile?.[0]?.nama_kk ?? 'Unknown'}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-600 text-[9px] font-semibold">
                            <Users className="w-2.5 h-2.5" />
                            JIMPITAN
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {p.profile?.[0]?.blok}-{p.profile?.[0]?.nomor_rumah}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-emerald-600">
                          {formatRupiah(Number(p.total_pendapatan))}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(p.tanggal).toLocaleString('id-ID', {
                            day: 'numeric', month: 'short',
                          })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-10">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <Activity className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-muted-foreground">Belum ada aktivitas</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Pembayaran pertama akan muncul di sini
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ====== MOBILE: Stacked progress + recent ====== */}
      <div className="lg:hidden space-y-4">
        {/* Mobile progress iuran */}
        <Card className="overflow-hidden border-0 shadow-md ring-1 ring-slate-200/60">
          <div className="relative bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3 border-b border-emerald-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                    Progress Iuran
                  </p>
                  <p className="text-sm font-bold text-slate-700">
                    {getMonthName(currentMonthStr)}
                  </p>
                </div>
              </div>
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-[10px] font-bold">
                {lunasPct}%
              </Badge>
            </div>
          </div>
          <CardContent className="p-4">
            <div className="flex h-4 rounded-full overflow-hidden border-2 border-white shadow-inner bg-slate-100">
              {lunasPct > 0 && <div className="bg-gradient-to-r from-emerald-500 to-emerald-600" style={{ width: `${lunasPct}%` }} />}
              {sebagianPct > 0 && <div className="bg-gradient-to-r from-amber-500 to-amber-600" style={{ width: `${sebagianPct}%` }} />}
              {belumPct > 0 && <div className="bg-gradient-to-r from-slate-300 to-slate-400" style={{ width: `${belumPct}%` }} />}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-emerald-50 rounded-lg p-2 text-center">
                <p className="text-[9px] font-bold uppercase text-emerald-700">Lunas</p>
                <p className="text-lg font-bold text-emerald-700">{jimpitanLunasRes.count ?? 0}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-2 text-center">
                <p className="text-[9px] font-bold uppercase text-amber-700">Cicil</p>
                <p className="text-lg font-bold text-amber-700">{jimpitanSebagianRes.count ?? 0}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-2 text-center">
                <p className="text-[9px] font-bold uppercase text-slate-700">Belum</p>
                <p className="text-lg font-bold text-slate-700">{jimpitanBelumRes.count ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mobile recent activity */}
        {recentPaymentRes.data && recentPaymentRes.data.length > 0 && (
          <Card className="overflow-hidden border-0 shadow-md ring-1 ring-slate-200/60">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-blue-100">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">
                  Pembayaran Terbaru
                </p>
              </div>
            </div>
            <CardContent className="p-3 space-y-1.5">
              {recentPaymentRes.data.slice(0, 3).map((p: RecentPayment) => (
                <div key={p.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-white border border-slate-200/60">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                    {p.profile?.[0]?.blok}{p.profile?.[0]?.nomor_rumah}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{p.profile?.[0]?.nama_kk ?? 'Unknown'}</p>
                    <p className="text-[10px] text-muted-foreground">Jimpitan · {new Date(p.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  <p className="text-xs font-bold text-emerald-600 shrink-0">{formatRupiah(Number(p.total_pendapatan))}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
