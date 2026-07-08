'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  Edit, Trash2, Loader2, User,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { formatRupiah } from '@/lib/format'
import {
  editTransaksiKas, hapusTransaksiKas,
} from '../jimpitan-actions'

export type KasTransaksiItem = {
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
  catatan: string | null
  created_at: string
  created_by?: string | null
  nota_url?: string | null
}

type Props = {
  tanggal: string
  items: KasTransaksiItem[]
  saldoAwal: number // Saldo sebelum hari ini (running balance)
  kategoriMap?: Record<string, { label: string; is_active: boolean }>
  defaultOpen?: boolean
}

// Helper format tanggal Indonesia (dd month yyyy)
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Helper untuk resolve label kategori.
// Priority: kategoriMap[kode].label > fallback replace _ dengan spasi.
function labelKategori(
  kode: string,
  kategoriMap?: Record<string, { label: string; is_active: boolean }>
): { label: string; isLegacy: boolean } {
  const entry = kategoriMap?.[kode]
  if (entry) return { label: entry.label, isLegacy: !entry.is_active }
  // Fallback: format kode as readable label, tandai sebagai legacy/non-master
  return { label: kode.replace(/_/g, ' '), isLegacy: true }
}

export function KasDateGroup({
  tanggal, items, saldoAwal, kategoriMap, defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [editing, setEditing] = useState<KasTransaksiItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  // Hitung total debit/kredit hari ini
  const dayMasuk = items
    .filter((t) => t.tipe === 'MASUK')
    .reduce((s, t) => s + Number(t.nominal), 0)
  const dayKeluar = items
    .filter((t) => t.tipe === 'KELUAR')
    .reduce((s, t) => s + Number(t.nominal), 0)
  const saldoAkhir = saldoAwal + dayMasuk - dayKeluar

  // Sort items by created_at agar urut chronological
  const sorted = [...items].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  // Hitung running saldo per transaksi
  const withRunning = (() => {
    let cur = saldoAwal
    return sorted.map((t) => {
      if (t.tipe === 'MASUK') cur += Number(t.nominal)
      else cur -= Number(t.nominal)
      return { ...t, running: cur }
    })
  })()

  function handleDelete(id: string) {
    if (!confirm('Hapus transaksi ini? Tindakan tidak bisa dibatalkan.')) return
    setDeletingId(id)
    startTransition(async () => {
      const res = await hapusTransaksiKas(id)
      setDeletingId(null)
      if (res.error) toast.error(res.error)
      else {
        toast.success('Transaksi dihapus')
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-2">
      {/* Header tanggal - clickable */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2 hover:bg-slate-100/80 rounded-lg py-2 transition-colors text-left"
      >
        <div className="text-center shrink-0 w-12 bg-white rounded-lg shadow-sm ring-1 ring-slate-200/60 py-1">
          <p className="text-[9px] font-bold uppercase text-muted-foreground">
            {new Date(tanggal).toLocaleString('id-ID', { month: 'short' })}
          </p>
          <p className="text-lg font-bold leading-none">
            {new Date(tanggal).getDate()}
          </p>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold text-slate-800">
            {fmtDate(tanggal)}
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {items.length} transaksi ·{' '}
            <span className="font-semibold text-emerald-700">
              +{formatRupiah(dayMasuk)}
            </span>{' '}
            /{' '}
            <span className="font-semibold text-rose-700">
              −{formatRupiah(dayKeluar)}
            </span>{' '}
            · Saldo:{' '}
            <span className={`font-bold ${saldoAkhir >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {formatRupiah(saldoAkhir)}
            </span>
          </p>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <Card className="border-0 shadow-sm ring-1 ring-slate-200/60 overflow-hidden">
          {/* Sub-header grid Debit/Kredit/Saldo */}
          <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200/60">
            <div>
              <p className="text-[9px] uppercase text-muted-foreground font-semibold">Saldo Awal</p>
              <p className="text-[11px] font-bold text-slate-700">{formatRupiah(saldoAwal)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase text-emerald-700 font-semibold">Debit (Masuk)</p>
              <p className="text-[11px] font-bold text-emerald-700">+{formatRupiah(dayMasuk)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase text-rose-700 font-semibold">Kredit (Keluar)</p>
              <p className="text-[11px] font-bold text-rose-700">−{formatRupiah(dayKeluar)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase text-blue-700 font-semibold">Saldo Akhir</p>
              <p className={`text-[11px] font-bold ${saldoAkhir >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                {formatRupiah(saldoAkhir)}
              </p>
            </div>
          </div>

          {/* Daftar transaksi */}
          <div className="divide-y divide-slate-100">
            {withRunning.map((t) => {
              const isMasuk = t.tipe === 'MASUK'
              const kat = labelKategori(t.kategori, kategoriMap)
              return (
                <div key={t.id} className="px-3 py-2.5 flex items-start gap-2 hover:bg-slate-50/50 transition-colors group">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    isMasuk ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {isMasuk ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{t.uraian}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <Badge className={`${
                        isMasuk ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/60' : 'bg-rose-50 text-rose-700 ring-rose-200/60'
                      } text-[9px] ring-1`}>
                        {kat.label}
                        {kat.isLegacy && <span className="ml-1 italic opacity-70 text-[8px]">(legacy)</span>}
                      </Badge>
                      {t.login_id && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <User className="w-2.5 h-2.5" />{t.login_id}
                        </span>
                      )}
                      {t.metode_bayar && (
                        <span className="text-[10px] text-muted-foreground">· {t.metode_bayar}</span>
                      )}
                      {t.sumber_dana === 'DITALANGI' && t.ditalangi_oleh && (
                        <span className="text-[10px] text-amber-700 font-semibold">· Ditalangi {t.ditalangi_oleh}</span>
                      )}
                    </div>
                    {t.catatan && (
                      <p className="text-[10px] text-muted-foreground italic mt-0.5 line-clamp-1">💬 {t.catatan}</p>
                    )}
                    {t.nota_url && (
                      <a
                        href={t.nota_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-600 hover:text-blue-800 mt-0.5 inline-flex items-center gap-1"
                      >
                        📎 Lihat Nota
                      </a>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-bold ${isMasuk ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isMasuk ? '+' : '−'} {formatRupiah(Number(t.nominal))}
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      Saldo: <span className="font-semibold">{formatRupiah(t.running)}</span>
                    </p>
                  </div>
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); setEditing(t) }}
                      className="h-6 w-6 opacity-60 hover:opacity-100"
                      title="Edit"
                    >
                      <Edit className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); handleDelete(t.id) }}
                      disabled={deletingId === t.id && pending}
                      className="h-6 w-6 opacity-60 hover:opacity-100 text-rose-600"
                      title="Hapus"
                    >
                      {deletingId === t.id && pending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Edit Dialog */}
      {editing && (
        <EditTransaksiDialog
          transaksi={editing}
          kategoriMap={kategoriMap}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

// Dialog edit
function EditTransaksiDialog({
  transaksi, onClose, onSaved, kategoriMap,
}: {
  transaksi: KasTransaksiItem
  onClose: () => void
  onSaved: () => void
  kategoriMap?: Record<string, { label: string; is_active: boolean }>
}) {
  const [pending, startTransition] = useTransition()
  const [uraian, setUraian] = useState(transaksi.uraian)
  const [nominal, setNominal] = useState(String(transaksi.nominal))
  const [catatan, setCatatan] = useState(transaksi.catatan ?? '')
  const [tanggal, setTanggal] = useState(transaksi.tanggal)
  const [kategori, setKategori] = useState(transaksi.kategori)

  const isMasuk = transaksi.tipe === 'MASUK'
  // Opsi kategori dari master kas_kategori (via parent).
  // Filter by tipe: PEMASUKAN atau PENGELUARAN.
  // Legacy categories (PENGELUARAN_ATK, SALDO_AWAL) selalu disertakan
  // supaya transaksi lama masih bisa diedit tanpa error.
  const kategoriOptionsFromMap: Array<{ value: string; label: string }> =
    Object.entries(kategoriMap ?? {})
      .filter((entry): entry is [string, { label: string; is_active: boolean } & { label: string; is_active: boolean }] =>
        (entry[1] as { is_active?: boolean }).is_active === true
      )
      .map(([kode, v]) => ({ value: kode, label: v.label }))
  const LEGACY_KATEGORI = ['PENGELUARAN_ATK', 'SALDO_AWAL'] as const
  const legacyOptions: Array<{ value: string; label: string }> = []
  for (const kode of LEGACY_KATEGORI) {
    if (!kategoriOptionsFromMap.some((k) => k.value === kode)) {
      legacyOptions.push({
        value: kode,
        label: kode === 'SALDO_AWAL' ? 'Saldo Awal (legacy)' : 'Pengeluaran ATK (legacy)',
      })
    }
  }
  const kategoriOptions = [...kategoriOptionsFromMap, ...legacyOptions].sort((a, b) =>
    a.label.localeCompare(b.label)
  )

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData()
    fd.append('id', transaksi.id)
    fd.append('uraian', uraian)
    fd.append('nominal', nominal)
    fd.append('tanggal', tanggal)
    fd.append('kategori', kategori)
    fd.append('catatan', catatan)
    startTransition(async () => {
      const res = await editTransaksiKas(fd)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success('Transaksi diperbarui')
        onSaved()
      }
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isMasuk ? (
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-600" />
            )}
            Edit Transaksi {isMasuk ? 'Pemasukan' : 'Pengeluaran'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-3">
          {/* Tipe — read only (tidak bisa diubah) */}
          <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200/60">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Tipe</p>
            <p className={`text-xs font-bold ${isMasuk ? 'text-emerald-700' : 'text-rose-700'}`}>
              {isMasuk ? 'Pemasukan (MASUK)' : 'Pengeluaran (KELUAR)'}
            </p>
            <p className="text-[10px] text-muted-foreground italic mt-0.5">
              Tipe tidak bisa diedit. Hapus & buat ulang jika perlu ubah tipe.
            </p>
          </div>

          {/* Tanggal & Kategori — EDITABLE */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="tanggal" className="text-xs">Tanggal</Label>
              <Input
                id="tanggal"
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                required
                disabled={pending}
              />
            </div>
            <div>
              <Label htmlFor="kategori" className="text-xs">Kategori</Label>
              <select
                id="kategori"
                value={kategori}
                onChange={(e) => setKategori(e.target.value)}
                required
                disabled={pending}
                className="flex w-full h-9 items-center rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {kategoriOptions.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="uraian" className="text-xs">Uraian</Label>
            <Input
              id="uraian"
              value={uraian}
              onChange={(e) => setUraian(e.target.value)}
              required
              disabled={pending}
            />
          </div>
          <div>
            <Label htmlFor="nominal" className="text-xs">Nominal (Rp)</Label>
            <Input
              id="nominal"
              type="number"
              value={nominal}
              onChange={(e) => setNominal(e.target.value)}
              required
              disabled={pending}
            />
          </div>
          <div>
            <Label htmlFor="catatan" className="text-xs">Catatan</Label>
            <Textarea
              id="catatan"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              rows={2}
              disabled={pending}
              placeholder="Opsional (suffix ✏️ diedit … akan ditambahkan otomatis)"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  Menyimpan...
                </>
              ) : (
                'Simpan'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}