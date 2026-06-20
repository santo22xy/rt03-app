'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { HandCoins, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { daftarJadiInputter } from '@/app/(dashboard)/dashboard/jimpitan-actions'

export function DaftarInputter({ tanggal }: { tanggal: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDaftar() {
    setOpen(false)
    startTransition(async () => {
      const promise = daftarJadiInputter(tanggal)
      toast.promise(promise, {
        loading: 'Mendaftarkan Anda sebagai petugas...',
        success: (res) => {
          if (res?.error) throw new Error(res.error)
          if (res?.success && res.sesiId) {
            // Alihkan ke form input setelah toast sukses muncul
            setTimeout(() => router.push(`/warga/jimpitan/${res.sesiId}`), 600)
            return 'Berhasil terdaftar! Mengalihkan ke form input...'
          }
          throw new Error('Respons tidak valid dari server')
        },
        error: (err) => err?.message || 'Gagal mendaftar',
      })
    })
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="bg-white text-emerald-700 hover:bg-emerald-50 font-semibold"
      >
        <HandCoins className="w-4 h-4" />
        Daftar Jadi Petugas
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-1">
              <HandCoins className="w-6 h-6 text-emerald-700" />
            </div>
            <DialogTitle className="text-center">Daftar Jadi Petugas?</DialogTitle>
            <DialogDescription className="text-center">
              Anda akan terdaftar sebagai petugas input jimpitan untuk sesi malam ini.
              Pastikan Anda benar-benar akan menjalankan ronda malam ini.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleDaftar}
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Mendaftar...
                </>
              ) : (
                <>
                  <HandCoins className="w-4 h-4" />
                  Ya, Daftar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
