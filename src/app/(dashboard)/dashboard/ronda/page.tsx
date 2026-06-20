import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createAdminClient } from '@/lib/supabase/server'
import { Calendar, ArrowLeftRight } from 'lucide-react'
import { JadwalRondaClient } from './jadwal-ronda-client'

export const dynamic = 'force-dynamic'

export default async function RondaPage() {
  // FIX: pakai admin client untuk bypass RLS recursion di profiles policy.
  const supabase = createAdminClient()

  // Ambil jadwal ronda (urut tanggal ASC, max 20 ke depan)
  // FIX timezone: pakai local-date formatter (lihat dashboard/page.tsx untuk penjelasan bug)
  const _todayRonda = new Date()
  const today = `${_todayRonda.getFullYear()}-${String(_todayRonda.getMonth() + 1).padStart(2, '0')}-${String(_todayRonda.getDate()).padStart(2, '0')}`
  const { data: jadwal } = await supabase
    .from('jadwal_ronda')
    .select(`
      id, tanggal, minggu_ke, bulan, tahun,
      penjaga_profile_id, nama_penjaga_snapshot, blok_snapshot, nomor_rumah_snapshot
    `)
    .gte('tanggal', today)
    .order('tanggal', { ascending: true })
    .limit(20)

  // Ambil swap history
  const { data: swaps } = await supabase
    .from('ronda_swap')
    .select(`
      id, tanggal, profile_asli_id, profile_pengganti_id,
      nama_asli_snapshot, nama_pengganti_snapshot, keterangan, created_at
    `)
    .order('created_at', { ascending: false })
    .limit(20)

  // Ambil list profile warga (untuk tambah jadwal)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, nama_kk, blok, nomor_rumah, login_id')
    .eq('is_active', true)
    .eq('role', 'WARGA')
    .order('blok', { ascending: true })
    .order('nomor_rumah', { ascending: true })

  // Ambil roster kelompok (untuk show anggota per jadwal)
  const { data: kelompok } = await supabase
    .from('ronda_kelompok')
    .select('id, kelompok_id, profile_id, login_id, nama_kk_snapshot, role_kelompok, urutan')
    .eq('is_active', true)
    .order('kelompok_id', { ascending: true })
    .order('urutan', { ascending: true })

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-4 h-4 text-amber-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600">
            Ronda
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold">Jadwal Ronda</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Kelola jadwal penjagaan Sabtu malam & history penggantian
        </p>
      </div>

      {/* Jadwal Mendatang */}
      <Card className="border-0 shadow-md ring-1 ring-slate-200/60 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-5 py-4 border-b border-blue-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">
                Jadwal Mendatang
              </p>
              <CardTitle className="text-lg mt-0.5">12 Sabtu ke Depan</CardTitle>
            </div>
            <Badge className="bg-blue-600 text-white hover:bg-blue-600">
              {jadwal?.length ?? 0} terjadwal
            </Badge>
          </div>
        </div>
        <CardContent className="p-0">
          <JadwalRondaClient
            jadwal={jadwal ?? []}
            profiles={profiles ?? []}
            kelompok={kelompok ?? []}
          />
        </CardContent>
      </Card>

      {/* History Swap */}
      <Card className="border-0 shadow-md ring-1 ring-slate-200/60 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 border-b border-amber-100">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-amber-600" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
              History Penggantian
            </p>
          </div>
          <CardTitle className="text-lg mt-0.5">Swap Terakhir</CardTitle>
        </div>
        <CardContent className="p-4">
          {swaps && swaps.length > 0 ? (
            <div className="space-y-2">
              {swaps.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200/60"
                >
                  <div className="text-center shrink-0 w-14">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">
                      {new Date(s.tanggal).toLocaleString('id-ID', { month: 'short' })}
                    </p>
                    <p className="text-2xl font-bold leading-none">
                      {new Date(s.tanggal).getDate()}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-semibold text-rose-600 line-through">
                        {s.nama_asli_snapshot}
                      </span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span className="font-semibold text-emerald-600">
                        {s.nama_pengganti_snapshot}
                      </span>
                    </p>
                    {s.keterangan && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {s.keterangan}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Belum ada history penggantian
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
