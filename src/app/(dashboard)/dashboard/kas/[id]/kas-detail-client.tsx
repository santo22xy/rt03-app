'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, XCircle } from 'lucide-react'
import { accSesi, rejectSesi } from '../../jimpitan-actions'

function AksiACC({ sesiId }: { sesiId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showReject, setShowReject] = useState(false)
  const [alasan, setAlasan] = useState('')

  function handleAcc() {
    if (!confirm('ACC sesi ini? Total akan masuk ke kas dan tagihan warga terupdate.')) return
    startTransition(async () => {
      const res = await accSesi(sesiId)
      if (res?.error) {
        alert(res.error)
      } else {
        alert('✅ Sesi berhasil disetujui. Pendapatan masuk kas.')
        router.refresh()
      }
    })
  }

  function handleReject() {
    if (!alasan.trim()) {
      alert('Mohon isi alasan penolakan')
      return
    }
    if (!confirm('Tolak sesi ini? Sesi akan dikembalikan ke petugas untuk revisi.')) return
    startTransition(async () => {
      const res = await rejectSesi(sesiId, alasan)
      if (res?.error) {
        alert(res.error)
      } else {
        alert('Sesi dikembalikan ke petugas')
        setShowReject(false)
        router.refresh()
      }
    })
  }

  return (
    <Card className="border-0 shadow-md ring-1 ring-emerald-300/60 bg-gradient-to-r from-emerald-50 to-teal-50">
      <CardContent className="p-4 space-y-3">
        <p className="text-xs font-bold uppercase text-emerald-700">Tindakan Bendahara</p>
        {showReject ? (
          <div className="space-y-2">
            <Textarea
              placeholder="Alasan penolakan (wajib)"
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                onClick={handleReject}
                disabled={isPending}
                variant="destructive"
                size="sm"
                className="flex-1"
              >
                <XCircle className="w-4 h-4" />
                Konfirmasi Tolak
              </Button>
              <Button
                onClick={() => {
                  setShowReject(false)
                  setAlasan('')
                }}
                size="sm"
                variant="outline"
                className="flex-1"
              >
                Batal
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={handleAcc}
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isPending ? 'Memproses...' : 'ACC'}
            </Button>
            <Button
              onClick={() => setShowReject(true)}
              disabled={isPending}
              variant="outline"
              className="border-rose-300 text-rose-600 hover:bg-rose-50"
            >
              <XCircle className="w-4 h-4" />
              Tolak
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export const KasDetailClient = { AksiACC }
