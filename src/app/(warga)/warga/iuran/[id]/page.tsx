import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { ArrowLeft, Receipt, CheckCircle2, Clock, AlertCircle, Wallet, HandCoins, Smartphone, Users, Calendar, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { createAdminClient } from '@/lib/supabase/server'
import { formatTanggal, formatRupiah, getMonthName } from '@/lib/format'

export const dynamic = 'force-dynamic'

type Tagihan = {
  id: string
  profile_id: string
  periode_bulan: string
  nominal: number
  total_terbayar: number
  status: 'BELUM' | 'CICIL' | 'LUNAS'
  due_date: string | null
  catatan: string | null
}

type Pembayaran = {
  id: string
  tagihan_id: string
  profile_id: string
  nominal: number
  metode: string
  sumber: string
  bukti_ref: string | null
  catatan: string | null
  created_at: string
  created_by: string | null
}

const METODE_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; ringColor: string }> = {
  TITIP_PENGURUS: {
    label: 'Titip Pengurus',
    icon: <HandCoins className="w-4 h-4" />,
    color: 'text-amber-700',
    bg: 'bg-amber-100',
    ringColor: 'ring-amber-200',
  },
  TRANSFER: {
    label: 'Transfer Bank',
    icon: <Smartphone className="w-4 h-4" />,
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    ringColor: 'ring-blue-200',
  },
  JIMPITAN: {
    label: 'Jimpitan Ronda',
    icon: <Users className="w-4 h-4" />,
    color: 'text-purple-700',
    bg: 'bg-purple-100',
    ringColor: 'ring-purple-200',
  },
  LAINNYA: {
    label: 'Lainnya',
    icon: <Wallet className="w-4 h-4" />,
    color: 'text-slate-700',
    bg: 'bg-slate-100',
    ringColor: 'ring-slate-200',
  },
}

const STATUS_META = {
  LUNAS: { label: 'Lunas', color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  CICIL: { label: 'Cicil', color: 'bg-amber-100 text-amber-700',     icon: <Clock className="w-3.5 h-3.5" /> },
  BELUM: { label: 'Belum', color: 'bg-slate-100 text-slate-600',      icon: <AlertCircle className="w-3.5 h-3.5" /> },
}

export default async function TagihanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('warga_session')?.value
  if (!sessionToken) redirect('/login')

  const admin = createAdminClient()
  const { data: profileId } = await admin.rpc('get_warga_from_session', { p_token: sessionToken })
  if (!profileId) redirect('/login')

  // Ambil profile singkat (perlu login_id untuk query kas_transaksi)
  const { data: profile } = await admin
    .from('profiles')
    .select('nama_kk, blok, nomor_rumah, kategori_tarif, login_id')
    .eq('id', profileId)
    .single()

  if (!profile) redirect('/login')

  // Ambil tagihan dari jimpitan_tagihan
  const { data: t } = await admin
    .from('jimpitan_tagihan')
    .select('id, profile_id, periode_bulan, nominal_tagihan, total_terbayar, status, kategori, created_at')
    .eq('id', id)
    .eq('profile_id', profileId) // pastikan milik user yg login
    .single()

  if (!t) notFound()

  const tagihan: Tagihan = {
    id: t.id,
    profile_id: t.profile_id,
    periode_bulan: t.periode_bulan,
    nominal: Number(t.nominal_tagihan),
    total_terbayar: Number(t.total_terbayar),
    status: t.status,
    due_date: null,
    catatan: t.kategori,
  }

  // =====================================================
  // HISTORY PEMBAYARAN
  // Sumber utama: kas_transaksi (kategori=IURAN_BULANAN) → titip/transfer cicilan
  // Sumber kedua:  jimpitan_detail (yang dibayar saat sesi jimpitan)
  // Filter ke transaksi pada periode tagihan ini saja.
  // =====================================================
  const periodeStart = tagihan.periode_bulan // 'YYYY-MM-01'
  const periodeYear = Number((periodeStart ?? '').slice(0, 4))
  const periodeMonth = Number((periodeStart ?? '').slice(5, 7))
  // Range bulan tagihan: [YYYY-MM-01, YYYY-(MM+1)-01)
  const nextMonth = new Date(Date.UTC(periodeYear, periodeMonth, 1))
  const periodeEnd = nextMonth.toISOString().slice(0, 10)

  // 1) kas_transaksi (cicilan titip/transfer manual) — by login_id
  const { data: kasList } = await admin
    .from('kas_transaksi')
    .select('id, tanggal, kategori, uraian, nominal, metode_bayar, catatan, created_at')
    .eq('tipe', 'MASUK')
    .eq('kategori', 'IURAN_BULANAN')
    .eq('login_id', profile.login_id)
    .gte('tanggal', periodeStart)
    .lt('tanggal', periodeEnd)
    .order('tanggal', { ascending: false })

  // 2) jimpitan_detail (bayar saat ronda jimpitan) — by profile_id + filter sesi di bulan tagihan
  const { data: sesiBulanIni } = await admin
    .from('jimpitan_sesi')
    .select('id, tanggal')
    .gte('tanggal', periodeStart)
    .lt('tanggal', periodeEnd)

  const sesiIdSet = new Set((sesiBulanIni ?? []).map((s) => s.id))
  const sesiTanggalMap = new Map((sesiBulanIni ?? []).map((s) => [s.id, s.tanggal]))

  const { data: detailList } = await admin
    .from('jimpitan_detail')
    .select('id, sesi_id, profile_id, nominal, is_bayar, created_at')
    .eq('profile_id', profileId)
    .eq('is_bayar', true)
    .gt('nominal', 0)

  const detailInPeriod = (detailList ?? []).filter((d) => sesiIdSet.has(d.sesi_id))

  type RiwayatRow = {
    id: string
    tagihan_id: string
    profile_id: string
    nominal: number
    metode: 'TITIP_PENGURUS' | 'TRANSFER' | 'JIMPITAN'
    sumber: string
    bukti_ref: string | null
    catatan: string | null
    tanggal: string
    created_at: string
    created_by: string | null
  }

  const riwayats: RiwayatRow[] = []

  // =====================================================
  // Map kas_transaksi → RiwayatRow
  // Deteksi sumber pembayaran:
  //   1. Jika catatan menyebut "ronda" / "jimpitan" → JIMPITAN (diambil saat ronda)
  //   2. Else jika metode_bayar='TRANSFER' → Transfer Bank
  //   3. Else → Titip Bendahara (TUNAI)
  // Catatan kas_transaksi dari SQL 21 seed berisi
  //   "Input Manual dari data ronda 06 Juni 2026" / "ronda 13 Juni 2026"
  // sehingga bisa dibedakan dari titip murni.
  // =====================================================
  const detectSumber = (catatan: string | null, metodeBayar: string | null): {
    metode: 'TITIP_PENGURUS' | 'TRANSFER' | 'JIMPITAN'
    sumber: string
  } => {
    const cat = (catatan ?? '').toLowerCase()
    if (cat.includes('ronda') || cat.includes('jimpitan') || cat.includes('jmp')) {
      return { metode: 'JIMPITAN', sumber: 'JIMPITAN' }
    }
    const isTransfer = (metodeBayar ?? '').toUpperCase() === 'TRANSFER'
    if (isTransfer) return { metode: 'TRANSFER', sumber: 'TRANSFER' }
    return { metode: 'TITIP_PENGURUS', sumber: 'TITIP' }
  }

  for (const k of kasList ?? []) {
    const { metode, sumber } = detectSumber(k.catatan, k.metode_bayar)
    riwayats.push({
      id: `kas-${k.id}`,
      tagihan_id: tagihan.id,
      profile_id: profileId,
      nominal: Number(k.nominal),
      metode,
      sumber,
      bukti_ref: null,
      // Tampilkan uraian sebagai catatan. Tambahkan label "Cicilan" jika nominal < tagihan
      catatan: k.uraian || (k.catatan ?? null) ||
        (Number(k.nominal) < tagihan.nominal ? 'Cicilan iuran' : 'Pelunasan iuran'),
      tanggal: k.tanggal,
      created_at: k.created_at,
      created_by: null,
    })
  }

  // Map jimpitan_detail → RiwayatRow
  // SKIP baris yang sudah terwakili dari kas_transaksi dengan catatan "ronda"
  // (untuk menghindari duplikat: SQL 24 generate jimpitan_detail dari kas_transaksi
  //  ronda 06/13, jadi satu transaksi yang sama tercatat di kedua tabel).
  // Cukup tambahkan jimpitan_detail yang TIDAK punya padanan kas_transaksi,
  // mis. pembayaran via aplikasi saat sesi jimpitan (tidak via input manual).
  const kasRondaTanggalSet = new Set<string>()
  for (const k of kasList ?? []) {
    const cat = (k.catatan ?? '').toLowerCase()
    if (cat.includes('ronda') || cat.includes('jimpitan') || cat.includes('jmp')) {
      kasRondaTanggalSet.add(k.tanggal)
    }
  }

  for (const d of detailInPeriod) {
    const tanggalSesi = sesiTanggalMap.get(d.sesi_id) ?? null
    // Skip jika transaksi kas_transaksi ronda untuk tanggal yang sama sudah di-include
    if (tanggalSesi && kasRondaTanggalSet.has(tanggalSesi)) continue

    riwayats.push({
      id: `detail-${d.id}`,
      tagihan_id: tagihan.id,
      profile_id: profileId,
      nominal: Number(d.nominal),
      metode: 'JIMPITAN',
      sumber: 'JIMPITAN',
      bukti_ref: null,
      catatan: tanggalSesi ? `Jimpitan ronda tgl ${tanggalSesi}` : 'Jimpitan ronda',
      tanggal: tanggalSesi ?? d.created_at,
      created_at: d.created_at,
      created_by: null,
    })
  }

  // Sort by tanggal desc, lalu created_at desc
  riwayats.sort((a, b) => {
    const ta = new Date(a.tanggal).getTime()
    const tb = new Date(b.tanggal).getTime()
    if (ta !== tb) return tb - ta
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const pembayarans: Pembayaran[] = riwayats.map((r) => ({
    id: r.id,
    tagihan_id: r.tagihan_id,
    profile_id: r.profile_id,
    nominal: r.nominal,
    metode: r.metode,
    sumber: r.sumber,
    bukti_ref: r.bukti_ref,
    catatan: r.catatan,
    created_at: r.created_at,
    created_by: r.created_by,
  }))

  const sisa = tagihan.nominal - tagihan.total_terbayar
  const progressPct = tagihan.nominal > 0
    ? Math.min(100, Math.round((tagihan.total_terbayar / tagihan.nominal) * 100))
    : 0
  const status = STATUS_META[tagihan.status] ?? STATUS_META.BELUM

  return (
    <div className="space-y-4 pt-2 pb-8">
      {/* Header dengan back button */}
      <div className="flex items-center gap-3">
        <Link
          href="/warga/iuran"
          className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-card border shadow-sm hover:bg-muted/50 transition-colors shrink-0"
          aria-label="Kembali ke daftar iuran"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Detail Tagihan
          </p>
          <h1 className="text-lg font-bold leading-tight truncate">
            {getMonthName(tagihan.periode_bulan)}
          </h1>
        </div>
      </div>

      {/* ============================================ */}
      {/* HERO CARD: Status, Nominal, Progress bar */}
      {/* ============================================ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 text-white shadow-xl shadow-emerald-500/20">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mb-16" />

        <div className="relative p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] font-medium text-emerald-100 uppercase tracking-wider">
                Tagihan Iuran
              </p>
              <h2 className="text-2xl font-bold mt-0.5">
                {getMonthName(tagihan.periode_bulan)}
              </h2>
              {tagihan.due_date && (
                <p className="text-[11px] text-emerald-100 mt-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Jatuh tempo: {formatTanggal(tagihan.due_date)}
                </p>
              )}
            </div>
            <Badge className={`${status.color} hover:${status.color} text-[10px] gap-1`}>
              {status.icon}
              {tagihan.status === 'CICIL'
                ? `Cicil · ${formatRupiah(tagihan.total_terbayar)}`
                : status.label}
            </Badge>
          </div>

          {/* Subtitle: jelaskan cicilan (mis. "Sudah bayar 5rb dari 15rb") */}
          {tagihan.status === 'CICIL' && (
            <p className="text-[11px] text-emerald-50/90 -mt-2">
              Sudah bayar <b>{formatRupiah(tagihan.total_terbayar)}</b> dari{' '}
              <b>{formatRupiah(tagihan.nominal)}</b>
            </p>
          )}

          {/* Nominal besar */}
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3.5 ring-1 ring-white/20">
            <p className="text-[10px] uppercase tracking-wider text-emerald-100 font-semibold">
              Total Tagihan
            </p>
            <p className="text-3xl font-bold mt-1">
              {formatRupiah(tagihan.nominal)}
            </p>
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-emerald-100 font-semibold uppercase tracking-wider">
                Terbayar {progressPct}%
              </span>
              <span className="text-white font-bold">
                {formatRupiah(tagihan.total_terbayar)}
              </span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* STATS: 3 cards */}
      {/* ============================================ */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border bg-gradient-to-b from-slate-50 to-white p-3 text-center">
          <Receipt className="w-4 h-4 mx-auto mb-1 text-slate-500" />
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Tagihan</p>
          <p className="text-[11px] font-bold text-slate-700 mt-0.5">{formatRupiah(tagihan.nominal)}</p>
        </div>
        <div className="rounded-2xl border bg-gradient-to-b from-emerald-50 to-white border-emerald-100 p-3 text-center">
          <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-emerald-600" />
          <p className="text-[9px] uppercase tracking-wider text-emerald-700 font-semibold">Dibayar</p>
          <p className="text-[11px] font-bold text-emerald-700 mt-0.5">{formatRupiah(tagihan.total_terbayar)}</p>
        </div>
        <div className={`rounded-2xl border p-3 text-center ${
          sisa > 0
            ? 'bg-gradient-to-b from-amber-50 to-white border-amber-100'
            : 'bg-gradient-to-b from-slate-50 to-white'
        }`}>
          <AlertCircle className={`w-4 h-4 mx-auto mb-1 ${sisa > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
          <p className={`text-[9px] uppercase tracking-wider font-semibold ${
            sisa > 0 ? 'text-amber-700' : 'text-muted-foreground'
          }`}>Sisa</p>
          <p className={`text-[11px] font-bold mt-0.5 ${
            sisa > 0 ? 'text-amber-700' : 'text-slate-700'
          }`}>{formatRupiah(sisa)}</p>
        </div>
      </div>

      {/* ============================================ */}
      {/* CARA BAYAR (hanya tampil jika belum lunas) */}
      {/* ============================================ */}
      {tagihan.status !== 'LUNAS' && (
        <div className="rounded-2xl border bg-blue-50/60 border-blue-100 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-2">
            💡 Cara Bayar
          </p>
          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <HandCoins className="w-3.5 h-3.5 text-amber-700" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-blue-900">Titip Bendahara</p>
                <p className="text-[11px] text-blue-800/80 leading-snug">
                  Serahkan langsung ke Pak RT / Bendahara
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <Smartphone className="w-3.5 h-3.5 text-blue-700" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-blue-900">Transfer Bank</p>
                <p className="text-[11px] text-blue-800/80 leading-snug">
                  Kirim bukti via WhatsApp bendahara
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                <Users className="w-3.5 h-3.5 text-purple-700" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-blue-900">Jimpitan Ronda</p>
                <p className="text-[11px] text-blue-800/80 leading-snug">
                  Otomatis terhitung saat ronda jimpitan
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* HISTORY PEMBAYARAN */}
      {/* ============================================ */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            Riwayat Pembayaran
          </h2>
          <span className="text-[11px] font-semibold text-muted-foreground">
            {pembayarans.length} kali
          </span>
        </div>

        {pembayarans.length === 0 ? (
          <div className="text-center py-10 px-4 bg-slate-50/50 rounded-2xl border">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-semibold">Belum ada pembayaran</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Silakan bayar melalui titip, transfer, atau jimpitan
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {pembayarans.map((p, idx) => {
              const m = METODE_META[p.metode] ?? METODE_META.LAINNYA
              return (
                <div key={p.id} className="rounded-2xl border bg-card p-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${m.bg} ring-1 ${m.ringColor}`}>
                      {m.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <p className="text-base font-bold leading-tight">
                            {formatRupiah(p.nominal)}
                          </p>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full mt-0.5 ${m.bg} ${m.color}`}>
                            {m.icon}
                            {m.label}
                          </span>
                        </div>
                        {idx === 0 && (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[9px]">
                            Terbaru
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-0.5 mt-1.5">
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 shrink-0" />
                          {new Date(p.created_at).toLocaleString('id-ID', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                        {p.bukti_ref && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                            <FileText className="w-3 h-3 shrink-0" />
                            Ref: <span className="font-mono font-semibold">{p.bukti_ref}</span>
                          </p>
                        )}
                      </div>

                      {p.catatan && (
                        <div className="mt-2 px-2.5 py-1.5 bg-muted/40 rounded-lg">
                          <p className="text-[11px] text-muted-foreground italic">
                            &ldquo;{p.catatan}&rdquo;
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
