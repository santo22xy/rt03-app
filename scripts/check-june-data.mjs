import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Load .env.local manually
try {
  const envRaw = readFileSync('.env.local', 'utf8')
  for (const line of envRaw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch (e) {
  console.error('Gagal baca .env.local:', e.message)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(url, key, { auth: { persistSession: false } })

console.log('=== CEK DATA KAS_TRANSAKSI PER BULAN ===')

// Ambil SEMUA transaksi tanpa limit, hitung per bulan
const { data, error } = await supabase
  .from('kas_transaksi')
  .select('id, tanggal, tipe, nominal, uraian')
  .order('tanggal', { ascending: false })

if (error) {
  console.error('ERROR query kas_transaksi:', error)
  process.exit(1)
}

const byMonth = {}
for (const t of data ?? []) {
  const m = (t.tanggal || '').slice(0, 7)
  if (!byMonth[m]) byMonth[m] = { count: 0, masuk: 0, keluar: 0 }
  byMonth[m].count++
  if (t.tipe === 'MASUK') byMonth[m].masuk += Number(t.nominal)
  if (t.tipe === 'KELUAR') byMonth[m].keluar += Number(t.nominal)
}

console.log('Total transaksi:', data?.length ?? 0)
console.log('Distribusi per bulan (YYYY-MM):')
for (const m of Object.keys(byMonth).sort()) {
  const d = byMonth[m]
  console.log(`  ${m}: ${d.count} tx | MASUK ${d.masuk} | KELUAR ${d.keluar}`)
}

console.log('\n=== CEK KHUSUS JUNI 2026 (2026-06) ===')
const juni = (data ?? []).filter(t => (t.tanggal || '').startsWith('2026-06'))
console.log('Jumlah transaksi Juni 2026:', juni.length)
if (juni.length > 0) {
  console.log('Sample 10 pertama:')
  for (const t of juni.slice(0, 10)) {
    console.log(`  ${t.tanggal} | ${t.tipe} | ${t.nominal} | ${t.uraian}`)
  }
} else {
  console.log('>> TIDAK ADA data Juni 2026 di database.')
}
