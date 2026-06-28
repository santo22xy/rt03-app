// Definitive check: kolom di kas_transaksi & table lainnya
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf8')
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

console.log('=== Kas_transaksi - cek spesifik kolom ===')
const fields = ['nama_snapshot', 'blok_snapshot', 'nomor_rumah_snapshot', 'login_id', 'kategori_tarif']
for (const f of fields) {
  const { data, error } = await supabase.from('kas_transaksi').select(f).limit(1)
  console.log(`  ${f.padEnd(28)}: ${error ? `❌ ${error.message}` : `✓ (sample: ${JSON.stringify(data?.[0])})`}`)
}

console.log('\n=== Ronda_attendance - cek spesifik kolom ===')
const rfields = ['nama_snapshot', 'blok_snapshot', 'nomor_rumah_snapshot', 'nama_kk_snapshot', 'login_id', 'is_pengganti', 'pengganti_dari_id']
for (const f of rfields) {
  const { data, error } = await supabase.from('ronda_attendance').select(f).limit(1)
  console.log(`  ${f.padEnd(28)}: ${error ? `❌ ${error.message}` : `✓ (sample: ${JSON.stringify(data?.[0])})`}`)
}

console.log('\n=== Ronda_kelompok - cek spesifik kolom ===')
const kfields = ['nama_kk_snapshot', 'blok_snapshot', 'nomor_rumah_snapshot', 'login_id']
for (const f of kfields) {
  const { data, error } = await supabase.from('ronda_kelompok').select(f).limit(1)
  console.log(`  ${f.padEnd(28)}: ${error ? `❌ ${error.message}` : `✓ (sample: ${JSON.stringify(data?.[0])})`}`)
}

console.log('\n=== Sample jimpitan_sesi row (cek status_bayar vs status_pembayaran vs status) ===')
const { data: js } = await supabase.from('jimpitan_sesi').select('*').limit(1)
console.log(JSON.stringify(js?.[0], null, 2))