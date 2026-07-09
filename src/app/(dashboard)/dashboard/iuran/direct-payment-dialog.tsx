'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { formatRupiah } from '@/lib/format'
import { Wallet, AlertCircle, CheckCircle2, Loader2, CreditCard } from 'lucide-react'
import { inputPembayaranLangsung, getWargaPaymentSummary, type WargaPaymentSummary } from './bulk-actions'

interface DirectPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profiles: Array<{ id: string; nama_kk: string; blok: string; nomor_rumah: string; login_id: string; kategori_tarif: string }>
  periode: string
  onSuccess?: () => void
}

export function DirectPaymentDialog({ open, onOpenChange, profiles, periode, onSuccess }: DirectPaymentDialogProps) {
  const [wargaId, setWargaId] = useState('')
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10))
  const [nominal, setNominal] = useState('')
  const [metode, setMetode] = useState('TUNAI')
  const [catatan, setCatatan] = useState('')
  const [summary, setSummary] = useState<WargaPaymentSummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Fetch summary saat warga dipilih
  useEffect(() => {
    if (!wargaId) { setSummary(null); return }
    setLoadingSummary(true)
    getWargaPaymentSummary(wargaId, periode).then(result => {
      setSummary(result.data ?? null)
      setLoadingSummary(false)
    })
  }, [wargaId, periode])

  function handleSubmit() {
    if (!wargaId) { toast.error('Pilih warga terlebih dahulu'); return }
    if (!nominal || Number(nominal) <= 0) { toast.error('Nominal harus lebih dari 0'); return }

    startTransition(async () => {
      const fd = new FormData()
      fd.append('wargaId', wargaId)
      fd.append('tanggalBayar', tanggal)
      fd.append('nominal', nominal)
      fd.append('metode', metode)
      fd.append('catatan', catatan)
      fd.append('autoAllocate', 'true')

      const result = await inputPembayaranLangsung(fd)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Pembayaran ${formatRupiah(Number(nominal))} berhasil dicatat`)
        resetForm()
        onOpenChange(false)
        onSuccess?.()
      }
    })
  }

  function resetForm() {
    setWargaId('')
    setNominal('')
    setCatatan('')
    setSummary(null)
  }

  const selectedProfile = profiles.find(p => p.id === wargaId)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o) }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-1">
            <Wallet className="w-6 h-6 text-emerald-600" />
          </div>
          <DialogTitle className="text-center">Input Pembayaran Langsung</DialogTitle>
          <DialogDescription className="text-center text-xs">
            Penerimaan iuran langsung dari warga ke Bendahara
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Pilih Warga */}
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Warga</label>
            <Select value={wargaId} onOpenChange={(o) => { if (o) setSummary(null) }} onValueChange={setWargaId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih warga..." />
              </SelectTrigger>
              <SelectContent>
                {profiles.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.blok}-{p.nomor_rumah} {p.nama_kk}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ringkasan Warga */}
          {wargaId && loadingSummary && (
            <div className="p-3 bg-slate-50 rounded-lg animate-pulse">
              <p className="text-xs text-slate-400">Memuat ringkasan...</p>
            </div>
          )}
          {summary && !loadingSummary && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">{summary.nama_kk}</span>
                <Badge className={
                  summary.status === 'LUNAS' ? 'bg-emerald-100 text-emerald-700 text-[9px]'
                    : summary.status === 'CICIL' ? 'bg-amber-100 text-amber-700 text-[9px]'
                    : summary.status === 'LEBIH' ? 'bg-blue-100 text-blue-700 text-[9px]'
                    : 'bg-red-100 text-red-700 text-[9px]'
                }>{summary.status}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div><span className="text-slate-500">Target:</span> <span className="font-bold">{formatRupiah(summary.nominal_tagihan)}</span></div>
                <div><span className="text-slate-500">Jimpitan:</span> <span className="font-medium">{formatRupiah(summary.jimpitan_total)}</span></div>
                <div><span className="text-slate-500">Langsung:</span> <span className="font-medium">{formatRupiah(summary.direct_total)}</span></div>
                <div><span className="text-slate-500">Kredit:</span> <span className="font-medium">{formatRupiah(summary.credit_used)}</span></div>
                <div className="col-span-2 border-t border-slate-200 pt-1">
                  <span className="text-slate-500">Total bayar:</span> <span className="font-bold text-emerald-600">{formatRupiah(summary.total_paid)}</span>
                </div>
                {summary.shortage > 0 && (
                  <div className="col-span-2">
                    <span className="text-red-500 font-semibold">Kekurangan: {formatRupiah(summary.shortage)}</span>
                  </div>
                )}
                {summary.credit_balance > 0 && (
                  <div className="col-span-2">
                    <span className="text-purple-500 font-semibold">Saldo kredit: {formatRupiah(summary.credit_balance)}</span>
                  </div>
                )}
              </div>
              {summary.arrears && summary.arrears.length > 0 && (
                <div className="mt-1 p-2 bg-red-50 rounded border border-red-100">
                  <p className="text-[10px] font-semibold text-red-700 mb-1">Tunggakan:</p>
                  {summary.arrears.map((a, i) => (
                    <p key={i} className="text-[10px] text-red-600">
                      {new Date(a.month).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}: kurang {formatRupiah(a.shortage)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tanggal */}
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Tanggal Pembayaran</label>
            <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </div>

          {/* Nominal */}
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Nominal Diterima</label>
            <Input
              type="number"
              value={nominal}
              onChange={(e) => setNominal(e.target.value)}
              placeholder="0"
              min={0}
            />
            {summary && Number(nominal) > 0 && (
              <p className="text-[10px] text-slate-500 mt-1">
                {Number(nominal) >= summary.shortage && summary.shortage > 0
                  ? `✓ Cukup untuk menutup kekurangan ${formatRupiah(summary.shortage)}`
                  : summary.shortage > 0
                  ? `Masih kurang ${formatRupiah(summary.shortage - Number(nominal))} setelah pembayaran ini`
                  : 'Pembayaran ini akan menjadi kelebihan'}
              </p>
            )}
          </div>

          {/* Metode */}
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Metode</label>
            <Select value={metode} onValueChange={setMetode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TUNAI">Tunai</SelectItem>
                <SelectItem value="TRANSFER">Transfer</SelectItem>
                <SelectItem value="LAINNYA">Lainnya</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Catatan */}
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Catatan (opsional)</label>
            <Textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Catatan pembayaran..."
              rows={2}
              className="text-sm"
            />
          </div>

          {/* Info alokasi otomatis */}
          {summary && Number(nominal) > 0 && (
            <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-[10px] font-semibold text-blue-700 mb-1.5">Alokasi Otomatis:</p>
              <div className="space-y-0.5 text-[10px] text-blue-600">
                {summary.arrears && summary.arrears.length > 0 && Number(nominal) > 0 && (
                  <p>1. Tunggakan paling lama (prioritas)</p>
                )}
                <p>{summary.arrears?.length ? '2' : '1'}. Bulan berjalan</p>
                <p>{summary.arrears?.length ? '3' : '2'}. Sisa menjadi saldo kredit</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Batal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !wargaId || !nominal || Number(nominal) <= 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memproses...</>
            ) : (
              <><CheckCircle2 className="w-4 h-4 mr-2" /> Simpan Pembayaran</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
