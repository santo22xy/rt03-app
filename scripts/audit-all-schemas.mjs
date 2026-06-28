// Audit komprehensif: cek SEMUA column reference di code vs DB real
// Tujuan: cari SEMUA bug schema-drift supaya tidak ada lagi "notif palsu"
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf8')
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

console.log('=== STEP 1: Dapatkan schema DB real utk semua tabel yang dipakai ===')
const TABLES = [
  'jimpitan_detail', 'jimpitan_sesi',
  'jadwal_ronda', 'ronda_attendance', 'ronda_kelompok', 'ronda_swap',
  'kas_transaksi', 'kas_akun',
  'info_pengumuman', 'profiles',
]

const realSchemas = {}
for (const t of TABLES) {
  // Ambil 1 row sample utk deteksi schema
  const { data, error } = await supabase.from(t).select('*').limit(1)
  if (error) {
    realSchemas[t] = { error: error.message, columns: [] }
  } else {
    realSchemas[t] = { columns: data?.[0] ? Object.keys(data[0]) : [] }
  }
  console.log(`  ${t.padEnd(22)}: ${realSchemas[t].columns.length} columns`)
}

console.log('\n=== STEP 2: Cari SEMUA file yang punya field reference string ===')
const grep = `
  // Direct field patterns (heuristic):
  'nama_snapshot','blok_snapshot','nomor_rumah_snapshot',
  'nama_penjaga_snapshot','nama_kk_snapshot',
  'login_id','status_bayar','is_bayar','status_pembayaran'
`
console.log(grep)

console.log('\n=== STEP 3: Detail schema per table ===')
for (const [t, info] of Object.entries(realSchemas)) {
  console.log(`\n📋 ${t}: ${info.columns.join(', ')}`)
}

console.log('\n=== STEP 4: Cek jadwal_ronda khusus (utk ronda/page.tsx) ===')
const { data: jrSample } = await supabase
  .from('jadwal_ronda')
  .select('*')
  .limit(2)
console.log('Sample row:')
console.log(jrSample?.[0] ? Object.keys(jrSample[0]) : '(no rows)')

console.log('\n=== STEP 5: Cek kas_transaksi (utk kas/[id]/page.tsx) ===')
const { data: ktSample } = await supabase
  .from('kas_transaksi')
  .select('*')
  .limit(2)
console.log('Sample row:')
console.log(ktSample?.[0] ? Object.keys(ktSample[0]) : '(no rows)')

console.log('\n=== STEP 6: Cek ronda_attendance (utk table ronda) ===')
const { data: raSample } = await supabase
  .from('ronda_attendance')
  .select('*')
  .limit(2)
console.log('Sample row:')
console.log(raSample?.[0] ? Object.keys(raSample[0]) : '(no rows)')