import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Megaphone, ChevronRight, Calendar, Pin,
} from 'lucide-react'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { formatTanggal } from '@/lib/format'

export const dynamic = 'force-dynamic'

const PRIORITY_META: Record<string, { label: string; cls: string; ringCls: string; iconCls: string }> = {
  DARURAT: {
    label: 'Darurat',
    cls: 'bg-rose-100 text-rose-700',
    ringCls: 'ring-rose-300',
    iconCls: 'bg-rose-500',
  },
  PENTING: {
    label: 'Penting',
    cls: 'bg-amber-100 text-amber-700',
    ringCls: 'ring-amber-300',
    iconCls: 'bg-amber-500',
  },
  NORMAL: {
    label: 'Info',
    cls: 'bg-blue-100 text-blue-700',
    ringCls: 'ring-blue-200/60',
    iconCls: 'bg-blue-500',
  },
}

export default async function PengumumanWargaPage() {
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

  // Ambil SEMUA pengumuman yang published, urut by published_at desc
  const { data: list } = await admin
    .from('info_pengumuman')
    .select('id, judul, konten, priority, published_at, gambar_url')
    .eq('is_published', true)
    .order('published_at', { ascending: false })

  const darurat = list?.filter((p) => p.priority === 'DARURAT') ?? []
  const penting = list?.filter((p) => p.priority === 'PENTING') ?? []
  const normal = list?.filter((p) => !['DARURAT', 'PENTING'].includes(p.priority ?? '')) ?? []

  return (
    <div className="space-y-4 pt-2 pb-8">
      {/* ============================================ */}
      {/* HERO */}
      {/* ============================================ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500 via-purple-600 to-fuchsia-600 text-white shadow-xl shadow-purple-500/20">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mb-16" />

        <div className="relative p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/30 shrink-0">
              <Megaphone className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-medium text-purple-100 uppercase tracking-wider">
                Informasi RT
              </p>
              <h1 className="text-xl font-bold leading-tight">Info & Pengumuman</h1>
            </div>
            <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm text-[10px]">
              {list?.length ?? 0} item
            </Badge>
          </div>
          <p className="text-sm text-purple-100 mt-3">
            Pengumuman & informasi terbaru dari pengurus RT
          </p>
        </div>
      </div>

      {/* Empty state */}
      {(!list || list.length === 0) && (
        <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
          <CardContent className="p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <Megaphone className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700">Belum ada pengumuman</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Pengurus belum mempublikasikan informasi apapun
            </p>
          </CardContent>
        </Card>
      )}

      {/* DARURAT - muncul di atas dengan highlight merah */}
      {darurat.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-rose-600 flex items-center gap-2 px-1">
            <Pin className="w-3.5 h-3.5" />
            Darurat ({darurat.length})
          </h2>
          {darurat.map((p) => {
            const meta = PRIORITY_META.DARURAT
            return (
              <Link
                key={p.id}
                href={`/warga/pengumuman/${p.id}`}
                className={`block rounded-2xl border-0 shadow-md ring-1 ${meta.ringCls} bg-gradient-to-r from-rose-50 to-orange-50 overflow-hidden hover:shadow-lg transition-all group`}
              >
                <CardContent className="p-3.5 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${meta.iconCls} text-white flex items-center justify-center shrink-0`}>
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <h3 className="font-bold text-sm leading-tight truncate group-hover:text-rose-700 transition-colors">
                        {p.judul}
                      </h3>
                      <Badge className={`${meta.cls} text-[9px] hover:${meta.cls}`}>
                        {meta.label}
                      </Badge>
                    </div>
                    {p.konten && (
                      <p className="text-[11px] text-slate-600 line-clamp-2 leading-snug">
                        {p.konten}
                      </p>
                    )}
                    {p.published_at && (
                      <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatTanggal(p.published_at)}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-rose-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </CardContent>
              </Link>
            )
          })}
        </section>
      )}

      {/* PENTING */}
      {penting.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-amber-600 flex items-center gap-2 px-1">
            <Pin className="w-3.5 h-3.5" />
            Penting ({penting.length})
          </h2>
          {penting.map((p) => {
            const meta = PRIORITY_META.PENTING
            return (
              <Link
                key={p.id}
                href={`/warga/pengumuman/${p.id}`}
                className={`block rounded-2xl border-0 shadow-sm ring-1 ${meta.ringCls} bg-gradient-to-r from-amber-50 to-yellow-50 overflow-hidden hover:shadow-md transition-all group`}
              >
                <CardContent className="p-3.5 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${meta.iconCls} text-white flex items-center justify-center shrink-0`}>
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <h3 className="font-bold text-sm leading-tight truncate group-hover:text-amber-700 transition-colors">
                        {p.judul}
                      </h3>
                      <Badge className={`${meta.cls} text-[9px] hover:${meta.cls}`}>
                        {meta.label}
                      </Badge>
                    </div>
                    {p.konten && (
                      <p className="text-[11px] text-slate-600 line-clamp-2 leading-snug">
                        {p.konten}
                      </p>
                    )}
                    {p.published_at && (
                      <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatTanggal(p.published_at)}
                      </p>
                    )}
                  </div>
                  {p.gambar_url ? (
                    <div className="h-10 w-10 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.gambar_url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-amber-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  )}
                </CardContent>
              </Link>
            )
          })}
        </section>
      )}

      {/* INFO / Normal */}
      {normal.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-blue-600 flex items-center gap-2 px-1">
            <Megaphone className="w-3.5 h-3.5" />
            Info ({normal.length})
          </h2>
          {normal.map((p) => {
            const meta = PRIORITY_META.NORMAL
            return (
              <Link
                key={p.id}
                href={`/warga/pengumuman/${p.id}`}
                className="block rounded-2xl border-0 shadow-sm ring-1 ring-slate-200/60 bg-card overflow-hidden hover:shadow-md hover:ring-blue-200 transition-all group"
              >
                <CardContent className="p-3.5 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${meta.iconCls} text-white flex items-center justify-center shrink-0`}>
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm leading-tight truncate group-hover:text-blue-700 transition-colors mb-0.5">
                      {p.judul}
                    </h3>
                    {p.konten && (
                      <p className="text-[11px] text-slate-600 line-clamp-2 leading-snug">
                        {p.konten}
                      </p>
                    )}
                    {p.published_at && (
                      <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatTanggal(p.published_at)}
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
