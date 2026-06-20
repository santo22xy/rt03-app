'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronDown, ChevronUp, Shield, ArrowLeftRight, Crown, Users } from 'lucide-react'

type NextJadwal = {
  tanggal: string
  profile_efektif_id: string
  nama_efektif: string
  is_swapped: boolean
  nama_asli: string | null
  profile_asli_id: string
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

export function NextJadwalCard({
  nextJadwal,
  anggota,
}: {
  nextJadwal: NextJadwal | null
  anggota: Anggota[]
}) {
  const [expanded, setExpanded] = useState(false)
  const otherAnggota = anggota.filter((a) => a.role_kelompok !== 'KETUA')
  const kelompokKey = nextJadwal?.minggu_ke ? `K${nextJadwal.minggu_ke}` : null

  return (
    <Card className="overflow-hidden border-0 shadow-md ring-1 ring-purple-200/60">
      <div className="relative bg-gradient-to-r from-purple-50 via-violet-50 to-fuchsia-50 px-5 py-3 border-b border-purple-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-600" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-purple-700">
              Ronda Sabtu Depan
            </span>
          </div>
          <Link href="/dashboard/ronda" className="text-[10px] text-purple-600 hover:underline font-semibold">
            Kelola →
          </Link>
        </div>
      </div>
      <CardContent className="p-4">
        {nextJadwal ? (
          <>
            <div className="flex items-center gap-3">
              <div className="text-center shrink-0 w-14">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">
                  {new Date(nextJadwal.tanggal).toLocaleString('id-ID', { month: 'short' })}
                </p>
                <p className="text-2xl font-bold leading-none">
                  {new Date(nextJadwal.tanggal).getDate()}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <p className="font-semibold text-sm truncate">{nextJadwal.nama_efektif}</p>
                </div>
                {nextJadwal.is_swapped && (
                  <p className="text-[10px] text-purple-600 flex items-center gap-1 mt-0.5">
                    <ArrowLeftRight className="w-2.5 h-2.5" />
                    Pengganti {nextJadwal.nama_asli}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(nextJadwal.tanggal).toLocaleString('id-ID', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </p>
                {anggota.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    K{nextJadwal.minggu_ke} · {anggota.length} anggota
                  </p>
                )}
              </div>
              {otherAnggota.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg p-1.5 transition-colors shrink-0"
                  aria-label={expanded ? 'Sembunyikan anggota' : 'Lihat anggota'}
                  title={`Lihat ${otherAnggota.length} anggota kelompok`}
                >
                  <Users className="w-4 h-4" />
                  {expanded ? (
                    <ChevronUp className="w-3 h-3 inline ml-0.5" />
                  ) : (
                    <ChevronDown className="w-3 h-3 inline ml-0.5" />
                  )}
                </button>
              )}
            </div>
            {/* Expandable anggota */}
            {expanded && otherAnggota.length > 0 && (
              <div className="mt-3 pt-3 border-t border-purple-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-purple-700 mb-2">
                  Anggota Kelompok {kelompokKey} ({anggota.length} orang)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {anggota.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-white border border-purple-100"
                    >
                      {a.role_kelompok === 'KETUA' ? (
                        <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                      ) : (
                        <Users className="w-3 h-3 text-slate-400 shrink-0" />
                      )}
                      <span className="font-medium truncate">{a.nama_kk_snapshot}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {a.login_id}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-3">
            Belum ada jadwal
          </p>
        )}
      </CardContent>
    </Card>
  )
}
