// Test: query as auth client (mirip browser) vs admin client
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

// Admin client
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
// Auth client (anon)
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function run() {
  console.log('=== AS ADMIN (service_role) ===')
  const { data: a, error: ea } = await admin.from('kas_transaksi').select('id', { count: 'exact', head: false }).limit(5)
  if (ea) console.error('Error:', ea)
  console.log('Got', a?.length, 'rows')

  console.log('\n=== AS ANON ===')
  const { data: b, error: eb } = await anon.from('kas_transaksi').select('id').limit(5)
  if (eb) console.error('Error:', eb)
  console.log('Got', b?.length, 'rows')

  // Test as logged-in user
  console.log('\n=== LOGIN AS SEKRETARIS ===')
  const { data: loginData, error: el } = await anon.auth.signInWithPassword({
    email: 'sekretaris@rt03.id',
    password: 'SENTRART03',  // try common password
  })
  if (el) {
    console.error('Login error:', el.message)
    // try different password
    const { data: ld2, error: el2 } = await anon.auth.signInWithPassword({
      email: 'sekretaris@rt03.id',
      password: 'SentraRT03!',
    })
    if (el2) {
      console.error('Login error 2:', el2.message)
    } else {
      console.log('Logged in as', ld2.user?.email)
    }
  } else {
    console.log('Logged in as', loginData.user?.email)
  }

  // Query as authenticated user
  const { data: c, error: ec } = await anon.from('kas_transaksi').select('id').limit(5)
  if (ec) console.error('Error:', ec)
  console.log('Got as auth user:', c?.length, 'rows')

  console.log('\n=== JADWAL_RONDA AS ADMIN ===')
  const { data: jr } = await admin.from('jadwal_ronda').select('tanggal, nama_penjaga_snapshot').eq('tahun', 2026)
  console.log('Total:', jr?.length)
  console.table(jr)

  console.log('\n=== JADWAL_RONDA AS AUTH ===')
  const { data: jr2 } = await anon.from('jadwal_ronda').select('tanggal, nama_penjaga_snapshot').eq('tahun', 2026)
  console.log('Total:', jr2?.length)
}

run().catch(console.error).finally(() => process.exit())