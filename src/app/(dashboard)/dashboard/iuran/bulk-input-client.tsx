'use client'

import { useEffect, useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Save, Users, AlertCircle,
  Calendar, Banknote, Coins,
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { bulkInputIuranBendahara, getWargaWithTagihan } from './bulk-actions'

type WargaTagihan = {
  profile_id: string
  login_id: string
  nama_kk: string
  blok: string
  nomor_rumah: string
  nominal_tagihan: number
  total_terbayar: number
  sisa: number
  status: 'BELUM' | 'CICIL' | 'LUNAS' | 'LEBIH'
  kategori_tarif: string
}

function currentPeriode(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const STATUS_BADGE: Record<string, string> = {
  BELUM: 'bg-rose-100 text-rose-700 border-rose-300',
  CICIL: 'bg-amber-100 text-amber-700 border-amber-300',
  LUNAS: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  LEBIH: 'bg-blue-100 text-blue-700 border-blue-300',
}

const STATUS_LABEL: Record<string, string> = {
  BELUM: 'Belum',
  CICIL: 'Cicil',
  LUNAS: 'Lunas',
  LEBIH: 'Lebih',
}

export function BulkInputIuran() {
  const router = useRouter()
  const [periode, setPeriode] = useState(currentPeriode())
  const [tanggalBayar, setTanggalBayar] = useState(todayISO())
  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER' | 'QRIS'>('TUNAI')
  const [catatan, setCatatan] = useState('')

  const [wargaList, setWargaList] = useState<WargaTagihan[]>([])
  const [loading, setLoading] = useState(true)
  const [nominalMap, setNominalMap] = useState<Record<string, string>>({})
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'BELUM' | 'CICIL' | 'LUNAS' | 'LEBIH'>('BELUM')
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()

  // Load warga + tagihan saat periode berubah
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getWargaWithTagihan(periode).then(res => {
      if (cancelled) return
      if (res.error) {
        toast.error(res.error)
        setLoading(false)
        return
      }
      setWargaList(res.data ?? [])
      // Set default nominal = sisa (untuk yang BELUM/CICIL)
      const defaults: Record<string, string> = {}
      for (const w of res.data ?? []) {
        if (w.sisa > 0) {
          defaults[w.profile_id] = String(w.sisa)
        }
      }
      setNominalMap(prev => ({ ...defaults, ...prev }))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [periode])

  const filteredList = wargaList.filter(w => {
    if (filterStatus !== 'ALL' && w.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return w.login_id.toLowerCase().includes(q) ||
        w.nama_kk.toLowerCase().includes(q) ||
        w.blok.toLowerCase().includes(q)
    }
    return true
  })

  // Summary stats
  const stats = {
    total: wargaList.length,
    belum: wargaList.filter(w => w.status === 'BELUM').length,
    cicil: wargaList.filter(w => w.status === 'CICIL').length,
    lunas: wargaList.filter(w => w.status === 'LUNAS').length,
    lebih: wargaList.filter(w => w.status === 'LEBIH').length,
  }

  // Count nominal yang akan di-submit
  const filledEntries = Object.entries(nominalMap).filter(([, v]) => Number(v) > 0)
  const totalInput = filledEntries.reduce((s, [pid, v]) => {
    const w = wargaList.find(x => x.profile_id === pid)
    if (!w) return s
    return s + (Number(v) - w.total_terbayar)  // nominal baru yg ditambahkan
  }, 0)

  function setNominal(profileId: string, value: string) {
    setNominalMap(prev => ({ ...prev, [profileId]: value }))
  }

  function fillAllWithSisa() {
    const m: Record<string, string> = {}
    for (const w of wargaList) {
      if (w.sisa > 0) m[w.profile_id] = String(w.sisa)
    }
    setNominalMap(m)
    toast.success(`Pre-fill nominal = sisa untuk ${Object.keys(m).length} warga`)
  }

  function clearAll() {
    setNominalMap({})
    toast.success('Semua input dikosongkan')
  }

  function handleSave() {
    if (filledEntries.length === 0) {
      toast.error('Minimal 1 warga harus diisi nominalnya')
      return
    }

    const entries = filledEntries.map(([pid, v]) => ({
      profile_id: pid,
      nominal: Number(v),
    }))

    const fd = new FormData()
    fd.append('periode', periode)
    fd.append('tanggal_bayar', tanggalBayar)
    fd.append('metode_bayar', metode)
    fd.append('catatan', catatan)
    fd.append('entries', JSON.stringify(entries))

    startTransition(async () => {
      const res = await bulkInputIuranBendahara(fd)
      if (res?.error && !res.success) {
        toast.error(res.error)
        return
      }
      const msg = res.success
        ? `Berhasil input ${res.inserted_payments} pembayaran (Rp ${(res.total_nominal ?? 0).toLocaleString('id-ID')})`
        : 'Selesai dengan beberapa peringatan'
      toast.success(msg)
      // Reset nominal
      setNominalMap({})
      // Reload data
      const refreshed = await getWargaWithTagihan(periode)
      if (refreshed.data) setWargaList(refreshed.data)
      // Reload parent pages
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label htmlFor="periode" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                <Calendar className="w-3 h-3 inline mr-1" /> Periode
              </Label>
              <Input
                id="periode"
                type="month"
                value={periode}
                onChange={(e) => setPeriode(e.target.value)}
                disabled={loading || isPending}
                className="font-semibold"
              />
            </div>
            <div>
              <Label htmlFor="tanggal" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Tanggal Bayar
              </Label>
              <Input
                id="tanggal"
                type="date"
                value={tanggalBayar}
                onChange={(e) => setTanggalBayar(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div>
              <Label htmlFor="metode" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Metode Bayar
              </Label>
              <select
                id="metode"
                value={metode}
                onChange={(e) => setMetode(e.target.value as 'TUNAI' | 'TRANSFER' | 'QRIS')}
                disabled={isPending}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="TUNAI">Tunai</option>
                <option value="TRANSFER">Transfer Bank</option>
                <option value="QRIS">QRIS</option>
              </select>
            </div>
            <div>
              <Label htmlFor="catatan" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Catatan (opsional)
              </Label>
              <Input
                id="catatan"
                placeholder="Misal: Iuran Juli 2026"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <button
          onClick={() => setFilterStatus('ALL')}
          className={`p-3 rounded-xl text-left transition-all ${
            filterStatus === 'ALL'
              ? 'bg-slate-900 text-white shadow-lg'
              : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-400'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Semua</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </button>
        <button
          onClick={() => setFilterStatus('BELUM')}
          className={`p-3 rounded-xl text-left transition-all ${
            filterStatus === 'BELUM'
              ? 'bg-rose-600 text-white shadow-lg'
              : 'bg-rose-50 text-rose-700 border border-rose-200 hover:border-rose-400'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Belum</p>
          <p className="text-2xl font-bold">{stats.belum}</p>
        </button>
        <button
          onClick={() => setFilterStatus('CICIL')}
          className={`p-3 rounded-xl text-left transition-all ${
            filterStatus === 'CICIL'
              ? 'bg-amber-600 text-white shadow-lg'
              : 'bg-amber-50 text-amber-700 border border-amber-200 hover:border-amber-400'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Cicil</p>
          <p className="text-2xl font-bold">{stats.cicil}</p>
        </button>
        <button
          onClick={() => setFilterStatus('LUNAS')}
          className={`p-3 rounded-xl text-left transition-all ${
            filterStatus === 'LUNAS'
              ? 'bg-emerald-600 text-white shadow-lg'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:border-emerald-400'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Lunas</p>
          <p className="text-2xl font-bold">{stats.lunas}</p>
        </button>
        <button
          onClick={() => setFilterStatus('LEBIH')}
          className={`p-3 rounded-xl text-left transition-all ${
            filterStatus === 'LEBIH'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-blue-50 text-blue-700 border border-blue-200 hover:border-blue-400'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Lebih</p>
          <p className="text-2xl font-bold">{stats.lebih}</p>
        </button>
      </div>

      {/* Search + Action buttons */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-3 flex items-center gap-2">
          <Input
            type="search"
            placeholder="Cari nama, login_id, atau blok..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
            disabled={isPending}
          />
          <Button type="button" variant="outline" onClick={fillAllWithSisa} disabled={isPending || wargaList.length === 0}>
            <Coins className="w-4 h-4 mr-1" />
            Pre-fill Sisa
          </Button>
          <Button type="button" variant="ghost" onClick={clearAll} disabled={isPending}>
            Clear
          </Button>
        </CardContent>
      </Card>

      {/* List Warga */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              Daftar Warga ({filteredList.length})
            </div>
            {filledEntries.length > 0 && (
              <Badge className="bg-emerald-100 text-emerald-800">
                {filledEntries.length} warga akan disimpan
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            FIX Problem #3: Input nominal per warga. Tagihan & status update otomatis.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
              <p className="text-sm text-muted-foreground">Memuat data warga...</p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Tidak ada warga dengan filter ini</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredList.map(w => (
                <div
                  key={w.profile_id}
                  className={`p-3 flex items-center gap-3 hover:bg-slate-50 transition-colors ${
                    nominalMap[w.profile_id] && Number(nominalMap[w.profile_id]) > 0
                      ? 'bg-emerald-50/30'
                      : ''
                  }`}
                >
                  <div className="w-12 text-center shrink-0">
                    <div className="text-xs font-bold text-slate-500">{w.blok}</div>
                    <div className="text-base font-bold leading-none">{w.nomor_rumah}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{w.nama_kk}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{w.login_id}</span>
                      <Badge className={`text-[9px] px-1 py-0 ${STATUS_BADGE[w.status]} border`}>
                        {STATUS_LABEL[w.status]}
                      </Badge>
                      <span className="text-rose-600">Tagihan: Rp {w.nominal_tagihan.toLocaleString('id-ID')}</span>
                      {w.total_terbayar > 0 && (
                        <span className="text-emerald-600">Bayar: Rp {w.total_terbayar.toLocaleString('id-ID')}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-muted-foreground">Rp</span>
                    <Input
                      type="number"
                      min={0}
                      placeholder={String(w.sisa > 0 ? w.sisa : 0)}
                      value={nominalMap[w.profile_id] ?? ''}
                      onChange={(e) => setNominal(w.profile_id, e.target.value)}
                      disabled={isPending}
                      className="w-28 text-right font-semibold"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Bar (sticky bottom) */}
      <div className="sticky bottom-0 z-30">
        <Card className="border-2 border-emerald-300 shadow-lg bg-white/95 backdrop-blur-md">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Banknote className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total input
                </p>
                <p className="text-lg font-bold text-emerald-700">
                  Rp {totalInput.toLocaleString('id-ID')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {filledEntries.length} warga · {metode}
                </p>
              </div>
            </div>
            <Button
              onClick={handleSave}
              disabled={isPending || filledEntries.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
              size="lg"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Simpan {filledEntries.length} Pembayaran
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
