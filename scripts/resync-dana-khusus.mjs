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

// Ambil Merti Desa 2026
const { data: dana, error } = await sb
  .from('dana_khusus')
  .select('id, judul, kategori, target_per_kk, target_per_kk_khusus')
  .eq('kategori', 'MERTI_DESA')
  .single()

if (error || !dana) {
  console.error('Merti Desa tidak ditemukan:', error?.message)
  process.exit(1)
}

console.log(`Merti Desa: id=${dana.id} target_normal=${dana.target_per_kk} target_khusus=${dana.target_per_kk_khusus}`)

// Snap sebelum
const { data: before } = await sb
  .from('dana_khusus_tagihan')
  .select('login_id, nominal_tagihan, total_terbayar, status')
  .eq('dana_khusus_id', dana.id)
  .order('login_id')

console.log('\n--- SEBELUM RESYNC ---')
const distBefore = {}
for (const t of before ?? []) distBefore[t.nominal_tagihan] = (distBefore[t.nominal_tagihan] || 0) + 1
console.log('Distribusi nominal:', distBefore)
const anomaliBefore = (before ?? []).filter(t => t.nominal_tagihan != dana.target_per_kk && t.nominal_tagihan != dana.target_per_kk_khusus)
console.log('Tagihan anomali:', anomaliBefore.map(t => `${t.login_id}=${t.nominal_tagihan}`).join(', ') || 'NONE')

// Jalankan resync
console.log('\n>>> Menjalankan resync_dana_khusus_tagihan...')
const { error: rpcErr } = await sb.rpc('resync_dana_khusus_tagihan', {
  p_dana_khusus_id: dana.id,
  p_target_normal: dana.target_per_kk,
  p_target_khusus: dana.target_per_kk_khusus,
})
if (rpcErr) {
  console.error('GAGAL resync:', rpcErr.message)
  process.exit(1)
}
console.log('Resync berhasil.')

// Snap sesudah
const { data: after } = await sb
  .from('dana_khusus_tagihan')
  .select('login_id, nominal_tagihan, total_terbayar, status')
  .eq('dana_khusus_id', dana.id)
  .order('login_id')

console.log('\n--- SESUDAH RESYNC ---')
const distAfter = {}
for (const t of after ?? []) distAfter[t.nominal_tagihan] = (distAfter[t.nominal_tagihan] || 0) + 1
console.log('Distribusi nominal:', distAfter)
const anomaliAfter = (after ?? []).filter(t => t.nominal_tagihan != dana.target_per_kk && t.nominal_tagihan != dana.target_per_kk_khusus)
console.log('Tagihan anomali:', anomaliAfter.map(t => `${t.login_id}=${t.nominal_tagihan}`).join(', ') || 'NONE')

console.log('\n--- STATUS & SISA (sesuai nominal baru) ---')
for (const t of after ?? []) {
  const sisa = Math.max(0, Number(t.nominal_tagihan) - Number(t.total_terbayar))
  console.log(`  ${t.login_id} | nominal=${t.nominal_tagihan} | bayar=${t.total_terbayar} | sisa=${sisa} | ${t.status}`)
}
