'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { syncDanaKhususParticipants } from '../dana-khusus-actions'

export function SyncPesertaButton({ danaKhususId }: { danaKhususId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleSync() {
    startTransition(async () => {
      const result = await syncDanaKhususParticipants(danaKhususId)
      if (result.error) {
        toast.error(result.error)
      } else if (result.added === 0) {
        toast.info('Semua warga aktif sudah terdaftar')
      } else {
        toast.success(`${result.added} warga baru berhasil ditambahkan`)
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
      {isPending ? 'Menyinkronkan...' : 'Sinkronkan Peserta'}
    </Button>
  )
}
