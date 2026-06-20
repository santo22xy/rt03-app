// Login as sekretaris and test kas page query
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function run() {
  // Reset password sekretaris (in case forgotten)
  const { data: u } = await sb.auth.admin.listUsers()
  const sekre = u.users.find(x => x.email === 'sekretaris@rt03.id')
  if (!sekre) {
    console.error('No sekretaris user')
    return
  }

  // Set known password
  const { error: e1 } = await sb.auth.admin.updateUserById(sekre.id, { password: 'SENTRART03' })
  if (e1) console.error(e1)
  console.log('Password set to SENTRART03')

  // Login as anon (simulating browser)
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const { data: login, error: e2 } = await anon.auth.signInWithPassword({
    email: 'sekretaris@rt03.id',
    password: 'SENTRART03',
  })
  if (e2) {
    console.error('Login error:', e2.message)
    return
  }
  console.log('Logged in:', login.user.email)

  // Try query like the kas page does
  console.log('\n=== KAS_TRANSAKSI query as logged-in user ===')
  const { data: trx, error: e3 } = await anon
    .from('kas_transaksi')
    .select('id, tanggal, tipe, kategori, uraian, nominal, login_id, metode_bayar, sumber_dana, ditalangi_oleh, status_talangan, catatan, created_by, created_at')
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (e3) console.error('Query error:', e3)
  console.log('Got', trx?.length, 'rows')
  if (trx && trx.length > 0) {
    console.log('Sample:', trx[0])
  }

  console.log('\n=== JADWAL_RONDA query (today=2026-06-19) ===')
  const today = '2026-06-19'
  const { data: jr, error: e4 } = await anon
    .from('jadwal_ronda')
    .select('id, tanggal, minggu_ke, bulan, tahun, penjaga_profile_id, nama_penjaga_snapshot, blok_snapshot, nomor_rumah_snapshot')
    .gte('tanggal', today)
    .order('tanggal', { ascending: true })
    .limit(20)

  if (e4) console.error('Query error:', e4)
  console.log('Got', jr?.length, 'rows')
  if (jr) console.table(jr.map(j => ({ tanggal: j.tanggal, minggu: j.minggu_ke, penjaga: j.nama_penjaga_snapshot })))
}

run().catch(console.error).finally(() => process.exit())