import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

try {
  const envRaw = readFileSync('.env.local', 'utf8')
  for (const line of envRaw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch (e) {}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

console.log('=== DANA KHUSUS (MERTI DESA) ===')
const { data: dana, error } = await sb
  .from('dana_khusus')
  .select('id, judul, kategori, target_per_kk, target_per_kk_khusus, is_active, is_wajib')
  .order('created_at', { ascending: false })
if (error) { console.error(error); process.exit(1) }
for (const d of dana ?? []) {
  console.log(`- [${d.kategori}] ${d.judul} | target_normal=${d.target_per_kk} | target_khusus=${d.target_per_kk_khusus} | active=${d.is_active} | wajib=${d.is_wajib} | id=${d.id}`)
}

const merti = (dana ?? []).find(d => d.kategori === 'MERTI_DESA')
if (!merti) { console.log('TIDAK ADA Merti Desa'); process.exit(0) }

console.log(`\n=== TAGIHAN MERTI DESA (id=${merti.id}) ===`)
console.log(`Target resmi normal = ${merti.target_per_kk}, khusus = ${merti.target_per_kk_khusus}`)
const { data: tag, error: te } = await sb
  .from('dana_khusus_tagihan')
  .select('id, login_id, nama_kk_snapshot, nominal_tagihan, total_terbayar, status')
  .eq('dana_khusus_id', merti.id)
  .order('login_id', { ascending: true })
if (te) { console.error(te); process.exit(1) }

const byNominal = {}
for (const t of tag ?? []) {
  const key = `${t.nominal_tagihan}`
  byNominal[key] = (byNominal[key] || 0) + 1
}
console.log(`Total tagihan: ${tag?.length}`)
console.log('Distribusi nominal_tagihan:', byNominal)
console.log('\nDetail (login | nominal | terbayar | status | nama):')
for (const t of tag ?? []) {
  const flag = (t.nominal_tagihan != merti.target_per_kk && t.nominal_tagihan != (merti.target_per_kk_khusus ?? merti.target_per_kk)) ? ' <<< ANEH' : ''
  console.log(`  ${t.login_id} | ${t.nominal_tagihan} | ${t.total_terbayar} | ${t.status} | ${t.nama_kk_snapshot}${flag}`)
}

console.log('\n=== PROFILES kategori_tarif (untuk cek A2) ===')
const loginIds = (tag ?? []).map(t => t.login_id)
const { data: prof } = await sb
  .from('profiles')
  .select('login_id, nama_kk, kategori_tarif, blok, nomor_rumah')
  .in('login_id', loginIds)
const pmap = new Map((prof ?? []).map(p => [p.login_id, p]))
console.log('Kategori tarif tiap tagihan:')
for (const t of tag ?? []) {
  const p = pmap.get(t.login_id)
  console.log(`  ${t.login_id} | kategori_tarif=${p?.kategori_tarif ?? '?'} | ${p?.nama_kk ?? '?'}`)
}
