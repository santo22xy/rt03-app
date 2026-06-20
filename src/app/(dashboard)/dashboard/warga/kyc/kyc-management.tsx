'use client'

import { useState, useMemo, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Check, X, MessageCircle, Loader2, Search, Clock,
  ChevronDown, ChevronUp, XCircle, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { KYC_KELUARGA_LABEL } from '@/lib/types'
import { formatTanggal } from '@/lib/format'
import { verifyKycBulk, rejectKycBulk } from '../kyc-actions'

interface KycPending {
  id: string
  login_id: string
  nama_kk: string
  blok: string
  nomor_rumah: string
  kyc_status: string
  kyc_nama_ktp: string | null
  kyc_status_keluarga: string | null
  kyc_no_wa: string | null
  kyc_nama_istri: string | null
  kyc_nama_anak: string[] | null
  kyc_catatan: string | null
  kyc_submitted_at: string | null
  kyc_verified_at: string | null
  kyc_rejected_reason: string | null
  days_waiting: number
}

interface KycRejected {
  id: string
  login_id: string
  nama_kk: string
  blok: string
  nomor_rumah: string
  kyc_status: string
  kyc_rejected_reason: string | null
  kyc_submitted_at: string | null
}

export function KycManagement({
  pending,
  rejected,
}: {
  pending: KycPending[]
  rejected: KycRejected[]
  actorId: string
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [isPending, startTransition] = useTransition()

  // Filter
  const filteredPending = useMemo(() => {
    if (!search) return pending
    const q = search.toLowerCase()
    return pending.filter(p =>
      p.nama_kk?.toLowerCase().includes(q) ||
      p.login_id?.toLowerCase().includes(q) ||
      p.kyc_nama_ktp?.toLowerCase().includes(q)
    )
  }, [pending, search])

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredPending.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredPending.map(p => p.id)))
    }
  }

  const clearSelection = () => setSelectedIds(new Set())

  // ============================================
  // HANDLERS
  // ============================================
  const handleVerify = () => {
    if (selectedIds.size === 0) {
      toast.error('Pilih minimal 1 warga')
      return
    }

    if (!confirm(`Verifikasi ${selectedIds.size} warga sekaligus?`)) return

    const fd = new FormData()
    fd.append('userIds', JSON.stringify(Array.from(selectedIds)))

    startTransition(async () => {
      const result = await verifyKycBulk(fd)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(result.success ?? 'Berhasil')
        if (result.details?.failed_count) {
          toast.warning(`${result.details.failed_count} gagal diproses`)
        }
        clearSelection()
      }
    })
  }

  const handleReject = () => {
    if (selectedIds.size === 0) {
      toast.error('Pilih minimal 1 warga')
      return
    }
    setRejectOpen(true)
  }

  const submitReject = () => {
    if (rejectReason.trim().length < 5) {
      toast.error('Alasan minimal 5 karakter')
      return
    }

    const fd = new FormData()
    fd.append('userIds', JSON.stringify(Array.from(selectedIds)))
    fd.append('reason', rejectReason.trim())

    startTransition(async () => {
      const result = await rejectKycBulk(fd)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(result.success ?? 'Berhasil')
        clearSelection()
        setRejectOpen(false)
        setRejectReason('')
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* ====== PENDING LIST ====== */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                Menunggu Verifikasi ({pending.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Centang warga lalu klik Verify atau Reject
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {selectedIds.size} dipilih
              </Badge>
              {selectedIds.size > 0 && (
                <Button size="sm" variant="ghost" onClick={clearSelection}>
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama, login ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-3 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-emerald-900">
                {selectedIds.size} dipilih
              </span>
              <div className="flex-1" />
              <Button
                size="sm"
                onClick={handleVerify}
                disabled={isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Verify
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleReject}
                disabled={isPending}
              >
                <X className="w-4 h-4" />
                Reject
              </Button>
            </div>
          )}

          {/* Select all (visible only when ada pending) */}
          {filteredPending.length > 0 && (
            <label className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size === filteredPending.length && filteredPending.length > 0}
                onChange={toggleSelectAll}
                className="rounded"
              />
              <span className="text-xs font-semibold text-slate-700">
                Pilih semua ({filteredPending.length})
              </span>
            </label>
          )}

          {/* List */}
          {filteredPending.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">Tidak ada antrian</p>
              <p className="text-xs text-muted-foreground mt-1">
                Semua warga sudah diverifikasi 🎉
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPending.map(p => {
                const isExpanded = expandedId === p.id
                const isSelected = selectedIds.has(p.id)
                const anak = Array.isArray(p.kyc_nama_anak) ? p.kyc_nama_anak : []
                return (
                  <div
                    key={p.id}
                    className={`border rounded-xl overflow-hidden transition-colors ${
                      isSelected ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-200'
                    }`}
                  >
                    {/* Header row */}
                    <div className="flex items-center gap-3 p-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(p.id)}
                        className="rounded shrink-0"
                        aria-label={`Pilih ${p.nama_kk}`}
                      />
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center font-bold shrink-0">
                        {p.nama_kk?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{p.nama_kk}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          {p.login_id} · {p.blok}-{p.nomor_rumah}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">
                          {p.days_waiting === 0
                            ? 'Hari ini'
                            : `${p.days_waiting} hari`}
                        </Badge>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setExpandedId(isExpanded ? null : p.id)}
                        className="h-8 w-8 shrink-0"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-slate-200 space-y-2 bg-slate-50/50">
                        <DetailRow label="Nama KTP" value={p.kyc_nama_ktp} />
                        <DetailRow
                          label="Status"
                          value={p.kyc_status_keluarga ? KYC_KELUARGA_LABEL[p.kyc_status_keluarga as keyof typeof KYC_KELUARGA_LABEL] : null}
                        />
                        <DetailRow
                          label="WhatsApp"
                          value={p.kyc_no_wa}
                          link={p.kyc_no_wa ? `https://wa.me/${p.kyc_no_wa}` : undefined}
                        />
                        {p.kyc_nama_istri && (
                          <DetailRow label="Istri" value={p.kyc_nama_istri} />
                        )}
                        {anak.length > 0 && (
                          <DetailRow label="Anak" value={anak.join(', ')} />
                        )}
                        {p.kyc_catatan && (
                          <DetailRow label="Catatan" value={p.kyc_catatan} />
                        )}
                        <DetailRow
                          label="Submit"
                          value={p.kyc_submitted_at ? formatTanggal(p.kyc_submitted_at) : null}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ====== REJECTED LIST ====== */}
      {rejected.length > 0 && (
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-600" />
              Ditolak ({rejected.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Warga yang pengajuannya ditolak. Mereka bisa submit ulang.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rejected.map(r => (
                <div key={r.id} className="border border-red-200 bg-red-50/50 rounded-xl p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold shrink-0">
                      {r.nama_kk?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{r.nama_kk}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {r.login_id} · {r.blok}-{r.nomor_rumah}
                      </p>
                      {r.kyc_rejected_reason && (
                        <p className="text-xs text-red-700 mt-1.5">
                          <span className="font-semibold">Alasan:</span> {r.kyc_rejected_reason}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog: Reject reason */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Tolak Pengajuan
            </DialogTitle>
            <DialogDescription>
              {selectedIds.size} warga akan di-reject. Wajib isi alasan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold">Alasan Penolakan</label>
            <Textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Contoh: Foto KTP tidak terbaca, mohon upload ulang yang lebih jelas"
              rows={4}
              maxLength={500}
            />
            <p className="text-[10px] text-muted-foreground">
              Alasan akan ditampilkan ke warga di halaman KYC mereka
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={submitReject}
              disabled={isPending || rejectReason.trim().length < 5}
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              Tolak {selectedIds.size} Warga
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailRow({
  label, value, link,
}: {
  label: string
  value: string | null | undefined
  link?: string
}) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <span className="text-slate-500 font-semibold uppercase tracking-wider shrink-0 text-[10px]">
        {label}
      </span>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-emerald-600 hover:underline font-medium text-right"
        >
          <MessageCircle className="w-3 h-3" />
          {value}
        </a>
      ) : (
        <span className="text-slate-900 font-medium text-right break-words">
          {value ?? '-'}
        </span>
      )}
    </div>
  )
}
