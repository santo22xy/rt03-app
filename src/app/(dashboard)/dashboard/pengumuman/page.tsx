import { createClient } from '@/lib/supabase/server'
import { PengumumanClient, type PengumumanItem } from './pengumuman-client'

export const dynamic = 'force-dynamic'

export default async function PengumumanPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('info_pengumuman')
    .select('id, judul, konten, priority, is_published, published_at, gambar_url, created_at')
    .order('is_published', { ascending: false })
    .order('published_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  const items: PengumumanItem[] = (data ?? []).map((row) => ({
    id: row.id,
    judul: row.judul,
    konten: row.konten ?? '',
    priority: (row.priority as PengumumanItem['priority']) ?? 'NORMAL',
    is_published: row.is_published ?? false,
    published_at: row.published_at ?? null,
    gambar_url: row.gambar_url ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
  }))

  return <PengumumanClient initial={items} />
}