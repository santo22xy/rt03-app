'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  HandCoins, ArrowRight, CheckCircle2, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { getNextSaturdays } from '@/lib/ronda'
import { BuatSesiForm } from './buat-sesi-form'
import { PendingAccList } from './pending-acc-list'
import { getJimpitanListData } from '../jimpitan-actions'

const roleLabelMap: Record<string, string> = {
  KETUA_RT: 'Ketua RT',
  BENDAHARA: 'Bendahara',
  SEKRETARIS: 'Sekretaris',
  PENGURUS: 'Pengurus',
  SUPERADMIN: 'Super Admin',
}

export default function JimpitanListPage({
  searchParams,
}: {
  searchParams?: { month?: string; year?: string }
}) {
  const [currentMonth, setCurrentMonth] = useState(
    searchParams?.month ? Number(searchParams.month) : new Date().getMonth()
  )
  const [currentYear, setCurrentYear] = useState(
    searchParams?.year ? Number(searchParams.year) : new Date().getFullYear()
  )
  
  const [isPengurus, setIsPengurus] = useState(false)
  const [profile, setProfile] = useState<{ id: string; role: string; nama_kk: string } | null>(null)
  const [isWindowOpen, setIsWindowOpen] = useState(false)
  const [sesi, setSesi] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ]

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const data = await getJimpitanListData(currentMonth, currentYear)
      setIsPengurus(data.isPengurus)
      setProfile(data.profile)
      setIsWindowOpen(data.isWindowOpen)
      setSesi(data.sesi)
      setLoading(false)
    }
    loadData()
  }, [currentMonth, currentYear])

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(currentYear + 1)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
  }

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(currentYear - 1)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <HandCoins className="w-4 h-4 text-emerald-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
            Jimpitan
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold">Sesi Jimpitan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Input jimpitan warga & history sesi sebelumnya
        </p>
      </div>

      {/* Status Window */}
      <Card className={`overflow-hidden border-0 shadow-md ring-1 ${isWindowOpen ? 'ring-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50' : 'ring-slate-200/60'}`}>
        <CardContent className="p-5 flex items-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isWindowOpen ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            {isWindowOpen ? (
              <CheckCircle2 className="w-6 h-6 text-white" />
            ) : (
              <Clock className="w-6 h-6 text-white" />
            )}
          </div>
          <div className="flex-1">
            <p className="font-semibold">
              {isWindowOpen ? '🟢 Window Jimpitan Sedang Buka' : '⏸️ Window Jimpitan Tertutup'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isWindowOpen
                ? 'Sabtu malam 19:00 - 23:00 WIB. Warga bisa daftar jadi petugas.'
                : 'Hanya buka setiap Sabtu 19:00 - 23:00 WIB. Pengurus bisa uji coba dengan form di bawah.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Mode Pengurus - Buat sesi manual (untuk uji coba alur di luar window)
      {isPengurus && (
        <Card className="overflow-hidden border-0 shadow-md ring-1 ring-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
          <CardContent className="p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-900">
                  Mode Pengurus — Uji Coba Alur
                </p>
                <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                  Anda login sebagai <span className="font-bold">{profile?.role}</span>.
                  Form ini memungkinkan pengurus membuat sesi jimpitan untuk tanggal berapapun
                  (di luar window) untuk menguji alur input sebelum hari H. Untuk warga biasa,
                  form ini tidak akan muncul.
                </p>
              </div>
            </div>
            <BuatSesiForm roleLabel={roleLabelMap[profile?.role ?? ''] ?? 'Pengurus'}>
              <div>
                <label className="text-xs font-semibold text-amber-900 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  Pilih Tanggal Sesi (bebas, tidak harus Sabtu)
                </label>
                <select
                  name="tanggal"
                  required
                  className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  defaultValue={getNextSaturdays(4)[0]?.value ?? ''}
                >
                  {getNextSaturdays(4).map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </BuatSesiForm>
          </CardContent>
        </Card>
      )}

      {/* Info warga untuk daftar */}
      <Card className="overflow-hidden border-0 shadow-md ring-1 ring-blue-200/60 bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardContent className="p-5">
          <p className="text-sm font-semibold text-blue-900">
            ℹ️ Untuk Warga
          </p>
          <p className="text-xs text-blue-700 mt-1.5 leading-relaxed">
            Warga yang ingin menjadi petugas input jimpitan silakan membuka
            aplikasi via <span className="font-bold">login warga</span> (bukan pengurus).
            Pendaftaran petugas hanya bisa dilakukan pada window jimpitan buka
            (Sabtu 19:00 - 23:00 WIB).
          </p>
        </CardContent>
      </Card>

      {/* Panel Pending ACC untuk Bendahara — di atas history supaya sangat terlihat */}
      {profile && (
        <PendingAccList
          sesiList={(sesi ?? []).filter((s) => s.status === 'SUBMITTED')}
          currentUserRole={profile.role}
          currentUserName={profile.nama_kk}
        />
      )}

      {/* List Sesi */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            History Sesi {months[currentMonth]} {currentYear}
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={prevMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={nextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {loading ? (
          <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Memuat data...
            </CardContent>
          </Card>
        ) : sesi.length > 0 ? (
          <div className="space-y-2">
            {sesi.map((s) => {
              const statusConfig = {
                DRAFT: { color: 'bg-slate-100 text-slate-700', label: 'Draft' },
                AKTIF: { color: 'bg-amber-100 text-amber-700', label: 'Aktif' },
                SUBMITTED: { color: 'bg-blue-100 text-blue-700', label: 'Menunggu ACC' },
                APPROVED: { color: 'bg-emerald-100 text-emerald-700', label: 'Disetujui' },
                REJECTED: { color: 'bg-rose-100 text-rose-700', label: 'Ditolak' },
                CANCELLED: { color: 'bg-rose-100 text-rose-700', label: 'Dibatalkan' },
              }[(s.status as 'DRAFT' | 'AKTIF' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED')] || { color: 'bg-slate-100 text-slate-700', label: s.status }

              const details = ((s as unknown) as { jimpitan_detail?: Array<{ is_bayar: boolean; nominal: number }> }).jimpitan_detail ?? []
              const totalFromSummary = Number(s.total_pendapatan ?? s.total_nominal ?? 0)
              const totalFromDetails = details
                .filter((d: { is_bayar: boolean; nominal: number }) => d.is_bayar)
                .reduce((acc: number, d: { is_bayar: boolean; nominal: number }) => acc + Number(d.nominal), 0)
              const total = totalFromSummary > 0 ? totalFromSummary : totalFromDetails

              const tglDiambil = new Date(s.tanggal)
              const tglDicatat = s.waktu_mulai ? new Date(s.waktu_mulai) : null
              const isLateEntry = tglDicatat
                ? tglDicatat.getTime() - tglDiambil.getTime() > 24 * 3600 * 1000
                : false
              const fmtWaktu = (d: Date) =>
                d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

              return (
                <Link
                  key={s.id}
                  href={`/dashboard/jimpitan/${s.id}`}
                  className="block bg-white rounded-xl border border-slate-200/60 p-4 hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-center shrink-0 w-14">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">
                        {tglDiambil.toLocaleString('id-ID', { month: 'short' })}
                      </p>
                      <p className="text-2xl font-bold leading-none">
                        {tglDiambil.getDate()}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">
                          Diambil {formatTanggal(s.tanggal)}
                        </p>
                        <Badge className={`${statusConfig.color} text-[9px]`}>
                          {statusConfig.label}
                        </Badge>
                        {isLateEntry && (
                          <Badge className="bg-purple-100 text-purple-700 text-[9px]">
                            📝 Input Manual
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>👤 {s.nama_inputter_snapshot}</span>
                        <span>•</span>
                        <span className="font-semibold text-emerald-700">💰 {formatRupiah(total)}</span>
                        <span>•</span>
                        <span>👥 {s.jumlah_warga_bayar > 0 ? s.jumlah_warga_bayar : details.filter((d: { is_bayar: boolean; nominal: number }) => d.is_bayar).length} warga</span>
                      </div>
                      {tglDicatat && (
                        <p className="text-[10px] text-purple-700 mt-0.5">
                          ✏️ Dicatat: {fmtWaktu(tglDicatat)}
                          {isLateEntry && (
                            <span className="text-muted-foreground"> ({(s.catatan || '').includes('manual') ? 'Manual' : 'Terlambat'})</span>
                          )}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Belum ada sesi jimpitan pada bulan {months[currentMonth]} {currentYear}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
