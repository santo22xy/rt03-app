import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { ArrowLeft, Clock, CheckCircle2, AlertCircle, XCircle, type LucideIcon } from 'lucide-react'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { JimpitanForm } from '@/app/(dashboard)/dashboard/jimpitan/[id]/jimpitan-form'

export const dynamic = 'force-dynamic'

export default async function WargaJimpitanPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('warga_session')?.value
  if (!sessionToken) redirect('/login')

  const admin = createAdminClient()
  const { data: profileId } = await admin.rpc('get_warga_from_session', {
    p_token: sessionToken,
  })
  if (!profileId) redirect('/login')

  const { data: profile } = await admin
    .from('profiles')
    .select('id, nama_kk, blok, nomor_rumah, login_id, is_active, role')
    .eq('id', profileId)
    .single()

  if (!profile) redirect('/login')

  const { data: sesi, error } = await admin
    .from('jimpitan_sesi')
    .select(`
      id, tanggal, status, total_nominal, jumlah_warga_bayar, jumlah_penjaga_hadir,
      kelompok_id, keadaan, catatan, nama_inputter_snapshot, blok_inputter_snapshot,
      input_by, waktu_mulai, waktu_submit
    `)
    .eq('id', id)
    .single()

  if (error || !sesi) notFound()

  // Authorization: warga hanya boleh akses jika dia inputter ATAU sesi masih AKTIF (bisa lihat tapi tidak input)
  // (cek dilakukan di action handlers)

  // Map kelompok_id sesi → minggu_ke jadwal_ronda (K1=1, K2=2, ...)
  const kelompokToMinggu = (k: string | null): number | null => {
    if (!k) return null
    const m = k.match(/K(\d+)/)
    return m ? parseInt(m[1], 10) : null
  }
  // Fallback: kalau sesi.kelompok_id NULL (sesi lama/manual), compute dari tanggal
  // Rumus: Sabtu ke-N dari bulan itu. Misal tgl 20 → ceil(20/7) = 3 → minggu 3 → K3
  const tanggalMingguKe = (t: string): number | null => {
    const d = new Date(t)
    if (isNaN(d.getTime())) return null
    const day = d.getUTCDate()
    const m = Math.ceil(day / 7)
    return m >= 1 && m <= 4 ? m : null
  }
  const mingguKe = kelompokToMinggu((sesi as { kelompok_id?: string | null }).kelompok_id ?? null) ?? tanggalMingguKe(sesi.tanggal)

  // Ambil penjaga jadwal
  const { data: jadwalInfo } = await admin
    .from('v_penjaga_efektif')
    .select('profile_efektif_id, nama_efektif, nama_asli, is_swapped, profile_asli_id')
    .eq('tanggal', sesi.tanggal)
    .maybeSingle()

  const { data: allProfiles } = await admin
    .from('profiles')
    .select('id, nama_kk, blok, nomor_rumah, login_id, kategori_tarif, role')
    .eq('is_active', true)
    .not('blok', 'is', null)
    .not('nomor_rumah', 'is', null)
    .neq('blok', 'X')
    .order('blok', { ascending: true })
    .order('nomor_rumah', { ascending: true })

  const { data: details } = await admin
    .from('jimpitan_detail')
    .select('profile_id, nominal, is_bayar')
    .eq('sesi_id', id)

  const { data: attendance } = await admin
    .from('ronda_attendance')
    .select('profile_id, is_pengganti, pengganti_dari_nama')
    .eq('sesi_id', id)

  // Ambil anggota kelompok (untuk absen & display)
  type AnggotaRow = {
    id: string
    kelompok_id: string
    profile_id: string
    nama_kk_snapshot: string
    role_kelompok: string
    urutan: number
  }
  let anggotaKelompok: AnggotaRow[] = []
  if (mingguKe !== null) {
    const { data: anggota } = await admin
      .from('ronda_kelompok')
      .select('id, kelompok_id, profile_id, nama_kk_snapshot, role_kelompok, urutan')
      .eq('is_active', true)
      .eq('kelompok_id', `K${mingguKe}`)
      .order('urutan', { ascending: true })
    anggotaKelompok = (anggota ?? []) as AnggotaRow[]
  }

  const statusConfig: { color: string; label: string; icon: LucideIcon } = {
    AKTIF: { color: 'bg-amber-100 text-amber-700', label: '🟡 Sedang Berlangsung', icon: Clock },
    SUBMITTED: { color: 'bg-blue-100 text-blue-700', label: '🔵 Menunggu ACC', icon: AlertCircle },
    APPROVED: { color: 'bg-emerald-100 text-emerald-700', label: '✅ Disetujui', icon: CheckCircle2 },
    REJECTED: { color: 'bg-rose-100 text-rose-700', label: '❌ Ditolak', icon: XCircle },
  }[(sesi.status as 'AKTIF' | 'SUBMITTED' | 'APPROVED' | 'REJECTED')] || { color: 'bg-slate-100 text-slate-700', label: sesi.status, icon: Clock as LucideIcon }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <Link href="/warga/ronda" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold">Input Jimpitan</h1>
          <p className="text-xs text-muted-foreground">{formatTanggal(sesi.tanggal)}</p>
        </div>
        <Badge className={`${statusConfig.color} hover:${statusConfig.color} text-[10px]`}>
          {statusConfig.label}
        </Badge>
      </div>

      {/* Petugas info */}
      <Card className="border-0 shadow-sm ring-1 ring-emerald-200/60 bg-gradient-to-r from-emerald-50 to-teal-50">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center font-bold shrink-0">
            {sesi.nama_inputter_snapshot?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Petugas Input</p>
            <p className="font-semibold text-sm">{sesi.nama_inputter_snapshot}</p>
            <p className="text-[10px] text-muted-foreground">Blok {sesi.blok_inputter_snapshot}</p>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
          <CardContent className="p-3 text-center">
            <p className="text-[9px] font-bold uppercase text-muted-foreground">Total</p>
            <p className="text-base font-bold text-emerald-600 mt-0.5 truncate">
              {formatRupiah(sesi.total_nominal)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
          <CardContent className="p-3 text-center">
            <p className="text-[9px] font-bold uppercase text-muted-foreground">Bayar</p>
            <p className="text-base font-bold text-blue-600 mt-0.5">
              {sesi.jumlah_warga_bayar}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
          <CardContent className="p-3 text-center">
            <p className="text-[9px] font-bold uppercase text-muted-foreground">Hadir</p>
            <p className="text-base font-bold text-purple-600 mt-0.5">
              {sesi.jumlah_penjaga_hadir}
            </p>
          </CardContent>
        </Card>
      </div>

      <JimpitanForm
        sesiId={sesi.id}
        tanggal={sesi.tanggal}
        status={sesi.status}
        namaInputter={sesi.nama_inputter_snapshot}
        profiles={allProfiles ?? []}
        existingDetails={details ?? []}
        attendance={attendance ?? []}
        penjagaJadwal={jadwalInfo ?? null}
        anggotaKelompok={anggotaKelompok}
        keadaan={sesi.keadaan}
        catatan={sesi.catatan}
      />
    </div>
  )
}
