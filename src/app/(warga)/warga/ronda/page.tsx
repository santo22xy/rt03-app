import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cookies } from 'next/headers'
import { Calendar, Shield, HandCoins, ChevronRight, Users, Clock, CheckCircle2 } from 'lucide-react'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { DaftarInputter } from './daftar-inputter'
import { JadwalListWarga } from './jadwal-list-warga'

export const dynamic = 'force-dynamic'

export default async function WargaRondaPage() {
  const admin = createAdminClient()
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('warga_session')?.value
  
  let profileId: string | null = null
  
  if (sessionToken) {
    // Warga login normal
    const { data: pid } = await admin.rpc('get_warga_from_session', {
      p_token: sessionToken,
    })
    if (pid) {
      profileId = pid
    }
  } else {
    // Dual-role: pengurus yang mengakses /warga
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()
      if (profile) {
        profileId = profile.id
      }
    }
  }

  if (!profileId) redirect('/login')

  const { data: profile } = await admin
    .from('profiles')
    .select('id, nama_kk, blok, nomor_rumah, login_id, is_active')
    .eq('id', profileId)
    .single()

  if (!profile) return null

  // Cek window jimpitan
  const { data: isOpen } = await admin.rpc('is_jimpitan_window_open')

  // Cari sesi AKTIF untuk hari ini (jika ada)
  // FIX timezone: pakai local-date formatter (lihat dashboard/page.tsx untuk penjelasan bug)
  const _todayRonda = new Date()
  const today = `${_todayRonda.getFullYear()}-${String(_todayRonda.getMonth() + 1).padStart(2, '0')}-${String(_todayRonda.getDate()).padStart(2, '0')}`
  const { data: sesiAktif } = await admin
    .from('jimpitan_sesi')
    .select('id, tanggal, input_by, status, nama_inputter_snapshot, blok_inputter_snapshot')
    .eq('tanggal', today)
    .in('status', ['AKTIF', 'SUBMITTED'])
    .maybeSingle()

  // Jadwal ronda 4 minggu ke depan (langsung pakai v_penjaga_efektif di bawah)
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + 28)
  const futureDateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`

  // Jadwal dengan info swap + minggu_ke (untuk lookup anggota kelompok)
  const { data: jadwalWithSwap } = await admin
    .from('v_penjaga_efektif')
    .select('tanggal, profile_efektif_id, nama_efektif, is_swapped, nama_asli, minggu_ke')
    .gte('tanggal', today)
    .lte('tanggal', futureDateStr)
    .order('tanggal', { ascending: true })

  // Roster anggota kelompok (untuk expandable anggota)
  const { data: kelompok } = await admin
    .from('ronda_kelompok')
    .select('id, kelompok_id, profile_id, login_id, nama_kk_snapshot, role_kelompok, urutan')
    .eq('is_active', true)
    .order('kelompok_id', { ascending: true })
    .order('urutan', { ascending: true })

  // Group kelompok by kelompok_id untuk lookup cepat
  const kelompokByKelompokId: Record<string, typeof kelompok> = {}
  ;(kelompok ?? []).forEach((k) => {
    if (!kelompokByKelompokId[k.kelompok_id]) kelompokByKelompokId[k.kelompok_id] = []
    kelompokByKelompokId[k.kelompok_id]!.push(k)
  })

  // Riwayat kehadiran (saya sebagai penjaga)
  const { data: myAttendance } = await admin
    .from('ronda_attendance')
    .select(`
      id, is_pengganti, pengganti_dari_nama,
      sesi:jimpitan_sesi!inner(tanggal, status)
    `)
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(20)

  // Cek apakah SAYA yang jadwal jaga di salah satu tanggal
  const isMyTurn = jadwalWithSwap?.find(
    (j) => j.profile_efektif_id === profile.id
  )
  // Cek apakah SAYA adalah petugas ronda untuk HARI INI
  const isMyTurnToday = jadwalWithSwap?.find(
    (j) => j.profile_efektif_id === profile.id && j.tanggal === today
  )

  return (
    <div className="space-y-4 pb-6">
      {/* ============================================ */}
      {/* HEADER GRADIENT */}
      {/* ============================================ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white shadow-xl shadow-orange-500/20">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mb-16" />

        <div className="relative p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/30 shrink-0">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-amber-100 uppercase tracking-wider">
                Ronda & Jimpitan
              </p>
              <h1 className="text-2xl font-bold leading-tight">Jadwal Ronda</h1>
            </div>
          </div>
          <p className="text-sm text-amber-100">
            Pantau jadwal & daftar jadi petugas input jimpitan
          </p>
        </div>
      </div>

      {/* Status Window + Aksi Daftar */}
      {isOpen && (
        <Card className="border-0 shadow-lg ring-1 ring-emerald-300 overflow-hidden bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">
                Window Jimpitan Sedang Buka
              </p>
            </div>
            <h2 className="text-lg font-bold">🟢 Malam ini, {new Date().toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            <p className="text-sm opacity-90 mt-1">
              {sesiAktif
                ? sesiAktif.input_by === profile.id
                  ? 'Anda sudah terdaftar sebagai petugas input jimpitan.'
                  : `Petugas saat ini: ${sesiAktif.nama_inputter_snapshot} (${sesiAktif.blok_inputter_snapshot})`
                : 'Belum ada petugas. Daftarkan diri Anda sekarang!'}
            </p>
            {!sesiAktif && isMyTurnToday && (
              <div className="mt-4">
                <DaftarInputter tanggal={today} />
              </div>
            )}
            {!sesiAktif && !isMyTurnToday && (
              <div className="mt-4 p-3 bg-white/10 rounded-lg text-sm">
                <p className="font-semibold">Hanya warga yang bertugas ronda hari ini yang bisa membuat sesi jimpitan.</p>
              </div>
            )}
            {sesiAktif && sesiAktif.input_by === profile.id && (
              <Link
                href={`/warga/jimpitan/${sesiAktif.id}`}
                className="mt-4 inline-flex items-center gap-2 bg-white text-emerald-700 font-semibold text-sm px-4 py-2.5 rounded-lg hover:bg-emerald-50 transition-colors"
              >
                <HandCoins className="w-4 h-4" />
                Buka Form Input
                <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {!isOpen && (
        <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-slate-500" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Window Jimpitan Tertutup</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Dibuka setiap Sabtu 19:00 - 23:00 WIB
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Giliran Saya */}
      {isMyTurn && (
        <Card className="border-0 shadow-md ring-1 ring-purple-300/60 overflow-hidden bg-gradient-to-r from-purple-50 to-violet-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-purple-600" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                Giliran Anda
              </p>
            </div>
            <p className="font-semibold text-sm">
              Sabtu, {new Date(isMyTurn.tanggal).toLocaleString('id-ID', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
            {isMyTurn.is_swapped && (
              <p className="text-[11px] text-purple-600 mt-1">
                Anda sebagai pengganti {isMyTurn.nama_asli}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Jadwal 8 Sabtu ke Depan */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5" />
          8 Sabtu ke Depan
        </h2>
        {jadwalWithSwap && jadwalWithSwap.length > 0 ? (
          <JadwalListWarga
            jadwal={jadwalWithSwap}
            kelompokByKelompokId={kelompokByKelompokId as Record<string, Array<{
              id: string; kelompok_id: string; profile_id: string;
              login_id: string; nama_kk_snapshot: string;
              role_kelompok: string; urutan: number
            }>>}
            profileId={profile.id}
            today={today}
          />
        ) : (
          <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Belum ada jadwal ronda
            </CardContent>
          </Card>
        )}
      </div>

      {/* Riwayat Kehadiran Saya */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Users className="w-3.5 h-3.5" />
          Riwayat Kehadiran Anda ({myAttendance?.length || 0}x)
        </h2>
        {myAttendance && myAttendance.length > 0 ? (
          <Card className="border-0 shadow-md ring-1 ring-slate-200/60 overflow-hidden">
            <CardContent className="p-0 divide-y divide-slate-100">
              {myAttendance.map((a) => {
                const sesi = Array.isArray(a.sesi) ? a.sesi[0] : a.sesi
                const tanggalSesi = (sesi as { tanggal?: string } | null)?.tanggal
                return (
                  <div key={a.id} className="flex items-center gap-3 p-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-violet-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">
                        {tanggalSesi
                          ? new Date(tanggalSesi).toLocaleString('id-ID', {
                              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                            })
                          : 'Tanggal tidak diketahui'}
                      </p>
                      {a.is_pengganti && a.pengganti_dari_nama && (
                        <p className="text-[10px] text-purple-600">
                          Pengganti {a.pengganti_dari_nama}
                        </p>
                      )}
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-700 text-[9px] hover:bg-emerald-100">
                      Hadir
                    </Badge>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Belum ada kehadiran tercatat
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
