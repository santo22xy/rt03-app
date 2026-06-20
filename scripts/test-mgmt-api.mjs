// Test: Apakah service_role key bisa dipakai untuk Supabase Management API?
import 'dotenv/config'

const ref = 'kjnmyiqzamftysgndbne'
const url = `https://api.supabase.com/v1/projects/${ref}/database/query`

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

async function run() {
  console.log('Mencoba service_role key untuk Management API...')
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      query: 'SELECT current_database() AS db, current_user AS user, version() AS pg_version;',
    }),
  })

  console.log('Status:', r.status)
  const text = await r.text()
  console.log('Response:', text.substring(0, 500))
}

run().catch(console.error).finally(() => process.exit())