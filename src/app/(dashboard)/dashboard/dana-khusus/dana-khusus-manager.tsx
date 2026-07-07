'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  HeartHandshake, Plus, Loader2, Calendar, Target,
  Users, AlertCircle, Sparkles,
  Power, PowerOff,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  createDanaKhusus, toggleDanaKhususActive, getDanaKhususList,
} from './dana-khusus-actions'

type DanaKhusus = {
  id: string
  judul: string
  deskripsi: string | null
  kategori: string
  target_per_kk: number
  tanggal_mulai: string
  tanggal_selesai: string
  is_active: boolean
  is_wajib: boolean
  created_at: string
  total_tagihan: number
  total_terbayar: number
  jumlah_lunas: number
  jumlah_cicil: number
  jumlah_belum: number
  pct_progres: number
}

const KATEGORI_LABEL: Record<string, string> = {
  MERTI_DESA: 'Merti Desa',
  '17_AGUSTUS': '17 Agustus',
  NATAL: 'Natal',
  LEBARAN: 'Lebaran',
  SOSIAL: 'Sosial',
  LAINNYA: 'Lainnya',
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function futureDateISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function DanaKhususManager() {
  const [list, setList] = useState<DanaKhusus[]>([])
  const [loading, setLoading] = useState(true)
  const [openCreate, setOpenCreate] = useState(false)
  const [isCreating, startCreating] = useTransition()
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')

  // Form state
  const [judul, setJudul] = useState('')
  const [deskripsi, setDeskripsi] = useState('')
  const [kategori, setKategori] = useState('LAINNYA')
  const [targetPerKk, setTargetPerKk] = useState('50000')
  const [tanggalMulai, setTanggalMulai] = useState(todayISO())
  const [tanggalSelesai, setTanggalSelesai] = useState(futureDateISO(60))
  const [isWajib, setIsWajib] = useState(false)

  async function loadData() {
    setLoading(true)
    const res = await getDanaKhususList()
    if (res.error) {
      toast.error(res.error)
    } else {
      setList(res.data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  function handleCreate() {
    const fd = new FormData()
    fd.append('judul', judul)
    fd.append('deskripsi', deskripsi)
    fd.append('kategori', kategori)
    fd.append('target_per_kk', targetPerKk)
    fd.append('tanggal_mulai', tanggalMulai)
    fd.append('tanggal_selesai', tanggalSelesai)
    fd.append('is_wajib', String(isWajib))

    startCreating(async () => {
      const res = await createDanaKhusus(fd)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success('Dana khusus berhasil dibuat! Tagihan per KK ter-generate otomatis.')
      setOpenCreate(false)
      setJudul(''); setDeskripsi(''); setKategori('LAINNYA')
      setTargetPerKk('50000'); setTanggalMulai(todayISO())
      setTanggalSelesai(futureDateISO(60)); setIsWajib(false)
      loadData()
    })
  }

  async function handleToggle(d: DanaKhusus) {
    const fd = new FormData()
    fd.append('id', d.id)
    fd.append('is_active', String(d.is_active))
    const res = await toggleDanaKhususActive(fd)
    if (res?.error) toast.error(res.error)
    else {
      toast.success(`Dana khusus ${!d.is_active ? 'diaktifkan' : 'dinonaktifkan'}`)
      loadData()
    }
  }

  const filtered = list.filter(d => {
    if (filter === 'ACTIVE') return d.is_active
    if (filter === 'INACTIVE') return !d.is_active
    return true
  })

  return (
    <div className="space-y-4">
      {/* Filter + Create */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === 'ALL' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            Semua ({list.length})
          </button>
          <button
            onClick={() => setFilter('ACTIVE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === 'ACTIVE' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700 border border-emerald-200'
            }`}
          >
            Aktif ({list.filter(d => d.is_active).length})
          </button>
          <button
            onClick={() => setFilter('INACTIVE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === 'INACTIVE' ? 'bg-slate-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            Non-aktif ({list.filter(d => !d.is_active).length})
          </button>
        </div>

        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white text-sm font-semibold h-10 px-4 shadow-md transition-colors gap-2">
            <Plus className="w-4 h-4" />
            Buat Dana Khusus
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-pink-700" />
                </div>
                <div>
                  <DialogTitle>Buat Pengumpulan Dana</DialogTitle>
                  <DialogDescription>
                    Untuk acara Merti Desa, 17 Agustus, Natal, atau lainnya
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <Label htmlFor="judul" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                  Judul *
                </Label>
                <Input
                  id="judul"
                  placeholder="Misal: Merti Desa 2026"
                  value={judul}
                  onChange={(e) => setJudul(e.target.value)}
                  disabled={isCreating}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="kategori" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                    Kategori
                  </Label>
                  <select
                    id="kategori"
                    value={kategori}
                    onChange={(e) => setKategori(e.target.value)}
                    disabled={isCreating}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="MERTI_DESA">Merti Desa</option>
                    <option value="17_AGUSTUS">17 Agustus</option>
                    <option value="NATAL">Natal</option>
                    <option value="LEBARAN">Lebaran</option>
                    <option value="SOSIAL">Sosial</option>
                    <option value="LAINNYA">Lainnya</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="target" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                    Target / KK *
                  </Label>
                  <Input
                    id="target"
                    type="number"
                    min={0}
                    value={targetPerKk}
                    onChange={(e) => setTargetPerKk(e.target.value)}
                    disabled={isCreating}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="mulai" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                    Tanggal Mulai *
                  </Label>
                  <Input
                    id="mulai"
                    type="date"
                    value={tanggalMulai}
                    onChange={(e) => setTanggalMulai(e.target.value)}
                    disabled={isCreating}
                  />
                </div>
                <div>
                  <Label htmlFor="selesai" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                    Tanggal Selesai *
                  </Label>
                  <Input
                    id="selesai"
                    type="date"
                    value={tanggalSelesai}
                    onChange={(e) => setTanggalSelesai(e.target.value)}
                    disabled={isCreating}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="deskripsi" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                  Deskripsi (opsional)
                </Label>
                <textarea
                  id="deskripsi"
                  rows={2}
                  placeholder="Penjelasan singkat..."
                  value={deskripsi}
                  onChange={(e) => setDeskripsi(e.target.value)}
                  disabled={isCreating}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={isWajib}
                  onChange={(e) => setIsWajib(e.target.checked)}
                  disabled={isCreating}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">
                  <span className="font-semibold">Sukarela</span>{' '}
                  <span className="text-muted-foreground">(centang jika iuran sukarela, biasanya Merti Desa)</span>
                </span>
              </label>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
                <p className="font-semibold flex items-center gap-1 mb-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Tabel akan auto-generate:
                </p>
                <p>Tagihan per KK akan dibuat otomatis oleh trigger database untuk semua warga aktif.</p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setOpenCreate(false)} disabled={isCreating}>
                Batal
              </Button>
              <Button
                type="button"
                onClick={handleCreate}
                disabled={isCreating || !judul || !targetPerKk}
                className="bg-pink-600 hover:bg-pink-700 text-white"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Membuat...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Buat Dana Khusus
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* List */}
      {loading ? (
        <div className="p-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-pink-600" />
          <p className="text-sm text-muted-foreground">Memuat data...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-2 bg-slate-50/50">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mx-auto mb-4">
              <HeartHandshake className="w-8 h-8 text-pink-600" />
            </div>
            <h3 className="font-bold text-lg mb-1">Belum ada dana khusus</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Buat pengumpulan dana sementara untuk acara RT (Merti Desa, 17 Agustus, dll)
              atau iuran sosial. Warga bisa bayar dengan cicilan.
            </p>
            <Button onClick={() => setOpenCreate(true)} className="bg-pink-600 hover:bg-pink-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Buat Dana Khusus Pertama
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(d => (
            <DanaKhususCard key={d.id} d={d} onToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  )
}

function DanaKhususCard({ d, onToggle }: { d: DanaKhusus; onToggle: (d: DanaKhusus) => void }) {
  const pct = d.pct_progres
  const pctColor = pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
  const katLabel = KATEGORI_LABEL[d.kategori] ?? d.kategori
  const isFinished = new Date(d.tanggal_selesai) < new Date()

  return (
    <Card className="border-0 shadow-md hover:shadow-xl transition-shadow overflow-hidden group">
      <div className={`h-2 ${pctColor}`} />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base leading-tight line-clamp-2">{d.judul}</CardTitle>
            <div className="flex items-center gap-1 mt-1.5">
              <Badge variant="secondary" className="text-[10px]">{katLabel}</Badge>
              {!d.is_wajib && <Badge className="bg-purple-100 text-purple-700 text-[10px]">Sukarela</Badge>}
              {d.is_wajib && <Badge className="bg-blue-100 text-blue-700 text-[10px]">Wajib</Badge>}
              {!d.is_active && <Badge variant="destructive" className="text-[10px]">Off</Badge>}
              {isFinished && d.is_active && <Badge className="bg-slate-200 text-slate-700 text-[10px]">Selesai</Badge>}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onToggle(d)}
            title={d.is_active ? 'Nonaktifkan' : 'Aktifkan'}
          >
            {d.is_active ? <PowerOff className="w-4 h-4 text-rose-600" /> : <Power className="w-4 h-4 text-emerald-600" />}
          </Button>
        </div>
        {d.deskripsi && (
          <CardDescription className="line-clamp-2 text-[11px]">{d.deskripsi}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Progress Bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold">{pct}% terkumpul</span>
            <span className="text-muted-foreground">
              Rp {d.total_terbayar.toLocaleString('id-ID')} / {d.total_tagihan.toLocaleString('id-ID')}
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full ${pctColor} transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-1 text-center">
          <div className="p-1.5 rounded-lg bg-emerald-50">
            <p className="text-base font-bold text-emerald-700">{d.jumlah_lunas}</p>
            <p className="text-[9px] text-emerald-600 font-semibold">Lunas</p>
          </div>
          <div className="p-1.5 rounded-lg bg-amber-50">
            <p className="text-base font-bold text-amber-700">{d.jumlah_cicil}</p>
            <p className="text-[9px] text-amber-600 font-semibold">Cicil</p>
          </div>
          <div className="p-1.5 rounded-lg bg-rose-50">
            <p className="text-base font-bold text-rose-700">{d.jumlah_belum}</p>
            <p className="text-[9px] text-rose-600 font-semibold">Belum</p>
          </div>
        </div>

        {/* Meta */}
        <div className="text-[10px] text-muted-foreground space-y-0.5">
          <p className="flex items-center gap-1">
            <Target className="w-3 h-3" />
            Target: <span className="font-semibold">Rp {d.target_per_kk.toLocaleString('id-ID')}</span> / KK
          </p>
          <p className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(d.tanggal_mulai).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
            {' - '}
            {new Date(d.tanggal_selesai).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>

        <Link href={`/dashboard/dana-khusus/${d.id}`}>
          <Button variant="outline" size="sm" className="w-full">
            <Users className="w-3.5 h-3.5 mr-1" />
            Lihat Detail & Pembayaran
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
