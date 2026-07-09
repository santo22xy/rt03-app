import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

try {
  const envRaw = readFileSync('.env.local', 'utf8')
  for (const line of envRaw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch (e) {}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

console.log('=== CEK KOLOM nota_url DI kas_transaksi ===')
const { data, error } = await supabase
  .from('kas_transaksi')
  .select('id, nota_url')
  .limit(3)

if (error) {
  console.error('ERROR (kolom mungkin belum ada):', error.message)
  process.exit(2)
}
console.log('OK - kolom nota_url sudah ada. Sample:', JSON.stringify(data, null, 2))

console.log('\n=== CEK BUCKET attachments ===')
const { data: buckets, error: bErr } = await supabase.storage.listBuckets()
if (bErr) {
  console.error('ERROR listBuckets:', bErr.message)
} else {
  const att = (buckets ?? []).find((b) => b.name === 'attachments')
  console.log(att ? 'OK - bucket attachments ADA' : 'PERINGATAN - bucket attachments BELUM ADA')
}
