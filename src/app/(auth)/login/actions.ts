'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export type LoginState = {
  error?: string
  success?: boolean
}

// =========================================================
// LOGIN WARGA: pakai Login ID gabungan (blok + nomor)
// =========================================================
export async function loginWarga(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const blok = String(formData.get('blok') ?? '').trim().toUpperCase()
  const nomorRumah = String(formData.get('nomorRumah') ?? '').trim()
  const pin = String(formData.get('pin') ?? '').trim()

  if (!blok || !nomorRumah || !pin) {
    return { error: 'Blok, nomor rumah, dan PIN wajib diisi' }
  }

  if (!/^\d{1,3}$/.test(nomorRumah)) {
    return { error: 'Nomor rumah harus angka (max 3 digit)' }
  }

  if (!/^\d{6}$/.test(pin)) {
    return { error: 'PIN harus 6 digit angka' }
  }

  const loginId = `${blok}-${nomorRumah}`

  const admin = createAdminClient()

  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, pin_hash, is_active, nama_kk, role')
    .eq('login_id', loginId)
    .single()

  if (error || !profile) {
    return { error: 'Login ID tidak ditemukan. Daftar dulu jika belum punya akun.' }
  }

  if (!profile.is_active) {
    return { error: 'Akun Anda nonaktif. Hubungi pengurus RT.' }
  }

  if (!profile.pin_hash) {
    return { error: 'PIN belum diatur. Hubungi pengurus RT untuk reset.' }
  }

  const { data: valid, error: rpcErr } = await admin.rpc('verify_warga_pin', {
    p_login_id: loginId,
    p_pin: pin,
  })

  if (rpcErr) {
    return { error: 'Verifikasi gagal: ' + rpcErr.message }
  }

  if (!valid) {
    return { error: 'PIN salah. Coba lagi atau hubungi pengurus.' }
  }

  // Buat session warga (cookie)
  const { data: token, error: tokenErr } = await admin.rpc('create_warga_session', {
    p_profile_id: profile.id,
  })

  if (tokenErr || !token) {
    return { error: 'Gagal membuat sesi: ' + (tokenErr?.message ?? 'unknown') }
  }

  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.set('warga_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })

  revalidatePath('/', 'layout')
  redirect('/warga')
}

// =========================================================
// DAFTAR WARGA BARU (self-service)
// =========================================================
export async function registerWarga(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const blok = String(formData.get('blok') ?? '').trim().toUpperCase()
  const nomorRumah = String(formData.get('nomorRumah') ?? '').trim()
  const nama = String(formData.get('nama') ?? '').trim()
  const noWA = String(formData.get('noWA') ?? '').trim()
  const pin = String(formData.get('pin') ?? '').trim()
  const pinConfirm = String(formData.get('pinConfirm') ?? '').trim()

  // Validasi
  if (!blok || !nomorRumah || !nama || !noWA || !pin) {
    return { error: 'Semua field wajib diisi' }
  }
  if (!['A', 'B', 'C', 'D'].includes(blok)) {
    return { error: 'Blok harus A, B, C, atau D' }
  }
  if (!/^\d{1,3}$/.test(nomorRumah)) {
    return { error: 'Nomor rumah harus angka (max 3 digit)' }
  }
  if (!/^\d{6}$/.test(pin)) {
    return { error: 'PIN harus 6 digit angka' }
  }
  if (pin !== pinConfirm) {
    return { error: 'Konfirmasi PIN belum sama' }
  }
  // Normalisasi WA: 08xx → 628xx
  const noHpNormalized = noWA.replace(/\D/g, '').replace(/^0/, '62')

  const loginId = `${blok}-${nomorRumah}`

  const admin = createAdminClient()

  // Cek apakah sudah ada profile dengan login_id ini
  const { data: existing } = await admin
    .from('profiles')
    .select('id, pin_hash, is_active')
    .eq('login_id', loginId)
    .maybeSingle()

  if (existing) {
    if (existing.pin_hash && existing.is_active) {
      return { error: `Blok ${loginId} sudah terdaftar. Silakan Login saja, atau hubungi pengurus untuk reset PIN.` }
    }
    // Update profile yang ada (misal: pengurus bikin profil tapi belum set PIN)
    const { error: updErr } = await admin
      .from('profiles')
      .update({
        nama_kk: nama,
        no_hp: noHpNormalized,
        pin_hash: null, // set via RPC di bawah
        role: 'WARGA',
        is_active: true,
      })
      .eq('id', existing.id)

    if (updErr) {
      return { error: 'Gagal update profil: ' + updErr.message }
    }

    // Set PIN via hash function
    await admin.rpc('set_warga_pin', {
      p_login_id: loginId,
      p_pin: pin,
    }).then(({ error }) => {
      if (error) return { error: 'Gagal set PIN: ' + error.message } as LoginState
    })

  } else {
    // Buat profile baru
    const { error: insErr } = await admin
      .from('profiles')
      .insert({
        id: crypto.randomUUID(),
        login_id: loginId,
        nama_kk: nama,
        blok: blok,
        nomor_rumah: nomorRumah,
        no_hp: noHpNormalized,
        role: 'WARGA',
        kategori_tarif: 'NORMAL',
        is_active: true,
      })

    if (insErr) {
      return { error: 'Gagal mendaftarkan: ' + insErr.message }
    }

    // Set PIN via hash function
    const { error: pinErr } = await admin.rpc('set_warga_pin', {
      p_login_id: loginId,
      p_pin: pin,
    })

    if (pinErr) {
      return { error: 'Gagal set PIN: ' + pinErr.message }
    }
  }

  // Auto-login setelah daftar
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('login_id', loginId)
    .single()

  if (!profile) {
    return { error: 'Profil tidak ditemukan setelah daftar' }
  }

  const { data: token, error: tokenErr } = await admin.rpc('create_warga_session', {
    p_profile_id: profile.id,
  })

  if (tokenErr || !token) {
    return { error: 'Gagal membuat sesi: ' + (tokenErr?.message ?? 'unknown') }
  }

  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.set('warga_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })

  revalidatePath('/', 'layout')
  redirect('/warga')
}

// =========================================================
// LOGIN PENGURUS (hidden — dipanggil dari Easter egg)
// =========================================================
export async function loginPengurus(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { error: 'Email dan password wajib diisi' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) {
    return { error: 'Email atau password salah' }
  }

  // Pakai admin client (service_role) untuk lookup profile
  // supaya bypass RLS — auth.uid() di session baru belum tentu
  // ter-set di request context yang sama dengan signInWithPassword
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', data.user.id)
    .single()

  if (!profile) {
    await supabase.auth.signOut()
    return { error: 'Profile pengurus tidak ditemukan untuk akun ini.' }
  }

  if (!profile.is_active) {
    await supabase.auth.signOut()
    return { error: 'Akun Anda nonaktif. Hubungi pengurus RT.' }
  }

  if (!['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'].includes(profile.role)) {
    await supabase.auth.signOut()
    return { error: 'Akun ini bukan akun pengurus' }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

// =========================================================
// LUPA PIN → link WA bendahara
// =========================================================
export async function lupaPinWA(formData: FormData): Promise<LoginState> {
  const blok = String(formData.get('blok') ?? '').trim().toUpperCase()
  const nomorRumah = String(formData.get('nomorRumah') ?? '').trim()
  const loginId = `${blok}-${nomorRumah}`

  // Nomor WA bendahara (dari env, default fallback jika tidak di-set)
  // Format internasional tanpa '+' (contoh: 6285328815155)
  const WA_BENDAHARA = process.env.NEXT_PUBLIC_WA_BENDAHARA ?? '6285328815155'
  const msg = `Halo Admin RT 03, saya ingin minta bantuan reset PIN RUKUN. Login ID: ${loginId || '(belum diisi)'}. Terima kasih.`
  const url = `https://wa.me/${WA_BENDAHARA}?text=${encodeURIComponent(msg)}`

  // Server actions tidak bisa redirect ke external URL,
  // tapi bisa return URL untuk client buka di tab baru
  return { success: true, error: url }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.delete('warga_session')

  redirect('/login')
}