'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Plus, Loader2, ArrowUpCircle, ArrowDownCircle,
  Wallet, CheckCircle2, MinusCircle, PlusCircle, Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRupiah, parseRupiah } from '@/lib/format'
import { toast } from 'sonner'
import {
  tambahTransaksiKas, getKasKategori,
  type KasKategori,
} from './jimpitan-actions'
import { getActiveDanaKhususAndProfiles } from './dana-khusus/dana-khusus-actions'
import { KelolaKategoriDialog } from './kelola-kategori-dialog'

type Tipe = 'MASUK' | 'KELUAR'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function TambahTransaksiKas() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kelolaOpen, setKelolaOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [tipe, setTipe] = useState<Tipe>('MASUK')
  const [tanggal, setTanggal] = useState<string>(todayISO())
  const [kategori, setKategori] = useState<string>('')
  const [uraian, setUraian] = useState('')
  const [nominalDisplay, setNominalDisplay] = useState('')
  const [metodeBayar, setMetodeBayar] = useState<'TUNAI' | 'TRANSFER'>('TUNAI')
  const [sumberDana, setSumberDana] = useState<'KAS_RT' | 'DITALANGI'>('KAS_RT')
  const [ditalangiOleh, setDitalangiOleh] = useState('')
  const [catatan, setCatatan] = useState('')
  const [notaFile, setNotaFile] = useState<File | null>(null)

  // Daftar kategori aktif dari DB
  const [kategoriList, setKategoriList] = useState<KasKategori[]>([])
  const [danaKhususList, setDanaKhususList] = useState<any[]>([])
  const [profilesList, setProfilesList] = useState<any[]>([])
  const [selectedDanaKhusus, setSelectedDanaKhusus] = useState<string>('')
  const [selectedBlok, setSelectedBlok] = useState<string>('')
  const [selectedProfile, setSelectedProfile] = useState<string>('')

  // Load kategori saat dialog tambah dibuka
  async function loadKategori() {
    const list = await getKasKategori()
    setKategoriList(list)
    // Set default kategori untuk tipe saat ini jika belum ada
    if (!kategori) {
      const first = list.find((k) => k.tipe === tipe)
      if (first) setKategori(first.kode)
    }
    // Load active dana khusus and profiles via server action
    const { danaKhususList, profilesList } = await getActiveDanaKhususAndProfiles()
    setDanaKhususList(danaKhususList || [])
    setProfilesList(profilesList || [])
  }

  function reset() {
    setTipe('MASUK')
    setTanggal(todayISO())
    // Reset kategori ke kategori pertama untuk tipe MASUK (kalau ada di list)
    const firstMasuk = kategoriList.find((k) => k.tipe === 'MASUK')
    setKategori(firstMasuk?.kode ?? '')
    setUraian('')
    setNominalDisplay('')
    setMetodeBayar('TUNAI')
    setSumberDana('KAS_RT')
    setDitalangiOleh('')
    setCatatan('')
    setSelectedDanaKhusus('')
    setSelectedBlok('')
    setSelectedProfile('')
    setNotaFile(null)
  }

  function handleTipeChange(next: Tipe) {
    setTipe(next)
    // Reset kategori ke kategori pertama yang sesuai tipe baru
    const first = kategoriList.find((k) => k.tipe === next)
    setKategori(first?.kode ?? '')
  }

  function handleOpenChange(o: boolean) {
    setOpen(o)
    if (o) {
      // Buka: load kategori
      loadKategori()
    } else {
      // Tutup: reset form
      reset()
    }
  }

  // Filter kategori sesuai tipe, urutkan by urutan lalu label
  const kategoriFiltered = kategoriList
    .filter((k) => k.tipe === tipe)
    .sort((a, b) => a.urutan - b.urutan || a.label.localeCompare(b.label))
  const selectedKategoriObj = kategoriList.find((k) => k.kode === kategori)

  function handleNominalChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9]/g, '')
    if (!raw) {
      setNominalDisplay('')
      return
    }
    const n = Number(raw)
    setNominalDisplay(formatRupiah(n).replace('Rp\u00A0', '').replace(/[^\d,]/g, ''))
    // Simpan raw digits di state terpisah via parseRupiah fallback
    // Kita pakai format sederhana: "15.000" style
    setNominalDisplay(n.toLocaleString('id-ID'))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validasi client-side
    const nominal = parseRupiah(nominalDisplay)
    if (!uraian.trim()) {
      toast.error('Uraian wajib diisi')
      return
    }
    if (nominal <= 0) {
      toast.error('Nominal harus lebih dari 0')
      return
    }
    if (sumberDana === 'DITALANGI' && !ditalangiOleh.trim()) {
      toast.error('Isi nama yang menalangi')
      return
    }

    const fd = new FormData()
    fd.append('tipe', tipe)
    fd.append('tanggal', tanggal)
    fd.append('kategori', kategori)
    fd.append('uraian', uraian.trim())
    fd.append('nominal', String(nominal))
    if (tipe === 'MASUK' && kategori === 'IURAN_BULANAN') {
      fd.append('metode_bayar', metodeBayar)
    }
    if (tipe === 'KELUAR') {
      fd.append('sumber_dana', sumberDana)
      if (sumberDana === 'DITALANGI') {
        fd.append('ditalangi_oleh', ditalangiOleh.trim())
      }
    }
    if (catatan.trim()) fd.append('catatan', catatan.trim())
    if (notaFile) fd.append('nota', notaFile)

    // For MERTI DUSUN
    if (selectedKategoriObj?.label.toLowerCase().includes('merti')) {
      fd.append('dana_khusus_id', selectedDanaKhusus)
      fd.append('profile_id', selectedProfile)
    }

    startTransition(async () => {
      const res = await tambahTransaksiKas(fd)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      const successMsg = tipe === 'MASUK'
        ? `Pemasukan ${formatRupiah(nominal)} berhasil dicatat`
        : `Pengeluaran ${formatRupiah(nominal)} berhasil dicatat`
      toast.success(successMsg)
      reset()
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="flex gap-2 shrink-0">
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium h-8 px-3 shadow-md transition-colors gap-2">
          <Plus className="w-4 h-4" />
          Input Transaksi
        </DialogTrigger>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <DialogTitle>Input Transaksi Manual</DialogTitle>
              <DialogDescription>
                Catat pemasukan atau pengeluaran kas RT
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipe Selector (segmented) */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Tipe Transaksi
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleTipeChange('MASUK')}
                className={cn(
                  'flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-sm font-semibold',
                  tipe === 'MASUK'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                )}
                disabled={isPending}
              >
                <PlusCircle className="w-4 h-4" />
                Pemasukan
              </button>
              <button
                type="button"
                onClick={() => handleTipeChange('KELUAR')}
                className={cn(
                  'flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-sm font-semibold',
                  tipe === 'KELUAR'
                    ? 'border-rose-500 bg-rose-50 text-rose-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                )}
                disabled={isPending}
              >
                <MinusCircle className="w-4 h-4" />
                Pengeluaran
              </button>
            </div>
          </div>

          {/* Tanggal & Kategori */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="tanggal" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Tanggal
              </label>
              <Input
                id="tanggal"
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                disabled={isPending}
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="kategori" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Kategori
                </label>
                <button
                  type="button"
                  onClick={() => setKelolaOpen(true)}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700"
                  title="Kelola kategori"
                >
                  <Settings className="w-3 h-3" />
                  Kelola
                </button>
              </div>
              <select
                id="kategori"
                value={kategori}
                onChange={(e) => setKategori(e.target.value)}
                disabled={isPending}
                className="flex w-full h-8 items-center rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {kategoriFiltered.length === 0 && (
                  <option value="">(Belum ada kategori — klik Kelola)</option>
                )}
                {kategoriFiltered.map((k) => (
                  <option key={k.kode} value={k.kode}>{k.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Uraian */}
          <div>
            <label htmlFor="uraian" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Uraian / Keterangan
            </label>
            <Input
              id="uraian"
              type="text"
              value={uraian}
              onChange={(e) => setUraian(e.target.value)}
              placeholder={tipe === 'MASUK' ? 'cth: Sumbangan 17 Agustus' : 'cth: Beli lampu LED pos ronda'}
              disabled={isPending}
              required
            />
          </div>

          {/* MERTI DUSUN / DANA KHUSUS FIELDS */}
          {selectedKategoriObj?.label.toLowerCase().includes('merti') && (
            <>
              <div>
                <label htmlFor="danaKhusus" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Pilih Dana Khusus
                </label>
                <select
                  id="danaKhusus"
                  value={selectedDanaKhusus}
                  onChange={(e) => {
                    setSelectedDanaKhusus(e.target.value)
                    setSelectedBlok('')
                    setSelectedProfile('')
                  }}
                  disabled={isPending}
                  className="flex w-full h-10 items-center rounded-lg border border-input bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">Pilih dana khusus...</option>
                  {danaKhususList.map(d => (
                    <option key={d.id} value={d.id}>{d.judul}</option>
                  ))}
                </select>
              </div>
              {selectedDanaKhusus && (
                <>
                  <div>
                    <label htmlFor="blok" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      Blok
                    </label>
                    <select
                      id="blok"
                      value={selectedBlok}
                      onChange={(e) => {
                        setSelectedBlok(e.target.value)
                        setSelectedProfile('')
                      }}
                      disabled={isPending}
                      className="flex w-full h-10 items-center rounded-lg border border-input bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="">Pilih blok...</option>
                      {Array.from(new Set(profilesList.map(p => p.blok).filter(b => b))).sort().map(blok => (
                        <option key={blok} value={blok}>{blok}</option>
                      ))}
                    </select>
                  </div>
                  {selectedBlok && (
                    <div>
                      <label htmlFor="warga" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                        Warga
                      </label>
                      <select
                        id="warga"
                        value={selectedProfile}
                        onChange={(e) => setSelectedProfile(e.target.value)}
                        disabled={isPending}
                        className="flex w-full h-10 items-center rounded-lg border border-input bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <option value="">Pilih warga...</option>
                        {profilesList.filter(p => p.blok === selectedBlok).map(p => (
                          <option key={p.id} value={p.id}>{p.nama_kk} ({p.login_id})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Nominal */}
          <div>
            <label htmlFor="nominal" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Nominal (Rp)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                Rp
              </span>
              <Input
                id="nominal"
                type="text"
                inputMode="numeric"
                value={nominalDisplay}
                onChange={handleNominalChange}
                placeholder="0"
                className="pl-9 font-semibold"
                disabled={isPending}
                required
              />
            </div>
            {nominalDisplay && (
              <p className={cn(
                'text-[11px] mt-1 font-semibold flex items-center gap-1',
                tipe === 'MASUK' ? 'text-emerald-600' : 'text-rose-600'
              )}>
                {tipe === 'MASUK' ? <ArrowUpCircle className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                {tipe === 'MASUK' ? '+' : '-'} {formatRupiah(parseRupiah(nominalDisplay))}
              </p>
            )}
          </div>

          {/* Metode Bayar (hanya untuk IURAN_BULANAN MASUK) */}
          {tipe === 'MASUK' && kategori === 'IURAN_BULANAN' && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Metode Bayar
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMetodeBayar('TUNAI')}
                  disabled={isPending}
                  className={cn(
                    'px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all',
                    metodeBayar === 'TUNAI'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600'
                  )}
                >
                  Tunai
                </button>
                <button
                  type="button"
                  onClick={() => setMetodeBayar('TRANSFER')}
                  disabled={isPending}
                  className={cn(
                    'px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all',
                    metodeBayar === 'TRANSFER'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600'
                  )}
                >
                  Transfer
                </button>
              </div>
            </div>
          )}

          {/* Sumber Dana (hanya untuk KELUAR) */}
          {tipe === 'KELUAR' && (
            <>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Sumber Dana
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSumberDana('KAS_RT')}
                    disabled={isPending}
                    className={cn(
                      'px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all',
                      sumberDana === 'KAS_RT'
                        ? 'border-rose-500 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    )}
                  >
                    Kas RT
                  </button>
                  <button
                    type="button"
                    onClick={() => setSumberDana('DITALANGI')}
                    disabled={isPending}
                    className={cn(
                      'px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all',
                      sumberDana === 'DITALANGI'
                        ? 'border-rose-500 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    )}
                  >
                    Ditalangi
                  </button>
                </div>
              </div>
              {sumberDana === 'DITALANGI' && (
                <div>
                  <label htmlFor="ditalangi" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    Ditalangi Oleh
                  </label>
                  <Input
                    id="ditalangi"
                    type="text"
                    value={ditalangiOleh}
                    onChange={(e) => setDitalangiOleh(e.target.value)}
                    placeholder="cth: Pak RT, Pak Sakund"
                    disabled={isPending}
                    required={sumberDana === 'DITALANGI'}
                  />
                </div>
              )}
            </>
          )}

          {/* Catatan */}
          <div>
            <label htmlFor="catatan" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Catatan <span className="text-muted-foreground/60 font-normal">(opsional)</span>
            </label>
            <Textarea
              id="catatan"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Tambahkan catatan jika perlu..."
              rows={2}
              disabled={isPending}
            />
          </div>

          {/* Nota / Bukti */}
          <div>
            <label htmlFor="nota" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Nota / Bukti <span className="text-muted-foreground/60 font-normal">(opsional)</span>
            </label>
            <Input
              id="nota"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif,.pdf"
              onChange={(e) => setNotaFile(e.target.files?.[0] || null)}
              disabled={isPending}
            />
            {notaFile && (
              <p className="text-[11px] text-emerald-700 mt-1">
                File dipilih: {notaFile.name} ({(notaFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className={cn(
                tipe === 'MASUK'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-rose-600 hover:bg-rose-700',
                'text-white'
              )}
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Simpan
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Kelola Kategori */}
      <KelolaKategoriDialog
        open={kelolaOpen}
        onOpenChange={(o) => {
          setKelolaOpen(o)
          if (!o) loadKategori() // refresh list setelah tutup
        }}
        onChanged={() => loadKategori()}
      />
    </div>
  )
}
