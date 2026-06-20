'use client'

import { useState, useTransition, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Check, ChevronDown, ChevronUp, Search, MessageCircle,
  Save, Users, Shield, Copy, ArrowLeftRight, Lock, Loader2, Crown
} from 'lucide-react'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { toast } from 'sonner'
import {
  updateJimpitanDetail, bulkSetBelumBayar, toggleKehadiran,
  submitSesi, swapPenjaga, swapAnggota
} from '../../jimpitan-actions'

type Profile = {
  id: string
  nama_kk: string
  blok: string
  nomor_rumah: string
  login_id: string
  kategori_tarif: string
}

type Detail = {
  profile_id: string
  nominal: number
  is_bayar: boolean
}

type Attendance = {
  profile_id: string
  is_pengganti: boolean
  pengganti_dari_nama: string | null
}

type PenjagaJadwal = {
  profile_efektif_id: string
  nama_efektif: string
  nama_asli: string
  is_swapped: boolean
  profile_asli_id: string
} | null

type AnggotaKelompok = {
  id: string
  kelompok_id: string
  profile_id: string
  nama_kk_snapshot: string
  role_kelompok: string
  urutan: number
}

export function JimpitanForm({
  sesiId,
  tanggal,
  status,
  namaInputter,
  profiles,
  existingDetails,
  attendance,
  penjagaJadwal,
  anggotaKelompok,
  keadaan: initialKeadaan,
  catatan: initialCatatan,
}: {
  sesiId: string
  tanggal: string
  status: string
  namaInputter: string
  profiles: Profile[]
  existingDetails: Detail[]
  attendance: Attendance[]
  penjagaJadwal: PenjagaJadwal
  anggotaKelompok: AnggotaKelompok[]
  keadaan: string
  catatan: string | null
}) {
  const isLocked = status === 'APPROVED' || status === 'SUBMITTED'
  const [isPending, startTransition] = useTransition()

  // State: detail jimpitan
  const [details, setDetails] = useState<Record<string, { nominal: number; is_bayar: boolean }>>(() => {
    const m: Record<string, { nominal: number; is_bayar: boolean }> = {}
    existingDetails.forEach((d) => {
      m[d.profile_id] = { nominal: Number(d.nominal), is_bayar: d.is_bayar }
    })
    return m
  })

  // State: attendance
  const [att, setAtt] = useState<Set<string>>(() => {
    return new Set(attendance.map((a) => a.profile_id))
  })

  // State: search & filter
  const [search, setSearch] = useState('')
  const [expandedBlok, setExpandedBlok] = useState<Set<string>>(() => new Set(['A', 'B', 'C', 'D']))
  const [showSwap, setShowSwap] = useState(false)
  const [absenExpanded, setAbsenExpanded] = useState(true)
  const [swapTarget, setSwapTarget] = useState<AnggotaKelompok | null>(null) // anggota yg mau di-swap (null = ketua)
  const [keadaan, setKeadaan] = useState(initialKeadaan || 'AMAN')
  const [catatan, setCatatan] = useState(initialCatatan || '')
  const [swapProfileAsliId, setSwapProfileAsliId] = useState(penjagaJadwal?.profile_asli_id || '')
  const [swapPenggantiId, setSwapPenggantiId] = useState('')
  const [swapKeterangan, setSwapKeterangan] = useState('')

  // Group profiles by blok
  const grouped = useMemo(() => {
    const g: Record<string, Profile[]> = {}
    profiles
      .filter((p) => p.nama_kk.toLowerCase().includes(search.toLowerCase()) || p.login_id.toLowerCase().includes(search.toLowerCase()))
      .forEach((p) => {
        if (!g[p.blok]) g[p.blok] = []
        g[p.blok].push(p)
      })
    return g
  }, [profiles, search])

  // Hitung jumlah yang hadir (untuk badge counter)
  const attCount = useMemo(() => {
    if (anggotaKelompok.length > 0) {
      return anggotaKelompok.filter((a) => att.has(a.profile_id)).length
    }
    return penjagaJadwal && att.has(penjagaJadwal.profile_efektif_id) ? 1 : 0
  }, [att, anggotaKelompok, penjagaJadwal])

  // Compute total
  const totalNominal = useMemo(() => {
    return Object.values(details).reduce((s, d) => s + (d.is_bayar ? d.nominal : 0), 0)
  }, [details])

  const jumlahBayar = useMemo(() => {
    return Object.values(details).filter((d) => d.is_bayar).length
  }, [details])

  function toggleBlok(blok: string) {
    const s = new Set(expandedBlok)
    if (s.has(blok)) s.delete(blok)
    else s.add(blok)
    setExpandedBlok(s)
  }

  function updateDetail(profileId: string, nominal: number, isBayar: boolean) {
    setDetails((prev) => ({ ...prev, [profileId]: { nominal, is_bayar: isBayar } }))
  }

  function saveDetail(profileId: string) {
    const d = details[profileId]
    if (!d) return
    const profile = profiles.find((p) => p.id === profileId)
    const profileName = profile?.nama_kk ?? 'Warga'
    startTransition(async () => {
      const fd = new FormData()
      fd.append('sesiId', sesiId)
      fd.append('profileId', profileId)
      fd.append('nominal', String(d.nominal))
      fd.append('isBayar', String(d.is_bayar))
      const res = await updateJimpitanDetail(fd)
      if (res?.error) toast.error(res.error)
      else if (res?.success) toast.success(`${profileName} tersimpan (${formatRupiah(d.nominal)})`)
    })
  }

  const [bulkBelumOpen, setBulkBelumOpen] = useState(false)

  function handleBulkBelum() {
    setBulkBelumOpen(false)
    startTransition(async () => {
      const res = await bulkSetBelumBayar(sesiId)
      if (res?.error) {
        toast.error(res.error)
      } else {
        // Reset local state
        const newDetails: Record<string, { nominal: number; is_bayar: boolean }> = {}
        profiles.forEach((p) => {
          newDetails[p.id] = { nominal: 0, is_bayar: false }
        })
        setDetails(newDetails)
        toast.success('Semua warga ditandai BELUM BAYAR')
      }
    })
  }

  function toggleAtt(profileId: string) {
    const isHadir = !att.has(profileId)
    const profile = profiles.find((p) => p.id === profileId)
    const profileName = profile?.nama_kk ?? 'Warga'
    startTransition(async () => {
      const fd = new FormData()
      fd.append('sesiId', sesiId)
      fd.append('profileId', profileId)
      fd.append('isHadir', String(isHadir))
      const res = await toggleKehadiran(fd)
      if (res?.error) {
        toast.error(res.error)
      } else {
        setAtt((prev) => {
          const s = new Set(prev)
          if (isHadir) s.add(profileId)
          else s.delete(profileId)
          return s
        })
        toast.success(isHadir ? `${profileName} ditandai hadir` : `${profileName} dihapus dari hadir`)
      }
    })
  }

  function handleSwap() {
    if (!swapProfileAsliId || !swapPenggantiId) {
      toast.error('Pilih penjaga asli dan pengganti')
      return
    }
    if (swapProfileAsliId === swapPenggantiId) {
      toast.error('Penjaga asli dan pengganti tidak boleh sama')
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.append('sesiId', sesiId)
      fd.append('profileAsliId', swapProfileAsliId)
      fd.append('profilePenggantiId', swapPenggantiId)
      fd.append('keterangan', swapKeterangan)
      const res = await swapPenjaga(fd)
      if (res?.error) {
        toast.error(res.error)
      } else {
        setShowSwap(false)
        toast.success('Penggantian penjaga berhasil dicatat')
      }
    })
  }

  function handleAnggotaSwap() {
    if (!swapTarget) {
      toast.error('Pilih anggota yang akan diganti')
      return
    }
    if (!swapPenggantiId) {
      toast.error('Pilih pengganti')
      return
    }
    if (swapTarget.profile_id === swapPenggantiId) {
      toast.error('Anggota asli dan pengganti tidak boleh sama')
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.append('sesiId', sesiId)
      fd.append('profileAsliId', swapTarget.profile_id)
      fd.append('profilePenggantiId', swapPenggantiId)
      fd.append('keterangan', swapKeterangan)
      const res = await swapAnggota(fd)
      if (res?.error) {
        toast.error(res.error)
      } else {
        setSwapTarget(null)
        setSwapPenggantiId('')
        setSwapKeterangan('')
        toast.success('Penggantian anggota berhasil dicatat')
      }
    })
  }

  const [submitOpen, setSubmitOpen] = useState(false)

  function doSubmit() {
    setSubmitOpen(false)
    startTransition(async () => {
      const fd = new FormData()
      fd.append('sesiId', sesiId)
      fd.append('keadaan', keadaan)
      fd.append('catatan', catatan)
      const res = await submitSesi(fd)
      if (res?.error) toast.error(res.error)
      else toast.success('Sesi berhasil disubmit. Menunggu ACC Bendahara.')
    })
  }

  function handleSubmit() {
    if (jumlahBayar === 0) {
      // Tampilkan dialog konfirmasi kalau belum ada yg bayar
      setSubmitOpen(true)
      return
    }
    setSubmitOpen(true)
  }

  // Generate chat format
  const chatFormat = useMemo(() => {
    const lines: string[] = []
    lines.push(`*LAPORAN JIMPITAN ${formatTanggal(tanggal)}*`)
    lines.push('')
    lines.push(`📅 ${formatTanggal(tanggal)}`)
    lines.push(`👤 Petugas: ${namaInputter}`)
    lines.push(`🛡️ Penjaga: ${penjagaJadwal?.nama_efektif || '-'}${penjagaJadwal?.is_swapped ? ` (pengganti ${penjagaJadwal.nama_asli})` : ''}`)
    lines.push(`🟢 Keadaan: ${keadaan}`)
    if (catatan) {
      lines.push(`📝 Catatan: ${catatan}`)
    }
    lines.push('')
    lines.push(`*RINGKASAN:*`)
    lines.push(`• Total: ${formatRupiah(totalNominal)}`)
    lines.push(`• Bayar: ${jumlahBayar} KK`)
    lines.push(`• Penjaga hadir: ${att.size} orang`)
    lines.push('')
    lines.push(`*DAFTAR YANG BAYAR:*`)
    profiles
      .filter((p) => details[p.id]?.is_bayar)
      .forEach((p) => {
        lines.push(`• ${p.nama_kk} (${p.login_id}) - ${formatRupiah(details[p.id]?.nominal || 0)}`)
      })
    if (jumlahBayar === 0) {
      lines.push('(Tidak ada yang bayar)')
    }
    return lines.join('\n')
  }, [tanggal, namaInputter, penjagaJadwal, keadaan, catatan, totalNominal, jumlahBayar, att.size, details, profiles])

  const [copied, setCopied] = useState(false)
  function copyChat() {
    navigator.clipboard.writeText(chatFormat)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      {/* Penjaga Jadwal + Absen Anggota (gabungan) */}
      {(penjagaJadwal || anggotaKelompok.length > 0) && (
        <Card className="border-0 shadow-md ring-1 ring-purple-200/60 bg-gradient-to-br from-purple-50 via-violet-50 to-fuchsia-50 overflow-hidden">
          <CardContent className="p-4 space-y-3">
            {/* Header: info ketua + Swap button */}
            {penjagaJadwal && (
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="w-4 h-4 text-purple-600" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                      Penjaga Jadwal · K{anggotaKelompok[0]?.kelompok_id?.replace('K','') ?? '-'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <p className="font-semibold text-sm">{penjagaJadwal.nama_efektif}</p>
                    {penjagaJadwal.is_swapped && (
                      <Badge className="bg-rose-100 text-rose-700 text-[9px] hover:bg-rose-100">
                        Pengganti
                      </Badge>
                    )}
                  </div>
                  {penjagaJadwal.is_swapped && (
                    <p className="text-[11px] text-purple-600 mt-0.5">
                      Menggantikan {penjagaJadwal.nama_asli}
                    </p>
                  )}
                </div>
                {!isLocked && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSwap(!showSwap)}
                    className="shrink-0"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    Swap
                  </Button>
                )}
              </div>
            )}

            {showSwap && penjagaJadwal && (
              <div className="pt-3 border-t border-purple-200 space-y-2">
                <p className="text-xs font-semibold text-purple-900">Penggantian Penjaga</p>
                <select
                  value={swapProfileAsliId}
                  onChange={(e) => setSwapProfileAsliId(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                >
                  <option value="">P penjaga asli...</option>
                  <option value={penjagaJadwal.profile_asli_id}>
                    {penjagaJadwal.nama_asli} (sesuai jadwal)
                  </option>
                </select>
                <select
                  value={swapPenggantiId}
                  onChange={(e) => setSwapPenggantiId(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                >
                  <option value="">Pilih pengganti...</option>
                  {profiles
                    .filter((p) => p.id !== swapProfileAsliId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nama_kk} ({p.login_id})
                      </option>
                    ))}
                </select>
                <Input
                  placeholder="Alasan (opsional)"
                  value={swapKeterangan}
                  onChange={(e) => setSwapKeterangan(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button onClick={handleSwap} size="sm" disabled={isPending} className="flex-1">
                    Simpan Swap
                  </Button>
                  <Button onClick={() => setShowSwap(false)} size="sm" variant="outline">
                    Batal
                  </Button>
                </div>
              </div>
            )}

            {/* Checklist absen anggota (collapsible) */}
            {!isLocked && anggotaKelompok.length > 0 && (
              <div className="pt-3 border-t border-purple-200">
                <button
                  type="button"
                  onClick={() => setAbsenExpanded(!absenExpanded)}
                  className="w-full flex items-center justify-between mb-2 hover:bg-purple-100/40 -mx-1 px-1 py-1 rounded transition-colors"
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-purple-700">
                    Absen Anggota Kelompok {absenExpanded ? '▾' : '▸'}
                  </p>
                  <Badge className="bg-purple-100 text-purple-700 text-[10px] hover:bg-purple-100">
                    {attCount}/{anggotaKelompok.length} hadir
                  </Badge>
                </button>
                {absenExpanded && (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {anggotaKelompok.map((a) => {
                      const profile = profiles.find((p) => p.id === a.profile_id)
                      if (!profile) return null
                      const isKetua = a.role_kelompok === 'KETUA'
                      const isHadir = att.has(a.profile_id)
                      // Highlight ketua yg di-swap supaya jelas ini bukan penjaga aktif
                      const isSwappedOriginal = isKetua && penjagaJadwal?.is_swapped
                      return (
                        <div
                          key={a.id}
                          className={`flex items-center gap-1.5 p-2.5 rounded-lg border transition-all ${
                            isHadir
                              ? 'bg-emerald-50 border-emerald-300'
                              : isSwappedOriginal
                              ? 'bg-slate-50 border-slate-200 opacity-60'
                              : isKetua
                              ? 'bg-amber-50/50 border-amber-200'
                              : 'bg-white border-slate-200/60'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleAtt(a.profile_id)}
                            disabled={isPending}
                            className="flex-1 flex items-center gap-3 text-left min-w-0"
                            aria-label={`Toggle ${profile.nama_kk}`}
                          >
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                                isHadir ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                              }`}
                            >
                              {isHadir && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                {isKetua ? (
                                  <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                                ) : (
                                  <Users className="w-3 h-3 text-slate-400 shrink-0" />
                                )}
                                <p className={`text-sm font-semibold truncate ${
                                  isSwappedOriginal ? 'line-through text-slate-500' : ''
                                }`}>
                                  {profile.nama_kk}
                                </p>
                                {isKetua && (
                                  <Badge className="bg-amber-100 text-amber-700 text-[9px] hover:bg-amber-100 ml-1">
                                    KETUA
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                Blok {profile.blok} No. {profile.nomor_rumah}
                              </p>
                            </div>
                          </button>
                          {/* Tombol swap per-anggota (skip ketua, ketua pakai tombol Swap di header) */}
                          {!isKetua && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSwapTarget(a)
                                setSwapPenggantiId('')
                                setSwapKeterangan('')
                              }}
                              disabled={isPending}
                              className="shrink-0 p-1.5 text-purple-600 hover:bg-purple-100 rounded transition-colors"
                              title={`Swap ${profile.nama_kk}`}
                              aria-label={`Swap ${profile.nama_kk}`}
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Form swap per-anggota (bukan ketua) */}
            {!isLocked && swapTarget && !swapTarget.role_kelompok.includes('KETUA') && (
              <div className="pt-3 border-t border-purple-200 space-y-2">
                <p className="text-xs font-semibold text-purple-900 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Penggantian: {profiles.find((p) => p.id === swapTarget.profile_id)?.nama_kk}
                </p>
                <p className="text-[10px] text-slate-600">
                  Asli tidak hadir, pilih pengganti dari warga lain.
                </p>
                <select
                  value={swapPenggantiId}
                  onChange={(e) => setSwapPenggantiId(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                >
                  <option value="">Pilih pengganti...</option>
                  {profiles
                    .filter((p) => p.id !== swapTarget.profile_id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nama_kk} ({p.login_id})
                      </option>
                    ))}
                </select>
                <Input
                  placeholder="Alasan (opsional)"
                  value={swapKeterangan}
                  onChange={(e) => setSwapKeterangan(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button onClick={handleAnggotaSwap} size="sm" disabled={isPending} className="flex-1">
                    Simpan Swap
                  </Button>
                  <Button onClick={() => setSwapTarget(null)} size="sm" variant="outline">
                    Batal
                  </Button>
                </div>
              </div>
            )}

                {/* Fallback: sesi tanpa kelompok → tampilkan ketua saja dengan checkbox */}
                {anggotaKelompok.length === 0 && penjagaJadwal && (
                  <div className="pt-3 border-t border-purple-200">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-purple-700 mb-2">
                      Absen Penjaga
                    </p>
                    <button
                      type="button"
                      onClick={() => toggleAtt(penjagaJadwal.profile_efektif_id)}
                      disabled={isPending}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${
                        att.has(penjagaJadwal.profile_efektif_id)
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-white border-slate-200/60 hover:border-slate-300'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                          att.has(penjagaJadwal.profile_efektif_id)
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'border-slate-300'
                        }`}
                      >
                        {att.has(penjagaJadwal.profile_efektif_id) && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{penjagaJadwal.nama_efektif}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {penjagaJadwal.is_swapped ? `Pengganti ${penjagaJadwal.nama_asli}` : 'Penjaga terjadwal'}
                        </p>
                      </div>
                    </button>
                  </div>
                )}

            {/* Mode read-only (locked): hanya tampilkan ringkasan */}
            {isLocked && (
              <div className="pt-3 border-t border-purple-200">
                <p className="text-[10px] font-bold uppercase tracking-widest text-purple-700 mb-2">
                  Absen Anggota ({attCount}/{anggotaKelompok.length || 1} hadir)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(anggotaKelompok.length > 0 ? anggotaKelompok : [{ profile_id: penjagaJadwal?.profile_efektif_id || '', nama_kk_snapshot: penjagaJadwal?.nama_efektif || '', role_kelompok: 'KETUA' } as { profile_id: string; nama_kk_snapshot: string; role_kelompok: string }])
                    .filter((a) => a.profile_id)
                    .map((a) => {
                      const isHadir = att.has(a.profile_id)
                      return (
                        <Badge
                          key={a.profile_id}
                          className={`text-[10px] ${
                            isHadir
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-100 line-through'
                          }`}
                        >
                          {isHadir && <Check className="w-3 h-3 mr-0.5" />}
                          {a.nama_kk_snapshot}
                        </Badge>
                      )
                    })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lock notice */}
      {isLocked && (
        <Card className="border-0 shadow-sm ring-1 ring-slate-200/60 bg-slate-50">
          <CardContent className="p-3 flex items-center gap-2 text-xs">
            <Lock className="w-4 h-4 text-slate-500" />
            <span className="text-slate-600">
              Sesi sudah {status === 'APPROVED' ? 'disetujui bendahara' : 'disubmit'} - tidak bisa diubah
            </span>
          </CardContent>
        </Card>
      )}

      {/* Search & Filter */}
      {!isLocked && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama atau blok (A-1)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkBelumOpen(true)}
            disabled={isPending}
            className="w-full"
          >
            Tandai Semua Warga Belum Bayar
          </Button>
        </div>
      )}

      {/* List Per-Warga per Blok */}
      <div className="space-y-2">
        {Object.entries(grouped).map(([blok, items]) => {
          const isExpanded = expandedBlok.has(blok)
          const statsBlok = items.reduce(
            (acc, p) => {
              const d = details[p.id]
              if (d?.is_bayar) {
                acc.bayar++
                acc.nominal += d.nominal
              }
              return acc
            },
            { bayar: 0, nominal: 0 }
          )

          return (
            <Card key={blok} className="border-0 shadow-sm ring-1 ring-slate-200/60 overflow-hidden">
              <button
                onClick={() => toggleBlok(blok)}
                className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {blok}
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-sm">Blok {blok}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {statsBlok.bayar}/{items.length} bayar · {formatRupiah(statsBlok.nominal)}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-slate-200/60 divide-y divide-slate-100">
                  {items.map((p) => {
                    const d = details[p.id] || { nominal: 0, is_bayar: false }
                    // Default nominal sesuai kategori_tarif (kalau warga JANDA = 10000, NORMAL = 15000)
                    const defaultNominal = p.kategori_tarif === 'JANDA' ? 10000 : 15000
                    return (
                      <div key={p.id} className="p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => !isLocked && updateDetail(p.id, d.is_bayar ? d.nominal : defaultNominal, !d.is_bayar)}
                            disabled={isLocked}
                            className={`shrink-0 w-7 h-7 rounded-md border-2 flex items-center justify-center transition-all ${
                              d.is_bayar
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'border-slate-300 hover:border-emerald-400'
                            } ${isLocked ? 'opacity-50' : ''}`}
                            title={d.is_bayar ? 'Batalkan bayar' : 'Tandai bayar'}
                          >
                            {d.is_bayar && <Check className="w-4 h-4 text-white" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{p.nama_kk}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {p.login_id} · {p.kategori_tarif === 'JANDA' ? 'Rp 10rb' : 'Rp 15rb'}
                            </p>
                          </div>
                          {d.is_bayar && (
                            <Badge className="bg-emerald-100 text-emerald-700 text-[10px] hover:bg-emerald-100">
                              {formatRupiah(d.nominal)}
                            </Badge>
                          )}
                        </div>
                        {/* Quick nominal picker - hanya muncul kalau sudah di-checklist bayar */}
                        {d.is_bayar && !isLocked && (
                          <div className="flex items-center gap-1.5 pl-9">
                            {[15000, 10000, 5000].map((preset) => (
                              <button
                                key={preset}
                                onClick={() => updateDetail(p.id, preset, true)}
                                className={`px-2.5 py-1 rounded-md text-xs font-bold border-2 transition-all ${
                                  d.nominal === preset
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300'
                                }`}
                              >
                                {preset >= 1000 ? `${preset / 1000}rb` : preset}
                              </button>
                            ))}
                            <Input
                              type="number"
                              value={d.nominal || ''}
                              onChange={(e) =>
                                updateDetail(p.id, parseInt(e.target.value || '0', 10), true)
                              }
                              disabled={isLocked}
                              className="w-20 h-7 text-xs text-right px-2"
                              placeholder="Manual"
                              step={500}
                            />
                            <Button
                              onClick={() => saveDetail(p.id)}
                              size="sm"
                              variant="ghost"
                              disabled={isPending}
                              className="h-7 w-7 p-0"
                              title="Simpan"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                        {/* Tombol simpan kalau di-checklist (auto-save on click nanti, atau pakai tombol ini) */}
                        {d.is_bayar && !isLocked && (
                          <div className="pl-9">
                            <button
                              onClick={() => saveDetail(p.id)}
                              disabled={isPending}
                              className="text-[10px] text-emerald-600 hover:text-emerald-700 hover:underline"
                            >
                              💾 Simpan permanen
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Submit Section */}
      {status === 'AKTIF' && (
        <Card className="border-0 shadow-md ring-1 ring-emerald-200/60 bg-gradient-to-r from-emerald-50 to-teal-50">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-bold uppercase text-emerald-700">Submit Sesi</p>
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">Keadaan malam ini</label>
              <div className="grid grid-cols-2 gap-2">
                {['AMAN', 'LAPORAN'].map((k) => (
                  <button
                    key={k}
                    onClick={() => setKeadaan(k)}
                    className={`p-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                      keadaan === k
                        ? k === 'AMAN'
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'bg-amber-500 border-amber-500 text-white'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    {k === 'AMAN' ? '🟢 Aman' : '🟡 Ada Laporan'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">Catatan (opsional)</label>
              <Textarea
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Misal: Tidak ada kejadian khusus, lingkungan aman."
                rows={2}
                className="text-sm"
              />
            </div>
            <Button onClick={handleSubmit} disabled={isPending} className="w-full">
              <MessageCircle className="w-4 h-4" />
              {isPending ? 'Menyimpan...' : 'Submit & Kirim ke Bendahara'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Chat Format Preview (setelah submit / approved) */}
      {(status === 'SUBMITTED' || status === 'APPROVED') && (
        <Card className="border-0 shadow-md ring-1 ring-blue-200/60">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-blue-600" />
                <p className="text-xs font-bold uppercase text-blue-700">
                  Format Laporan (kirim ke Bendahara)
                </p>
              </div>
              <Button onClick={copyChat} size="sm" variant="outline">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Tersalin' : 'Copy'}
              </Button>
            </div>
            <pre className="bg-slate-900 text-slate-100 text-[10px] leading-relaxed p-3 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono">
{chatFormat}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* ============================================ */}
      {/* DIALOGS */}
      {/* ============================================ */}

      {/* Dialog: Konfirmasi Tandai Semua Belum */}
      <Dialog open={bulkBelumOpen} onOpenChange={setBulkBelumOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-1">
              <Users className="w-6 h-6 text-amber-700" />
            </div>
            <DialogTitle className="text-center">Tandai Semua Belum Bayar?</DialogTitle>
            <DialogDescription className="text-center">
              Nominal semua warga akan di-reset ke 0. Tindakan ini tidak bisa dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkBelumOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleBulkBelum}
              disabled={isPending}
              variant="destructive"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                'Ya, Tandai Semua'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Konfirmasi Submit Sesi */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-1">
              <MessageCircle className="w-6 h-6 text-emerald-700" />
            </div>
            <DialogTitle className="text-center">Konfirmasi Submit Sesi</DialogTitle>
            <DialogDescription className="text-center">
              {formatTanggal(tanggal)} · {namaInputter}
            </DialogDescription>
          </DialogHeader>

          {/* Ringkasan Per Blok */}
          <div className="space-y-2 my-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Ringkasan Per Blok
            </p>
            <div className="grid grid-cols-2 gap-2">
              {['A', 'B', 'C', 'D'].map((blok) => {
                const stats = (grouped[blok] || []).reduce(
                  (acc, p) => {
                    const d = details[p.id]
                    if (d?.is_bayar) {
                      acc.bayar++
                      acc.nominal += d.nominal
                    }
                    return acc
                  },
                  { bayar: 0, nominal: 0 }
                )
                const totalWarga = grouped[blok]?.length || 0
                return (
                  <div
                    key={blok}
                    className={`rounded-lg p-2.5 border ${
                      stats.bayar > 0
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-700">Blok {blok}</span>
                      <Badge className={`text-[9px] ${
                        stats.bayar > 0
                          ? 'bg-emerald-200 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-200'
                      }`}>
                        {stats.bayar}/{totalWarga}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {stats.bayar} KK bayar
                    </p>
                    <p className="text-sm font-bold text-emerald-700">
                      {formatRupiah(stats.nominal)}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Total */}
            <div className="mt-3 p-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">
                    Total Jimpitan
                  </p>
                  <p className="text-xl font-bold leading-tight">{formatRupiah(totalNominal)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] opacity-90">{jumlahBayar} KK bayar</p>
                  <p className="text-[10px] opacity-90">{att.size} penjaga hadir</p>
                </div>
              </div>
            </div>

            {jumlahBayar === 0 && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
                ⚠️ Belum ada warga yang ditandai bayar. Yakin submit dengan kosong?
              </p>
            )}
          </div>

          <DialogFooter className="sm:justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSubmitOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={doSubmit}
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Konfirmasi Submit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
