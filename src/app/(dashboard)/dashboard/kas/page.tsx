import { createAdminClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import {
  Wallet, Activity,
  ArrowUpCircle, ArrowDownCircle, AlertCircle, Receipt,
} from 'lucide-react'
import { formatRupiah, formatTanggal } from '@/lib/format'
import nextDynamic from 'next/dynamic'
import { FilterKas } from './filter-kas'
import { KasDateGroup, type KasTransaksiItem } from './kas-date-group'
import { ExportLaporanButton } from '../export-laporan-button'
import { ExportLaporanPDFButton } from '../export-laporan-pdf-button'

// Lazy-load form transaksi (paling berat, banyak state & dialog) — tidak di-bundle di initial JS
const TambahTransaksiKas = nextDynamic(
  () => import('../tambah-transaksi-kas').then(m => ({ default: m.TambahTransaksiKas })),
  { ssr: false, loading: () => <div className="h-10 w-40 bg-muted animate-pulse rounded-md" /> }
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
}

export default async function KasPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const params = await searchParams
  const filter = (params.filter ?? 'semua').toLowerCase()

  // FIX: pakai admin client untuk bypass RLS recursion di profiles policy.
  // (lihat SQL 40-fix-profiles-rls-no-recursion.sql untuk root cause)
  const supabase = createAdminClient()

  // Ambil semua transaksi (max 100 terakhir) - filter di server untuk hemat data
  let query = supabase
    .from('kas_transaksi')
    .select('id, tanggal, tipe, kategori, uraian, nominal, login_id, metode_bayar, sumber_dana, ditalangi_oleh, status_talangan, catatan, created_by, created_at')
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (filter === 'masuk') query = query.eq('tipe', 'MASUK')
  if (filter === 'keluar') query = query.eq('tipe', 'KELUAR')

  const { data: trx } = await query

  // Saldo dihitung independent dari filter (full ledger)
  const { data: allTrx } = await supabase
    .from('kas_transaksi')
    .select('tipe, nominal')

  const totalMasuk = (allTrx ?? [])
    .filter((t) => t.tipe === 'MASUK')
    .reduce((s, t) => s + Number(t.nominal), 0)
  const totalKeluar = (allTrx ?? [])
    .filter((t) => t.tipe === 'KELUAR')
    .reduce((s, t) => s + Number(t.nominal), 0)
  const saldo = totalMasuk - totalKeluar

  // Sesi jimpitan yang perlu ACC
  const { data: sesiPending } = await supabase
    .from('jimpitan_sesi')
    .select('id, tanggal, status, total_nominal, total_pendapatan')
    .eq('status', 'SUBMITTED')
    .order('tanggal', { ascending: false })
    .limit(5)

  const trxList = (trx ?? []) as KasTransaksi[]

  // Ambil master kategori untuk label dinamis (termasuk yg non-aktif
  // supaya transaksi lama dengan kategori legacy tetap punya label rapi)
  const { data: kategoriData } = await supabase
    .from('kas_kategori')
    .select('kode, label, is_active')
  const kategoriMap: Record<string, { label: string; is_active: boolean }> = {}
  for (const k of kategoriData ?? []) {
    kategoriMap[k.kode] = { label: k.label, is_active: k.is_active }
  }

  // Group by date
  const grouped = trxList.reduce<Record<string, KasTransaksi[]>>((acc, t) => {
    const key = t.tanggal
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  return (
    <div className="space-y-5 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="w-4 h-4 text-emerald-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
              Kas & Transaksi
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">Kas RT 03</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Buku besar kas & input transaksi manual
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <ExportLaporanButton />
          <ExportLaporanPDFButton />
          <TambahTransaksiKas />
        </div>
      </div>

      {/* Hero Saldo */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white shadow-xl shadow-emerald-500/20">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -mr-24 -mt-24" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mb-16" />
        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 opacity-80" />
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
              Saldo Kas Saat Ini
            </span>
          </div>
          <p className="text-3xl md:text-4xl font-bold leading-tight tracking-tight">
            {formatRupiah(saldo)}
          </p>
          <p className="text-[11px] opacity-80 mt-1">
            Per {formatTanggal(new Date())}
          </p>
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 ring-1 ring-white/20">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowUpCircle className="w-3.5 h-3.5" />
                <p className="text-[10px] font-semibold uppercase tracking-wider opacity-90">Pemasukan</p>
              </div>
              <p className="text-base md:text-lg font-bold truncate">{formatRupiah(totalMasuk)}</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 ring-1 ring-white/20">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowDownCircle className="w-3.5 h-3.5" />
                <p className="text-[10px] font-semibold uppercase tracking-wider opacity-90">Pengeluaran</p>
              </div>
              <p className="text-base md:text-lg font-bold truncate">{formatRupiah(totalKeluar)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pending ACC Alert */}
      {sesiPending && sesiPending.length > 0 && (
        <Card className="border-0 shadow-md ring-1 ring-amber-200 bg-amber-50/60">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-200 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                {sesiPending.length} sesi jimpitan perlu ACC
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                ACC agar pendapatan masuk ke kas
              </p>
            </div>
            <a
              href="/dashboard/jimpitan"
              className="text-[10px] font-bold uppercase text-amber-700 hover:text-amber-900 shrink-0"
            >
              Lihat →
            </a>
          </CardContent>
        </Card>
      )}

      {/* Filter + List Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Buku Transaksi</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {trxList.length} transaksi
            {filter === 'masuk' && ' (Pemasukan)'}
            {filter === 'keluar' && ' (Pengeluaran)'}
          </p>
        </div>
        <FilterKas current={filter} />
      </div>

      {/* Transaction List */}
      {trxList.length === 0 ? (
        <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
          <CardContent className="p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <Activity className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700">Belum ada transaksi</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Klik &ldquo;Input Transaksi&rdquo; untuk catat pemasukan/pengeluaran pertama
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-[10px] text-muted-foreground text-center -mt-1">
            💡 Klik tanggal untuk expand/collapse · Grid Debit/Kredit/Saldo per hari
          </p>
          <div className="space-y-4">
            {(() => {
              // Sort tanggal ASC (terlama → terbaru) untuk hitung saldo awal per hari
              const sortedDates = Object.keys(grouped).sort()
              let runningSaldo = 0
              return sortedDates.map((tanggal) => {
                const items = grouped[tanggal]
                const dayMasuk = items
                  .filter((t) => t.tipe === 'MASUK')
                  .reduce((s, t) => s + Number(t.nominal), 0)
                const dayKeluar = items
                  .filter((t) => t.tipe === 'KELUAR')
                  .reduce((s, t) => s + Number(t.nominal), 0)
                const saldoAwal = runningSaldo
                const saldoAkhir = saldoAwal + dayMasuk - dayKeluar
                runningSaldo = saldoAkhir // carry ke tanggal berikutnya

                return (
                  <KasDateGroup
                    key={tanggal}
                    tanggal={tanggal}
                    items={items as KasTransaksiItem[]}
                    saldoAwal={saldoAwal}
                    kategoriMap={kategoriMap}
                    defaultOpen={sortedDates.length <= 3}
                  />
                )
              })
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
