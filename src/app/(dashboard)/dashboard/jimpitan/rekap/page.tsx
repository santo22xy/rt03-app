'use client'

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { formatRupiah, getMonthName } from '@/lib/format'
import {
  Users, Wallet, AlertCircle, CheckCircle2, TrendingUp,
  ArrowLeft, Gift, ChevronRight, Search, FileSpreadsheet, FileText,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { getJimpitanRecap, allocateExcess, type RekapRow } from '../../jimpitan-actions'
import { ExportRekapJimpitanPDF } from './export-rekap-pdf'

const BULAN_LIST = [
  { value: '01', label: 'Januari' }, { value: '02', label: 'Februari' },
  { value: '03', label: 'Maret' }, { value: '04', label: 'April' },
  { value: '05', label: 'Mei' }, { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' }, { value: '08', label: 'Agustus' },
  { value: '09', label: 'September' }, { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' }, { value: '12', label: 'Desember' },
]

export default function RekapJimpitanPage() {
  const today = new Date()
  const [bulan, setBulan] = useState(String(today.getMonth() + 1).padStart(2, '0'))
  const [tahun, setTahun] = useState(String(today.getFullYear()))
  const [filterBlok, setFilterBlok] = useState('SEMUA')
  const [filterStatus, setFilterStatus] = useState('SEMUA')
  const [searchNama, setSearchNama] = useState('')
  const [quickFilter, setQuickFilter] = useState<'all' | 'paid' | 'shortage' | 'excess'>('all')
  const [data, setData] = useState<RekapRow[]>([])
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Dialog kelebihan
  const [excessDialog, setExcessDialog] = useState<RekapRow | null>(null)
  const [excessType, setExcessType] = useState<'carry_forward' | 'donation'>('carry_forward')
  const [excessNotes, setExcessNotes] = useState('')
  const [excessDestMonth, setExcessDestMonth] = useState('')

  const periode = `${tahun}-${bulan}-01`

  useEffect(() => {
    setQuickFilter('all')
    fetchData()
  }, [bulan, tahun])

  async function fetchData() {
    setLoading(true)
    try {
      const result = await getJimpitanRecap(periode)
      if (result.error) {
        toast.error(result.error)
        setData([])
      } else {
        setData(result.data ?? [])
      }
    } catch {
      toast.error('Gagal memuat data rekap')
      setData([])
    }
    setLoading(false)
  }

  // Filter data
  const blokList = [...new Set(data.map(r => r.blok))].sort()
  const filtered = data.filter(r => {
    if (filterBlok !== 'SEMUA' && r.blok !== filterBlok) return false
    if (filterStatus !== 'SEMUA' && r.status !== filterStatus) return false
    if (searchNama && !r.nama_kk.toLowerCase().includes(searchNama.toLowerCase())) return false
    // Quick filter dari kartu
    const paidAmount = Number(r.total_bayar || 0)
    const effectiveDue = Number(r.kewajiban_efektif || 0)
    if (quickFilter === 'paid') return paidAmount > 0
    if (quickFilter === 'shortage') return paidAmount < effectiveDue
    if (quickFilter === 'excess') return paidAmount > effectiveDue
    return true
  })

  // Summary
  const totalWarga = data.length
  const belumCount = data.filter(r => r.status === 'BELUM').length
  const cicilCount = data.filter(r => r.status === 'CICIL').length
  const lunasCount = data.filter(r => r.status === 'LUNAS').length
  const lebihCount = data.filter(r => r.status === 'LEBIH').length
  const dibawaCount = data.filter(r => r.status === 'DIBAWA').length
  const hibahCount = data.filter(r => r.status === 'HIBAH').length

  const totalTarget = data.reduce((s, r) => s + r.kewajiban_efektif, 0)
  const totalDibayar = data.reduce((s, r) => s + r.total_bayar, 0)
  const totalKekurangan = data.filter(r => r.selisih < 0).reduce((s, r) => s + Math.abs(r.selisih), 0)
  const totalKelebihan = data.filter(r => r.selisih > 0).reduce((s, r) => s + r.selisih, 0)
  const totalKreditDepan = data.filter(r => r.status === 'DIBAWA').reduce((s, r) => s + r.selisih, 0)
  const totalHibah = data.filter(r => r.status === 'HIBAH').reduce((s, r) => s + r.selisih, 0)

  function handleAllocate(row: RekapRow) {
    setExcessDialog(row)
    setExcessType('carry_forward')
    setExcessNotes('')
    // Default dest month = bulan berikutnya
    const nextDate = new Date(Number(tahun), Number(bulan), 1)
    setExcessDestMonth(`${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-01`)
  }

  function doAllocate() {
    if (!excessDialog) return
    const excess = excessDialog.selisih
    if (excess <= 0) {
      toast.error('Tidak ada kelebihan untuk dialokasikan')
      return
    }

    startTransition(async () => {
      // Kita perlu tagihan_id, ambil dari data
      const result = await allocateExcess(
        '', // tagihan_id akan diambil dari profile+periode di backend
        excessDialog.profile_id,
        periode,
        excess,
        excessType,
        excessType === 'carry_forward' ? excessDestMonth : undefined,
        excessNotes || undefined
      )
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(excessType === 'carry_forward'
          ? `Kelebihan ${formatRupiah(excess)} dibawa ke bulan depan`
          : `Kelebihan ${formatRupiah(excess)} dijadikan hibah`)
        setExcessDialog(null)
        fetchData()
      }
    })
  }

  function handleCardClick(filter: 'all' | 'paid' | 'shortage' | 'excess') {
    setQuickFilter((current) => current === filter && filter !== 'all' ? 'all' : filter)
  }

  const quickFilterLabel: Record<string, string> = {
    all: 'Semua warga',
    paid: 'Sudah bayar',
    shortage: 'Masih kurang',
    excess: 'Kelebihan bayar',
  }

  function getStatusBadge(status: string) {
    const config: Record<string, { color: string; label: string }> = {
      BELUM: { color: 'bg-red-100 text-red-700', label: 'Belum Iuran' },
      CICIL: { color: 'bg-amber-100 text-amber-700', label: 'Cicilan Kurang' },
      LUNAS: { color: 'bg-emerald-100 text-emerald-700', label: 'Lunas' },
      LEBIH: { color: 'bg-blue-100 text-blue-700', label: 'Kelebihan Bayar' },
      DIBAWA: { color: 'bg-purple-100 text-purple-700', label: 'Dibawa ke Depan' },
      HIBAH: { color: 'bg-pink-100 text-pink-700', label: 'Hibah' },
    }
    const c = config[status] ?? { color: 'bg-slate-100 text-slate-700', label: status }
    return <Badge className={`${c.color} hover:${c.color} text-[9px]`}>{c.label}</Badge>
  }

  async function getDataForPeriod(periode: string): Promise<RekapRow[]> {
    const result = await getJimpitanRecap(periode)
    return result.data ?? []
  }

  return (
    <div className="space-y-5 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/jimpitan" className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold">Rekap Jimpitan Bulanan</h1>
          <p className="text-xs text-muted-foreground">Status pembayaran jimpitan per warga per bulan</p>
        </div>
        <ExportRekapJimpitanPDF
          getDataForPeriod={getDataForPeriod}
          currentBulan={bulan}
          currentTahun={tahun}
          quickFilter={quickFilter}
          quickFilterLabel={quickFilterLabel[quickFilter]}
        />
      </div>

      {/* Filter */}
      <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <Select value={bulan} onValueChange={setBulan}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BULAN_LIST.map(b => (
                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tahun} onValueChange={setTahun}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['2025', '2026', '2027'].map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterBlok} onValueChange={setFilterBlok}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Blok" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SEMUA">Semua Blok</SelectItem>
                {blokList.map(b => <SelectItem key={b} value={b}>Blok {b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SEMUA">Semua Status</SelectItem>
                <SelectItem value="BELUM">Belum Iuran</SelectItem>
                <SelectItem value="CICIL">Cicilan Kurang</SelectItem>
                <SelectItem value="LUNAS">Lunas</SelectItem>
                <SelectItem value="LEBIH">Kelebihan Bayar</SelectItem>
                <SelectItem value="DIBAWA">Dibawa ke Depan</SelectItem>
                <SelectItem value="HIBAH">Hibah</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Cari nama warga..."
                value={searchNama}
                onChange={(e) => setSearchNama(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards - Interactive */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          { key: 'all' as const, icon: Users, iconColor: 'text-slate-500', activeColor: 'ring-2 ring-slate-400 bg-slate-50 shadow-md', title: 'Total Warga', value: String(totalWarga), sub: `${lunasCount} lunas · ${cicilCount} cicil · ${belumCount} belum` },
          { key: 'paid' as const, icon: Wallet, iconColor: 'text-emerald-500', activeColor: 'ring-2 ring-emerald-400 bg-emerald-50 shadow-md', title: 'Terkumpul', value: formatRupiah(totalDibayar), sub: `Target: ${formatRupiah(totalTarget)}` },
          { key: 'shortage' as const, icon: AlertCircle, iconColor: 'text-red-500', activeColor: 'ring-2 ring-red-400 bg-red-50 shadow-md', title: 'Kekurangan', value: formatRupiah(totalKekurangan), sub: `${belumCount + cicilCount} warga` },
          { key: 'excess' as const, icon: TrendingUp, iconColor: 'text-blue-500', activeColor: 'ring-2 ring-blue-400 bg-blue-50 shadow-md', title: 'Kelebihan', value: formatRupiah(totalKelebihan), sub: `${formatRupiah(totalKreditDepan)} kredit · ${formatRupiah(totalHibah)} hibah` },
        ]).map(({ key, icon: Icon, iconColor, activeColor, title, value, sub }) => {
          const isActive = quickFilter === key
          return (
            <button
              key={key}
              type="button"
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              aria-label={key === 'all' ? 'Tampilkan semua warga' : key === 'paid' ? 'Tampilkan warga yang sudah membayar' : key === 'shortage' ? 'Tampilkan warga yang masih memiliki kekurangan' : 'Tampilkan warga yang memiliki kelebihan pembayaran'}
              onClick={() => handleCardClick(key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(key) } }}
              className={`text-left rounded-xl border-0 shadow-sm ring-1 ring-slate-200/60 transition-all duration-150 cursor-pointer hover:shadow-md active:scale-[0.98] ${isActive ? activeColor : 'hover:ring-slate-300'}`}
            >
              <div className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${iconColor}`} />
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">{title}</p>
                </div>
                <p className={`text-xl font-bold ${key === 'paid' ? 'text-emerald-600' : key === 'shortage' ? 'text-red-600' : key === 'excess' ? 'text-blue-600' : ''}`}>{value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
                {isActive && key !== 'all' && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    <span className="text-[9px] font-semibold">Filter aktif: {quickFilterLabel[key]}</span>
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Active filter chip */}
      {quickFilter !== 'all' && (
        <div className="flex items-center gap-2">
          <Badge className="bg-slate-800 text-white hover:bg-slate-700 text-[10px] flex items-center gap-1">
            {quickFilterLabel[quickFilter]}
            <button type="button" onClick={() => setQuickFilter('all')} className="ml-1 hover:text-slate-300" aria-label="Hapus filter">
              <X className="w-3 h-3" />
            </button>
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            Menampilkan {filtered.length} dari {data.length} warga
          </span>
        </div>
      )}

      {/* Tabel Rekap */}
      {loading ? (
        <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
          <CardContent className="p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 animate-pulse">
              <Users className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm text-muted-foreground">Memuat data rekap...</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
          <CardContent className="p-10 text-center">
            <p className="text-sm font-semibold text-slate-700">Tidak ada data</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {quickFilter === 'paid'
                ? 'Belum ada warga yang melakukan pembayaran pada periode ini.'
                : quickFilter === 'shortage'
                ? 'Tidak ada warga yang memiliki kekurangan pembayaran.'
                : quickFilter === 'excess'
                ? 'Tidak ada warga yang memiliki kelebihan pembayaran.'
                : searchNama
                ? 'Tidak ditemukan warga yang sesuai dengan filter.'
                : 'Belum ada tagihan jimpitan untuk periode ini'}
            </p>
            {quickFilter !== 'all' && (
              <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => setQuickFilter('all')}>
                Tampilkan Semua Warga
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm ring-1 ring-slate-200/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left p-2.5 font-semibold text-slate-600">#</th>
                  <th className="text-left p-2.5 font-semibold text-slate-600">Nama</th>
                  <th className="text-left p-2.5 font-semibold text-slate-600">Blok/No</th>
                  <th className="text-right p-2.5 font-semibold text-slate-600">Target</th>
                  <th className="text-right p-2.5 font-semibold text-slate-600">Kredit Lalu</th>
                  <th className="text-right p-2.5 font-semibold text-slate-600">Kewajiban</th>
                  <th className="text-right p-2.5 font-semibold text-slate-600">Dibayar</th>
                  <th className="text-right p-2.5 font-semibold text-slate-600">Selisih</th>
                  <th className="text-center p-2.5 font-semibold text-slate-600">Status</th>
                  <th className="text-center p-2.5 font-semibold text-slate-600">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr key={row.profile_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="p-2.5 text-muted-foreground">{i + 1}</td>
                    <td className="p-2.5 font-medium text-slate-900">{row.nama_kk}</td>
                    <td className="p-2.5 text-muted-foreground">{row.blok}-{row.nomor_rumah}</td>
                    <td className="p-2.5 text-right">{formatRupiah(row.target_bulanan)}</td>
                    <td className="p-2.5 text-right text-purple-600">
                      {row.kredit_dari_lalu > 0 ? formatRupiah(row.kredit_dari_lalu) : '-'}
                    </td>
                    <td className="p-2.5 text-right font-medium">{formatRupiah(row.kewajiban_efektif)}</td>
                    <td className="p-2.5 text-right font-medium text-emerald-600">
                      {row.total_bayar > 0 ? formatRupiah(row.total_bayar) : '-'}
                    </td>
                    <td className={`p-2.5 text-right font-bold ${
                      row.selisih > 0 ? 'text-blue-600' : row.selisih < 0 ? 'text-red-600' : 'text-slate-400'
                    }`}>
                      {row.selisih === 0 ? 'Rp0' : (row.selisih > 0 ? '+' : '') + formatRupiah(row.selisih)}
                    </td>
                    <td className="p-2.5 text-center">{getStatusBadge(row.status)}</td>
                    <td className="p-2.5 text-center">
                      {row.selisih > 0 && row.status === 'LEBIH' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-blue-600 hover:text-blue-800"
                          onClick={() => handleAllocate(row)}
                        >
                          <Gift className="w-3 h-3 mr-1" />
                          Alokasi
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Dialog Alokasi Kelebihan */}
      <Dialog open={!!excessDialog} onOpenChange={(o) => !o && setExcessDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alokasi Kelebihan Pembayaran</DialogTitle>
            <DialogDescription>
              {excessDialog?.nama_kk} — {BULAN_LIST.find(b => b.value === bulan)?.label} {tahun}
            </DialogDescription>
          </DialogHeader>
          {excessDialog && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Kewajiban:</span> <span className="font-bold">{formatRupiah(excessDialog.kewajiban_efektif)}</span></div>
                  <div><span className="text-muted-foreground">Dibayar:</span> <span className="font-bold text-emerald-600">{formatRupiah(excessDialog.total_bayar)}</span></div>
                  <div className="col-span-2"><span className="text-muted-foreground">Kelebihan:</span> <span className="font-bold text-blue-600">{formatRupiah(excessDialog.selisih)}</span></div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">Penggunaan kelebihan</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExcessType('carry_forward')}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      excessType === 'carry_forward'
                        ? 'border-purple-400 bg-purple-50 ring-2 ring-purple-200'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-xs font-bold text-purple-700">Bawa ke Depan</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Kredit bulan berikutnya</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExcessType('donation')}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      excessType === 'donation'
                        ? 'border-pink-400 bg-pink-50 ring-2 ring-pink-200'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-xs font-bold text-pink-700">Jadikan Hibah</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Donasi untuk kas RT</p>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Catatan (opsional)</label>
                <Textarea
                  value={excessNotes}
                  onChange={(e) => setExcessNotes(e.target.value)}
                  placeholder="Catatan alokasi kelebihan..."
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcessDialog(null)} disabled={isPending}>
              Batal
            </Button>
            <Button onClick={doAllocate} disabled={isPending} className={
              excessType === 'carry_forward'
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'bg-pink-600 hover:bg-pink-700'
            }>
              {isPending ? 'Memproses...' : excessType === 'carry_forward' ? 'Bawa ke Bulan Depan' : 'Jadikan Hibah'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
