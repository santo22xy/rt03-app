'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { pindahkanKelebihanKeBulanDepan, setKelebihanTujuan } from '../jimpitan-actions'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

interface Props {
  tagihanId: string
  kelebihan: number
  kelebihanTujuan: string | null
  kelebihanCatatan: string | null
}

export function KelebihanManager({ tagihanId, kelebihan, kelebihanTujuan, kelebihanCatatan }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [tujuan, setTujuan] = useState(kelebihanTujuan || '')
  const [catatan, setCatatan] = useState(kelebihanCatatan || '')

  if (!(kelebihan > 0)) return null

  const handleSetTujuan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    startTransition(async () => {
      const formData = new FormData()
      formData.set('tagihanId', tagihanId)
      formData.set('tujuan', tujuan)
      if (catatan) formData.set('catatan', catatan)
      const res = await setKelebihanTujuan(formData)
      if (res.success) {
        setOpen(false)
        router.refresh()
      }
    })
  }

  const handlePindahkan = async () => {
    if (!confirm('Yakin ingin memindahkan ke bulan depan?')) return
    startTransition(async () => {
      const res = await pindahkanKelebihanKeBulanDepan(tagihanId)
      if (res.success) {
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
        +{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(kelebihan)}
      </Badge>

      <div className="flex gap-1">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2">
              Atur Tujuan
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Atur Kelebihan</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSetTujuan} className="flex flex-col gap-3">
              <div className="grid gap-2">
                <Label htmlFor="tujuan">Tujuan</Label>
                <Select name="tujuan" value={tujuan} onValueChange={(v) => setTujuan(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih tujuan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BULAN_DEPAN">Dipindahkan ke Bulan Depan</SelectItem>
                    <SelectItem value="HIBAH">Dijadikan Hibah</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="catatan">Catatan (Opsional)</Label>
                <Input
                  id="catatan"
                  name="catatan"
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="Keterangan..."
                />
              </div>
              {kelebihanCatatan && (
                <p className="text-xs text-gray-500">Catatan sebelumnya: {kelebihanCatatan}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Batal
                </Button>
                <Button type="submit" disabled={isPending || !tujuan}>
                  {isPending ? 'Menyimpan...' : 'Simpan'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {kelebihanTujuan === 'BULAN_DEPAN' && (
          <Button
          variant="default"
          size="sm"
          className="text-xs h-7 px-2 bg-green-600"
          onClick={handlePindahkan}
          disabled={isPending}
        >
          {isPending ? 'Memindahkan...' : 'Pindahkan'}
        </Button>
        )}

        {kelebihanTujuan === 'HIBAH' && (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
            Hibah
          </Badge>
        )}
      </div>
    </div>
  )
}
