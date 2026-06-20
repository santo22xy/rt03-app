'use client'

import { useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { pengurusBuatSesi } from '../jimpitan-actions'

// Client Component khusus untuk form "Buat Sesi" pengurus.
// Form ini dipisah dari Server Component parent karena:
// 1. Server Component dengan <form action={serverAction}> kadang bermasalah
//    dengan DialogContext + hydration di Next.js 14 (form submit "diam"
//    tanpa feedback — symptom yang user lihat).
// 2. useTransition memberi loading state yang reliable di tombol submit.
// 3. Server action return {success, error, sesiId} → kita bisa toast
//    + redirect manual, sehingga ada feedback jelas ke user.
export function BuatSesiForm({
  children,
  roleLabel,
}: {
  children: ReactNode
  roleLabel: string
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await pengurusBuatSesi(formData)
      if (result.error && !result.success) {
        // Error murni
        toast.error('Gagal membuat sesi', {
          description: result.error,
        })
        return
      }
      if (result.success && result.sesiId) {
        if (result.error) {
          // Warning: sesi sudah ada
          toast.warning('Sesi sudah ada', {
            description: result.error,
          })
        } else {
          // Sukses buat baru
          toast.success('Sesi berhasil dibuat!', {
            description: 'Membuka halaman input jimpitan...',
          })
        }
        // Navigasi ke list page (lebih reliable daripada detail page di dev mode)
        // User bisa klik sesi dari list. Atau jika sesiId valid, coba detail dulu.
        const target = result.sesiId
          ? `/dashboard/jimpitan/${result.sesiId}`
          : '/dashboard/jimpitan'
        router.push(target)
        router.refresh()
      }
    })
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      {children}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
      >
        {pending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Membuat Sesi...
          </>
        ) : (
          <>
            <UserPlus className="w-4 h-4" />
            Buat Sesi (Mode {roleLabel})
          </>
        )}
      </button>

      <p className="text-[10px] text-amber-700 text-center">
        Setelah dibuat, sesi akan masuk ke list di bawah dan bisa langsung dibuka untuk input.
      </p>
    </form>
  )
}