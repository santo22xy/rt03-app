import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function run() {
  console.log('Checking all kas_transaksi without limit...')
  const { data: allTrx, error: err } = await supabase
    .from('kas_transaksi')
    .select('id, tanggal')
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false })

  if (err) {
    console.error('ERROR:', err)
    return
  }
  console.log('Total transactions:', allTrx.length)
  console.log('First 10 transactions:', allTrx.slice(0, 10).map(t => ({ id: t.id, tanggal: t.tanggal })))

  const monthsSet = new Set()
  allTrx.forEach(t => {
    const m = t.tanggal.slice(0,7)
    monthsSet.add(m)
  })
  console.log('Available months (all):', Array.from(monthsSet).sort())
}

run().catch(console.error).finally(() => process.exit())
