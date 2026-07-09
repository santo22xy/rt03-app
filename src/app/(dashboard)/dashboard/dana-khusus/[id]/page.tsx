import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatRupiah } from '@/lib/format'
import { ArrowLeft, HeartHandshake, Users, CheckCircle2, Clock, AlertCircle, Calendar, Target } from 'lucide-react'
import { PengaturanDanaKhusus } from '../pengaturan-dana-khusus'
import { SyncPesertaButton } from './sync-peserta-button'

export const dynamic = 'force-dynamic'

export default async function DanaKhususDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: dana, error: danaErr } = await admin
    .from('dana_khusus')
    .select('*')
    .eq('id', id)
    .single()

  if (danaErr || !dana) return notFound()

  // Ambil semua tagihan + progress per KK
  const { data: tagihanList, error: tagihanErr } = await admin
    .from('dana_khusus_tagihan')
    .select('*')
    .eq('dana_khusus_id', id)
    .order('login_id', { ascending: true })

  // Don't return 404 if tagihanErr, just use empty list
  const tagihanListSafe = tagihanList ?? []

  // Ambil profil lengkap
  const profileIds = tagihanListSafe.map(t => t.profile_id)
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, login_id, nama_kk, blok, nomor_rumah, no_hp')
    .in('id', profileIds)
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  // Ambil pembayaran history
  const { data: pembayaranList } = await admin
    .from('dana_khusus_pembayaran')
    .select('*')
    .eq('dana_khusus_id', id)
    .order('tanggal_bayar', { ascending: false })
    .order('created_at', { ascending: false })

  const enrichedTagihan = tagihanListSafe
    .map(t => ({ ...t, profile: profileMap.get(t.profile_id) }))
    .sort((a, b) => {
      const ba = a.profile?.blok ?? 'Z'
      const bb = b.profile?.blok ?? 'Z'
      if (ba !== bb) return ba.localeCompare(bb)
      return Number(a.profile?.nomor_rumah ?? 0) - Number(b.profile?.nomor_rumah ?? 0)
    })

  const totalTagihan = enrichedTagihan.reduce((s, t) => s + Number(t.nominal_tagihan), 0)
  const totalTerbayar = enrichedTagihan.reduce((s, t) => s + Number(t.total_terbayar), 0)
  const lunasCount = enrichedTagihan.filter(t => t.status === 'LUNAS').length
  const cicilCount = enrichedTagihan.filter(t => t.status === 'CICIL').length
  const belumCount = enrichedTagihan.filter(t => t.status === 'BELUM').length
  const lebihCount = enrichedTagihan.filter(t => t.status === 'LEBIH').length
  const pct = totalTagihan > 0 ? Math.round(100 * totalTerbayar / totalTagihan) : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link href="/dashboard/dana-khusus" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          Kembali ke daftar dana khusus
        </Link>
        <div className="flex items-center gap-2">
          <SyncPesertaButton danaKhususId={dana.id} />
          <PengaturanDanaKhusus dana={{
          id: dana.id,
          judul: dana.judul,
          deskripsi: dana.deskripsi,
          kategori: dana.kategori,
          target_per_kk: Number(dana.target_per_kk),
          target_per_kk_khusus: dana.target_per_kk_khusus != null ? Number(dana.target_per_kk_khusus) : null,
          tanggal_mulai: dana.tanggal_mulai,
          tanggal_selesai: dana.tanggal_selesai,
          is_wajib: dana.is_wajib,
          is_active: dana.is_active,
        }} />
        </div>
      </div>

      {/* Header */}
      <Card className="border-0 shadow-md overflow-hidden">
        <div className={`h-2 ${pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} />
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shrink-0">
              <HeartHandshake className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl">{dana.judul}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">{dana.kategori}</Badge>
                {!dana.is_wajib && <Badge className="bg-purple-100 text-purple-700">Sukarela</Badge>}
                {dana.is_wajib && <Badge className="bg-blue-100 text-blue-700">Wajib</Badge>}
                {dana.is_active ? <Badge className="bg-emerald-100 text-emerald-700">Aktif</Badge> : <Badge variant="destructive">Non-aktif</Badge>}
              </div>
              {dana.deskripsi && <CardDescription className="mt-2">{dana.deskripsi}</CardDescription>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Target / KK</p>
              {dana.target_per_kk_khusus != null && Number(dana.target_per_kk_khusus) !== Number(dana.target_per_kk) ? (
                <>
                  <p className="text-sm font-bold text-blue-700">{formatRupiah(dana.target_per_kk)}</p>
                  <p className="text-[10px] text-blue-600 mt-0.5">Khusus: {formatRupiah(dana.target_per_kk_khusus)}</p>
                </>
              ) : (
                <p className="text-lg font-bold text-blue-700">{formatRupiah(dana.target_per_kk)}</p>
              )}
            </div>
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600">Total Target</p>
              <p className="text-lg font-bold text-purple-700">{formatRupiah(totalTagihan)}</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Terkumpul</p>
              <p className="text-lg font-bold text-emerald-700">{formatRupiah(totalTerbayar)}</p>
            </div>
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Sisa</p>
              <p className="text-lg font-bold text-rose-700">{formatRupiah(totalTagihan - totalTerbayar)}</p>
            </div>
          </div>

          <div className="px-1 mb-4">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-semibold">{pct}% tercapai</span>
              <span className="text-muted-foreground">{enrichedTagihan.length} KK terdaftar</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 mt-3 text-center px-1">
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto mb-0.5" />
              <p className="text-lg font-bold text-emerald-700">{lunasCount}</p>
              <p className="text-[10px] font-semibold text-emerald-600">Lunas</p>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-100">
              <Clock className="w-4 h-4 text-amber-600 mx-auto mb-0.5" />
              <p className="text-lg font-bold text-amber-700">{cicilCount}</p>
              <p className="text-[10px] font-semibold text-amber-600">Cicil</p>
            </div>
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-100">
              <AlertCircle className="w-4 h-4 text-rose-600 mx-auto mb-0.5" />
              <p className="text-lg font-bold text-rose-700">{belumCount}</p>
              <p className="text-[10px] font-semibold text-rose-600">Belum</p>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
              <Target className="w-4 h-4 text-blue-600 mx-auto mb-0.5" />
              <p className="text-lg font-bold text-blue-700">{lebihCount}</p>
              <p className="text-[10px] font-semibold text-blue-600">Lebih</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground px-1">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(dana.tanggal_mulai).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              {' - '}
              {new Date(dana.tanggal_selesai).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Per-KK Tagihan */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-pink-600" />
            Status Per Warga ({enrichedTagihan.length})
          </CardTitle>
          <CardDescription>
            Klik untuk input pembayaran cicilan. Trigger akan auto-update progress + catat ke kas.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {enrichedTagihan.map(t => (
              <DanaKhususRow key={t.id} t={t} danaId={dana.id} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pembayaran History */}
      {(pembayaranList ?? []).length > 0 && (
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Riwayat Pembayaran ({pembayaranList?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {(pembayaranList ?? []).slice(0, 20).map(p => (
                <div key={p.id} className="p-3 flex items-center gap-3 hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{p.login_id}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(p.tanggal_bayar).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}{p.metode}
                      {p.catatan && ` · ${p.catatan}`}
                    </p>
                    {p.bukti_url && (
                      <a
                        href={p.bukti_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                      >
                        📎 Lihat Bukti Pembayaran
                      </a>
                    )}
                  </div>
                  <p className="font-bold text-emerald-700">{formatRupiah(p.nominal)}</p>
                  <EditPembayaranDanaKhusus p={p} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Inline form untuk input pembayaran (client component needed)
import { BayarCicilanInline } from './bayar-cicilan-inline'
import { EditPembayaranDanaKhusus } from './edit-pembayaran-dana-khusus'

type DanaKhususTagihanRow = {
  id: string
  profile_id: string
  login_id: string
  nominal_tagihan: number
  total_terbayar: number
  status: string
  profile?: { nama_kk: string; blok: string; nomor_rumah: string }
}

function DanaKhususRow({ t, danaId }: { t: DanaKhususTagihanRow; danaId: string }) {
  const profile = t.profile as { nama_kk: string; blok: string; nomor_rumah: string } | undefined
  const sisa = t.nominal_tagihan - t.total_terbayar

  return (
    <div className="p-3 flex items-center gap-3 hover:bg-slate-50">
      <div className="text-center shrink-0 w-12">
        <div className="text-xs font-bold text-slate-500">{profile?.blok ?? '?'}</div>
        <div className="text-base font-bold leading-none">{profile?.nomor_rumah ?? '?'}</div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{profile?.nama_kk ?? 'Tanpa nama'}</p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{t.login_id}</span>
          {t.status === 'LUNAS' && <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">Lunas</Badge>}
          {t.status === 'CICIL' && <Badge className="bg-amber-100 text-amber-700 text-[9px]">Cicil</Badge>}
          {t.status === 'BELUM' && <Badge className="bg-rose-100 text-rose-700 text-[9px]">Belum</Badge>}
          {t.status === 'LEBIH' && <Badge className="bg-blue-100 text-blue-700 text-[9px]">Lebih</Badge>}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Bayar: <span className="font-bold text-emerald-600">{formatRupiah(t.total_terbayar)}</span>
          {' / '}
          {formatRupiah(t.nominal_tagihan)}
          {sisa > 0 && <span className="text-rose-600"> · Sisa {formatRupiah(sisa)}</span>}
        </div>
      </div>
      <BayarCicilanInline danaId={danaId} tagihanId={t.id} profileId={t.profile_id} maxNominal={sisa} />
    </div>
  )
}
