import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { HandCoins, ArrowRight, CheckCircle2, Clock, ShieldAlert, Calendar } from 'lucide-react'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { getNextSaturdays } from '@/lib/ronda'
import { BuatSesiForm } from './buat-sesi-form'

export const dynamic = 'force-dynamic'

const roleLabelMap: Record<string, string> = {
  KETUA_RT: 'Ketua RT',
  BENDAHARA: 'Bendahara',
  SEKRETARIS: 'Sekretaris',
  PENGURUS: 'Pengurus',
  SUPERADMIN: 'Super Admin',
}

export default async function JimpitanListPage() {
  // FIX: pakai admin client untuk bypass RLS recursion di profiles policy.
  const auth = await createClient()
  const supabase = createAdminClient()

  // Cek user login + role
  const { data: { user } } = await auth.auth.getUser()
  let isPengurus = false
  let profile: { id: string; role: string; nama_kk: string } | null = null
  if (user) {
    const { data: p } = await auth
      .from('profiles')
      .select('id, role, nama_kk')
      .eq('id', user.id)
      .single()
    profile = p
    isPengurus = ['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'].includes(p?.role ?? '')
  }

  // Cek apakah sekarang window jimpitan (Sabtu 19-23 WIB)
  const { data: isOpenData } = await supabase.rpc('is_jimpitan_window_open')
  const isWindowOpen = !!isOpenData

  // List semua sesi
  const { data: sesi } = await supabase
    .from('jimpitan_sesi')
    .select(`
      id, tanggal, status, total_nominal, total_pendapatan, jumlah_warga_bayar, jumlah_penjaga_hadir,
      keadaan, nama_inputter_snapshot, blok_inputter_snapshot, waktu_mulai, waktu_submit, approved_at, catatan
    `)
    .order('tanggal', { ascending: false })
    .limit(20)

  // Ambil daftar Sabtu terdekat (untuk opsi tanggal pengurus)
  const nextSaturdays = getNextSaturdays(4)

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

      {/* Mode Pengurus - Buat sesi manual (untuk uji coba alur di luar window) */}
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
                  defaultValue={nextSaturdays[0]?.value ?? ''}
                >
                  {nextSaturdays.map((s) => (
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

      {/* List Sesi */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
          History Sesi
        </h2>
        {sesi && sesi.length > 0 ? (
          <div className="space-y-2">
            {sesi.map((s) => {
              const statusConfig = {
                AKTIF: { color: 'bg-amber-100 text-amber-700', label: 'Aktif' },
                SUBMITTED: { color: 'bg-blue-100 text-blue-700', label: 'Submitted' },
                APPROVED: { color: 'bg-emerald-100 text-emerald-700', label: 'Disetujui' },
                REJECTED: { color: 'bg-rose-100 text-rose-700', label: 'Ditolak' },
              }[(s.status as 'AKTIF' | 'SUBMITTED' | 'APPROVED' | 'REJECTED')] || { color: 'bg-slate-100 text-slate-700', label: s.status }

              const total = Number(s.total_pendapatan ?? s.total_nominal ?? 0)

              // Tanggal diambil = sesi.tanggal
              // Tanggal dicatat = sesi.waktu_mulai (timestamp) atau created_at
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
                        <span>👥 {s.jumlah_warga_bayar ?? 0} warga</span>
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
              Belum ada sesi jimpitan
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}