'use client'

import { useState, useTransition } from 'react'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { updateDanaKhusus } from './dana-khusus-actions'

type Props = {
  dana: {
    id: string
    judul: string
    deskripsi: string | null
    kategori: string
    target_per_kk: number
    target_per_kk_khusus: number | null
    tanggal_mulai: string
    tanggal_selesai: string
    is_wajib: boolean
    is_active: boolean
  }
}

export function PengaturanDanaKhusus({ dana }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Form state (pre-filled dari props)
  const [judul, setJudul] = useState(dana.judul)
  const [deskripsi, setDeskripsi] = useState(dana.deskripsi ?? '')
  const [kategori, setKategori] = useState(dana.kategori)
  const [targetPerKk, setTargetPerKk] = useState(String(dana.target_per_kk))
  const [targetPerKkKhusus, setTargetPerKkKhusus] = useState(
    dana.target_per_kk_khusus != null && dana.target_per_kk_khusus !== dana.target_per_kk
      ? String(dana.target_per_kk_khusus)
      : ''
  )
  const [tanggalMulai, setTanggalMulai] = useState(dana.tanggal_mulai.slice(0, 10))
  const [tanggalSelesai, setTanggalSelesai] = useState(dana.tanggal_selesai.slice(0, 10))
  const [isWajib, setIsWajib] = useState(dana.is_wajib)
  const [isActive, setIsActive] = useState(dana.is_active)

  // Reset state saat dialog dibuka (kalau ada perubahan sebelumnya di-cancel)
  function handleOpenChange(next: boolean) {
    if (next) {
      setJudul(dana.judul)
      setDeskripsi(dana.deskripsi ?? '')
      setKategori(dana.kategori)
      setTargetPerKk(String(dana.target_per_kk))
      setTargetPerKkKhusus(
        dana.target_per_kk_khusus != null && dana.target_per_kk_khusus !== dana.target_per_kk
          ? String(dana.target_per_kk_khusus)
          : ''
      )
      setTanggalMulai(dana.tanggal_mulai.slice(0, 10))
      setTanggalSelesai(dana.tanggal_selesai.slice(0, 10))
      setIsWajib(dana.is_wajib)
      setIsActive(dana.is_active)
    }
    setOpen(next)
  }

  function handleSubmit() {
    const fd = new FormData()
    fd.append('id', dana.id)
    fd.append('judul', judul)
    fd.append('deskripsi', deskripsi)
    fd.append('kategori', kategori)
    fd.append('target_per_kk', targetPerKk)
    fd.append('target_per_kk_khusus', targetPerKkKhusus)
    fd.append('tanggal_mulai', tanggalMulai)
    fd.append('tanggal_selesai', tanggalSelesai)
    fd.append('is_wajib', String(isWajib))
    fd.append('is_active', String(isActive))

    startTransition(async () => {
      const res = await updateDanaKhusus(fd)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success('Pengaturan dana khusus berhasil disimpan')
      setOpen(false)
    })
  }

  const targetChanged = Number(targetPerKk) !== dana.target_per_kk
  const targetKhususChanged = Number(targetPerKkKhusus || targetPerKk) !== (dana.target_per_kk_khusus ?? dana.target_per_kk)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="w-4 h-4" />
            Pengaturan
          </Button>
        }
      />
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center">
              <Settings className="w-5 h-5 text-pink-700" />
            </div>
            <div>
              <DialogTitle>Pengaturan Dana Khusus</DialogTitle>
              <DialogDescription>
                Ubah judul, nominal iuran per KK, tanggal, dan status pengumpulan.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="edit-judul" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
              Judul *
            </Label>
            <Input
              id="edit-judul"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <div>
              <Label htmlFor="edit-kategori" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                Kategori
              </Label>
              <select
                id="edit-kategori"
                value={kategori}
                onChange={(e) => setKategori(e.target.value)}
                disabled={isPending}
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
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="edit-target" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                Iuran / KK Normal *
              </Label>
              <Input
                id="edit-target"
                type="number"
                min={0}
                value={targetPerKk}
                onChange={(e) => setTargetPerKk(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div>
              <Label htmlFor="edit-target-khusus" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                Iuran / KK Khusus
              </Label>
              <Input
                id="edit-target-khusus"
                type="number"
                min={0}
                placeholder={`Default: Rp ${Number(targetPerKk || 0).toLocaleString('id-ID')}`}
                value={targetPerKkKhusus}
                onChange={(e) => setTargetPerKkKhusus(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          {(targetChanged || targetKhususChanged) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Perubahan nominal iuran</p>
                <p>Nominal seluruh tagihan warga akan disesuaikan ke nilai baru (Normal / Khusus) secara konsisten, <strong>termasuk yang sudah mencicil</strong>. Sisa &amp; status dihitung ulang otomatis dari riwayat pembayaran.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="edit-mulai" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                Tanggal Mulai *
              </Label>
              <Input
                id="edit-mulai"
                type="date"
                value={tanggalMulai}
                onChange={(e) => setTanggalMulai(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div>
              <Label htmlFor="edit-selesai" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                Tanggal Selesai *
              </Label>
              <Input
                id="edit-selesai"
                type="date"
                value={tanggalSelesai}
                onChange={(e) => setTanggalSelesai(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="edit-deskripsi" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
              Deskripsi (opsional)
            </Label>
            <textarea
              id="edit-deskripsi"
              rows={2}
              placeholder="Penjelasan singkat..."
              value={deskripsi}
              onChange={(e) => setDeskripsi(e.target.value)}
              disabled={isPending}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
              <input
                type="checkbox"
                checked={isWajib}
                onChange={(e) => setIsWajib(e.target.checked)}
                disabled={isPending}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">
                <span className="font-semibold">Sukarela</span>{' '}
                <span className="text-muted-foreground">(centang jika iuran sukarela, biasanya Merti Desa)</span>
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={isPending}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">
                <span className="font-semibold">Aktif</span>{' '}
                <span className="text-muted-foreground">(nonaktifkan untuk tutup pengumpulan tanpa hapus data)</span>
              </span>
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !judul || !targetPerKk}
            className="bg-pink-600 hover:bg-pink-700 text-white"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Menyimpan...
              </>
            ) : (
              <>
                <Settings className="w-4 h-4 mr-2" />
                Simpan Pengaturan
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}