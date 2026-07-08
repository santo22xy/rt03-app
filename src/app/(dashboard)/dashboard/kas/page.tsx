
import { createAdminClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import {
  Wallet, Activity,
  ArrowUpCircle, ArrowDownCircle, AlertCircle, Receipt,
} from 'lucide-react'
import { formatRupiah, formatTanggal } from '@/lib/format'
import nextDynamic from 'next/dynamic'
import { FilterKas } from './filter-kas'
import { MonthPickerKas } from './month-picker-kas'
import { KasDateGroup, type KasTransaksiItem } from './kas-date-group'
import { ExportLaporanButton } from '../export-laporan-button'
import { ExportLaporanPDFButton } from '../export-laporan-pdf-button'

// Lazy-load form transaksi (paling berat, banyak state & dialog) — tidak di-bundle di initial JS
const TambahTransaksiKas = nextDynamic(
  () =&gt; import('../tambah-transaksi-kas').then(m =&gt; ({ default: m.TambahTransaksiKas })),
  { ssr: false, loading: () =&gt; &lt;div className="h-10 w-40 bg-muted animate-pulse rounded-md" /&gt; }
)

export const dynamic = 'force-dynamic'

type KasTransaksi = {
  id: string
  tanggal: string
  tipe: 'MASUK' | 'KELUAR'
  kategori: string
  uraian: string
  nominal: number | string
  login_id: string | null
  metode_bayar: string | null
  sumber_dana: string | null
  ditalangi_oleh: string | null
  status_talangan: string | null
  catatan: string | null
  created_by: string | null
  created_at: string
  nota_url: string | null
}

export default async function KasPage({
  searchParams,
}: {
  searchParams: Promise&lt;{ filter?: string; month?: string }&gt;
}) {
  const params = await searchParams
  const filter = (params.filter ?? 'semua').toLowerCase()

  // FIX: pakai admin client untuk bypass RLS recursion di profiles policy.
  // (lihat SQL 40-fix-profiles-rls-no-recursion.sql untuk root cause)
  const supabase = createAdminClient()

  // Ambil semua transaksi (tanpa limit untuk month options)
  const { data: allTrxRaw } = await supabase
    .from('kas_transaksi')
    .select('id, tanggal, tipe, kategori, uraian, nominal, login_id, metode_bayar, sumber_dana, ditalangi_oleh, status_talangan, catatan, created_by, created_at, nota_url')
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false })

  // Generate list of available months (YYYY-MM)
  const availableMonthsSet = new Set&lt;string&gt;()
  const allTrx = (allTrxRaw ?? []) as KasTransaksi[]
  allTrx.forEach(t =&gt; {
    const monthKey = t.tanggal.slice(0, 7)
    availableMonthsSet.add(monthKey)
  })
  const availableMonths = Array.from(availableMonthsSet).sort() // ascending
  if (availableMonths.length === 0) {
    const now = new Date()
    availableMonths.push(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  }
  // Determine current month from params or default to latest available
  let currentMonth = params.month
  if (!currentMonth || !availableMonthsSet.has(currentMonth)) {
    currentMonth = availableMonths[availableMonths.length - 1]
  }

  // Filter transactions by month and type
  let trxList = allTrx.filter(t =&gt; t.tanggal.startsWith(currentMonth))
  if (filter === 'masuk') trxList = trxList.filter(t =&gt; t.tipe === 'MASUK')
  if (filter === 'keluar') trxList = trxList.filter(t =&gt; t.tipe === 'KELUAR')

  // Saldo dihitung independent dari filter (full ledger)
  const { data: allTrxForSaldo } = await supabase
    .from('kas_transaksi')
    .select('tipe, nominal')

  const totalMasuk = (allTrxForSaldo ?? [])
    .filter((t) =&gt; t.tipe === 'MASUK')
    .reduce((s, t) =&gt; s + Number(t.nominal), 0)
  const totalKeluar = (allTrxForSaldo ?? [])
    .filter((t) =&gt; t.tipe === 'KELUAR')
    .reduce((s, t) =&gt; s + Number(t.nominal), 0)
  const saldo = totalMasuk - totalKeluar

  // Sesi jimpitan yang perlu ACC
  const { data: sesiPending } = await supabase
    .from('jimpitan_sesi')
    .select('id, tanggal, status, total_nominal, total_pendapatan')
    .eq('status', 'SUBMITTED')
    .order('tanggal', { ascending: false })
    .limit(5)

  // Ambil master kategori untuk label dinamis (termasuk yg non-aktif
  // supaya transaksi lama dengan kategori legacy tetap punya label rapi)
  const { data: kategoriData } = await supabase
    .from('kas_kategori')
    .select('kode, label, is_active')
  const kategoriMap: Record&lt;string, { label: string; is_active: boolean }&gt; = {}
  for (const k of kategoriData ?? []) {
    kategoriMap[k.kode] = { label: k.label, is_active: k.is_active }
  }

  // Group by date
  const grouped = trxList.reduce&lt;Record&lt;string, KasTransaksi[]&gt;&gt;((acc, t) =&gt; {
    const key = t.tanggal
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  return (
    &lt;div className="space-y-5 pb-24 md:pb-8"&gt;
      {/* Header */}
      &lt;div className="flex items-start justify-between gap-3"&gt;
        &lt;div&gt;
          &lt;div className="flex items-center gap-2 mb-1"&gt;
            &lt;Receipt className="w-4 h-4 text-emerald-500" /&gt;
            &lt;span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600"&gt;
              Kas &amp; Transaksi
            &lt;/span&gt;
          &lt;/div&gt;
          &lt;h1 className="text-2xl md:text-3xl font-bold"&gt;Kas RT 03&lt;/h1&gt;
          &lt;p className="text-sm text-muted-foreground mt-1"&gt;
            Buku besar kas &amp; input transaksi manual
          &lt;/p&gt;
        &lt;/div&gt;
        &lt;div className="flex gap-2 shrink-0"&gt;
          &lt;ExportLaporanButton /&gt;
          &lt;ExportLaporanPDFButton /&gt;
          &lt;TambahTransaksiKas /&gt;
        &lt;/div&gt;
      &lt;/div&gt;

      {/* Hero Saldo */}
      &lt;div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white shadow-xl shadow-emerald-500/20"&gt;
        &lt;div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -mr-24 -mt-24" /&gt;
        &lt;div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mb-16" /&gt;
        &lt;div className="relative p-5 md:p-6"&gt;
          &lt;div className="flex items-center gap-2 mb-2"&gt;
            &lt;Wallet className="w-4 h-4 opacity-80" /&gt;
            &lt;span className="text-[10px] font-bold uppercase tracking-widest opacity-80"&gt;
              Saldo Kas Saat Ini
            &lt;/span&gt;
          &lt;/div&gt;
          &lt;p className="text-3xl md:text-4xl font-bold leading-tight tracking-tight"&gt;
            {formatRupiah(saldo)}
          &lt;/p&gt;
          &lt;p className="text-[11px] opacity-80 mt-1"&gt;
            Per {formatTanggal(new Date())}
          &lt;/p&gt;
          &lt;div className="grid grid-cols-2 gap-3 mt-5"&gt;
            &lt;div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 ring-1 ring-white/20"&gt;
              &lt;div className="flex items-center gap-1.5 mb-1"&gt;
                &lt;ArrowUpCircle className="w-3.5 h-3.5" /&gt;
                &lt;p className="text-[10px] font-semibold uppercase tracking-wider opacity-90"&gt;Pemasukan&lt;/p&gt;
              &lt;/div&gt;
              &lt;p className="text-base md:text-lg font-bold truncate"&gt;{formatRupiah(totalMasuk)}&lt;/p&gt;
            &lt;/div&gt;
            &lt;div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 ring-1 ring-white/20"&gt;
              &lt;div className="flex items-center gap-1.5 mb-1"&gt;
                &lt;ArrowDownCircle className="w-3.5 h-3.5" /&gt;
                &lt;p className="text-[10px] font-semibold uppercase tracking-wider opacity-90"&gt;Pengeluaran&lt;/p&gt;
              &lt;/div&gt;
              &lt;p className="text-base md:text-lg font-bold truncate"&gt;{formatRupiah(totalKeluar)}&lt;/p&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;
      &lt;/div&gt;

      {/* Pending ACC Alert */}
      {sesiPending &amp;&amp; sesiPending.length &gt; 0 &amp;&amp; (
        &lt;Card className="border-0 shadow-md ring-1 ring-amber-200 bg-amber-50/60"&gt;
          &lt;CardContent className="p-4 flex items-center gap-3"&gt;
            &lt;div className="w-10 h-10 rounded-xl bg-amber-200 flex items-center justify-center shrink-0"&gt;
              &lt;AlertCircle className="w-5 h-5 text-amber-700" /&gt;
            &lt;/div&gt;
            &lt;div className="flex-1 min-w-0"&gt;
              &lt;p className="text-sm font-semibold text-amber-900"&gt;
                {sesiPending.length} sesi jimpitan perlu ACC
              &lt;/p&gt;
              &lt;p className="text-[11px] text-amber-700 mt-0.5"&gt;
                ACC agar pendapatan masuk ke kas
              &lt;/p&gt;
            &lt;/div&gt;
            &lt;a
              href="/dashboard/jimpitan"
              className="text-[10px] font-bold uppercase text-amber-700 hover:text-amber-900 shrink-0"
            &gt;
              Lihat →
            &lt;/a&gt;
          &lt;/CardContent&gt;
        &lt;/Card&gt;
      )}

      {/* Filter + List Header */}
      &lt;div className="flex flex-wrap items-center justify-between gap-3"&gt;
        &lt;div&gt;
          &lt;h2 className="text-base font-bold"&gt;Buku Transaksi&lt;/h2&gt;
          &lt;p className="text-[11px] text-muted-foreground mt-0.5"&gt;
            {trxList.length} transaksi
            {filter === 'masuk' &amp;&amp; ' (Pemasukan)'}
            {filter === 'keluar' &amp;&amp; ' (Pengeluaran)'}
          &lt;/p&gt;
        &lt;/div&gt;
        &lt;div className="flex flex-wrap gap-2"&gt;
          &lt;MonthPickerKas availableMonths={availableMonths} currentMonth={currentMonth} /&gt;
          &lt;FilterKas current={filter} /&gt;
        &lt;/div&gt;
      &lt;/div&gt;

      {/* Transaction List */}
      {trxList.length === 0 ? (
        &lt;Card className="border-0 shadow-sm ring-1 ring-slate-200/60"&gt;
          &lt;CardContent className="p-10 text-center"&gt;
            &lt;div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3"&gt;
              &lt;Activity className="w-7 h-7 text-slate-400" /&gt;
            &lt;/div&gt;
            &lt;p className="text-sm font-semibold text-slate-700"&gt;Belum ada transaksi&lt;/p&gt;
            &lt;p className="text-[11px] text-muted-foreground mt-1"&gt;
              Klik &amp;ldquo;Input Transaksi&amp;rdquo; untuk catat pemasukan/pengeluaran pertama
            &lt;/p&gt;
          &lt;/CardContent&gt;
        &lt;/Card&gt;
      ) : (
        &lt;div className="space-y-3"&gt;
          &lt;p className="text-[10px] text-muted-foreground text-center -mt-1"&gt;
            💡 Klik tanggal untuk expand/collapse · Grid Debit/Kredit/Saldo per hari
          &lt;/p&gt;
          &lt;div className="space-y-4"&gt;
            {(() =&gt; {
              // Sort tanggal ASC (terlama → terbaru) untuk hitung saldo awal per hari
              const sortedDates = Object.keys(grouped).sort()
              let runningSaldo = 0
              return sortedDates.map((tanggal) =&gt; {
                const items = grouped[tanggal]
                const dayMasuk = items
                  .filter((t) =&gt; t.tipe === 'MASUK')
                  .reduce((s, t) =&gt; s + Number(t.nominal), 0)
                const dayKeluar = items
                  .filter((t) =&gt; t.tipe === 'KELUAR')
                  .reduce((s, t) =&gt; s + Number(t.nominal), 0)
                const saldoAwal = runningSaldo
                const saldoAkhir = saldoAwal + dayMasuk - dayKeluar
                runningSaldo = saldoAkhir // carry ke tanggal berikutnya

                return (
                  &lt;KasDateGroup
                    key={tanggal}
                    tanggal={tanggal}
                    items={items as KasTransaksiItem[]}
                    saldoAwal={saldoAwal}
                    kategoriMap={kategoriMap}
                    defaultOpen={sortedDates.length &lt;= 3}
                  /&gt;
                )
              })
            })()}
          &lt;/div&gt;
        &lt;/div&gt;
      )}
    &lt;/div&gt;
  )
}
