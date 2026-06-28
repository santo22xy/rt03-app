'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ShieldCheck, XCircle, ArrowRight, AlertTriangle, Loader2,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { accSesi, rejectSesi } from '../jimpitan-actions'
import { formatRupiah, formatTanggal } from '@/lib/format'

type Sesi = {
  id: string
  tanggal: string
  status: string
  total_nominal: number | null
  total_pendapatan: number | null
  jumlah_warga_bayar: number | null
  jumlah_penjaga_hadir: number | null
  nama_inputter_snapshot: string
  waktu_submit: string | null
}

export function PendingAccList({
  sesiList,
  currentUserRole,
  currentUserName,
}: {
  sesiList: Sesi[]
  currentUserRole: string
  currentUserName: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [accOpen, setAccOpen] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState<string | null>(null)
  const [rejectAlasan, setRejectAlasan] = useState('')

  const canValidate = ['BENDAHARA', 'KETUA_RT', 'SUPERADMIN'].includes(currentUserRole)
  if (!canValidate || sesiList.length === 0) return null

  function doAcc(sesiId: string) {
    setAccOpen(null)
    startTransition(async () => {
      const res = await accSesi(sesiId)
      if (res?.error) toast.error(res.error)
      else {
        toast.success('✅ Sesi berhasil di-ACC')
        router.refresh()
      }
    })
  }

  function doReject(sesiId: string) {
    if (!rejectAlasan.trim()) {
      toast.error('Alasan penolakan wajib diisi')
      return
    }
    setRejectOpen(null)
    const alasan = rejectAlasan
    setRejectAlasan('')
    startTransition(async () => {
      const res = await rejectSesi(sesiId, alasan)
      if (res?.error) toast.error(res.error)
      else {
        toast.success('Sesi dikembalikan ke AKTIF untuk direvisi')
        router.refresh()
      }
    })
  }

  return (
    <>
      <Card className="border-0 shadow-lg ring-2 ring-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-3 flex items-center gap-2 text-white">
          <ShieldCheck className="w-5 h-5" />
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-90">
              Panel Validasi Bendahara
            </p>
            <p className="text-base font-bold leading-tight">
              {sesiList.length} sesi menunggu ACC Anda
            </p>
          </div>
        </div>
        <CardContent className="p-4 space-y-3">
          {sesiList.map((s) => {
            const total = Number(s.total_pendapatan ?? s.total_nominal ?? 0)
            return (
              <div
                key={s.id}
                className="bg-white rounded-xl border-2 border-amber-200 p-3 shadow-sm hover:shadow-md hover:border-amber-400 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="text-center shrink-0 w-12">
                    <p className="text-[9px] font-bold uppercase text-amber-700">
                      {new Date(s.tanggal).toLocaleString('id-ID', { month: 'short' })}
                    </p>
                    <p className="text-xl font-bold leading-none text-amber-900">
                      {new Date(s.tanggal).getDate()}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <p className="font-semibold text-sm text-slate-900">
                        {formatTanggal(s.tanggal)}
                      </p>
                      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-[9px]">
                        🔵 Submitted
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      👤 {s.nama_inputter_snapshot}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs">
                      <span className="font-bold text-emerald-700">
                        💰 {formatRupiah(total)}
                      </span>
                      <span className="text-slate-500">
                        👥 {s.jumlah_warga_bayar ?? 0} KK
                      </span>
                      <span className="text-slate-500">
                        🛡️ {s.jumlah_penjaga_hadir ?? 0} hadir
                      </span>
                    </div>
                    {s.waktu_submit && (
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        ⏰ Disubmit: {new Date(s.waktu_submit).toLocaleString('id-ID', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Tombol Aksi */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => setRejectOpen(s.id)}
                    className="border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800 hover:border-rose-400"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Tolak
                  </Button>
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => setAccOpen(s.id)}
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md shadow-emerald-500/30"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    ACC Sekarang
                  </Button>
                </div>
                <Link
                  href={`/dashboard/jimpitan/${s.id}`}
                  className="flex items-center justify-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 mt-2 hover:underline"
                >
                  Buka detail lengkap untuk review
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )
          })}

          <div className="flex items-start gap-2 p-2 bg-amber-100/60 border border-amber-300 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-800 leading-relaxed">
              Klik <span className="font-bold">ACC Sekarang</span> untuk langsung menyetujui sesi,
              atau <span className="font-bold">Buka detail lengkap</span> untuk review data per-warga
              sebelum ACC.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Dialog ACC */}
      <Dialog open={!!accOpen} onOpenChange={(o) => !o && setAccOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-1 shadow-lg shadow-emerald-500/30">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <DialogTitle className="text-center">Konfirmasi ACC Sesi</DialogTitle>
            <DialogDescription className="text-center">
              {accOpen && (() => {
                const s = sesiList.find((x) => x.id === accOpen)
                return s ? formatTanggal(s.tanggal) : ''
              })()}
            </DialogDescription>
          </DialogHeader>

          {accOpen && (() => {
            const s = sesiList.find((x) => x.id === accOpen)
            if (!s) return null
            const total = Number(s.total_pendapatan ?? s.total_nominal ?? 0)
            return (
              <div className="space-y-3 my-2">
                <div className="p-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl">
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">
                    Total yang akan masuk kas
                  </p>
                  <p className="text-2xl font-bold leading-tight mt-0.5">{formatRupiah(total)}</p>
                  <p className="text-[11px] opacity-90 mt-1">
                    {s.jumlah_warga_bayar ?? 0} KK bayar · {s.jumlah_penjaga_hadir ?? 0} penjaga hadir
                  </p>
                </div>

                <div className="flex items-start gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-emerald-800 leading-relaxed">
                    <p className="font-semibold mb-0.5">Setelah ACC:</p>
                    <ul className="space-y-0.5 list-disc list-inside">
                      <li>Total <strong>{formatRupiah(total)}</strong> masuk ke kas RT sebagai pemasukan resmi</li>
                      <li>Sesi terkunci — tidak bisa diubah lagi</li>
                      <li>{currentUserName ? `${currentUserName} (${currentUserRole})` : 'Anda'} tercatat sebagai validator</li>
                    </ul>
                  </div>
                </div>
              </div>
            )
          })()}

          <DialogFooter className="sm:justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAccOpen(null)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={() => accOpen && doAcc(accOpen)}
              disabled={isPending}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Ya, ACC Sesi
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Tolak */}
      <Dialog open={!!rejectOpen} onOpenChange={(o) => !o && setRejectOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-rose-400 to-red-600 flex items-center justify-center mb-1 shadow-lg shadow-rose-500/30">
              <XCircle className="w-7 h-7 text-white" />
            </div>
            <DialogTitle className="text-center">Tolak & Minta Revisi</DialogTitle>
            <DialogDescription className="text-center">
              Sesi akan dikembalikan ke AKTIF agar petugas bisa memperbaikinya
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Alasan penolakan <span className="text-rose-600">*</span>
              </label>
              <Textarea
                value={rejectAlasan}
                onChange={(e) => setRejectAlasan(e.target.value)}
                placeholder="Misal: Nominal Budi B-5 salah hitung, mohon dikoreksi."
                rows={4}
                className="text-sm"
                autoFocus
              />
            </div>
            <div className="flex items-start gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-800 leading-relaxed">
                Tolak hanya mengembalikan status ke AKTIF, data tetap aman.
              </p>
            </div>
          </div>

          <DialogFooter className="sm:justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectOpen(null)
                setRejectAlasan('')
              }}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={() => rejectOpen && doReject(rejectOpen)}
              disabled={isPending || !rejectAlasan.trim()}
              variant="destructive"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />
                  Tolak Sesi
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}