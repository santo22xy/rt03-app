// Create pengurus accounts (idempotent)
// State existing: PENGURUS-B1 (Budi Sulaiman) + ketua@rt03.id sudah ada
// Yang dibuat: Bendahara, Sekretaris, Superadmin
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf8')
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing env vars di .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// Pak RT: existing, pakai email ketua@rt03.id (sudah dibuat)
// Bendahara, Sekretaris, Superadmin: baru
const PENGURUS = [
  {
    // Pak RT existing — pakai email existing (ketua@rt03.id)
    profileId: null,  // akan di-fetch by login_id
    loginId: 'PENGURUS-B1',
    nama: 'Bpk. Budi Sulaiman',
    email: 'ketua@rt03.id',
    password: 'rt123456',
    role: 'KETUA_RT',
    isExisting: true,
  },
  {
    // Bendahara baru
    loginId: 'PENGURUS-BEND',
    nama: 'Bpk. Setyobudi',
    blok: 'C',
    nomor_rumah: '2',
    email: 'bendahara@rt03.id',
    password: 'bendahara123456',
    role: 'BENDAHARA',
  },
  {
    // Sekretaris baru
    loginId: 'PENGURUS-SEKR',
    nama: 'Bpk. Iwan',
    blok: 'Y',
    nomor_rumah: '0',
    email: 'sekretaris@rt03.id',
    password: 'sekretaris123456',
    role: 'SEKRETARIS',
  },
  {
    // Superadmin baru
    loginId: 'PENGURUS-SA',
    nama: 'Super Admin',
    blok: 'X',
    nomor_rumah: '0',
    email: 'admin@rt03.id',
    password: 'admin123456',
    role: 'PENGURUS',  // pakai role existing PENGURUS
  },
]

console.log('=== STEP 1: Ambil/Setup Profile untuk masing-masing pengurus ===')
for (const p of PENGURUS) {
  // Cari profile by login_id
  const { data: existing } = await supabase
    .from('profiles')
    .select('id, login_id, nama_kk, role, blok, nomor_rumah')
    .eq('login_id', p.loginId)
    .maybeSingle()

  if (existing) {
    p.profileId = existing.id
    console.log(`   ${p.loginId}: profile ada (id=${existing.id}, role=${existing.role})`)
  } else {
    // Buat profile baru
    const newId = randomUUID()
    const { data: created, error } = await supabase
      .from('profiles')
      .insert({
        id: newId,
        login_id: p.loginId,
        nama_kk: p.nama,
        blok: p.blok ?? null,
        nomor_rumah: p.nomor_rumah ?? null,
        no_hp: null,
        role: p.role,
        kategori_tarif: 'NORMAL',
        is_active: true,
      })
      .select('id')
      .single()

    if (error) {
      console.error(`   ❌ ${p.loginId}: insert profile gagal: ${error.message}`)
      continue
    }
    p.profileId = created.id
    console.log(`   ✅ ${p.loginId}: profile BARU (id=${created.id})`)
  }
}

console.log('')
console.log('=== STEP 2: Create/Update Auth Users ===')
for (const p of PENGURUS) {
  if (!p.profileId) {
    console.error(`   ❌ Skip ${p.loginId}: no profileId`)
    continue
  }

  // Cek apakah auth user dengan UUID ini sudah ada
  const { data: existing } = await supabase.auth.admin.getUserById(p.profileId).catch(() => ({ data: null }))

  if (existing?.user) {
    // Update password & email
    const { error } = await supabase.auth.admin.updateUserById(p.profileId, {
      password: p.password,
      email: p.email,
      email_confirm: true,
    })
    if (error) console.error(`   ❌ ${p.loginId}: update auth gagal: ${error.message}`)
    else console.log(`   ✅ ${p.loginId}: auth user di-update (${p.email})`)
  } else {
    // Create baru
    const { data, error } = await supabase.auth.admin.createUser({
      id: p.profileId,
      email: p.email,
      password: p.password,
      email_confirm: true,
      user_metadata: {
        nama: p.nama,
        role: p.role,
        login_id: p.loginId,
      },
    })
    if (error) console.error(`   ❌ ${p.loginId}: create auth gagal: ${error.message}`)
    else console.log(`   ✅ ${p.loginId}: auth user BARU (${data.user.email})`)
  }
}

console.log('')
console.log('=== STEP 3: Verifikasi akhir ===')
const { data: finalProfiles } = await supabase
  .from('profiles')
  .select('login_id, nama_kk, blok, nomor_rumah, role, is_active')
  .in('role', ['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS'])
  .order('role')
  .order('login_id')

console.log('\nLogin ID       | Nama               | Blok/No | Role')
console.log('-'.repeat(70))
finalProfiles?.forEach(p => {
  const lok = p.blok ? `${p.blok}-${p.nomor_rumah}` : '-'
  console.log(`${(p.login_id ?? '-').padEnd(15)}| ${(p.nama_kk ?? '-').padEnd(19)}| ${lok.padEnd(8)}| ${p.role}`)
})

console.log('\n=== KREDENSIAL LOGIN PENGURUS ===')
console.log('Login pengurus ada di /login (klik logo 5x untuk toggle form pengurus):')
console.log('')
console.log('  Pak RT      | ketua@rt03.id       | rt123456')
console.log('  Bendahara   | bendahara@rt03.id   | bendahara123456')
console.log('  Sekretaris  | sekretaris@rt03.id  | sekretaris123456')
console.log('  Superadmin  | admin@rt03.id       | admin123456')
console.log('')
console.log('⚠️  Ganti password setelah login pertama via Supabase Dashboard → Auth → Users')
