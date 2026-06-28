'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Banknote, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { bayarDanaKhusus } from '@/app/(dashboard)/dashboard/dana-khusus/dana-khusus-actions'

export function BayarCicilanWarga({
  danaId,
  tagihanId,
  maxNominal,
  judul,
  status,
}: {
  danaId: string
  tagihanId: string
  maxNominal: number
  judul: string
  status: 'BELUM' | 'CICIL' | 'LUNAS' | 'LEBIH'
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
    // profile_id dikosongkan → pakai profile.id user (warga)
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
      toast.success(`Pembayaran ${judul} Rp ${n.toLocaleString('id-ID')} berhasil!`)
      setOpen(false)
      setTimeout(() => window.location.reload(), 600)
    })
  }

  // Quick nominal buttons (50rb, 100rb, max)
  const quickAmounts = status === 'BELUM'
    ? [10000, 25000, 50000]
    : [10000, 25000, maxNominal].filter((v, i, a) => a.indexOf(v) === i)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={`w-full inline-flex items-center justify-center rounded-lg text-sm font-bold h-11 shadow-md transition-colors gap-2 ${
        status === 'LUNAS'
          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white'
          : 'bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white'
      }`}>
        <Sparkles className="w-4 h-4" />
        {status === 'LUNAS' ? 'Tambah Sumbangan' : status === 'CICIL' ? 'Bayar Cicilan Lagi' : 'Bayar Sekarang'}
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-pink-600" />
            Bayar {judul}
          </DialogTitle>
          <DialogDescription>
            {maxNominal > 0 && status !== 'LUNAS' && (
              <>Sisa tagihan Anda: <strong>Rp {maxNominal.toLocaleString('id-ID')}</strong></>
            )}
            {status === 'LUNAS' && 'Tagihan Anda sudah lunas. Anda tetap bisa menambahkan sumbangan sukarela.'}
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
            {quickAmounts.length > 0 && (
              <div className="flex gap-1 mt-2">
                {quickAmounts.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setNominal(String(v))}
                    disabled={isPending}
                    className="flex-1 px-2 py-1.5 rounded-md border border-pink-200 bg-pink-50 hover:bg-pink-100 text-xs font-semibold text-pink-700 transition-colors"
                  >
                    {(v / 1000).toLocaleString('id-ID')}k
                  </button>
                ))}
              </div>
            )}
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
              placeholder="Misal: Cicilan ke-2"
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
                Bayar Sekarang
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
