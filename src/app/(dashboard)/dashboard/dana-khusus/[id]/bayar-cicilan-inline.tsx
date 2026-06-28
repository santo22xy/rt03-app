'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Loader2, Banknote } from 'lucide-react'
import { toast } from 'sonner'
import { bayarDanaKhusus } from '../dana-khusus-actions'

export function BayarCicilanInline({
  danaId,
  tagihanId,
  profileId,
  maxNominal,
}: {
  danaId: string
  tagihanId: string
  profileId: string
  maxNominal: number
}) {
  const [open, setOpen] = useState(false)
  const [nominal, setNominal] = useState(String(maxNominal > 0 ? maxNominal : ''))
  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER' | 'QRIS'>('TUNAI')
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10))
  const [catatan, setCatatan] = useState('')
  const [isPending, startTransition] = useTransition()

  function handlePay() {
    const n = Number(nominal)
    if (!n || n <= 0) {
      toast.error('Nominal harus > 0')
      return
    }

    const fd = new FormData()
    fd.append('dana_khusus_id', danaId)
    fd.append('tagihan_id', tagihanId)
    fd.append('profile_id', profileId)
    fd.append('nominal', String(n))
    fd.append('metode', metode)
    fd.append('tanggal_bayar', tanggal)
    fd.append('catatan', catatan)

    startTransition(async () => {
      const res = await bayarDanaKhusus(fd)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success(`Pembayaran Rp ${n.toLocaleString('id-ID')} berhasil dicatat!`)
      setOpen(false)
      // Force refresh - this component is on a server page, will need reload
      setTimeout(() => window.location.reload(), 600)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold h-8 px-3 shadow-sm transition-colors gap-1">
        <Plus className="w-3.5 h-3.5" />
        Bayar
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-pink-600" />
            Input Pembayaran
          </DialogTitle>
          <DialogDescription>
            {maxNominal > 0 ? (
              <>Sisa tagihan: <strong>Rp {maxNominal.toLocaleString('id-ID')}</strong></>
            ) : (
              'Tagihan sudah lunas / lebih — input extra bayar'
            )}
          </DialogDescription>
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
              autoFocus
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
                onChange={(e) => setMetode(e.target.value as 'TUNAI' | 'TRANSFER' | 'QRIS')}
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
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Batal
          </Button>
          <Button
            onClick={handlePay}
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
                Simpan Bayar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
