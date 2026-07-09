import 'dotenv/config'
import { createServerClient } from '@supabase/ssr'

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SERVICE_ROLE_KEY')
  }
  return createServerClient(
    url,
    key,
    {
      cookies: { getAll() { return [] }, setAll() {} }
    }
  )
}

async function run() {
  console.log('Testing kas page query with createAdminClient...')
  const supabase = createAdminClient()
  const { data: allTrxRaw, error: err } = await supabase
    .from('kas_transaksi')
    .select('id, tanggal, tipe, kategori, uraian, nominal, login_id, metode_bayar, sumber_dana, ditalangi_oleh, status_talangan, catatan, created_by, created_at, nota_url')
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (err) {
    console.error('kas page query ERROR:', err)
    return
  }

  console.log('kas page query - allTrxRaw.length:', allTrxRaw.length)
  console.log('kas page query - first 5 rows:', allTrxRaw.slice(0, 5))
}

run().catch(console.error).finally(() => process.exit())
