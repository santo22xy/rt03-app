'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Wallet } from 'lucide-react'
import { DirectPaymentDialog } from './direct-payment-dialog'

interface DirectPaymentButtonProps {
  profiles: Array<{ id: string; nama_kk: string; blok: string; nomor_rumah: string; login_id: string; kategori_tarif: string }>
  periode: string
}

export function DirectPaymentButton({ profiles, periode }: DirectPaymentButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-xs"
      >
        <Wallet className="w-3.5 h-3.5 mr-1.5" />
        Bayar Langsung
      </Button>
      <DirectPaymentDialog
        open={open}
        onOpenChange={setOpen}
        profiles={profiles}
        periode={periode}
        onSuccess={() => window.location.reload()}
      />
    </>
  )
}
