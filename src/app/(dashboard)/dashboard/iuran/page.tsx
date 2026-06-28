import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createAdminClient } from '@/lib/supabase/server'
import { Wallet, CheckCircle2, Clock, AlertCircle, TrendingUp, Users, Sparkles } from 'lucide-react'
import { formatRupiah, getMonthName } from '@/lib/format'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function IuranPage() {
  // FIX: pakai admin client untuk bypass RLS recursion di profiles policy.
  const supabase = createAdminClient()
  const today = new Date()
  // FIX timezone: pakai local-date formatter (lihat dashboard/page.tsx untuk penjelasan)
  const _yyyy = today.getFullYear()
  const _mm = String(today.getMonth() + 1).padStart(2, '0')
  const currentMonth = `${_yyyy}-${_mm}-01`

  // Summary per-bulan
  const { data: tagihan } = await supabase
    .from('jimpitan_tagihan')
    .select('id, status, nominal_tagihan, total_terbayar, kategori, profile_id')
    .eq('periode_bulan', currentMonth)

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, nama_kk, blok, nomor_rumah, login_id')
    .eq('is_active', true)
    .order('blok', { ascending: true })
    .order('nomor_rumah', { ascending: true })

  const totalTagihan = tagihan?.reduce((s, t) => s + Number(t.nominal_tagihan), 0) ?? 0
  const totalTerbayar = tagihan?.reduce((s, t) => s + Number(t.total_terbayar), 0) ?? 0
  const totalLunas = tagihan?.filter((t) => t.status === 'LUNAS').length ?? 0
  const totalSebagian = tagihan?.filter((t) => t.status === 'CICIL').length ?? 0
  const totalBelum = tagihan?.filter((t) => t.status === 'BELUM').length ?? 0

  // Group by kategori
  const normalTariff = tagihan?.filter((t) => t.kategori === 'NORMAL') ?? []
  const normalCount = normalTariff.length
  const normalLunas = normalTariff.filter((t) => t.status === 'LUNAS').length
  const konfirmasiTariff = tagihan?.filter((t) => t.kategori === 'PERLU_KONFIRMASI') ?? []
  const konfirmasiCount = konfirmasiTariff.length
  const konfirmasiLunas = konfirmasiTariff.filter((t) => t.status === 'LUNAS').length

  // Per profile detail
  const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? [])
  const sortedTagihan = (tagihan ?? [])
    .map((t) => ({ ...t, profile: profileMap.get(t.profile_id) }))
    .sort((a, b) => {
      const ba = a.profile?.blok ?? 'Z'
      const bb = b.profile?.blok ?? 'Z'
      if (ba !== bb) return ba.localeCompare(bb)
      return Number(a.profile?.nomor_rumah ?? 0) - Number(b.profile?.nomor_rumah ?? 0)
    })

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-blue-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
              Iuran Bulanan
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">Iuran {getMonthName(currentMonth)}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Status tagihan & pembayaran warga bulan ini
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link
            href="/dashboard/iuran/bulk-input"
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-semibold h-10 px-4 shadow-md transition-colors gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Bulk Input
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-0 shadow-md ring-1 ring-blue-200/60 bg-gradient-to-br from-blue-500 to-indigo-600 text-white overflow-hidden relative">
          <div className="absolute -top-6 -right-6 w-20 h-20 bg-white/10 rounded-full" />
          <CardContent className="p-4 relative">
            <TrendingUp className="w-5 h-5 opacity-80 mb-1" />
            <p className="text-[10px] font-bold uppercase opacity-80">Total Tagihan</p>
            <p className="text-lg font-bold leading-tight mt-0.5 truncate">{formatRupiah(totalTagihan)}</p>
            <p className="text-[10px] opacity-80 mt-0.5">{tagihan?.length ?? 0} KK</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md ring-1 ring-emerald-200/60 bg-gradient-to-br from-emerald-500 to-teal-600 text-white overflow-hidden relative">
          <div className="absolute -top-6 -right-6 w-20 h-20 bg-white/10 rounded-full" />
          <CardContent className="p-4 relative">
            <CheckCircle2 className="w-5 h-5 opacity-80 mb-1" />
            <p className="text-[10px] font-bold uppercase opacity-80">Sudah Bayar</p>
            <p className="text-lg font-bold leading-tight mt-0.5 truncate">{formatRupiah(totalTerbayar)}</p>
            <p className="text-[10px] opacity-80 mt-0.5">{totalLunas} KK lunas</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md ring-1 ring-amber-200/60 bg-gradient-to-br from-amber-500 to-orange-600 text-white overflow-hidden relative">
          <div className="absolute -top-6 -right-6 w-20 h-20 bg-white/10 rounded-full" />
          <CardContent className="p-4 relative">
            <Clock className="w-5 h-5 opacity-80 mb-1" />
            <p className="text-[10px] font-bold uppercase opacity-80">Sebagian</p>
            <p className="text-2xl font-bold mt-0.5">{totalSebagian}</p>
            <p className="text-[10px] opacity-80 mt-0.5">KK cicil</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md ring-1 ring-rose-200/60 bg-gradient-to-br from-rose-500 to-red-600 text-white overflow-hidden relative">
          <div className="absolute -top-6 -right-6 w-20 h-20 bg-white/10 rounded-full" />
          <CardContent className="p-4 relative">
            <AlertCircle className="w-5 h-5 opacity-80 mb-1" />
            <p className="text-[10px] font-bold uppercase opacity-80">Belum Bayar</p>
            <p className="text-2xl font-bold mt-0.5">{totalBelum}</p>
            <p className="text-[10px] opacity-80 mt-0.5">KK</p>
          </CardContent>
        </Card>
      </div>

      {/* Per Kategori */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="border-0 shadow-md ring-1 ring-slate-200/60 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-white px-4 py-2.5 border-b border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Kategori NORMAL
            </p>
          </div>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-2xl font-bold">{normalLunas}/{normalCount}</p>
              <p className="text-[11px] text-muted-foreground">KK sudah lunas</p>
            </div>
            <Badge className="bg-emerald-100 text-emerald-700">
              {normalCount > 0 ? Math.round(normalLunas / normalCount * 100) : 0}%
            </Badge>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md ring-1 ring-amber-200/60 overflow-hidden">
          <div className="bg-gradient-to-r from-amber-50 to-white px-4 py-2.5 border-b border-amber-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
              PERLU KONFIRMASI (Khusus)
            </p>
          </div>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-2xl font-bold">{konfirmasiLunas}/{konfirmasiCount}</p>
              <p className="text-[11px] text-muted-foreground">KK sudah bayar</p>
            </div>
            <Badge className="bg-amber-100 text-amber-700">
              {konfirmasiCount > 0 ? Math.round(konfirmasiLunas / konfirmasiCount * 100) : 0}%
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Per Warga Detail */}
      <Card className="border-0 shadow-md ring-1 ring-slate-200/60 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-5 py-3 border-b border-blue-100">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
            Detail Per Warga
          </p>
          <CardTitle className="text-base mt-0.5">{getMonthName(currentMonth)}</CardTitle>
        </div>
        <CardContent className="p-0">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-slate-600">Blok</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-slate-600">Nama KK</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-slate-600">Kategori</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-slate-600">Tagihan</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-slate-600">Dibayar</th>
                  <th className="text-center px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedTagihan.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {t.profile?.blok}-{t.profile?.nomor_rumah}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold">{t.profile?.nama_kk ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Badge className={
                        t.kategori === 'NORMAL'
                          ? 'bg-slate-100 text-slate-700 text-[9px]'
                          : 'bg-amber-100 text-amber-700 text-[9px]'
                      }>
                        {t.kategori === 'NORMAL' ? 'Normal' : 'Khusus'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {formatRupiah(Number(t.nominal_tagihan))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      <span className={Number(t.total_terbayar) > Number(t.nominal_tagihan) ? 'font-bold text-blue-600' : 'font-bold text-emerald-600'}>
                        {formatRupiah(Number(t.total_terbayar))}
                      </span>
                      {Number(t.total_terbayar) > Number(t.nominal_tagihan) && (
                        <span className="ml-1 text-[9px] font-bold text-blue-600">
                          (+{formatRupiah(Number(t.total_terbayar) - Number(t.nominal_tagihan))})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {t.status === 'LUNAS' ? (
                        <div className="inline-flex flex-col gap-0.5">
                          <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">
                            <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Lunas
                          </Badge>
                          {Number(t.total_terbayar) > Number(t.nominal_tagihan) && (
                            <Badge className="bg-blue-100 text-blue-700 text-[8px]">
                              +{formatRupiah(Number(t.total_terbayar) - Number(t.nominal_tagihan))}
                            </Badge>
                          )}
                        </div>
                      ) : t.status === 'CICIL' ? (
                        <Badge className="bg-amber-100 text-amber-700 text-[9px]">
                          <Clock className="w-2.5 h-2.5 mr-0.5" /> Cicil
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-100 text-rose-700 text-[9px]">
                          <AlertCircle className="w-2.5 h-2.5 mr-0.5" /> Belum
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-slate-100">
            {sortedTagihan.map((t) => (
              <div key={t.id} className="p-3 flex items-center gap-3">
                <div className="text-center shrink-0 w-12">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {t.profile?.blok}-{t.profile?.nomor_rumah}
                  </Badge>
                </div>
                <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{t.profile?.nama_kk ?? '-'}</p>
                <p className="text-[10px] text-muted-foreground">
                  <span className={Number(t.total_terbayar) > Number(t.nominal_tagihan) ? 'font-bold text-blue-600' : 'font-semibold text-emerald-600'}>
                    {formatRupiah(Number(t.total_terbayar))}
                  </span>
                  {' / '}
                  {formatRupiah(Number(t.nominal_tagihan))}
                  {Number(t.total_terbayar) > Number(t.nominal_tagihan) && (
                    <span className="ml-1 text-[9px] font-bold text-blue-600">
                      (+{formatRupiah(Number(t.total_terbayar) - Number(t.nominal_tagihan))})
                    </span>
                  )}
                </p>
              </div>
              <div className="shrink-0 flex flex-col gap-0.5 items-end">
                {t.status === 'LUNAS' ? (
                  <>
                    <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">Lunas</Badge>
                    {Number(t.total_terbayar) > Number(t.nominal_tagihan) && (
                      <Badge className="bg-blue-100 text-blue-700 text-[8px]">
                        +{formatRupiah(Number(t.total_terbayar) - Number(t.nominal_tagihan))}
                      </Badge>
                    )}
                  </>
                ) : t.status === 'CICIL' ? (
                  <Badge className="bg-amber-100 text-amber-700 text-[9px]">Cicil</Badge>
                ) : (
                  <Badge className="bg-rose-100 text-rose-700 text-[9px]">Belum</Badge>
                )}
              </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
