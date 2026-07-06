import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { ArrowLeft, Receipt, CheckCircle2, Clock, AlertCircle, ChevronRight, Sparkles, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { formatTanggal, formatRupiah, getMonthName } from '@/lib/format'

export const dynamic = 'force-dynamic'

type Tagihan = {
  id: string
  periode_bulan: string
  nominal: number
  total_terbayar: number
  status: 'BELUM' | 'CICIL' | 'LUNAS' | 'LEBIH'
  due_date: string | null
  catatan: string | null
}

type Pembayaran = {
  id: string
  nominal: number
  metode: string
  sumber: string
  bukti_ref: string | null
  catatan: string | null
  created_at: string
  nota_url: string | null
}

const STATUS_META = {
  LUNAS: { label: 'Lunas',  color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  LEBIH: { label: 'Lebih',  color: 'bg-blue-100 text-blue-700',       icon: <TrendingUp className="w-3.5 h-3.5" /> },
  CICIL: { label: 'Cicil',  color: 'bg-amber-100 text-amber-700',     icon: <Clock className="w-3.5 h-3.5" /> },
  BELUM: { label: 'Belum',  color: 'bg-slate-100 text-slate-600',      icon: <AlertCircle className="w-3.5 h-3.5" /> },
}

export default async function IuranDetailPage() {
  const admin = createAdminClient()
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('warga_session')?.value
  
  let profileId: string | null = null
  
  if (sessionToken) {
    // Warga login normal
    const { data: pid } = await admin.rpc('get_warga_from_session', {
      p_token: sessionToken,
    })
    if (pid) {
      profileId = pid
    }
  } else {
    // Dual-role: pengurus yang mengakses /warga
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()
      if (profile) {
        profileId = profile.id
      }
    }
  }

  if (!profileId) redirect('/login')

  // Ambil profile singkat
  const { data: profile } = await admin
    .from('profiles')
    .select('nama_kk, blok, nomor_rumah, kategori_tarif, login_id')
    .eq('id', profileId)
    .single()

  if (!profile) redirect('/login')

  // Ambil semua tagihan dari jimpitan_tagihan (BUKAN iuran_tagihan)
  // Field name juga beda: nominal_tagihan (bukan nominal)
  const { data: tagihanList } = await admin
    .from('jimpitan_tagihan')
    .select('id, periode_bulan, nominal_tagihan, total_terbayar, status, kategori, created_at')
    .eq('profile_id', profileId)
    .order('periode_bulan', { ascending: false })

  const tagihanArr: Tagihan[] = (tagihanList ?? []).map(t => ({
    id: t.id,
    periode_bulan: t.periode_bulan,
    nominal: Number(t.nominal_tagihan),
    total_terbayar: Number(t.total_terbayar),
    status: t.status,
    due_date: null,
    catatan: t.kategori,
  }))

  // Ambil semua pembayaran
  // Sumber 1: kas_transaksi (cicilan titip/transfer) — by login_id, semua periode
  // Sumber 2: jimpitan_detail (bayar saat jimpitan) — by profile_id, join sesi untuk tanggal
  // Catatan: untuk filter per periode, dilakukan in-memory setelah join dengan sesi.
  const { data: kasList } = await admin
    .from('kas_transaksi')
    .select('id, tanggal, kategori, uraian, nominal, metode_bayar, catatan, created_at, login_id, nota_url')
    .eq('tipe', 'MASUK')
    .eq('kategori', 'IURAN_BULANAN')
    .eq('login_id', profile.login_id)
    .order('tanggal', { ascending: false })

  const { data: sesiAll } = await admin
    .from('jimpitan_sesi')
    .select('id, tanggal')

  const sesiIdMap = new Map((sesiAll ?? []).map((s) => [s.id, s.tanggal]))

  const { data: detailList } = await admin
    .from('jimpitan_detail')
    .select('id, sesi_id, nominal, created_at')
    .eq('profile_id', profileId)
    .eq('is_bayar', true)
    .gt('nominal', 0)

  // Map ke format Pembayaran (gabungan dari 2 sumber)
  const pembayaranArr: Pembayaran[] = []

  // Deteksi sumber pembayaran:
  //   1. catatan menyebut "ronda" / "jimpitan" → JIMPITAN (diambil saat ronda)
  //   2. else metode_bayar='TRANSFER' → Transfer
  //   3. else → Titip Bendahara (TUNAI)
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
    pembayaranArr.push({
      id: `kas-${k.id}`,
      nominal: Number(k.nominal),
      metode,
      sumber,
      bukti_ref: null,
      // Catatan = uraian (mis. "Cicilan iuran Juni")
      catatan: k.uraian || k.catatan || (Number(k.nominal) > 0 ? 'Cicilan iuran' : ''),
      created_at: k.created_at,
      nota_url: k.nota_url || null,
    })
  }

  // SKIP jimpitan_detail yang sudah terwakili dari kas_transaksi ronda
  // (SQL 24 generate jimpitan_detail dari kas_transaksi, jadi satu event
  //  tercatat di kedua tabel — supaya tidak double-count)
  const kasRondaTanggalSet = new Set<string>()
  for (const k of kasList ?? []) {
    const cat = (k.catatan ?? '').toLowerCase()
    if (cat.includes('ronda') || cat.includes('jimpitan') || cat.includes('jmp')) {
      kasRondaTanggalSet.add(k.tanggal)
    }
  }

  for (const d of detailList ?? []) {
    const tanggalSesi = sesiIdMap.get(d.sesi_id)
    if (!tanggalSesi) continue
    // Skip jika transaksi kas_transaksi ronda untuk tanggal yang sama sudah di-include
    if (kasRondaTanggalSet.has(tanggalSesi)) continue

    pembayaranArr.push({
      id: `detail-${d.id}`,
      nominal: Number(d.nominal),
      metode: 'JIMPITAN',
      sumber: 'JIMPITAN',
      bukti_ref: null,
      catatan: `Jimpitan ronda tgl ${tanggalSesi}`,
      created_at: d.created_at,
    })
  }

  // Sort by created_at desc
  pembayaranArr.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  // Group pembayaran by bulan (untuk counter) — pakai tanggal transaksi / tanggal sesi
  const pembayaranByBulan: Record<string, Pembayaran[]> = {}
  for (const p of pembayaranArr) {
    // Ekstrak YYYY-MM dari catatan (kas: uraian tanggal YYYY-MM-DD, atau detail: "tgl YYYY-MM-DD")
    const m = (p.catatan ?? '').match(/\d{4}-\d{2}-\d{2}/)
    const bulan = m ? m[0].slice(0, 7) : (p.created_at ?? '').slice(0, 7)
    const arr = pembayaranByBulan[bulan] ?? []
    arr.push(p)
    pembayaranByBulan[bulan] = arr
  }

  // Summary
  const totalTagihan   = tagihanArr.reduce((s, t) => s + t.nominal, 0)
  const totalTerbayar  = tagihanArr.reduce((s, t) => s + t.total_terbayar, 0)
  const totalSisa      = Math.max(0, totalTagihan - totalTerbayar)
  const countLunas     = tagihanArr.filter(t => t.status === 'LUNAS').length
  const countCicil     = tagihanArr.filter(t => t.status === 'CICIL').length
  const countBelum     = tagihanArr.filter(t => t.status === 'BELUM').length
  // const totalKelebihan & countLebih tidak dipakai di UI saat ini
  const cicilAmount    = tagihanArr
    .filter(t => t.status === 'CICIL')
    .reduce((s, t) => s + t.total_terbayar, 0)

  return (
    <div className="space-y-4 pt-2 pb-8">
      {/* ============================================ */}
      {/* HEADER GRADIENT */}
      {/* ============================================ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 text-white shadow-xl shadow-emerald-500/20">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mb-16" />

        <div className="relative p-5">
          <div className="flex items-center gap-3">
            <Link
              href="/warga"
              className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm ring-1 ring-white/30 hover:bg-white/30 transition-colors shrink-0"
              aria-label="Kembali"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-medium text-emerald-100 uppercase tracking-wider">
                Detail Iuran · {profile.login_id}
              </p>
              <h1 className="text-lg font-bold leading-tight truncate">
                {profile.nama_kk}
              </h1>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/30 shrink-0">
              <Receipt className="w-5 h-5 text-white" />
            </div>
          </div>

          {/* Alamat */}
          <div className="mt-3 flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-2xl px-3 py-2 ring-1 ring-white/20">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-wider text-emerald-100 font-medium">
                Alamat Rumah
              </p>
              <p className="text-sm font-bold truncate">
                Blok {profile.blok} No. {profile.nomor_rumah}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SUMMARY: 3 gradient cards */}
      <div className="grid grid-cols-3 gap-2">
        {/* Total Tagihan */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-500 via-slate-600 to-slate-700 text-white p-3 text-center shadow-lg shadow-slate-500/20">
          <div className="absolute top-0 right-0 w-12 h-12 bg-white/10 rounded-full -mr-6 -mt-6" />
          <div className="relative">
            <Receipt className="w-4 h-4 mx-auto mb-1 text-white/80" />
            <p className="text-[9px] uppercase tracking-wider text-white/80 font-semibold">Total</p>
            <p className="text-xs font-bold mt-0.5">{formatRupiah(totalTagihan)}</p>
          </div>
        </div>
        {/* Dibayar */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 text-white p-3 text-center shadow-lg shadow-emerald-500/20">
          <div className="absolute top-0 right-0 w-12 h-12 bg-white/10 rounded-full -mr-6 -mt-6" />
          <div className="relative">
            <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-white/80" />
            <p className="text-[9px] uppercase tracking-wider text-white/80 font-semibold">Dibayar</p>
            <p className="text-xs font-bold mt-0.5">{formatRupiah(totalTerbayar)}</p>
          </div>
        </div>
        {/* Sisa */}
        <div className={`relative overflow-hidden rounded-2xl p-3 text-center shadow-lg ${
          totalSisa > 0
            ? 'bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 text-white shadow-amber-500/20'
            : 'bg-gradient-to-br from-slate-400 via-slate-500 to-slate-600 text-white shadow-slate-500/20'
        }`}>
          <div className="absolute top-0 right-0 w-12 h-12 bg-white/10 rounded-full -mr-6 -mt-6" />
          <div className="relative">
            <AlertCircle className="w-4 h-4 mx-auto mb-1 text-white/80" />
            <p className="text-[9px] uppercase tracking-wider text-white/80 font-semibold">Sisa</p>
            <p className="text-xs font-bold mt-0.5">{formatRupiah(totalSisa)}</p>
          </div>
        </div>
      </div>

      {/* Status count chips */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="w-3 h-3" /> {countLunas} Lunas
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
          <Clock className="w-3 h-3" />
          {countCicil === 0 ? 'Cicil' : `Cicil · ${formatRupiah(cicilAmount)}`}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
          <AlertCircle className="w-3 h-3" /> {countBelum} Belum
        </span>
      </div>

      {/* Info cara bayar */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-100 p-3.5">
        <div className="absolute top-0 right-0 w-20 h-20 bg-blue-200/30 rounded-full -mr-10 -mt-10" />
        <div className="relative">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> 💡 Cara Bayar
          </p>
          <ul className="text-[11px] text-blue-900 space-y-0.5 leading-snug">
            <li>• <b>Titip</b> ke bendahara / ketua RT</li>
            <li>• <b>Transfer</b> bank + kirim bukti via WhatsApp</li>
            <li>• <b>Jimpitan</b> — otomatis terhitung saat ronda jimpitan</li>
          </ul>
        </div>
      </div>

      {/* LIST TAGIHAN */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider px-1">
          Riwayat Tagihan ({tagihanArr.length})
        </h2>

        {tagihanArr.length === 0 ? (
          <div className="text-center py-10 px-4 bg-slate-50/50 rounded-2xl border">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Belum ada tagihan iuran</p>
          </div>
        ) : (
          tagihanArr.map(t => {
            const status = STATUS_META[t.status as keyof typeof STATUS_META] ?? STATUS_META.BELUM
            const sisa = t.nominal - t.total_terbayar
            // Cari pembayaran by bulan (YYYY-MM)
            const periodeKey = (t.periode_bulan ?? '').slice(0, 7)
            const pembayarans = pembayaranByBulan[periodeKey] ?? []
            return (
              <Link
                key={t.id}
                href={`/warga/iuran/${t.id}`}
                className="block rounded-2xl border bg-card shadow-sm overflow-hidden hover:shadow-md hover:border-emerald-200 transition-all group"
              >
                {/* Header card */}
                <div className="p-4 border-b bg-muted/20">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold leading-tight">
                        {getMonthName(t.periode_bulan)}
                      </h3>
                      {t.due_date && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Jatuh tempo: {formatTanggal(t.due_date)}
                        </p>
                      )}
                    </div>
                    <Badge className={`${status.color} hover:${status.color} text-[10px] gap-1 shrink-0`}>
                      {status.icon}
                      {status.label}
                    </Badge>
                  </div>

                  {/* 3 angka kecil */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="bg-background rounded-lg p-2 text-center">
                      <p className="text-[9px] text-muted-foreground">Tagihan</p>
                      <p className="text-[11px] font-bold">{formatRupiah(t.nominal)}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-2 text-center">
                      <p className="text-[9px] text-emerald-700">Dibayar</p>
                      <p className="text-[11px] font-bold text-emerald-700">{formatRupiah(t.total_terbayar)}</p>
                    </div>
                    <div className={`rounded-lg p-2 text-center ${
                      sisa > 0 ? 'bg-amber-50' : 'bg-slate-50'
                    }`}>
                      <p className={`text-[9px] ${sisa > 0 ? 'text-amber-700' : 'text-muted-foreground'}`}>Sisa</p>
                      <p className={`text-[11px] font-bold ${sisa > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
                        {formatRupiah(sisa)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Preview history + chevron */}
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    {pembayarans.length === 0
                      ? 'Belum ada pembayaran'
                      : `${pembayarans.length} kali pembayaran`}
                  </p>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 group-hover:translate-x-0.5 transition-transform">
                    Detail <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
