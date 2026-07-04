'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Edit, Trash2, Loader2, Banknote } from 'lucide-react'
import { toast } from 'sonner'
import { editDanaKhususPembayaran, deleteDanaKhususPembayaran } from '../dana-khusus-actions'

type Pembayaran = {
  id: string
  nominal: number
  metode: string
  tanggal_bayar: string
  catatan: string | null
}

export function EditPembayaranDanaKhusus({ p }: { p: Pembayaran }) {
  const [openEdit, setOpenEdit] = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [nominal, setNominal] = useState(String(p.nominal))
  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER' | 'QRIS'>(
    p.metode as any
  )
  const [tanggal, setTanggal] = useState(p.tanggal_bayar)
  const [catatan, setCatatan] = useState(p.catatan ?? '')

  function handleEdit() {
    const n = Number(nominal)
    if (!n || n <= 0) {
      toast.error('Nominal harus > 0')
      return
    }

    const fd = new FormData()
    fd.append('pembayaran_id', p.id)
    fd.append('nominal', String(n))
    fd.append('metode', metode)
    fd.append('tanggal_bayar', tanggal)
    fd.append('catatan', catatan)

    startTransition(async () => {
      const res = await editDanaKhususPembayaran(fd)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success('Pembayaran berhasil diubah!')
      setOpenEdit(false)
      setTimeout(() => window.location.reload(), 600)
    })
  }

  function handleDelete() {
    const fd = new FormData()
    fd.append('pembayaran_id', p.id)
    startTransition(async () => {
      const res = await deleteDanaKhususPembayaran(fd)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success('Pembayaran berhasil dihapus!')
      setOpenDelete(false)
      setTimeout(() => window.location.reload(), 600)
    })
  }

  return (
    <div className="flex gap-1">
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogTrigger className="inline-flex items-center justify-center rounded-md h-8 w-8 bg-slate-100 hover:bg-slate-200 transition-colors">
          <Edit className="w-4 h-4 text-slate-600" />
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-pink-600" />
              Edit Pembayaran
            </DialogTitle>
            <DialogDescription>Ubah detail pembayaran</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                Nominal (Rp)
              </label>
              <Input
                type="number"
                min={0}
                value={nominal}
                onChange={(e) => setNominal(e.target.value)}
                disabled={isPending}
                className="text-lg font-bold"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                  Tanggal
                </label>
                <Input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                  Metode
                </label>
                <select
                  value={metode}
                  onChange={(e) =>
                    setMetode(e.target.value as 'TUNAI' | 'TRANSFER' | 'QRIS')
                  }
                  disabled={isPending}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="TUNAI">Tunai</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="QRIS">QRIS</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                Catatan (opsional)
              </label>
              <Input
                placeholder="Misal: Cicilan kedua"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setOpenEdit(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              onClick={handleEdit}
              disabled={isPending || !nominal || Number(nominal) <= 0}
              className="bg-pink-600 hover:bg-pink-700 text-white"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Banknote className="w-4 h-4 mr-2" />
                  Simpan
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openDelete} onOpenChange={setOpenDelete}>
        <DialogTrigger className="inline-flex items-center justify-center rounded-md h-8 w-8 bg-rose-50 hover:bg-rose-100 transition-colors">
          <Trash2 className="w-4 h-4 text-rose-600" />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Pembayaran?</DialogTitle>
            <DialogDescription>
              Tindakan ini tidak bisa dibatalkan. Pembayaran ini akan dihapus dari riwayat dan tagihan akan diperbarui.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenDelete(false)} disabled={isPending}>
              Batal
            </Button>
            <Button
              onClick={handleDelete}
              disabled={isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Menghapus...
                </>
              ) : (
                'Hapus'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
