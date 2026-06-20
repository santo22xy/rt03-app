'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Users, ChevronDown, ChevronUp, Crown } from 'lucide-react'
import { tambahJadwalRonda, hapusJadwalRonda } from '../jimpitan-actions'

type Jadwal = {
  id: string
  tanggal: string
  minggu_ke: number
  bulan: number
  tahun: number
  penjaga_profile_id: string
  nama_penjaga_snapshot: string
  blok_snapshot: string
  nomor_rumah_snapshot: string
}

type Profile = {
  id: string
  nama_kk: string
  blok: string
  nomor_rumah: string
  login_id: string
}

type KelompokAnggota = {
  id: string
  kelompok_id: string
  profile_id: string
  login_id: string
  nama_kk_snapshot: string
  role_kelompok: string
  urutan: number
}

export function JadwalRondaClient({
  jadwal,
  profiles,
  kelompok,
}: {
  jadwal: Jadwal[]
  profiles: Profile[]
  kelompok: KelompokAnggota[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [tanggal, setTanggal] = useState('')
  const [profileId, setProfileId] = useState('')

  function getAnggota(minggu_ke: number) {
    return kelompok.filter((k) => k.kelompok_id === `K${minggu_ke}`)
  }

  function handleTambah() {
    if (!tanggal || !profileId) return
    startTransition(async () => {
      const fd = new FormData()
      fd.append('tanggal', tanggal)
      fd.append('profileId', profileId)
      const res = await tambahJadwalRonda(fd)
      if (res?.error) {
        alert(res.error)
      } else {
        setShowAdd(false)
        setTanggal('')
        setProfileId('')
      }
    })
  }

  function handleHapus(id: string) {
    if (!confirm('Hapus jadwal ini?')) return
    startTransition(async () => {
      const res = await hapusJadwalRonda(id)
      if (res?.error) alert(res.error)
    })
  }

  function nextSaturday() {
    const d = new Date()
    const day = d.getDay()
    const diff = (6 - day + 7) % 7 || 7
    d.setDate(d.getDate() + diff)
    return d.toISOString().slice(0, 10)
  }

  return (
    <div className="p-4 space-y-3">
      {/* Tombol Tambah */}
      <Button
        onClick={() => setShowAdd(!showAdd)}
        variant={showAdd ? 'outline' : 'default'}
        className="w-full"
        size="sm"
      >
        <Plus className="w-4 h-4" />
        {showAdd ? 'Batal' : 'Tambah Jadwal'}
      </Button>

      {/* Form Tambah */}
      {showAdd && (
        <Card className="p-4 bg-blue-50/50 border-blue-200 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">
                Tanggal (Sabtu)
              </label>
              <Input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
              />
              <button
                type="button"
                onClick={() => setTanggal(nextSaturday())}
                className="text-[10px] text-blue-600 mt-1 hover:underline"
              >
                → Sabtu depan
              </button>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">
                Penjaga
              </label>
              <select
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">Pilih warga...</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama_kk} ({p.login_id})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button
            onClick={handleTambah}
            disabled={!tanggal || !profileId || isPending}
            size="sm"
            className="w-full"
          >
            {isPending ? 'Menyimpan...' : 'Simpan Jadwal'}
          </Button>
        </Card>
      )}

      {/* List Jadwal */}
      {jadwal.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          Belum ada jadwal. Tambahkan jadwal ronda untuk Sabtu depan.
        </div>
      ) : (
        <div className="space-y-2">
          {jadwal.map((j) => {
            const dt = new Date(j.tanggal)
            const isToday = j.tanggal === new Date().toISOString().slice(0, 10)
            const isExpanded = expandedId === j.id
            const anggota = getAnggota(j.minggu_ke)
            const otherAnggota = anggota.filter((a) => a.role_kelompok !== 'KETUA')
            return (
              <div
                key={j.id}
                className={`rounded-xl border transition-all overflow-hidden ${
                  isToday
                    ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-200'
                    : 'bg-white border-slate-200/60'
                }`}
              >
                <div className="flex items-center gap-3 p-3">
                  <div className="text-center shrink-0 w-14">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">
                      {dt.toLocaleString('id-ID', { month: 'short' })}
                    </p>
                    <p className="text-2xl font-bold leading-none">{dt.getDate()}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      M{j.minggu_ke}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <p className="text-sm font-semibold truncate">
                        {j.nama_penjaga_snapshot}
                      </p>
                      {isToday && (
                        <Badge className="bg-amber-500 text-white text-[9px] hover:bg-amber-500">
                          HARI INI
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Blok {j.blok_snapshot} No. {j.nomor_rumah_snapshot} ·{' '}
                      {dt.toLocaleString('id-ID', { weekday: 'long' })}
                    </p>
                  </div>
                  {otherAnggota.length > 0 && (
                    <Button
                      onClick={() => setExpandedId(isExpanded ? null : j.id)}
                      variant="ghost"
                      size="sm"
                      className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                      title="Lihat anggota kelompok"
                    >
                      <Users className="w-4 h-4" />
                      <span className="text-xs ml-1 hidden md:inline">
                        {otherAnggota.length}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3 ml-1" />
                      ) : (
                        <ChevronDown className="w-3 h-3 ml-1" />
                      )}
                    </Button>
                  )}
                  <Button
                    onClick={() => handleHapus(j.id)}
                    variant="ghost"
                    size="sm"
                    className="text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                    disabled={isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {/* Expandable anggota section */}
                {isExpanded && otherAnggota.length > 0 && (
                  <div className="px-3 pb-3 pt-1 border-t border-slate-200/60 bg-slate-50/50">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">
                      Anggota Kelompok {j.minggu_ke} ({anggota.length} orang)
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {anggota.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-white border border-slate-200/60"
                        >
                          {a.role_kelompok === 'KETUA' ? (
                            <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                          ) : (
                            <Users className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                          <span className="font-medium truncate">
                            {a.nama_kk_snapshot}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {a.login_id}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
