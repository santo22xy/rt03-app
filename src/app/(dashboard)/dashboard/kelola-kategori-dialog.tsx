'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Plus, Pencil, PowerOff, Loader2, Settings, ArrowUpCircle, ArrowDownCircle,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getAllKasKategori, addKasKategori, editKasKategori, nonaktifkanKasKategori,
  type KasKategori,
} from './jimpitan-actions'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged?: () => void
}

export function KelolaKategoriDialog({ open, onOpenChange, onChanged }: Props) {
  const router = useRouter()
  const [list, setList] = useState<KasKategori[]>([])
  const [loading, setLoading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // Form state untuk add/edit
  const [formTipe, setFormTipe] = useState<'MASUK' | 'KELUAR'>('MASUK')
  const [formKode, setFormKode] = useState('')
  const [formLabel, setFormLabel] = useState('')
  const [formUrutan, setFormUrutan] = useState('100')

  async function refresh() {
    setLoading(true)
    try {
      const data = await getAllKasKategori()
      setList(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) refresh()
  }, [open])

  function resetForm() {
    setEditingId(null)
    setAdding(false)
    setFormTipe('MASUK')
    setFormKode('')
    setFormLabel('')
    setFormUrutan('100')
  }

  function startEdit(k: KasKategori) {
    setEditingId(k.id)
    setAdding(false)
    setFormTipe(k.tipe)
    setFormKode(k.kode)
    setFormLabel(k.label)
    setFormUrutan(String(k.urutan))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formLabel.trim()) {
      toast.error('Label wajib diisi')
      return
    }
    startTransition(async () => {
      if (editingId) {
        // Edit: tidak bisa ubah kode/tipe
        const fd = new FormData()
        fd.append('id', editingId)
        fd.append('label', formLabel.trim())
        fd.append('urutan', formUrutan)
        const target = list.find((x) => x.id === editingId)
        fd.append('is_active', target?.is_active ? 'true' : 'false')
        const res = await editKasKategori(fd)
        if (res.error) toast.error(res.error)
        else {
          toast.success('Kategori diperbarui')
          resetForm()
          await refresh()
          onChanged?.()
          router.refresh()
        }
      } else {
        // Add
        if (!formKode.trim()) {
          toast.error('Kode wajib diisi (contoh: IURAN_KONDANGAN)')
          return
        }
        const fd = new FormData()
        fd.append('tipe', formTipe)
        fd.append('kode', formKode.trim())
        fd.append('label', formLabel.trim())
        fd.append('urutan', formUrutan)
        const res = await addKasKategori(fd)
        if (res.error) toast.error(res.error)
        else {
          toast.success(`Kategori "${formKode.trim().toUpperCase()}" ditambahkan`)
          resetForm()
          await refresh()
          onChanged?.()
          router.refresh()
        }
      }
    })
  }

  function handleNonaktifkan(id: string, kode: string) {
    if (!confirm(`Nonaktifkan kategori "${kode}"? Data transaksi lama tetap aman, tapi kategori tidak muncul di dropdown.`)) return
    startTransition(async () => {
      const res = await nonaktifkanKasKategori(id)
      if (res.error) toast.error(res.error)
      else {
        toast.success('Kategori dinonaktifkan')
        await refresh()
        onChanged?.()
        router.refresh()
      }
    })
  }

  const masuk = list.filter((k) => k.tipe === 'MASUK')
  const keluar = list.filter((k) => k.tipe === 'KELUAR')

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-blue-600" />
            Kelola Kategori Transaksi
          </DialogTitle>
          <DialogDescription>
            Tambah, edit, atau nonaktifkan kategori Pemasukan & Pengeluaran. Kategori yang dinonaktifkan tidak muncul di dropdown tapi tetap aman untuk transaksi lama.
          </DialogDescription>
        </DialogHeader>

        {/* Form Add / Edit */}
        {adding || editingId ? (
          <form onSubmit={handleSubmit} className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-3 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
              {editingId ? 'Edit Kategori' : 'Tambah Kategori Baru'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tipe</Label>
                <select
                  value={formTipe}
                  onChange={(e) => setFormTipe(e.target.value as 'MASUK' | 'KELUAR')}
                  disabled={!!editingId || pending}
                  className="flex w-full h-8 items-center rounded-lg border border-input bg-white px-2.5 text-sm"
                >
                  <option value="MASUK">Pemasukan</option>
                  <option value="KELUAR">Pengeluaran</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Kode (uppercase, snake_case)</Label>
                <Input
                  value={formKode}
                  onChange={(e) => setFormKode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                  disabled={!!editingId || pending}
                  placeholder="cth: IURAN_KEAMANAN"
                  className="font-mono"
                />
                {editingId && (
                  <p className="text-[10px] text-muted-foreground italic mt-0.5">Kode tidak bisa diubah.</p>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs">Label Tampil</Label>
              <Input
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                disabled={pending}
                placeholder="cth: Iuran Keamanan"
              />
            </div>
            <div>
              <Label className="text-xs">Urutan (angka kecil = tampil duluan)</Label>
              <Input
                type="number"
                value={formUrutan}
                onChange={(e) => setFormUrutan(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={resetForm} disabled={pending}>
                Batal
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : (editingId ? 'Simpan Perubahan' : 'Tambah')}
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
            className="w-full"
          >
            <Plus className="w-3 h-3 mr-1" />
            Tambah Kategori Baru
          </Button>
        )}

        {/* Daftar kategori */}
        {loading ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
            Memuat…
          </div>
        ) : (
          <div className="space-y-3">
            {/* PEMASUKAN */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 px-1">
                <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-600" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Pemasukan ({masuk.length})
                </p>
              </div>
              <div className="space-y-1">
                {masuk.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic px-2">Belum ada kategori.</p>
                )}
                {masuk.map((k) => (
                  <KategoriRow
                    key={k.id}
                    k={k}
                    onEdit={() => startEdit(k)}
                    onNonaktifkan={() => handleNonaktifkan(k.id, k.kode)}
                    pending={pending}
                  />
                ))}
              </div>
            </div>

            {/* PENGELUARAN */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 px-1">
                <ArrowDownCircle className="w-3.5 h-3.5 text-rose-600" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                  Pengeluaran ({keluar.length})
                </p>
              </div>
              <div className="space-y-1">
                {keluar.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic px-2">Belum ada kategori.</p>
                )}
                {keluar.map((k) => (
                  <KategoriRow
                    key={k.id}
                    k={k}
                    onEdit={() => startEdit(k)}
                    onNonaktifkan={() => handleNonaktifkan(k.id, k.kode)}
                    pending={pending}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function KategoriRow({
  k, onEdit, onNonaktifkan, pending,
}: {
  k: KasKategori
  onEdit: () => void
  onNonaktifkan: () => void
  pending: boolean
}) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
      k.is_active ? 'bg-card' : 'bg-slate-50 opacity-60'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-semibold truncate">{k.label}</p>
          {!k.is_active && (
            <Badge className="bg-slate-200 text-slate-600 text-[9px]">
              <AlertCircle className="w-2.5 h-2.5 mr-0.5" /> Non-aktif
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground font-mono">{k.kode} · urutan {k.urutan}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onEdit}
        disabled={pending}
        className="h-7 w-7"
        title="Edit"
      >
        <Pencil className="w-3 h-3" />
      </Button>
      {k.is_active && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onNonaktifkan}
          disabled={pending}
          className="h-7 w-7 text-rose-600"
          title="Nonaktifkan"
        >
          <PowerOff className="w-3 h-3" />
        </Button>
      )}
    </div>
  )
}
