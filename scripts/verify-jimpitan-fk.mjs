// Verify FK name untuk jimpitan_detail.profile_id
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf8')
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

console.log('=== Test FK name utk jimpitan_detail.profile_id ===')
const possibleFKs = [
  'jimpitan_detail_profile_id_fkey',
  'jimpitan_detail_profile_fkey',
  'jimpitan_detail_profile_profiles_fkey',
]
for (const fk of possibleFKs) {
  const { data, error } = await supabase
    .from('jimpitan_detail')
    .select(`test:profiles!${fk}(id, nama_kk)`)
    .limit(1)
  console.log(`  ${fk.padEnd(36)}: ${error ? `❌ ${error.message.split(',')[0]}` : '✓'}`)
}

// Cek juga FK utk tabel lain yg dipakai (ronda_attendance)
console.log('\n=== Test FK name utk ronda_attendance.profile_id ===')
const rFKs = [
  'ronda_attendance_profile_id_fkey',
  'ronda_attendance_profile_fkey',
  'ronda_attendance_profile_profiles_fkey',
]
for (const fk of rFKs) {
  const { data, error } = await supabase
    .from('ronda_attendance')
    .select(`test:profiles!${fk}(id, nama_kk)`)
    .limit(1)
  console.log(`  ${fk.padEnd(36)}: ${error ? `❌ ${error.message.split(',')[0]}` : '✓'}`)
}

// Test query dengan join real (pakai REST PostgREST)
console.log('\n=== Real test: query dgn join profile utk jimpitan_detail ===')
const { data: realData, error: realErr } = await supabase
  .from('jimpitan_detail')
  .select(`
    id, profile_id, login_id, nama_kk_snapshot, nominal, is_bayar,
    profile:profiles!jimpitan_detail_profile_id_fkey(id, nama_kk, blok, nomor_rumah)
  `)
  .eq('sesi_id', '35492aef-279c-48f7-93e0-cf629a3e145c')
  .order('login_id')
console.log('Real data:', realData?.slice(0, 3))
console.log('Error:', realErr?.message)