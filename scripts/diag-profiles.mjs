// Diagnostic: check existing profiles
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf8')
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

console.log('=== ALL PROFILES ===')
const { data: all } = await supabase
  .from('profiles')
  .select('id, login_id, nama_kk, blok, nomor_rumah, role, is_active')
  .order('blok')
  .order('nomor_rumah')

console.log(`Total: ${all?.length ?? 0}`)
all?.forEach(p => {
  console.log(`  ${(p.login_id ?? '-').padEnd(12)} | ${(p.blok ?? '-')}-${(p.nomor_rumah ?? '-')} | ${(p.nama_kk ?? '-').padEnd(22)} | ${p.role} | active=${p.is_active}`)
})

console.log('\n=== AUTH USERS ===')
const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers()
if (authErr) {
  console.error('Auth list failed:', authErr.message)
} else {
  console.log(`Total: ${users?.length ?? 0}`)
  users?.forEach(u => {
    console.log(`  ${u.id} | ${u.email} | created=${u.created_at}`)
  })
}
