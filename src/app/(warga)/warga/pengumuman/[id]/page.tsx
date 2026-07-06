import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Megaphone, Calendar, ChevronRight, MegaphoneOff, Pin } from 'lucide-react'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { formatTanggal } from '@/lib/format'
import { ImageLightbox } from '../image-lightbox'

export const dynamic = 'force-dynamic'

const PRIORITY_META: Record<string, { label: string; cls: string; heroGradient: string; ringCls: string; iconBg: string; textCls: string }> = {
  DARURAT: {
    label: 'Darurat',
    cls: 'bg-rose-100 text-rose-700',
    heroGradient: 'from-rose-500 via-rose-600 to-orange-600',
    ringCls: 'ring-rose-300/60',
    iconBg: 'bg-white/20',
    textCls: 'text-rose-100',
  },
  PENTING: {
    label: 'Penting',
    cls: 'bg-amber-100 text-amber-700',
    heroGradient: 'from-amber-500 via-amber-600 to-orange-600',
    ringCls: 'ring-amber-300/60',
    iconBg: 'bg-white/20',
    textCls: 'text-amber-100',
  },
  NORMAL: {
    label: 'Info',
    cls: 'bg-blue-100 text-blue-700',
    heroGradient: 'from-blue-500 via-blue-600 to-indigo-600',
    ringCls: 'ring-blue-300/60',
    iconBg: 'bg-white/20',
    textCls: 'text-blue-100',
  },
}

export default async function PengumumanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

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

  // Ambil pengumuman by id (hanya yang published - warga tidak boleh lihat draft)
  const { data: p, error } = await admin
    .from('info_pengumuman')
    .select('id, judul, konten, priority, is_published, published_at, gambar_url, created_at')
    .eq('id', id)
    .eq('is_published', true)
    .maybeSingle()

  if (error || !p) notFound()

  const meta = PRIORITY_META[p.priority ?? 'NORMAL'] ?? PRIORITY_META.NORMAL

  // Ambil 5 pengumuman published lain (selain yang sedang dibuka), urut paling baru
  const { data: related } = await admin
    .from('info_pengumuman')
    .select('id, judul, priority, published_at')
    .eq('is_published', true)
    .neq('id', id)
    .order('published_at', { ascending: false })
    .limit(5)

  return (
    <div className="space-y-4 pt-2 pb-8">
      {/* Header back */}
      <div className="flex items-center gap-3">
        <Link
          href="/warga/pengumuman"
          className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-card border shadow-sm hover:bg-muted/50 transition-colors shrink-0"
          aria-label="Kembali ke daftar pengumuman"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Detail Pengumuman
          </p>
          <h1 className="text-lg font-bold leading-tight truncate">{p.judul}</h1>
        </div>
      </div>

      {/* HERO */}
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${meta.heroGradient} text-white shadow-xl shadow-rose-500/20`}>
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mb-16" />

        <div className="relative p-5">
          <div className="flex items-start gap-3">
            <div className={`w-12 h-12 rounded-2xl ${meta.iconBg} backdrop-blur-sm flex items-center justify-center ring-2 ring-white/30 shrink-0`}>
              <Megaphone className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge className={`${meta.cls} text-[10px] hover:${meta.cls}`}>
                  {meta.label}
                </Badge>
                {p.published_at && (
                  <span className={`text-[10px] font-semibold ${meta.textCls} uppercase tracking-wider flex items-center gap-1`}>
                    <Calendar className="w-3 h-3" />
                    {formatTanggal(p.published_at)}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold leading-tight">{p.judul}</h2>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <Card className="border-0 shadow-md ring-1 ring-slate-200/60">
        <CardContent className="p-5 space-y-4">
          {p.gambar_url ? (
            <ImageLightbox src={p.gambar_url} alt={p.judul} />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-muted-foreground">
              Tidak ada lampiran gambar
            </div>
          )}

          {p.konten ? (
            <div className="prose prose-sm max-w-none">
              <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                {p.konten}
              </p>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <MegaphoneOff className="w-7 h-7 mx-auto mb-2 text-slate-300" />
              <p className="text-xs">Tidak ada konten tambahan</p>
            </div>
          )}

          {p.published_at && (
            <div className="pt-4 border-t border-slate-100 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              Dipublikasi {formatTanggal(p.published_at)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Related */}
      {related && related.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-2">
            <Pin className="w-3.5 h-3.5" />
            Pengumuman Lainnya
          </h2>
          {related.map((r) => {
            const rMeta = PRIORITY_META[r.priority ?? 'NORMAL'] ?? PRIORITY_META.NORMAL
            return (
              <Link
                key={r.id}
                href={`/warga/pengumuman/${r.id}`}
                className="block rounded-2xl border-0 shadow-sm ring-1 ring-slate-200/60 bg-card overflow-hidden hover:shadow-md hover:ring-blue-200 transition-all group"
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${rMeta.iconBg} flex items-center justify-center shrink-0`}>
                    <Megaphone className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-semibold text-sm leading-tight truncate group-hover:text-blue-700 transition-colors">
                        {r.judul}
                      </h3>
                      {r.priority === 'DARURAT' && (
                        <Badge className="bg-rose-100 text-rose-700 text-[9px] hover:bg-rose-100 shrink-0">Darurat</Badge>
                      )}
                      {r.priority === 'PENTING' && (
                        <Badge className="bg-amber-100 text-amber-700 text-[9px] hover:bg-amber-100 shrink-0">Penting</Badge>
                      )}
                    </div>
                    {r.published_at && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatTanggal(r.published_at)}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </CardContent>
              </Link>
            )
          })}
        </section>
      )}
    </div>
  )
}
