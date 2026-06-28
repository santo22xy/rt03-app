'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, Crown, Users } from 'lucide-react'

type Jadwal = {
  tanggal: string
  profile_efektif_id: string
  nama_efektif: string
  is_swapped: boolean
  nama_asli: string | null
  minggu_ke: number | null
}

type Anggota = {
  id: string
  kelompok_id: string
  profile_id: string
  login_id: string
  nama_kk_snapshot: string
  role_kelompok: string
  urutan: number
}

export function JadwalListWarga({
  jadwal,
  kelompokByKelompokId,
  profileId,
  today,
}: {
  jadwal: Jadwal[]
  kelompokByKelompokId: Record<string, Anggota[]>
  profileId: string
  today: string
}) {
  const [expandedTgl, setExpandedTgl] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      {jadwal.map((j) => {
        const isMyDuty = j.profile_efektif_id === profileId
        const isToday = j.tanggal === today
        const isExpanded = expandedTgl === j.tanggal
        const kelompokKey = j.minggu_ke ? `K${j.minggu_ke}` : null
        const anggota = kelompokKey ? kelompokByKelompokId[kelompokKey] || [] : []
        const otherAnggota = anggota.filter((a) => a.role_kelompok !== 'KETUA')

        return (
          <div
            key={j.tanggal}
            className={`rounded-xl border overflow-hidden ${
              isMyDuty
                ? 'bg-purple-50 border-purple-300'
                : isToday
                ? 'bg-amber-50 border-amber-300'
                : 'bg-white border-slate-200/60'
            }`}
          >
            <div className="flex items-center gap-3 p-3">
              <div className="text-center shrink-0 w-12">
                <p className="text-[9px] font-bold uppercase text-muted-foreground">
                  {new Date(j.tanggal).toLocaleString('id-ID', { month: 'short' })}
                </p>
                <p className="text-xl font-bold leading-none">
                  {new Date(j.tanggal).getDate()}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <p className="text-sm font-semibold truncate">{j.nama_efektif}</p>
                  {isMyDuty && (
                    <Badge className="bg-purple-600 text-white text-[9px] hover:bg-purple-600 ml-1">
                      Anda
                    </Badge>
                  )}
                </div>
                {j.is_swapped && (
                  <p className="text-[10px] text-purple-600 mt-0.5">
                    Pengganti {j.nama_asli}
                  </p>
                )}
                {anggota.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    K{j.minggu_ke} · {anggota.length} anggota
                  </p>
                )}
              </div>
              {otherAnggota.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpandedTgl(isExpanded ? null : j.tanggal)}
                  className="shrink-0 inline-flex items-center gap-0.5 text-blue-600 active:text-blue-800 active:bg-blue-50 rounded-lg px-2 py-1.5 min-h-[36px] min-w-[36px] justify-center touch-manipulation"
                  aria-label={isExpanded ? 'Sembunyikan anggota' : `Lihat ${otherAnggota.length} anggota`}
                  aria-expanded={isExpanded}
                  title={`Lihat ${otherAnggota.length} anggota kelompok`}
                >
                  <Users className="w-4 h-4" />
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
            {/* Expandable anggota */}
            {isExpanded && otherAnggota.length > 0 && (
              <div className="px-3 pb-3 pt-1 border-t border-slate-200/60 bg-slate-50/50">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">
                  Daftar Petugas ({otherAnggota.length} orang)
                </p>
                <ul className="space-y-1">
                  {otherAnggota.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-white border border-slate-200/60"
                    >
                      <Users className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="font-medium truncate flex-1 min-w-0">
                        {a.nama_kk_snapshot}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {a.login_id}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
