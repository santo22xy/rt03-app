import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { JimpitanForm } from './jimpitan-form'

export const dynamic = 'force-dynamic'

export default async function JimpitanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // FIX: pakai admin client untuk bypass RLS recursion di profiles policy.
  const supabase = createAdminClient()

  // Ambil data sesi (termasuk approved_by untuk join dengan profile)
  const { data: sesi, error } = await supabase
    .from('jimpitan_sesi')
    .select(`
      id, tanggal, status, total_nominal, jumlah_warga_bayar, jumlah_penjaga_hadir,
      kelompok_id, keadaan, catatan, nama_inputter_snapshot, blok_inputter_snapshot,
      waktu_mulai, waktu_submit, approved_at, approved_by,
      created_by_user_id, created_by_name, created_by_role, created_at, created_from,
      submitted_by_user_id, submitted_by_name, submitted_at,
      cancelled_by_user_id, cancelled_by_name, cancelled_at, cancel_reason,
      kas_transaction_id,
      approver:profiles!jimpitan_sesi_approved_by_fkey(id, nama_kk, role)
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[JimpitanDetail] query error:', error.message, 'id:', id)
    notFound()
  }
  if (!sesi) notFound()

  // Map kelompok_id sesi → minggu_ke jadwal_ronda
  // K1 = minggu 1, K2 = minggu 2, K3 = minggu 3, K4 = minggu 4
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
  const mingguKe = kelompokToMinggu(sesi.kelompok_id) ?? tanggalMingguKe(sesi.tanggal)

  // Ambil profil penjaga jadwal (yang efektif setelah swap)
  const { data: jadwalInfo } = await supabase
    .from('v_penjaga_efektif')
    .select('profile_efektif_id, nama_efektif, nama_asli, is_swapped, profile_asli_id')
    .eq('tanggal', sesi.tanggal)
    .maybeSingle()

  // Ambil semua profile yang punya rumah di RT 03 (WARGA + pengurus yang tinggal di sini)
  // Filter blok IS NOT NULL supaya SUPERADMIN (blok=X) tidak ikut
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, nama_kk, blok, nomor_rumah, login_id, kategori_tarif, role')
    .eq('is_active', true)
    .not('blok', 'is', null)
    .not('nomor_rumah', 'is', null)
    .neq('blok', 'X')
    .order('blok', { ascending: true })
    .order('nomor_rumah', { ascending: true })

  // Ambil detail jimpitan yang sudah ada
  const { data: details } = await supabase
    .from('jimpitan_detail')
    .select('profile_id, nominal, is_bayar')
    .eq('sesi_id', id)

  // Ambil attendance
  const { data: attendance } = await supabase
    .from('ronda_attendance')
    .select('profile_id, is_pengganti, pengganti_dari_nama')
    .eq('sesi_id', id)

  // Ambil daftar penjaga terjadwal untuk KELOMPOK sesi ini (untuk "Tandai Kehadiran Penjaga")
  // Kalau sesi tidak punya kelompok (null), tampilkan semua penjaga
  void (async () => {
    if (mingguKe === null) return
    const { data: penjagaJadwal } = await supabase
      .from('jadwal_ronda')
      .select('penjaga_profile_id')
      .eq('minggu_ke', mingguKe)
      .eq('is_active', true)
    void penjagaJadwal
  })()

  // Ambil SEMUA anggota kelompok (ketua + anggota) untuk absen & display
  // Kalau sesi tidak punya kelompok, kosong (fallback ke "semua warga")
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
    const { data: anggota } = await supabase
      .from('ronda_kelompok')
      .select('id, kelompok_id, profile_id, nama_kk_snapshot, role_kelompok, urutan')
      .eq('is_active', true)
      .eq('kelompok_id', `K${mingguKe}`)
      .order('urutan', { ascending: true })
    anggotaKelompok = (anggota ?? []) as AnggotaRow[]
  }

  type StatusKey = 'AKTIF' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'DRAFT' | 'CANCELLED'
  const statusConfig: { color: string; label: string; icon: typeof Clock } = {
    DRAFT: { color: 'bg-slate-100 text-slate-700', label: '📝 Draft', icon: Clock },
    AKTIF: { color: 'bg-amber-100 text-amber-700', label: '🟡 Sedang Berlangsung', icon: Clock },
    SUBMITTED: { color: 'bg-blue-100 text-blue-700', label: '🔵 Menunggu ACC Bendahara', icon: AlertCircle },
    APPROVED: { color: 'bg-emerald-100 text-emerald-700', label: '✅ Disetujui Bendahara', icon: CheckCircle2 },
    REJECTED: { color: 'bg-rose-100 text-rose-700', label: '❌ Ditolak', icon: XCircle },
    CANCELLED: { color: 'bg-rose-100 text-rose-700', label: '❌ Dibatalkan', icon: XCircle },
  }[(sesi.status as StatusKey)] || { color: 'bg-slate-100 text-slate-700', label: sesi.status, icon: Clock }

  // Ambil profil user yang sedang login (untuk panel validasi)
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  let currentUserRole = ''
  let currentUserName: string | null = null
  if (user) {
    const { data: me } = await supabase
      .from('profiles')
      .select('id, nama_kk, role')
      .eq('id', user.id)
      .maybeSingle()
    currentUserRole = me?.role ?? ''
    currentUserName = me?.nama_kk ?? null
  }

  // Siapkan info approver (kalau ada)
  type ApproverRel = { id: string; nama_kk: string; role: string } | { id: string; nama_kk: string; role: string }[] | null
  const approverRaw = (sesi as { approver?: ApproverRel }).approver
  const approverObj = Array.isArray(approverRaw) ? approverRaw[0] : approverRaw
  const approvedByName = approverObj?.nama_kk ?? null

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/jimpitan" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold">Sesi Jimpitan</h1>
          <p className="text-xs text-muted-foreground">
            {formatTanggal(sesi.tanggal)} · Petugas: {sesi.nama_inputter_snapshot}
          </p>
        </div>
        <Badge className={`${statusConfig.color} hover:${statusConfig.color} text-[10px]`}>
          {statusConfig.label}
        </Badge>
      </div>

      {/* Summary Cards — hitung dari detail aktual, bukan field sesi yang mungkin masih 0 */}
      {(() => {
        const detailArr = details ?? []
        const paidDetails = detailArr.filter((d) => d.is_bayar)
        const calcTotal = paidDetails.reduce((sum, d) => sum + Number(d.nominal || 0), 0)
        const calcBayar = paidDetails.length
        const calcHadir = (attendance ?? []).length
        // Gunakan field sesi jika sudah terisi (>0), fallback ke kalkulasi detail
        const displayTotal = Number(sesi.total_nominal) > 0 ? Number(sesi.total_nominal) : calcTotal
        const displayBayar = (sesi.jumlah_warga_bayar ?? 0) > 0 ? sesi.jumlah_warga_bayar : calcBayar
        const displayHadir = (sesi.jumlah_penjaga_hadir ?? 0) > 0 ? sesi.jumlah_penjaga_hadir : calcHadir
        return (
          <div className="grid grid-cols-3 gap-2">
            <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
              <CardContent className="p-3 text-center">
                <p className="text-[9px] font-bold uppercase text-muted-foreground">Total</p>
                <p className="text-base font-bold text-emerald-600 mt-0.5 truncate">
                  {formatRupiah(displayTotal)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
              <CardContent className="p-3 text-center">
                <p className="text-[9px] font-bold uppercase text-muted-foreground">Bayar</p>
                <p className="text-base font-bold text-blue-600 mt-0.5">
                  {displayBayar}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
              <CardContent className="p-3 text-center">
                <p className="text-[9px] font-bold uppercase text-muted-foreground">Hadir</p>
                <p className="text-base font-bold text-purple-600 mt-0.5">
                  {displayHadir}
                </p>
              </CardContent>
            </Card>
          </div>
        )
      })()}

      {/* Form */}
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
        approvedByName={approvedByName}
        approvedAt={sesi.approved_at}
        currentUserRole={currentUserRole}
        currentUserName={currentUserName}
        createdByName={sesi.created_by_name}
        createdByRole={sesi.created_by_role}
        createdAt={sesi.created_at}
        createdFrom={sesi.created_from}
        submittedByName={sesi.submitted_by_name}
        submittedAt={sesi.submitted_at}
        cancelledByName={sesi.cancelled_by_name}
        cancelledAt={sesi.cancelled_at}
        cancelReason={sesi.cancel_reason}
      />
    </div>
  )
}
