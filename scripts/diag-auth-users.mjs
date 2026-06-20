// Diagnostik: Cek auth user vs profile id
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function run() {
  // List auth users
  const { data: users, error: e1 } = await sb.auth.admin.listUsers()
  console.log('=== AUTH USERS ===')
  if (e1) { console.error(e1); return }
  for (const u of users.users) {
    console.log(`- ${u.email} (id=${u.id})`)

    // Find profile with same id
    const { data: p, error: e2 } = await sb.from('profiles').select('id, login_id, nama_kk, role').eq('id', u.id).maybeSingle()
    if (e2) console.error(e2)
    if (p) {
      console.log(`  Profile match: ${p.login_id} (${p.nama_kk}) role=${p.role}`)
    } else {
      console.log(`  No profile with same UUID!`)
      // Check by email or other way
      const { data: p2 } = await sb.from('profiles').select('id, login_id, nama_kk, role, no_hp').eq('login_id', 'X-0').maybeSingle()
      console.log(`  X-0 superadmin: ${p2 ? JSON.stringify(p2) : 'NOT FOUND'}`)
    }
  }
}

run().catch(console.error).finally(() => process.exit())