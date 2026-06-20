import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { 
  Wallet, Megaphone, Receipt, 
  CheckCircle2, Clock, AlertCircle, 
  MessageCircle, MapPin, Sparkles, ChevronRight,
  Shield, HandCoins,
} from 'lucide-react'
import { formatTanggal } from '@/lib/format'
import { CollapsibleCard } from './_components/CollapsibleCard'

export const dynamic = 'force-dynamic'

export default async function WargaHomePage() {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('warga_session')?.value

  if (!sessionToken) redirect('/login')

  const admin = createAdminClient()
  const { data: profileId } = await admin.rpc('get_warga_from_session', {
    p_token: sessionToken,
  })

  if (!profileId) redirect('/login')

  // Ambil data profil lengkap
  const { data: profile } = await admin
    .from('profiles')
    .select('id, login_id, nama_kk, blok, nomor_rumah, no_hp, kategori_tarif, role, created_at')
    .eq('id', profileId)
    .single()

  if (!profile) redirect('/login')

  // Hitung ringkasan iuran (dari jimpitan_tagihan, BUKAN iuran_tagihan)
  // TIDAK filter by yearStart karena periode_bulan type bisa berbeda
  // Ambil semua tagihan, tampilkan 1 yang terbaru di Beranda, detail di tab Iuran
  const { data: iuran } = await admin
    .from('jimpitan_tagihan')
    .select('id, periode_bulan, nominal_tagihan, total_terbayar, status, kategori')
    .eq('profile_id', profileId)
    .order('periode_bulan', { ascending: false })
    .limit(1) // Beranda cukup tampilkan periode terbaru

  const totalTagihan = iuran?.[0]?.nominal_tagihan != null ? Number(iuran[0].nominal_tagihan) : 0
  const totalTerbayar = iuran?.[0]?.total_terbayar != null ? Number(iuran[0].total_terbayar) : 0
  // `sisa` adalah kolom generated/computed — tidak muncul di tipe PostgREST
  type RowWithSisa = { sisa?: number | string | null }
  const sisaRaw = (iuran?.[0] as RowWithSisa | undefined)?.sisa
  const totalSisa = sisaRaw != null ? Number(sisaRaw) : Math.max(0, totalTagihan - totalTerbayar)

  // Ambil pengumuman terbaru (published)
  const { data: pengumuman } = await admin
    .from('info_pengumuman')
    .select('id, judul, priority, published_at')
    .eq('is_published', true)
    .order('published_at', { ascending: false })
    .limit(3)

  // Cek window jimpitan + next jadwal
  const { data: isJimpitanOpen } = await admin.rpc('is_jimpitan_window_open')
  // FIX timezone: pakai local-date formatter (lihat dashboard/page.tsx untuk penjelasan bug)
  const _today = new Date()
  const today = `${_today.getFullYear()}-${String(_today.getMonth() + 1).padStart(2, '0')}-${String(_today.getDate()).padStart(2, '0')}`
  const { data: myNextJadwal } = await admin
    .from('v_penjaga_efektif')
    .select('tanggal, profile_efektif_id, nama_efektif, is_swapped, nama_asli')
    .eq('profile_efektif_id', profileId)
    .gte('tanggal', today)
    .order('tanggal', { ascending: true })
    .limit(1)
    .maybeSingle()

  const initial = profile.nama_kk?.[0]?.toUpperCase() ?? '?'
  // Iuran bulanan: NORMAL = 15rb, JANDA = 10rb (langsung nominal, tanpa label kategori)
  const iuranNominal = profile.kategori_tarif === 'JANDA' ? 10000 : 15000
  const iuranColor = profile.kategori_tarif === 'JANDA'
    ? 'bg-purple-100 text-purple-700 border-purple-200'
    : 'bg-emerald-100 text-emerald-700 border-emerald-200'

  return (
    <div className="space-y-4 pt-2 pb-8">
      {/* ============================================ */}
      {/* HERO PROFILE CARD (compact) */}
      {/* ============================================ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 text-white shadow-xl shadow-emerald-500/20">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mb-16" />
        
        <div className="relative p-5">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl font-bold ring-2 ring-white/30 shadow-lg shrink-0">
              {initial}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-medium text-emerald-100 uppercase tracking-wider">
                Login ID · {profile.login_id}
              </p>
              <h1 className="text-lg font-bold leading-tight truncate">
                {profile.nama_kk}
              </h1>
            </div>

            <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm text-[10px]">
              <Sparkles className="w-3 h-3 mr-1" />
              Aktif
            </Badge>
          </div>

          {/* Alamat besar */}
          <div className="mt-3 flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-2xl px-3 py-2.5 ring-1 ring-white/20">
            <MapPin className="w-4 h-4 text-white shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-wider text-emerald-100 font-medium">
                Alamat Rumah
              </p>
              <p className="text-sm font-bold truncate">
                Blok {profile.blok} No. {profile.nomor_rumah}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* QUICK ACTIONS: Iuran Bulanan + WhatsApp */}
      {/* ============================================ */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-2xl p-3.5 border ${iuranColor}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet className="w-3.5 h-3.5" />
            <p className="text-[9px] font-bold uppercase tracking-wider">Iuran Bulanan</p>
          </div>
          <p className="text-base font-bold leading-tight">
            Rp {iuranNominal.toLocaleString('id-ID')}
          </p>
          <p className="text-[11px] opacity-80">per bulan</p>
        </div>

        {profile.no_hp ? (
          <a 
            href={`https://wa.me/${profile.no_hp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl p-3.5 border bg-emerald-50 border-emerald-200 hover:bg-emerald-100 transition-colors group"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
              <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">WhatsApp</p>
            </div>
            <p className="text-xs font-bold text-emerald-900 truncate group-hover:underline">
              {profile.no_hp}
            </p>
            <p className="text-[11px] text-emerald-600">Chat via WA →</p>
          </a>
        ) : (
          <div className="rounded-2xl p-3.5 border bg-slate-50 border-slate-200">
            <div className="flex items-center gap-1.5 mb-1">
              <MessageCircle className="w-3.5 h-3.5 text-slate-500" />
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">WhatsApp</p>
            </div>
            <p className="text-xs font-medium text-slate-400">Belum diatur</p>
          </div>
        )}
      </div>

      {/* ============================================ */}
      {/* RONDA / JIMPITAN BANNER (jika ada) */}
      {/* ============================================ */}
      {(isJimpitanOpen || myNextJadwal) && (
        <Link
          href="/warga/ronda"
          className={`block rounded-2xl p-4 border ${
            isJimpitanOpen
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 border-emerald-300 text-white shadow-lg shadow-emerald-500/20'
              : 'bg-gradient-to-r from-purple-50 to-violet-50 border-purple-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isJimpitanOpen ? 'bg-white/20' : 'bg-purple-100'
            }`}>
              {isJimpitanOpen ? (
                <HandCoins className="w-5 h-5 text-white" />
              ) : (
                <Shield className="w-5 h-5 text-purple-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] font-bold uppercase tracking-wider ${
                isJimpitanOpen ? 'text-emerald-100' : 'text-purple-700'
              }`}>
                {isJimpitanOpen ? '🟢 Jimpitan Malam Ini' : '🛡️ Ronda Anda'}
              </p>
              <p className={`font-semibold text-sm ${isJimpitanOpen ? 'text-white' : 'text-purple-900'}`}>
                {isJimpitanOpen
                  ? 'Window buka - daftarkan diri jadi petugas!'
                  : myNextJadwal
                  ? `${new Date(myNextJadwal.tanggal).toLocaleString('id-ID', {
                      weekday: 'long', day: 'numeric', month: 'short',
                    })}`
                  : 'Lihat jadwal'}
              </p>
            </div>
            <ChevronRight className={`w-5 h-5 shrink-0 ${
              isJimpitanOpen ? 'text-white' : 'text-purple-600'
            }`} />
          </div>
        </Link>
      )}

      {/* ============================================ */}
      {/* IURAN TAHUN INI (Collapsible) */}
      {/* ============================================ */}
      <CollapsibleCard
        label={`Iuran ${new Date().getFullYear()}`}
        title="Status Pembayaran"
        icon={<Receipt className="w-4 h-4" />}
        iconBgClass="bg-emerald-100"
        iconColorClass="text-emerald-600"
      >
        <div className="space-y-3 pt-2">
          {/* 3 Stats: Tagihan / Dibayar / Sisa */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2.5 bg-gradient-to-b from-slate-50 to-white rounded-2xl border border-slate-100">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                Tagihan
              </p>
              <p className="text-xs font-bold text-slate-700 mt-0.5">
                {totalTagihan.toLocaleString('id-ID')}
              </p>
            </div>
            <div className="text-center p-2.5 bg-gradient-to-b from-emerald-50 to-white rounded-2xl border border-emerald-100">
              <p className="text-[9px] uppercase tracking-wider text-emerald-700 font-semibold">
                Dibayar
              </p>
              <p className="text-xs font-bold text-emerald-700 mt-0.5">
                {totalTerbayar.toLocaleString('id-ID')}
              </p>
            </div>
            <div className={`text-center p-2.5 rounded-2xl border ${
              totalSisa > 0 
                ? 'bg-gradient-to-b from-amber-50 to-white border-amber-100'
                : 'bg-gradient-to-b from-slate-50 to-white border-slate-100'
            }`}>
              <p className={`text-[9px] uppercase tracking-wider font-semibold ${
                totalSisa > 0 ? 'text-amber-700' : 'text-muted-foreground'
              }`}>
                Sisa
              </p>
              <p className={`text-xs font-bold mt-0.5 ${
                totalSisa > 0 ? 'text-amber-700' : 'text-slate-700'
              }`}>
                {totalSisa.toLocaleString('id-ID')}
              </p>
            </div>
          </div>

          {/* List tagihan per bulan */}
          {iuran && iuran.length > 0 ? (
            <div className="space-y-1.5">
              {iuran.slice(0, 6).map(t => {
                const periode = new Date(t.periode_bulan).toLocaleDateString('id-ID', {
                  month: 'long', year: 'numeric'
                })
                const Icon = t.status === 'LUNAS' ? CheckCircle2 
                  : t.status === 'CICIL' ? Clock 
                  : AlertCircle
                const color = t.status === 'LUNAS' ? 'text-emerald-600' 
                  : t.status === 'CICIL' ? 'text-amber-600' 
                  : 'text-slate-400'
                return (
                  <div key={t.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                    <Icon className={`w-4 h-4 shrink-0 ${color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-tight">{periode}</p>
                      <p className="text-[11px] text-muted-foreground">
                      Rp {Number(t.nominal_tagihan).toLocaleString('id-ID')}
                    </p>
                    </div>
                    <Badge className={
                      t.status === 'LUNAS' 
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]'
                        : t.status === 'CICIL'
                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-100 text-[10px]'
                    }>
                      {t.status === 'LUNAS' ? 'Lunas' : t.status === 'CICIL' ? 'Cicil' : 'Belum'}
                    </Badge>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-6 px-4 bg-slate-50/50 rounded-2xl">
              <Receipt className="w-7 h-7 text-slate-300 mx-auto mb-1.5" />
              <p className="text-xs text-muted-foreground">
                Belum ada tagihan iuran tahun ini
              </p>
            </div>
          )}

          {/* Lihat Detail link */}
          <Link
            href="/warga/iuran"
            className="flex items-center justify-center gap-1.5 mt-1 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition-colors"
          >
            Lihat Detail & Riwayat
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </CollapsibleCard>

      {/* ============================================ */}
      {/* PENGUMUMAN TERBARU (Collapsible) */}
      {/* ============================================ */}
      <CollapsibleCard
        label="Informasi RT"
        title="Pengumuman Terbaru"
        icon={<Megaphone className="w-4 h-4" />}
        iconBgClass="bg-amber-100"
        iconColorClass="text-amber-600"
      >
        <div className="pt-2">
          {pengumuman && pengumuman.length > 0 ? (
            <div className="space-y-1.5">
              {pengumuman.map(p => (
                <a
                  key={p.id}
                  href={`/warga/pengumuman/${p.id}`}
                  className="block p-2.5 rounded-xl bg-muted/30 hover:bg-muted/60 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm group-hover:text-emerald-700 transition-colors">
                      {p.judul}
                    </p>
                    {p.priority === 'DARURAT' && (
                      <Badge variant="destructive" className="text-[10px] shrink-0">Darurat</Badge>
                    )}
                    {p.priority === 'PENTING' && (
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] shrink-0">Penting</Badge>
                    )}
                  </div>
                  {p.published_at && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatTanggal(p.published_at)}
                    </p>
                  )}
                </a>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 px-4 bg-slate-50/50 rounded-2xl">
              <Megaphone className="w-7 h-7 text-slate-300 mx-auto mb-1.5" />
              <p className="text-xs text-muted-foreground">
                Belum ada pengumuman
              </p>
            </div>
          )}
        </div>
      </CollapsibleCard>
    </div>
  )
}
