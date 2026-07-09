'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { syncKategoriWarga } from './bulk-actions'

export function SyncKategoriButton({ periode }: { periode?: string }) {
  const [isPending, startTransition] = useTransition()

  function handleSync() {
    startTransition(async () => {
      const result = await syncKategoriWarga(periode)
      if (result.error) {
        toast.error(result.error)
      } else if (result.updated === 0) {
        toast.info('Semua kategori sudah sesuai')
      } else {
        toast.success(`${result.updated} kategori warga berhasil diperbarui`)
      }
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={isPending}
      className="text-xs"
    >
      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isPending ? 'animate-spin' : ''}`} />
      {isPending ? 'Menyinkronkan...' : 'Sinkronkan Kategori'}
    </Button>
  )
}
