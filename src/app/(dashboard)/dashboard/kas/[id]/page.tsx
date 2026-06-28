import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { ArrowLeft, CheckCircle2, Users, Shield, XCircle, AlertCircle, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { KasDetailClient } from './kas-detail-client'

export const dynamic = 'force-dynamic'

export default async function KasDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: sesi, error } = await supabase
    .from('jimpitan_sesi')
    .select(`
      id, tanggal, status, total_nominal, jumlah_warga_bayar, jumlah_penjaga_hadir,
      keadaan, catatan, nama_inputter_snapshot, blok_inputter_snapshot,
      waktu_mulai, waktu_submit, approved_at, approved_by,
      approver:approved_by(nama_kk)
    `)
    .eq('id', id)
    .single()

  if (error || !sesi) notFound()

  // Ambil detail jimpitan (warga yang bayar)
  // Catatan: jimpitan_detail real columns = login_id, nama_kk_snapshot, status_bayar, is_bayar
  // (TIDAK ada blok_snapshot/nomor_rumah_snapshot) → join profiles untuk dapat blok/nomor_rumah
  const { data: details } = await supabase
    .from('jimpitan_detail')
    .select(`
      id, profile_id, login_id, nama_kk_snapshot, nominal, is_bayar,
      profile:profiles!jimpitan_detail_profile_id_fkey(id, nama_kk, blok, nomor_rumah)
    `)
    .eq('sesi_id', id)
    .order('login_id', { ascending: true })

  // Ambil attendance
  const { data: attendance } = await supabase
    .from('ronda_attendance')
    .select('id, profile_id, nama_snapshot, is_pengganti, pengganti_dari_nama')
    .eq('sesi_id', id)

  const statusConfig: { color: string; label: string; icon: LucideIcon } = {
    SUBMITTED: { color: 'bg-amber-100 text-amber-700', label: '🟡 Menunggu ACC', icon: AlertCircle },
    APPROVED: { color: 'bg-emerald-100 text-emerald-700', label: '✅ Disetujui', icon: CheckCircle2 },
    AKTIF: { color: 'bg-blue-100 text-blue-700', label: '🟢 Sedang Berlangsung', icon: AlertCircle },
    REJECTED: { color: 'bg-rose-100 text-rose-700', label: '❌ Ditolak', icon: XCircle },
  }[(sesi.status as 'AKTIF' | 'SUBMITTED' | 'APPROVED' | 'REJECTED')] || { color: 'bg-slate-100 text-slate-700', label: sesi.status, icon: AlertCircle as LucideIcon }

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/kas" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold">Detail Kas</h1>
          <p className="text-xs text-muted-foreground">
            {formatTanggal(sesi.tanggal)} · Total Jimpitan
          </p>
        </div>
        <Badge className={`${statusConfig.color} hover:${statusConfig.color} text-[10px]`}>
          {statusConfig.label}
        </Badge>
      </div>

      {/* Total Highlight */}
      <Card className="border-0 shadow-md ring-1 ring-emerald-200/60 overflow-hidden bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 text-white">
        <CardContent className="p-5 text-center">
          <p className="text-[10px] font-bold uppercase opacity-80">
            Total Jimpitan {formatTanggal(sesi.tanggal)}
          </p>
          <p className="text-3xl md:text-4xl font-bold mt-2">
            {formatRupiah(sesi.total_nominal)}
          </p>
          <div className="flex items-center justify-center gap-4 mt-3 text-xs opacity-90">
            <span>👥 {sesi.jumlah_warga_bayar} KK</span>
            <span>🛡️ {sesi.jumlah_penjaga_hadir} penjaga</span>
            <span>{sesi.keadaan === 'AMAN' ? '🟢 Aman' : '🟡 Laporan'}</span>
          </div>
        </CardContent>
      </Card>

      {/* ACC Action */}
      {sesi.status === 'SUBMITTED' && <KasDetailClient.AksiACC sesiId={sesi.id} />}

      {/* Penanda Tangan */}
      <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
        <CardContent className="p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Petugas Input</span>
            <span className="font-semibold">{sesi.nama_inputter_snapshot}</span>
          </div>
          {sesi.waktu_submit && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Waktu Submit</span>
              <span className="font-semibold">
                {new Date(sesi.waktu_submit).toLocaleString('id-ID', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          )}
          {sesi.approved_at && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Disetujui oleh</span>
              <span className="font-semibold text-emerald-600">
                {(sesi.approver as { nama_kk?: string } | null)?.nama_kk || 'Bendahara'}
              </span>
            </div>
          )}
          {sesi.catatan && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-muted-foreground mb-1">Catatan:</p>
              <p className="whitespace-pre-wrap">{sesi.catatan}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daftar Pembayar */}
      <Card className="border-0 shadow-md ring-1 ring-slate-200/60 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-3 border-b border-blue-100">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
              Daftar Pembayar ({details?.filter((d) => d.is_bayar).length || 0})
            </p>
          </div>
        </div>
        <CardContent className="p-0">
          {details && details.filter((d) => d.is_bayar).length > 0 ? (
            <div className="divide-y divide-slate-100">
              {details
                .filter((d) => d.is_bayar)
                .map((d) => {
                  // Blok/nomor_rumah dari joined profile (jimpitan_detail tidak punya snapshot-nya)
                  const profile = Array.isArray(d.profile) ? d.profile[0] : d.profile
                  const blok = profile?.blok ?? '-'
                  const noRumah = profile?.nomor_rumah ?? '-'
                  return (
                  <div key={d.id} className="flex items-center gap-3 p-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {d.nama_kk_snapshot?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{d.nama_kk_snapshot}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Blok {blok} No. {noRumah} · {d.login_id}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-emerald-600 shrink-0">
                      {formatRupiah(Number(d.nominal))}
                    </p>
                  </div>
                  )
                })}
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Tidak ada yang bayar
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kehadiran Penjaga */}
      {attendance && attendance.length > 0 && (
        <Card className="border-0 shadow-md ring-1 ring-slate-200/60 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-50 to-violet-50 px-5 py-3 border-b border-purple-100">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-600" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                Penjaga Hadir ({attendance.length})
              </p>
            </div>
          </div>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {attendance.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-violet-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                    {a.nama_snapshot?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{a.nama_snapshot}</p>
                    {a.is_pengganti && a.pengganti_dari_nama && (
                      <p className="text-[10px] text-purple-600">
                        Pengganti {a.pengganti_dari_nama}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
