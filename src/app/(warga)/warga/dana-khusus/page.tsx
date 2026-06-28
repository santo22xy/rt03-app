import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatRupiah } from '@/lib/format'
import { HeartHandshake, CheckCircle2, Calendar, Target, Sparkles } from 'lucide-react'
import { BayarCicilanWarga } from './bayar-cicilan-warga'

export const dynamic = 'force-dynamic'

export default async function WargaDanaKhususPage() {
  const admin = createAdminClient()
  const { data: { user } } = await admin.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await admin
    .from('profiles')
    .select('id, login_id, nama_kk')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Ambil semua dana_khusus aktif + tagihan user ini
  const { data: danaList } = await admin
    .from('dana_khusus')
    .select('*')
    .eq('is_active', true)
    .order('tanggal_selesai', { ascending: true })

  const { data: tagihanList } = await admin
    .from('dana_khusus_tagihan')
    .select('*')
    .eq('profile_id', profile.id)

  const tagihanMap = new Map((tagihanList ?? []).map(t => [t.dana_khusus_id, t]))

  // Ambil history pembayaran user ini
  const { data: pembayaranList } = await admin
    .from('dana_khusus_pembayaran')
    .select('*, dana_khusus:judul')
    .eq('profile_id', profile.id)
    .order('tanggal_bayar', { ascending: false })
    .limit(10)

  return (
    <div className="space-y-4 pb-8">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <HeartHandshake className="w-4 h-4 text-pink-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-pink-600">
            Iuran & Sumbangan
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-pink-600" />
          Dana Khusus RT
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pengumpulan dana sementara untuk acara RT. Bisa dicicil.
        </p>
      </div>

      {/* Active Dana */}
      {(danaList ?? []).length === 0 ? (
        <Card className="border-dashed border-2 bg-slate-50/50">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mx-auto mb-4">
              <HeartHandshake className="w-8 h-8 text-pink-600" />
            </div>
            <h3 className="font-bold text-lg mb-1">Belum ada pengumpulan aktif</h3>
            <p className="text-sm text-muted-foreground">
              Pengurus belum membuat dana khusus. Cek lagi nanti ya.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {danaList?.map(d => {
            const tagihan = tagihanMap.get(d.id)
            if (!tagihan) return null  // belum ada tagihan untuk user ini (mungkin warga baru)

            const sisa = tagihan.nominal_tagihan - tagihan.total_terbayar
            const pct = tagihan.nominal_tagihan > 0
              ? Math.round(100 * tagihan.total_terbayar / tagihan.nominal_tagihan)
              : 0

            return (
              <Card key={d.id} className="border-0 shadow-md overflow-hidden">
                <div className={`h-1.5 ${tagihan.status === 'LUNAS' ? 'bg-emerald-500' : tagihan.status === 'CICIL' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">{d.judul}</CardTitle>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant="secondary" className="text-[10px]">{d.kategori}</Badge>
                        {!d.is_wajib && <Badge className="bg-purple-100 text-purple-700 text-[10px]">Sukarela</Badge>}
                        {tagihan.status === 'LUNAS' && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">✓ Lunas</Badge>}
                        {tagihan.status === 'CICIL' && <Badge className="bg-amber-100 text-amber-700 text-[10px]">Cicil</Badge>}
                        {tagihan.status === 'BELUM' && <Badge className="bg-rose-100 text-rose-700 text-[10px]">Belum Bayar</Badge>}
                      </div>
                    </div>
                  </div>
                  {d.deskripsi && (
                    <CardDescription className="text-[11px] line-clamp-2">{d.deskripsi}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {/* Progress */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold">{pct}% terbayar</span>
                      <span className="text-muted-foreground">
                        Rp {tagihan.total_terbayar.toLocaleString('id-ID')} / {tagihan.nominal_tagihan.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      s.d. {new Date(d.tanggal_selesai).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    {sisa > 0 && (
                      <span className="flex items-center gap-1 font-semibold text-rose-600">
                        <Target className="w-3 h-3" />
                        Sisa: Rp {sisa.toLocaleString('id-ID')}
                      </span>
                    )}
                  </div>

                  {/* Tombol bayar cicilan */}
                  <BayarCicilanWarga
                    danaId={d.id}
                    tagihanId={tagihan.id}
                    maxNominal={sisa > 0 ? sisa : tagihan.nominal_tagihan}
                    judul={d.judul}
                    status={tagihan.status}
                  />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* History Pembayaran User */}
      {(pembayaranList ?? []).length > 0 && (
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Riwayat Pembayaran Saya
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {(pembayaranList ?? []).map(p => {
            const judulDana = (p as unknown as { dana_khusus?: { judul?: string } | null })?.dana_khusus?.judul ?? 'Dana Khusus'
            return (
              <div key={p.id} className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{judulDana}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(p.tanggal_bayar).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {' · '}{p.metode}
                  </p>
                </div>
                <p className="font-bold text-emerald-700">{formatRupiah(p.nominal)}</p>
              </div>
            )
          })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
