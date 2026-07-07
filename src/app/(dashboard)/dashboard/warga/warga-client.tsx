'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Link from 'next/link'
import {
  tambahWarga, editWarga, resetPinWarga,
  nonaktifkanWarga, aktifkanWarga,
  tambahAnggotaKK, hapusAnggotaKK,
  type WargaFormState
} from './actions'
import type { Profile } from '@/lib/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus, Search, MoreVertical, Pencil, KeyRound, Users,
  Power, PowerOff, Loader2, Eye, EyeOff, MessageCircle, Trash2,
  Building2, Shield, ShieldCheck, Crown,
} from 'lucide-react'
import { formatTanggal } from '@/lib/format'
import { toast } from 'sonner'

const initialState: WargaFormState = {}

function SubmitButton({ 
  icon: Icon, label, pendingLabel, variant = 'default' 
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  pendingLabel: string
  variant?: 'default' | 'destructive' | 'outline'
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        <>
          <Icon className="w-4 h-4" />
          {label}
        </>
      )}
    </Button>
  )
}

function PinInput({ name, placeholder = '••••••' }: { name: string, placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        name={name}
        type={show ? 'text' : 'password'}
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        placeholder={placeholder}
        required
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        tabIndex={-1}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
        aria-label="Toggle visibility"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

const BLOK_LIST = ['A', 'B', 'C', 'D']

const ROLE_LABEL: Record<string, string> = {
  KETUA_RT: 'Ketua RT',
  BENDAHARA: 'Bendahara',
  SEKRETARIS: 'Sekretaris',
  PENGURUS: 'Pengurus',
  WARGA: 'Warga',
}

// Role order untuk sort pengurus (Ketua RT paling atas)
const ROLE_ORDER: Record<string, number> = {
  KETUA_RT: 1,
  BENDAHARA: 2,
  SEKRETARIS: 3,
  PENGURUS: 4,
  SUPERADMIN: 5,
  WARGA: 99,
}

// Badge styling khusus per role (tersedia untuk dipakai saat butuh)
const ROLE_BADGE: Record<string, string> = {
  KETUA_RT: 'bg-amber-100 text-amber-800 border-amber-300 font-bold',
  BENDAHARA: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold',
  SEKRETARIS: 'bg-blue-100 text-blue-800 border-blue-300 font-bold',
  PENGURUS: 'bg-purple-100 text-purple-800 border-purple-300 font-bold',
  SUPERADMIN: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
}
void ROLE_BADGE  // silence unused warning — exported untuk reuse

interface WargaClientProps {
  warga: Profile[]
  pengurus: Profile[]
  kycPendingCount: number
}

interface KKAnggota {
  id: string
  nama: string
  nik: string | null
  hubungan: string
  tanggal_lahir: string | null
  jenis_kelamin: 'L' | 'P' | null
  pekerjaan: string | null
  is_active: boolean
}

export function WargaClient({ warga, pengurus, kycPendingCount }: WargaClientProps) {
  const [search, setSearch] = useState('')
  const [filterBlok, setFilterBlok] = useState<string>('ALL')
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')

  const [tambahOpen, setTambahOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Profile | null>(null)
  const [resetTarget, setResetTarget] = useState<Profile | null>(null)
  const [kkTarget, setKkTarget] = useState<Profile | null>(null)

  const [tambahState, tambahAction] = useFormState(tambahWarga, initialState)
  const [editState, editAction] = useFormState(editWarga, initialState)
  const [resetState, resetAction] = useFormState(resetPinWarga, initialState)

  const [, startToggleTransition] = useTransition()

  async function handleToggle(id: string, isActive: boolean) {
    const fd = new FormData()
    fd.append('id', id)
    startToggleTransition(async () => {
      const result = isActive ? await aktifkanWarga(fd) : await nonaktifkanWarga(fd)
      if (result?.error) toast.error(result.error)
      else if (result?.success) toast.success(result.success)
    })
  }

  // Watch action results & close dialogs
  useEffect(() => {
    if (tambahState?.success) {
      toast.success(tambahState.success)
      setTambahOpen(false)
    } else if (tambahState?.error) {
      toast.error(tambahState.error)
    }
  }, [tambahState])

  useEffect(() => {
    if (editState?.success) {
      toast.success(editState.success)
      setEditTarget(null)
    } else if (editState?.error) {
      toast.error(editState.error)
    }
  }, [editState])

  useEffect(() => {
    if (resetState?.success) {
      toast.success(resetState.success)
      setResetTarget(null)
    } else if (resetState?.error) {
      toast.error(resetState.error)
    }
  }, [resetState])

  // Filtered warga
  const filteredWarga = useMemo(() => {
    return warga.filter(w => {
      if (search) {
        const q = search.toLowerCase()
        const match = 
          w.nama_kk?.toLowerCase().includes(q) ||
          w.login_id?.toLowerCase().includes(q) ||
          w.no_hp?.includes(q)
        if (!match) return false
      }
      if (filterBlok !== 'ALL' && w.blok !== filterBlok) return false
      if (filterStatus === 'ACTIVE' && !w.is_active) return false
      if (filterStatus === 'INACTIVE' && w.is_active) return false
      return true
    })
  }, [warga, search, filterBlok, filterStatus])

  const stats = useMemo(() => ({
    total: warga.length,
    aktif: warga.filter(w => w.is_active).length,
    nonaktif: warga.filter(w => !w.is_active).length,
    perBlok: BLOK_LIST.map(b => ({
      blok: b,
      total: warga.filter(w => w.blok === b).length,
    })),
  }), [warga])

  return (
    <div className="space-y-6">
      {/* ============================================ */}
      {/* HEADER GRADIENT */}
      {/* ============================================ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 text-white shadow-xl shadow-emerald-500/20">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mb-16" />

        <div className="relative p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/30 shrink-0">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-emerald-100 uppercase tracking-wider">
                Manajemen Warga
              </p>
              <h1 className="text-2xl font-bold leading-tight">Data Warga RT 03</h1>
            </div>
          </div>
          <p className="text-sm text-emerald-100">
            Kelola data KK, PIN akses, dan anggota keluarga SENTRA
          </p>
        </div>
      </div>

      {/* KYC Pending Alert */}
      {kycPendingCount > 0 && (
        <Link
          href="/dashboard/warga/kyc"
          className="block relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white p-4 shadow-lg shadow-amber-500/20 hover:shadow-xl transition-shadow"
        >
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-white/10 rounded-full" />
          <div className="relative flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-100">
                Verifikasi Warga
              </p>
              <p className="font-bold text-sm">
                {kycPendingCount} warga menunggu verifikasi KYC
              </p>
            </div>
            <Badge className="bg-white text-amber-700 hover:bg-white font-bold text-xs shrink-0">
              Review →
            </Badge>
          </div>
        </Link>
      )}

      {/* ============================================ */}
      {/* STATISTIK GRADIENT */}
      {/* ============================================ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total KK */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 text-white p-4 shadow-lg shadow-blue-500/20">
          <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -mr-8 -mt-8" />
          <div className="relative">
            <Users className="w-5 h-5 text-white/80 mb-1.5" />
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-[10px] uppercase tracking-wider text-blue-100 font-semibold mt-0.5">
              Total KK
            </p>
          </div>
        </div>

        {/* Aktif */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 text-white p-4 shadow-lg shadow-emerald-500/20">
          <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -mr-8 -mt-8" />
          <div className="relative">
            <ShieldCheck className="w-5 h-5 text-white/80 mb-1.5" />
            <p className="text-2xl font-bold">{stats.aktif}</p>
            <p className="text-[10px] uppercase tracking-wider text-emerald-100 font-semibold mt-0.5">
              Aktif
            </p>
          </div>
        </div>

        {/* Nonaktif */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-400 via-slate-500 to-slate-600 text-white p-4 shadow-lg shadow-slate-500/20">
          <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -mr-8 -mt-8" />
          <div className="relative">
            <PowerOff className="w-5 h-5 text-white/80 mb-1.5" />
            <p className="text-2xl font-bold">{stats.nonaktif}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-100 font-semibold mt-0.5">
              Nonaktif
            </p>
          </div>
        </div>

        {/* Per Blok */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500 via-purple-600 to-fuchsia-600 text-white p-4 shadow-lg shadow-purple-500/20">
          <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -mr-8 -mt-8" />
          <div className="relative">
            <Building2 className="w-5 h-5 text-white/80 mb-1.5" />
            <p className="text-base font-bold leading-tight">
              {stats.perBlok.map(b => b.blok).join(' · ')}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-purple-100 font-semibold mt-0.5">
              {stats.perBlok.map(b => b.total).reduce((a, b) => a + b, 0)} KK
            </p>
          </div>
        </div>
      </div>

      {/* Per-Block Breakdown (sekaligus filter blok interaktif) */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 pl-1">
            <Building2 className="w-4 h-4 text-emerald-600" />
            Distribusi per Blok
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1 pb-4 px-4">
          <div className="grid grid-cols-4 gap-2.5">
            {stats.perBlok.map(b => {
              const colors = {
                A: 'from-blue-500 to-indigo-500',
                B: 'from-emerald-500 to-teal-500',
                C: 'from-amber-500 to-orange-500',
                D: 'from-purple-500 to-fuchsia-500',
              }
              const isSelected = filterBlok === b.blok
              return (
                <button
                  key={b.blok}
                  type="button"
                  onClick={() => setFilterBlok(isSelected ? 'ALL' : b.blok)}
                  aria-pressed={isSelected}
                  className={`text-left rounded-xl px-2.5 py-2 bg-gradient-to-br ${
                    colors[b.blok as keyof typeof colors] ?? 'from-slate-500 to-slate-600'
                  } text-white shadow-md ring-1 ring-white/10 transition-all hover:scale-[1.03] active:scale-[0.97] ${
                    isSelected ? 'ring-2 ring-offset-2 ring-emerald-500 scale-[1.03]' : ''
                  }`}
                >
                  <p className="text-[9px] uppercase tracking-wider text-white/80 font-semibold leading-none">Blok</p>
                  <p className="text-lg font-bold leading-tight mt-1">{b.blok}</p>
                  <p className="text-[10px] text-white/95 font-semibold mt-0.5 leading-none">{b.total} KK</p>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tombol Tambah */}
      <div className="flex justify-end">
        <Button onClick={() => setTambahOpen(true)} className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20">
          <Plus className="w-4 h-4" />
          Tambah Warga
        </Button>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama, login ID, atau nomor HP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="ALL">Semua Status</option>
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Nonaktif</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* ====== DESKTOP: Tabel Lengkap (≥md) ====== */}
      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle className="text-base">
            Daftar Warga ({filteredWarga.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-6 px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Login ID</TableHead>
                  <TableHead>Nama KK</TableHead>
                  <TableHead>Blok/No</TableHead>
                  <TableHead>Tarif</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWarga.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Tidak ada data warga
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredWarga.map(w => (
                    <TableRow key={w.id}>
                      <TableCell className="font-mono font-semibold">{w.login_id}</TableCell>
                      <TableCell>{w.nama_kk}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{w.blok}</span>
                        <span className="font-semibold ml-1">{w.nomor_rumah}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={w.kategori_tarif === 'KHUSUS' ? 'secondary' : 'outline'} className="text-xs">
                          {w.kategori_tarif === 'KHUSUS' ? 'Khusus' : 'Normal'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {w.no_hp ? (
                          <a
                            href={`https://wa.me/${w.no_hp}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
                          >
                            <MessageCircle className="w-3 h-3" />
                            {w.no_hp}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {w.is_active ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Aktif</Badge>
                        ) : (
                          <Badge variant="secondary">Nonaktif</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                            <MoreVertical className="w-4 h-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setEditTarget(w)}>
                              <Pencil className="w-4 h-4" /> Edit Data
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setResetTarget(w)}>
                              <KeyRound className="w-4 h-4" /> Reset PIN
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setKkTarget(w)}>
                              <Users className="w-4 h-4" /> Lihat KK
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {w.is_active ? (
                              <DropdownMenuItem
                                onClick={() => handleToggle(w.id, false)}
                                className="text-amber-600"
                              >
                                <PowerOff className="w-4 h-4" /> Nonaktifkan
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => handleToggle(w.id, true)}
                                className="text-emerald-600"
                              >
                                <Power className="w-4 h-4" /> Aktifkan
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ====== MOBILE: Card View (<md) ====== */}
      <div className="md:hidden space-y-1.5">
        {filteredWarga.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 rounded-xl border">
            <p className="text-sm text-muted-foreground">Tidak ada data warga</p>
          </div>
        ) : (
          filteredWarga.map(w => (
            <div key={w.id} className="bg-card border rounded-xl px-2.5 py-2 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold shrink-0 font-mono">
                  {w.blok}{w.nomor_rumah}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-sm truncate leading-tight">{w.nama_kk}</p>
                    {w.is_active ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[9px] px-1.5 py-0">Aktif</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Off</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant={w.kategori_tarif === 'KHUSUS' ? 'secondary' : 'outline'} className="text-[9px] px-1.5 py-0">
                      {w.kategori_tarif === 'KHUSUS' ? 'Khusus 10rb' : 'Normal 15rb'}
                    </Badge>
                    {w.no_hp && (
                      <a
                        href={`https://wa.me/${w.no_hp}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 hover:underline"
                      >
                        <MessageCircle className="w-2.5 h-2.5" />
                        WA
                      </a>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Menu aksi" />}>
                          <MoreVertical className="w-3.5 h-3.5" />
                        </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setEditTarget(w)}>
                      <Pencil className="w-4 h-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setResetTarget(w)}>
                      <KeyRound className="w-4 h-4" /> Reset PIN
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setKkTarget(w)}>
                      <Users className="w-4 h-4" /> Lihat KK
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {w.is_active ? (
                      <DropdownMenuItem onClick={() => handleToggle(w.id, false)} className="text-amber-600">
                        <PowerOff className="w-4 h-4" /> Nonaktifkan
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => handleToggle(w.id, true)} className="text-emerald-600">
                        <Power className="w-4 h-4" /> Aktifkan
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pengurus Section */}
      {pengurus.length > 0 && (() => {
        // Sort pengurus by ROLE_ORDER (Ketua RT paling atas), lalu by login_id
        const sortedPengurus = [...pengurus].sort((a, b) => {
          const ao = ROLE_ORDER[a.role] ?? 99
          const bo = ROLE_ORDER[b.role] ?? 99
          if (ao !== bo) return ao - bo
          return (a.login_id ?? '').localeCompare(b.login_id ?? '')
        })
        const ketuaRT = sortedPengurus.find(p => p.role === 'KETUA_RT')

        return (
        <Card className="border-0 shadow-md mt-10">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              Pengurus RT ({sortedPengurus.length})
            </CardTitle>
            <CardDescription>
              Akun dengan akses dashboard pengurus. Klik ⋮ untuk reset PIN atau edit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Highlight Pak RT kalau ada */}
            {ketuaRT && (
              <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-300 flex items-center gap-3 shadow-sm">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shrink-0 ring-2 ring-amber-300 shadow-md">
                  <Crown className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700">
                      👑 Pak RT
                    </p>
                    <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-[9px] font-bold">
                      Aktif
                    </Badge>
                  </div>
                  <p className="font-bold text-base text-amber-900 leading-tight truncate mt-0.5">
                    {ketuaRT.nama_kk}
                  </p>
                  <p className="text-[11px] text-amber-700">
                    Blok {ketuaRT.blok} No. {ketuaRT.nomor_rumah} · Login ID {ketuaRT.login_id}
                  </p>
                </div>
                <Badge className="bg-amber-500 text-white hover:bg-amber-500 font-bold text-[10px] shrink-0">
                  KETUA RT
                </Badge>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedPengurus.map((p, i) => {
                const isKetua = p.role === 'KETUA_RT'
                const gradients = isKetua
                  ? ['from-amber-500 via-amber-600 to-orange-600']
                  : [
                      'from-blue-500 to-indigo-500',
                      'from-emerald-500 to-teal-500',
                      'from-purple-500 to-fuchsia-500',
                      'from-rose-500 to-pink-500',
                      'from-slate-500 to-slate-600',
                    ]
                const gradient = isKetua ? gradients[0] : gradients[i % gradients.length]
                return (
                  <div key={p.id} className="relative overflow-hidden border-0 rounded-xl text-white p-3 flex items-center gap-3 shadow-md group"
                    style={{ backgroundImage: undefined }}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-90`} />
                    <div className="relative flex items-center gap-3 w-full">
                      <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm ring-2 ring-white/30 flex items-center justify-center font-bold shrink-0">
                        {isKetua ? <Crown className="w-5 h-5" /> : (p.nama_kk?.[0]?.toUpperCase() ?? '?')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{p.nama_kk}</p>
                        <p className="text-xs text-white/90">
                          {ROLE_LABEL[p.role] ?? p.role} · {p.blok}{p.nomor_rumah}
                        </p>
                      </div>
                      <Badge className={`text-[10px] shrink-0 border ${
                        isKetua
                          ? 'bg-white text-amber-700 hover:bg-white border-white font-bold'
                          : 'bg-white/20 text-white border-white/30 backdrop-blur-sm'
                      }`}>
                        {p.is_active ? 'Aktif' : 'Off'}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20 hover:text-white shrink-0" />}>
                          <MoreVertical className="w-4 h-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => setEditTarget(p)}>
                            <Pencil className="w-4 h-4" /> Edit Data
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setResetTarget(p)}>
                            <KeyRound className="w-4 h-4" /> Reset PIN
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setKkTarget(p)}>
                            <Users className="w-4 h-4" /> Lihat KK
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {p.is_active ? (
                            <DropdownMenuItem
                              onClick={() => handleToggle(p.id, false)}
                              className="text-amber-600"
                            >
                              <PowerOff className="w-4 h-4" /> Nonaktifkan
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleToggle(p.id, true)}
                              className="text-emerald-600"
                            >
                              <Power className="w-4 h-4" /> Aktifkan
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
        )
      })()}

      {/* Dialog: Tambah Warga */}
      <Dialog open={tambahOpen} onOpenChange={setTambahOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Warga Baru</DialogTitle>
            <DialogDescription>
              Daftarkan KK baru ke sistem. PIN awal bisa diberikan langsung atau diubah nanti.
            </DialogDescription>
          </DialogHeader>
          <form action={tambahAction} className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Blok</Label>
                <select name="blok" required defaultValue="A"
                  className="w-full h-10 rounded-md border border-input bg-background px-2 text-sm">
                  {BLOK_LIST.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Nomor Rumah</Label>
                <Input name="nomorRumah" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} required placeholder="1-200" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nama Kepala Keluarga</Label>
              <Input name="namaKK" required placeholder="Sesuai KTP" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">No WhatsApp (opsional)</Label>
              <Input name="noHp" type="tel" placeholder="08xxxxxxxxxx" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Kategori Tarif</Label>
                <select name="kategoriTarif" defaultValue="NORMAL"
                  className="w-full h-10 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="NORMAL">Normal (15rb)</option>
                  <option value="KHUSUS">Khusus (10rb)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">PIN Awal</Label>
                <PinInput name="pinAwal" />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTambahOpen(false)}>Batal</Button>
              <SubmitButton icon={Plus} label="Tambah" pendingLabel="Menyimpan..." />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Edit Warga */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Data Warga</DialogTitle>
            <DialogDescription>
              {editTarget?.login_id} · {editTarget?.blok}{editTarget?.nomor_rumah}
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <form action={editAction} className="space-y-3" key={editTarget.id}>
              <input type="hidden" name="id" value={editTarget.id} />
              <div className="space-y-1">
                <Label className="text-xs">Nama Kepala Keluarga</Label>
                <Input name="namaKK" required defaultValue={editTarget.nama_kk} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">No WhatsApp</Label>
                <Input name="noHp" type="tel" defaultValue={editTarget.no_hp ?? ''} placeholder="08xxxxxxxxxx" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kategori Tarif</Label>
                <select name="kategoriTarif" defaultValue={editTarget.kategori_tarif}
                  className="w-full h-10 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="NORMAL">Normal</option>
                  <option value="KHUSUS">Khusus</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" defaultChecked={editTarget.is_active} className="rounded" />
                <span>Akun aktif (warga bisa login)</span>
              </label>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Batal</Button>
                <SubmitButton icon={Pencil} label="Simpan" pendingLabel="Menyimpan..." />
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Reset PIN */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-600" />
              Reset PIN Warga
            </DialogTitle>
            <DialogDescription>
              {resetTarget?.nama_kk} ({resetTarget?.login_id})
            </DialogDescription>
          </DialogHeader>
          {resetTarget && (
            <form action={resetAction} className="space-y-3" key={resetTarget.id}>
              <input type="hidden" name="id" value={resetTarget.id} />
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md p-2">
                ⚠️ Pastikan Anda mengkomunikasikan PIN baru ke warga via WhatsApp secara langsung.
              </div>
              <div className="space-y-1">
                <Label className="text-xs">PIN Baru (6 digit)</Label>
                <PinInput name="pinBaru" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Konfirmasi PIN</Label>
                <PinInput name="pinConfirm" />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>Batal</Button>
                <SubmitButton icon={KeyRound} label="Reset PIN" pendingLabel="Mereset..." variant="destructive" />
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: KK Anggota */}
      <KKAnggotaDialog target={kkTarget} onClose={() => setKkTarget(null)} />
    </div>
  )
}

// =========================================================
// Sub-component: Dialog KK Anggota
// =========================================================
function KKAnggotaDialog({ target, onClose }: { target: Profile | null; onClose: () => void }) {
  const [anggota, setAnggota] = useState<KKAnggota[]>([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [tambahState, tambahAction] = useFormState(tambahAnggotaKK, initialState)
  const [, startHapus] = useTransition()

  // Fetch anggota when target changes
  useEffect(() => {
    if (!target) {
      setAnggota([])
      return
    }
    
    let cancelled = false
    setLoading(true)
    
    ;(async () => {
      try {
        const res = await fetch(`/api/kk-anggota?profileId=${target.id}`)
        const data = await res.json()
        if (!cancelled) {
          setAnggota(data.anggota ?? [])
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    })()
    
    return () => { cancelled = true }
  }, [target, tambahState?.success])

  useEffect(() => {
    if (tambahState?.success) {
      toast.success(tambahState.success)
      setAddOpen(false)
    } else if (tambahState?.error) {
      toast.error(tambahState.error)
    }
  }, [tambahState])

  async function handleHapus(id: string) {
    if (!confirm('Hapus anggota KK ini?')) return
    const fd = new FormData()
    fd.append('id', id)
    startHapus(async () => {
      const result = await hapusAnggotaKK(fd)
      if (result?.error) toast.error(result.error)
      else if (result?.success) toast.success(result.success)
    })
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Anggota KK
          </DialogTitle>
          <DialogDescription>
            {target?.nama_kk} · {target?.login_id}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {loading ? (
            <p className="text-center text-muted-foreground py-4">Memuat...</p>
          ) : anggota.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">Belum ada anggota KK terdaftar</p>
          ) : (
            anggota.map(a => (
              <div key={a.id} className="flex items-center gap-3 border rounded-lg p-3">
                <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-sm font-bold">
                  {a.jenis_kelamin === 'P' ? '♀' : '♂'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{a.nama}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.hubungan}
                    {a.tanggal_lahir && ` · ${formatTanggal(a.tanggal_lahir)}`}
                    {a.pekerjaan && ` · ${a.pekerjaan}`}
                  </p>
                </div>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-destructive"
                  onClick={() => handleHapus(a.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        {addOpen ? (
          <form action={tambahAction} className="space-y-2 border-t pt-3">
            <input type="hidden" name="profileId" value={target?.id} />
            <div className="grid grid-cols-2 gap-2">
              <Input name="nama" required placeholder="Nama lengkap" />
              <Input name="nik" placeholder="NIK (opsional)" maxLength={16} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input name="hubungan" required placeholder="Hubungan (Istri/Anak/dll)" />
              <select name="jenisKelamin" defaultValue=""
                className="h-10 rounded-md border border-input bg-background px-2 text-sm">
                <option value="">-- JK --</option>
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input name="tanggalLahir" type="date" />
              <Input name="pekerjaan" placeholder="Pekerjaan (opsional)" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(false)}>Batal</Button>
              <SubmitButton icon={Plus} label="Tambah" pendingLabel="Menyimpan..." />
            </div>
          </form>
        ) : (
          <Button variant="outline" onClick={() => setAddOpen(true)} className="w-full">
            <Plus className="w-4 h-4" /> Tambah Anggota
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
