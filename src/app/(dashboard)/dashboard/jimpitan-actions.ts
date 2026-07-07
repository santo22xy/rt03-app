'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { formatTanggal } from '@/lib/format'

// =====================================================
// ATTACHMENT HELPERS
// =====================================================
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_ATTACHMENT_MIME = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'
]

function sanitizeAttachmentExt(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (fromName && fromName.length <= 5) return fromName
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/gif') return 'gif'
  if (file.type === 'application/pdf') return 'pdf'
  return 'jpg'
}

async function uploadAttachment(file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error('Ukuran file max 5 MB')
  }
  if (!ALLOWED_ATTACHMENT_MIME.includes(file.type)) {
    throw new Error('Format file harus JPG, PNG, WebP, GIF, atau PDF')
  }

  const ext = sanitizeAttachmentExt(file)
  const filename = `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const admin = createAdminClient()
  const { error } = await admin.storage
    .from('attachments')
    .upload(filename, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: '3600',
    })

  if (error) {
    throw new Error('Upload file gagal: ' + error.message)
  }

  const { data: urlData } = admin.storage
    .from('attachments')
    .getPublicUrl(filename)

  return urlData.publicUrl
}

async function deleteAttachment(url: string | null | undefined): Promise<void> {
  if (!url) return
  try {
    const marker = '/attachments/'
    const idx = url.indexOf(marker)
    if (idx === -1) return
    const path = url.slice(idx + marker.length).split('?')[0]
    if (!path) return
    const admin = createAdminClient()
    await admin.storage.from('attachments').remove([path])
  } catch {
    // best-effort cleanup
  }
}

// =====================================================
// FETCH FOR JIMPITAN LIST PAGE
// =====================================================
export async function getJimpitanListData(month: number, year: number) {
  const auth = createClient()
  const supabase = createAdminClient()
  
  const { data: { user } } = await auth.auth.getUser()
  let profile: any = null
  let isPengurus = false
  if (user) {
    const { data: p } = await supabase
      .from('profiles')
      .select('id, role, nama_kk')
      .eq('id', user.id)
      .single()
    profile = p
    isPengurus = ['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'].includes(p?.role ?? '')
  }
  
  const { data: isOpenData } = await supabase.rpc('is_jimpitan_window_open')
  const isWindowOpen = !!isOpenData
  
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0]
  
  console.log('Jimpitan query range:', startDate, 'to', endDate)
  
  const { data: sesi } = await supabase
    .from('jimpitan_sesi')
    .select(`
      id, tanggal, status, total_nominal, total_pendapatan, jumlah_warga_bayar, jumlah_penjaga_hadir,
      keadaan, nama_inputter_snapshot, blok_inputter_snapshot, waktu_mulai, waktu_submit, approved_at, catatan,
      created_by_name, created_by_role, cancelled_by_name, cancel_reason,
      jimpitan_detail(nominal, is_bayar)
    `)
    .gte('tanggal', startDate)
    .lte('tanggal', endDate)
    .order('tanggal', { ascending: false })
    .limit(50)
  
  return {
    profile,
    isPengurus,
    isWindowOpen,
    sesi: sesi || []
  }
}

// =====================================================
// HELPER: Hitung ulang jumlah_penjaga_hadir setelah toggle/swap
// =====================================================
async function recalcJumlahPenjagaHadir(sesiId: string) {
  const admin = createAdminClient()
  const { count } = await admin
    .from('ronda_attendance')
    .select('*', { count: 'exact', head: true })
    .eq('sesi_id', sesiId)

  await admin
    .from('jimpitan_sesi')
    .update({ jumlah_penjaga_hadir: count ?? 0 })
    .eq('id', sesiId)
}

// =====================================================
// AUTH HELPERS
// FIX: Pakai admin client untuk query profiles (RLS recursion safe)
// =====================================================
async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // FIX: pakai admin client — policy profiles yg lama recursive sehingga
  // createClient() selalu gagal baca profile.
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, nama_kk, blok, nomor_rumah, login_id, is_active')
    .eq('id', user.id)
    .single()
  return profile
}

async function getCurrentWarga() {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('warga_session')?.value
  if (!sessionToken) return null
  const admin = createAdminClient()
  const { data: profileId } = await admin.rpc('get_warga_from_session', {
    p_token: sessionToken,
  })
  if (!profileId) return null
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, nama_kk, blok, nomor_rumah, login_id, is_active')
    .eq('id', profileId)
    .single()
  return profile
}

// Helper: apakah user pengurus (BUKAN warga biasa)?
function isPengurus(profile: { role: string } | null): boolean {
  if (!profile) return false
  return ['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'].includes(profile.role)
}

// =====================================================
// Cek apakah user adalah petugas ronda untuk tanggal tertentu
// Periksa v_penjaga_efektif (dengan swap)
// =====================================================
export async function getRondaPetugasForDate(tanggal: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('v_penjaga_efektif')
    .select('*')
    .eq('tanggal', tanggal)
  return data
}

export async function isUserRondaPetugas(tanggal: string): Promise<{ isPetugas: boolean; data?: any }> {
  const profile = (await getCurrentWarga()) || (await getCurrentUser())
  if (!profile) return { isPetugas: false }

  const petugasList = await getRondaPetugasForDate(tanggal)
  const isPetugas = (petugasList || []).some((p) => p.profile_efektif_id === profile.id)
  return { isPetugas, data: { profile, petugasList } }
}

// =====================================================
// Cek apakah ada sesi jimpitan untuk tanggal tertentu
// =====================================================
export async function getSesiForDate(tanggal: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jimpitan_sesi')
    .select('*')
    .eq('tanggal', tanggal)
    .maybeSingle()
  return data
}

// =====================================================
// Buat sesi jimpitan baru (hanya jika user petugas ronda dan belum ada sesi)
// =====================================================
export async function createJimpitanSesi(formData: FormData): Promise<{
  success?: boolean
  error?: string
  sesiId?: string
}> {
  const profile = (await getCurrentWarga()) || (await getCurrentUser())
  if (!profile) return { error: 'Anda belum login' }

  const tanggal = formData.get('tanggal') as string
  if (!tanggal) return { error: 'Tanggal wajib dipilih' }

  // Periksa apakah user adalah petugas ronda (kecuali pengurus)
  if (!isPengurus(profile)) {
    const { isPetugas } = await isUserRondaPetugas(tanggal)
    if (!isPetugas) {
      return { error: 'Hanya petugas ronda yang bisa membuat sesi jimpitan' }
    }
  }

  const admin = createAdminClient()

  // Periksa apakah sudah ada sesi untuk tanggal ini
  const existingSesi = await getSesiForDate(tanggal)
  if (existingSesi) {
    if (existingSesi.status !== 'CANCELLED') {
      return {
        error: `Sesi jimpitan tanggal ini sudah dibuat oleh ${existingSesi.created_by_name || 'seseorang'}`,
        sesiId: existingSesi.id
      }
    } else {
      // If cancelled, only pengurus can re-open
      if (!isPengurus(profile)) {
        return { error: 'Sesi lama dibatalkan. Hanya pengurus yang bisa membuat sesi baru.' }
      }
    }
  }

  // Insert sesi baru dengan created_by info
  const { data, error } = await admin
    .from('jimpitan_sesi')
    .insert({
      tanggal,
      waktu_mulai: new Date().toISOString(),
      status: 'DRAFT', // Use DRAFT as per user request
      input_by: profile.id,
      nama_inputter_snapshot: profile.nama_kk,
      blok_inputter_snapshot: profile.blok,
      created_by_user_id: profile.id,
      created_by_name: profile.nama_kk,
      created_by_role: profile.role,
      created_from: isPengurus(profile) ? 'dashboard_pengurus' : 'warga_ronda',
    })
    .select('id')
    .single()

  if (error || !data) {
    return { error: error?.message || 'Gagal membuat sesi jimpitan' }
  }

  revalidatePath('/dashboard/jimpitan')
  revalidatePath('/warga')
  revalidatePath('/warga/jimpitan')

  return { success: true, sesiId: data.id }
}

// =====================================================
// Cancel sesi jimpitan (hanya pengurus)
// =====================================================
export async function cancelJimpitanSesi(formData: FormData): Promise<{
  success?: boolean
  error?: string
}> {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Anda belum login' }
  if (!isPengurus(profile)) return { error: 'Hanya pengurus yang bisa membatalkan sesi' }

  const sesiId = formData.get('sesiId') as string
  const alasan = formData.get('alasan') as string
  if (!sesiId) return { error: 'Sesi ID tidak ditemukan' }
  if (!alasan) return { error: 'Alasan pembatalan wajib diisi' }

  const admin = createAdminClient()

  const { data: sesi } = await admin
    .from('jimpitan_sesi')
    .select('id, status, total_nominal')
    .eq('id', sesiId)
    .maybeSingle()

  if (!sesi) return { error: 'Sesi tidak ditemukan' }

  if (sesi.status === 'APPROVED') {
    // Warning: butuh koreksi kas, tapi tetap izinkan cancel (sesuai user request)
    console.warn('Sesi sudah di-APPROVED. Pembatalan butuh koreksi manual di kas_transaksi.')
  }

  const { error } = await admin
    .from('jimpitan_sesi')
    .update({
      status: 'CANCELLED',
      cancelled_by_user_id: profile.id,
      cancelled_by_name: profile.nama_kk,
      cancelled_at: new Date().toISOString(),
      cancel_reason: alasan,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sesiId)

  if (error) return { error: `Gagal membatalkan sesi: ${error.message}` }

  revalidatePath('/dashboard/jimpitan')
  revalidatePath('/warga')
  return { success: true }
}

// =====================================================
// PENGURUS: BUAT SESI JIMPITAN MANUAL (untuk testing di luar window)
// Dipakai untuk uji alur sebelum hari H. Tanggal bebas (bukan hanya Sabtu).
// Return: { success, error, sesiId } — client handle toast & redirect
// =====================================================
export async function pengurusBuatSesi(formData: FormData): Promise<{
  success?: boolean
  error?: string
  sesiId?: string
}> {
  const profile = await getCurrentUser()
  if (!profile) {
    return { error: 'Anda belum login sebagai pengurus' }
  }
  if (!isPengurus(profile)) {
    return { error: 'Hanya pengurus yang boleh membuat sesi' }
  }

  const tanggal = formData.get('tanggal') as string
  if (!tanggal) {
    return { error: 'Tanggal wajib dipilih' }
  }

  const admin = createAdminClient()

  // Cek apakah sudah ada sesi AKTIF/SUBMITTED untuk tanggal ini
  const { data: existing } = await admin
    .from('jimpitan_sesi')
    .select('id, status')
    .eq('tanggal', tanggal)
    .in('status', ['AKTIF', 'SUBMITTED'])
    .maybeSingle()

  if (existing) {
    // Return existing sesiId agar client bisa redirect
    return { success: true, sesiId: existing.id, error: 'Sesi sudah ada, dialihkan ke sesi tersebut' }
  }

  // Tentukan kelompok_id dari tanggal sesi (Sabtu ke-N → KN)
  // Rumus: minggu ke = ceil(day/7), misal tgl 20 → ceil(2.857) = 3 → K3
  const tanggalDate = new Date(tanggal)
  const day = tanggalDate.getUTCDate()
  const mingguKe = Math.ceil(day / 7)
  const kelompokId = mingguKe >= 1 && mingguKe <= 4 ? `K${mingguKe}` : null

  const { data, error } = await admin
    .from('jimpitan_sesi')
    .insert({
      tanggal,
      kelompok_id: kelompokId,
      waktu_mulai: new Date().toISOString(),
      input_by: profile.id,
      nama_inputter_snapshot: `${profile.nama_kk} (Pengurus)`,
      blok_inputter_snapshot: profile.blok,
      created_by_user_id: profile.id,
      created_by_name: profile.nama_kk,
      created_by_role: profile.role,
      created_from: 'dashboard_pengurus',
      // FIX: pengurus yang buat sesi manual → langsung APPROVED (skip alur ACC)
      // biar total_pendapatan langsung terhitung di dashboard
      status: 'APPROVED',
      approved_by: profile.id,
      approved_by_user_id: profile.id,
      approved_by_name: profile.nama_kk,
      approved_at: new Date().toISOString(),
      catatan: 'Dibuat manual oleh pengurus (uji coba alur)',
    })
    .select('id')
    .single()

  if (error || !data) {
    return { error: error?.message ?? 'Gagal membuat sesi' }
  }

  revalidatePath('/dashboard/jimpitan')
  revalidatePath('/dashboard/kas')
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/jimpitan/${data.id}`)

  return { success: true, sesiId: data.id }
}

// =====================================================
// PENDAFTARAN INPUTTER (warga pertama jadi inputter sesi)
// PENGURUS boleh bypass window check supaya bisa uji coba
// =====================================================
export async function daftarJadiInputter(tanggal: string) {
  // Untuk pengurus, gunakan getCurrentUser (login via auth).
  // Untuk warga, gunakan session token.
  const profile = (await getCurrentWarga()) || (await getCurrentUser())
  if (!profile) return { error: 'Sesi login tidak valid' }

  // WARGA wajib window check dan cek apakah dia petugas ronda untuk tanggal ini!
  if (!isPengurus(profile)) {
    const admin = createAdminClient()
    const { data: isOpen } = await admin.rpc('is_jimpitan_window_open')
    if (!isOpen) {
      return { error: 'Window jimpitan tertutup. Hanya pengurus yang bisa membuat sesi di luar window.' }
    }

    // Cek apakah warga ini adalah petugas ronda untuk tanggal ini
    const isRonda = await isUserRondaPetugas(profile.id, tanggal)
    if (!isRonda) {
      return { error: 'Hanya warga yang sedang bertugas ronda hari ini yang bisa membuat sesi jimpitan.' }
    }
  }

  const admin = createAdminClient()

  // Cek apakah sudah ada sesi untuk tanggal ini (any status except CANCELLED)
  const { data: existing } = await admin
    .from('jimpitan_sesi')
    .select('id, input_by, status')
    .eq('tanggal', tanggal)
    .not('status', 'in', '("CANCELLED")')
    .maybeSingle()

  if (existing) {
    if (existing.input_by === profile.id) {
      return { error: 'Anda sudah terdaftar sebagai petugas sesi ini' }
    }
    return { error: 'Sudah ada petugas lain untuk sesi ini', existingSesiId: existing.id }
  }

  // Insert sesi baru
  const { data, error } = await admin
    .from('jimpitan_sesi')
    .insert({
      tanggal,
      waktu_mulai: new Date().toISOString(),
      input_by: profile.id,
      nama_inputter_snapshot: isPengurus(profile)
        ? `${profile.nama_kk} (Pengurus)`
        : profile.nama_kk,
      blok_inputter_snapshot: profile.blok,
      created_by_user_id: profile.id,
      created_by_name: profile.nama_kk,
      created_by_role: profile.role,
      created_from: isPengurus(profile) ? 'dashboard_pengurus' : 'warga_app',
      // FIX: pengurus yang input manual → langsung APPROVED biar langsung
      // masuk dashboard "Iuran Bulan Ini" tanpa alur ACC terpisah.
      // Warga biasa tetap AKTIF dan perlu submit + ACC oleh bendahara.
      ...(isPengurus(profile)
        ? {
            status: 'APPROVED',
            approved_by: profile.id,
            approved_by_user_id: profile.id,
            approved_by_name: profile.nama_kk,
            approved_at: new Date().toISOString(),
          }
        : { status: 'AKTIF' }),
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/dashboard/jimpitan')
  revalidatePath('/warga')
  revalidatePath('/warga/ronda')
  revalidatePath(`/warga/jimpitan/${data.id}`)
  revalidatePath(`/dashboard/jimpitan/${data.id}`)
  revalidatePath('/dashboard')

  return { success: true, sesiId: data.id }
}

// =====================================================
// JAGA TIDAK HADIR + PENGGANTI (oleh penginput / pengurus)
// =====================================================
export async function swapPenjaga(formData: FormData) {
  const profile = await getCurrentWarga() || await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }

  const sesiId = formData.get('sesiId') as string
  const profileAsliId = formData.get('profileAsliId') as string
  const profilePenggantiId = formData.get('profilePenggantiId') as string
  const keterangan = (formData.get('keterangan') as string | null) ?? null

  if (!sesiId || !profileAsliId || !profilePenggantiId) {
    return { error: 'Data tidak lengkap' }
  }

  const admin = createAdminClient()
  const { data: sesi } = await admin
    .from('jimpitan_sesi')
    .select('tanggal, input_by, status')
    .eq('id', sesiId)
    .single()

  if (!sesi) return { error: 'Sesi tidak ditemukan' }
  if (sesi.status !== 'AKTIF') return { error: 'Sesi sudah disubmit/ditutup' }
  // Pengurus boleh swap, warga hanya jika dia inputter sesi
  if (!isPengurus(profile) && sesi.input_by !== profile.id) {
    return { error: 'Hanya petugas sesi atau pengurus yang boleh swap' }
  }

  // Ambil data penjaga & pengganti
  const { data: asli } = await admin
    .from('profiles')
    .select('nama_kk')
    .eq('id', profileAsliId)
    .single()
  const { data: pengganti } = await admin
    .from('profiles')
    .select('nama_kk')
    .eq('id', profilePenggantiId)
    .single()

  if (!asli || !pengganti) return { error: 'Profile tidak ditemukan' }

  // Cari jadwal_ronda_id berdasarkan profile_asli_id dan tanggal
  const { data: jadwal } = await admin
    .from('jadwal_ronda')
    .select('id')
    .eq('tanggal', sesi.tanggal)
    .eq('penjaga_profile_id', profileAsliId)
    .maybeSingle()

  if (!jadwal) return { error: 'Jadwal ronda tidak ditemukan untuk penjaga asli' }

  // Nonaktifkan swap lama (kalau ada)
  await admin
    .from('ronda_swap')
    .update({ is_active: false })
    .eq('jadwal_ronda_id', jadwal.id)
    .eq('is_active', true)

  // Insert swap baru
  const { error } = await admin.from('ronda_swap').insert({
    jadwal_ronda_id: jadwal.id,
    tanggal: sesi.tanggal,
    profile_asli_id: profileAsliId,
    profile_pengganti_id: profilePenggantiId,
    nama_asli_snapshot: asli.nama_kk,
    nama_pengganti_snapshot: pengganti.nama_kk,
    keterangan: keterangan || null,
    created_by: profile.id,
    is_active: true,
  })

  if (error) return { error: error.message }

  revalidatePath('/dashboard/jimpitan')
  revalidatePath('/dashboard/ronda')
  revalidatePath('/warga')
  revalidatePath('/warga/ronda')
  revalidatePath(`/warga/jimpitan/${sesiId}`)
  revalidatePath(`/dashboard/jimpitan/${sesiId}`)
  return { success: true }
}

// =====================================================
// SWAP ANGGOTA (bukan ketua) - tukar attendance
// Untuk ketua pakai swapPenjaga (yang insert ke ronda_swap).
// Untuk anggota biasa: langsung swap baris di ronda_attendance.
// =====================================================
export async function swapAnggota(formData: FormData) {
  const profile = await getCurrentWarga() || await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }

  const sesiId = formData.get('sesiId') as string
  const profileAsliId = formData.get('profileAsliId') as string
  const profilePenggantiId = formData.get('profilePenggantiId') as string

  if (!sesiId || !profileAsliId || !profilePenggantiId) {
    return { error: 'Data tidak lengkap' }
  }

  const admin = createAdminClient()
  const { data: sesi } = await admin
    .from('jimpitan_sesi')
    .select('status')
    .eq('id', sesiId)
    .single()

  if (!sesi) return { error: 'Sesi tidak ditemukan' }
  if (sesi.status !== 'AKTIF') return { error: 'Sesi sudah disubmit/ditutup' }

  // Ambil data nama asli & pengganti
  const { data: asli } = await admin
    .from('profiles')
    .select('nama_kk, login_id')
    .eq('id', profileAsliId)
    .single()
  const { data: pengganti } = await admin
    .from('profiles')
    .select('nama_kk, login_id')
    .eq('id', profilePenggantiId)
    .single()

  if (!asli || !pengganti) return { error: 'Profile tidak ditemukan' }

  // Cek apakah asli ada di attendance (kalau belum, langsung insert pengganti saja)
  const { data: attAsli } = await admin
    .from('ronda_attendance')
    .select('id')
    .eq('sesi_id', sesiId)
    .eq('profile_id', profileAsliId)
    .maybeSingle()

  // Hapus baris attendance asli (kalau ada)
  if (attAsli) {
    const { error: delErr } = await admin
      .from('ronda_attendance')
      .delete()
      .eq('sesi_id', sesiId)
      .eq('profile_id', profileAsliId)
    if (delErr) return { error: delErr.message }
  }

  // Hapus baris attendance pengganti kalau sudah ada (replace)
  await admin
    .from('ronda_attendance')
    .delete()
    .eq('sesi_id', sesiId)
    .eq('profile_id', profilePenggantiId)

  // Insert baris attendance pengganti dengan flag is_pengganti
  const { error } = await admin.from('ronda_attendance').insert({
    sesi_id: sesiId,
    profile_id: profilePenggantiId,
    nama_snapshot: pengganti.nama_kk,
    nama_kk_snapshot: pengganti.nama_kk,
    login_id: pengganti.login_id,
    is_pengganti: true,
    pengganti_dari_id: profileAsliId,
    pengganti_dari_nama: asli.nama_kk,
  })

  if (error) return { error: error.message }

  await recalcJumlahPenjagaHadir(sesiId)

  revalidatePath(`/warga/jimpitan/${sesiId}`)
  revalidatePath(`/dashboard/jimpitan/${sesiId}`)
  return { success: true }
}

// =====================================================
// UPDATE DETAIL JIMPITAN (per-warga)
// =====================================================
export async function updateJimpitanDetail(formData: FormData) {
  const profile = await getCurrentWarga() || await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }

  const sesiId = formData.get('sesiId') as string
  const profileId = formData.get('profileId') as string
  const nominal = parseInt(formData.get('nominal') as string || '0', 10)
  const isBayar = formData.get('isBayar') === 'true'

  if (!sesiId || !profileId) return { error: 'Data tidak lengkap' }

  const admin = createAdminClient()
  const { data: sesi } = await admin
    .from('jimpitan_sesi')
    .select('input_by, status')
    .eq('id', sesiId)
    .single()

  if (!sesi) return { error: 'Sesi tidak ditemukan' }
  // Pengurus boleh input, warga hanya jika dia inputter sesi
  if (!isPengurus(profile) && sesi.input_by !== profile.id) {
    return { error: 'Hanya petugas sesi atau pengurus yang boleh input' }
  }
  if (sesi.status === 'APPROVED') {
    return { error: 'Sesi sudah di-ACC, tidak bisa diubah' }
  }

  // Ambil snapshot profile
  const { data: warga } = await admin
    .from('profiles')
    .select('nama_kk, login_id, blok, nomor_rumah')
    .eq('id', profileId)
    .single()

  if (!warga) return { error: 'Profile warga tidak ditemukan' }

  // Upsert detail
  // Catatan: kolom real di DB = login_id, nama_kk_snapshot, status_bayar
  // (bukan nama_snapshot/blok_snapshot/nomor_rumah_snapshot seperti di SQL 20)
  const { error } = await admin
    .from('jimpitan_detail')
    .upsert(
      {
        sesi_id: sesiId,
        profile_id: profileId,
        login_id: warga.login_id,
        nama_kk_snapshot: warga.nama_kk,
        nominal: isBayar ? nominal : 0,
        is_bayar: isBayar,
        status_bayar: isBayar ? 'BAYAR' : 'BELUM',
      },
      { onConflict: 'sesi_id,profile_id' }
    )

  if (error) return { error: error.message }

  revalidatePath(`/warga/jimpitan/${sesiId}`)
  revalidatePath('/warga/ronda')
  revalidatePath(`/dashboard/jimpitan/${sesiId}`)
  return { success: true }
}

// =====================================================
// FETCH ALL ACTIVE RESIDENTS (for manual input/bulk actions)
// =====================================================
export async function getActiveResidents() {
  const admin = createAdminClient()
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, nama_kk, login_id, blok, nomor_rumah')
    .eq('is_active', true)
    .not('blok', 'is', null)
    .not('nomor_rumah', 'is', null)
    .neq('blok', 'X')
  return profiles ?? []
}
export async function bulkSetBelumBayar(sesiId: string) {
  const profile = await getCurrentWarga() || await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }

  const admin = createAdminClient()
  const { data: sesi } = await admin
    .from('jimpitan_sesi')
    .select('input_by, status')
    .eq('id', sesiId)
    .single()

  if (!sesi) return { error: 'Sesi tidak ditemukan' }
  if (!isPengurus(profile) && sesi.input_by !== profile.id) {
    return { error: 'Hanya petugas sesi atau pengurus yang boleh input' }
  }

  // Ambil semua profile yang punya rumah di RT 03 (WARGA + pengurus yang tinggal di sini)
  // Filter blok != 'X' supaya SUPERADMIN tidak ikut
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, nama_kk, login_id, blok, nomor_rumah')
    .eq('is_active', true)
    .not('blok', 'is', null)
    .not('nomor_rumah', 'is', null)
    .neq('blok', 'X')

  if (!profiles || profiles.length === 0) return { error: 'Tidak ada warga' }

  // Kolom real di DB: login_id, nama_kk_snapshot, status_bayar
  // (SQL 20 dokumentasi lama — DB sudah di-migrasi, lihat sql/48)
  const rows = profiles.map((p) => ({
    sesi_id: sesiId,
    profile_id: p.id,
    login_id: p.login_id,
    nama_kk_snapshot: p.nama_kk,
    nominal: 0,
    is_bayar: false,
    status_bayar: 'BELUM',
  }))

  const { error } = await admin
    .from('jimpitan_detail')
    .upsert(rows, { onConflict: 'sesi_id,profile_id' })

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/jimpitan/${sesiId}`)
  revalidatePath(`/warga/jimpitan/${sesiId}`)
  revalidatePath('/warga/ronda')
  return { success: true }
}

// =====================================================
// TOGGLE KEHADIRAN PENJAGA
// =====================================================
export async function toggleKehadiran(formData: FormData) {
  const profile = await getCurrentWarga() || await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }

  const sesiId = formData.get('sesiId') as string
  const profileId = formData.get('profileId') as string
  const isHadir = formData.get('isHadir') === 'true'

  if (!sesiId || !profileId) return { error: 'Data tidak lengkap' }

  const admin = createAdminClient()
  const { data: sesi } = await admin
    .from('jimpitan_sesi')
    .select('input_by, status')
    .eq('id', sesiId)
    .single()

  if (!sesi) return { error: 'Sesi tidak ditemukan' }
  if (!isPengurus(profile) && sesi.input_by !== profile.id) {
    return { error: 'Hanya petugas sesi atau pengurus yang boleh input' }
  }

  if (isHadir) {
    const { data: warga } = await admin
      .from('profiles')
      .select('nama_kk, login_id')
      .eq('id', profileId)
      .single()
    if (!warga) return { error: 'Profile tidak ditemukan' }

    // Cek apakah ini hasil swap
    const { data: sesiInfo } = await admin
      .from('jimpitan_sesi')
      .select('tanggal')
      .eq('id', sesiId)
      .single()
    let isPengganti = false
    let penggantiDariId: string | null = null
    let penggantiDariNama: string | null = null

    if (sesiInfo) {
      const { data: swap } = await admin
        .from('ronda_swap')
        .select('profile_asli_id, nama_asli_snapshot')
        .eq('tanggal', sesiInfo.tanggal)
        .eq('profile_pengganti_id', profileId)
        .eq('is_active', true)
        .maybeSingle()
      if (swap) {
        isPengganti = true
        penggantiDariId = swap.profile_asli_id
        penggantiDariNama = swap.nama_asli_snapshot
      }
    }

    const { error } = await admin.from('ronda_attendance').upsert(
      {
        sesi_id: sesiId,
        profile_id: profileId,
        nama_snapshot: warga.nama_kk,
        nama_kk_snapshot: warga.nama_kk,
        login_id: warga.login_id,
        is_pengganti: isPengganti,
        pengganti_dari_id: penggantiDariId,
        pengganti_dari_nama: penggantiDariNama,
      },
      { onConflict: 'sesi_id,profile_id' }
    )
    if (error) return { error: error.message }
  } else {
    const { error } = await admin
      .from('ronda_attendance')
      .delete()
      .eq('sesi_id', sesiId)
      .eq('profile_id', profileId)
    if (error) return { error: error.message }
  }

  await recalcJumlahPenjagaHadir(sesiId)

  revalidatePath(`/dashboard/jimpitan/${sesiId}`)
  revalidatePath(`/warga/jimpitan/${sesiId}`)
  revalidatePath('/warga/ronda')
  return { success: true }
}

// =====================================================
// SUBMIT SESI (status AKTIF → SUBMITTED)
// =====================================================
export async function submitSesi(formData: FormData) {
  const profile = await getCurrentWarga() || await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }

  const sesiId = formData.get('sesiId') as string
  const keadaan = formData.get('keadaan') as string
  const catatan = formData.get('catatan') as string | null
  const detailsJson = formData.get('details') as string | null

  if (!sesiId) return { error: 'Sesi ID tidak ada' }

  const admin = createAdminClient()

  // 1. Get current session to check status
  const { data: sesi, error: sesiErr } = await admin
    .from('jimpitan_sesi')
    .select('status, total_nominal, jumlah_warga_bayar, input_by')
    .eq('id', sesiId)
    .maybeSingle()

  if (sesiErr) return { error: sesiErr.message }
  if (!sesi) return { error: 'Sesi tidak ditemukan' }

  // 2. Prevent re-submission if already SUBMITTED or APPROVED or CANCELLED
  if (sesi.status === 'SUBMITTED' || sesi.status === 'APPROVED' || sesi.status === 'CANCELLED') {
    return { error: `Sesi sudah dalam status ${sesi.status}. Tidak dapat disubmit ulang.` }
  }

  // 3. Save details first to ensure they are in DB before status change
  let calculatedTotal = 0
  let calculatedCount = 0

  if (detailsJson) {
    try {
      const details: Record<string, { nominal: number; is_bayar: boolean }> = JSON.parse(detailsJson)
      
      const profileIds = Object.keys(details)
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, nama_kk, login_id, blok, nomor_rumah')
        .in('id', profileIds)

      if (profiles && profiles.length > 0) {
        const rows = profiles.map((p) => {
          const d = details[p.id]
          const nominal = d?.nominal ?? 0
          const isBayar = d?.is_bayar ?? false
          
          if (isBayar) {
            calculatedTotal += nominal
            calculatedCount += 1
          }

          return {
            sesi_id: sesiId,
            profile_id: p.id,
            login_id: p.login_id,
            nama_kk_snapshot: p.nama_kk,
            blok_snapshot: p.blok,
            nomor_rumah_snapshot: p.nomor_rumah,
            nominal: nominal,
            is_bayar: isBayar,
            status_bayar: isBayar ? 'BAYAR' : 'BELUM',
          }
        })

        const { error: upsertError } = await admin
          .from('jimpitan_detail')
          .upsert(rows, { onConflict: 'sesi_id,profile_id' })

        if (upsertError) throw upsertError
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      return { error: `Gagal menyimpan detail jimpitan: ${errorMessage}` }
    }
  }

  // 4. Validation: Ensure at least one payer
  if (calculatedCount === 0) {
    return { error: 'Harus ada setidaknya satu warga yang membayar untuk submit sesi' }
  }

  // 5. Calculate attendance count
  const { count: attendanceCount } = await admin
    .from('ronda_attendance')
    .select('*', { count: 'exact', head: true })
    .eq('sesi_id', sesiId)

  // 6. Update session status and totals, plus submitted_by info
  const { error: updateError } = await admin
    .from('jimpitan_sesi')
    .update({
      status: 'SUBMITTED',
      total_nominal: calculatedTotal,
      total_pendapatan: calculatedTotal,
      jumlah_warga_bayar: calculatedCount,
      jumlah_penjaga_hadir: attendanceCount ?? 0,
      keadaan: keadaan,
      catatan: catatan,
      waktu_submit: new Date().toISOString(),
      submitted_by_user_id: profile.id,
      submitted_by_name: profile.nama_kk,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sesiId)

  if (updateError) return { error: updateError.message }

  revalidatePath('/dashboard/jimpitan')
  revalidatePath('/dashboard/kas')
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/jimpitan/${sesiId}`)

  return { success: true }
}

// =====================================================
// BENDAHARA: ACC SESI
// =====================================================
export async function accSesi(sesiId: string) {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  if (!['BENDAHARA', 'KETUA_RT', 'SUPERADMIN', 'SEKRETARIS'].includes(profile.role)) {
    return { error: 'Hanya pengurus yang boleh ACC' }
  }

  const admin = createAdminClient()
  
  // 1. Ambil data sesi lengkap
  const { data: sesi } = await admin
    .from('jimpitan_sesi')
    .select('*')
    .eq('id', sesiId)
    .maybeSingle()

  if (!sesi) return { error: 'Sesi tidak ditemukan' }
  if (sesi.status !== 'SUBMITTED') return { error: 'Sesi harus dalam status Submitted untuk di-ACC' }
  if (sesi.approved_by_user_id) {
    return { error: 'Sesi sudah di-ACC sebelumnya' }
  }

  // 2. Ambil total dari jimpitan_detail untuk validasi (fallback mechanism) + update tagihan
  const { data: details } = await admin
    .from('jimpitan_detail')
    .select('profile_id, nominal, is_bayar')
    .eq('sesi_id', sesiId)

  const calculatedTotal = (details ?? []).reduce((s, d: { nominal: number; is_bayar: boolean }) => s + Number(d.nominal), 0)
  const calculatedCount = (details ?? []).filter((d: { nominal: number; is_bayar: boolean }) => d.is_bayar).length

  // 3. Get attendance count
  const { count: attendanceCount } = await admin
    .from('ronda_attendance')
    .select('*', { count: 'exact', head: true })
    .eq('sesi_id', sesiId)

  // 3.5 Update jimpitan_tagihan untuk setiap warga yang bayar di sesi ini
  const periodeBulan = sesi.tanggal.slice(0, 8) + '01' // YYYY-MM-01
  const detailBayar = (details ?? []).filter((d: { profile_id: string; nominal: number; is_bayar: boolean }) => d.is_bayar && Number(d.nominal) > 0)
  
  for (const detail of detailBayar) {
    // Dapatkan tagihan yang ada untuk profile_id dan periode_bulan
    const { data: tagihan } = await admin
      .from('jimpitan_tagihan')
      .select('*')
      .eq('profile_id', detail.profile_id)
      .eq('periode_bulan', periodeBulan)
      .maybeSingle()

    if (tagihan) {
      // Update total_terbayar yang ada
      const newTotalTerbayar = Number(tagihan.total_terbayar) + Number(detail.nominal)
      let newStatus = 'CICIL'
      if (newTotalTerbayar >= Number(tagihan.nominal_tagihan)) {
        newStatus = newTotalTerbayar === Number(tagihan.nominal_tagihan) ? 'LUNAS' : 'LEBIH'
      }
      const kelebihanBaru = Math.max(0, newTotalTerbayar - Number(tagihan.nominal_tagihan))

      await admin
        .from('jimpitan_tagihan')
        .update({
          total_terbayar: newTotalTerbayar,
          status: newStatus,
          kelebihan: kelebihanBaru,
          updated_at: new Date().toISOString()
        })
        .eq('id', tagihan.id)
    } else {
      // Buat tagihan baru jika belum ada (dapatkan nominal tagihan default dari profile)
      const { data: profilePembayar } = await admin
        .from('profiles')
        .select('kategori_tarif')
        .eq('id', detail.profile_id)
        .maybeSingle()

      const tarifDefault: Record<string, number> = { STANDAR: 3000, KURANG: 2000, ISTIMEWA: 5000 }
      const nominalTagihan = tarifDefault[profilePembayar?.kategori_tarif ?? 'STANDAR'] ?? 3000

      let newStatus = 'CICIL'
      if (Number(detail.nominal) >= nominalTagihan) {
        newStatus = Number(detail.nominal) === nominalTagihan ? 'LUNAS' : 'LEBIH'
      }

      const kelebihan = Math.max(0, Number(detail.nominal) - nominalTagihan)

      await admin
        .from('jimpitan_tagihan')
        .insert({
          profile_id: detail.profile_id,
          periode_bulan: periodeBulan,
          nominal_tagihan: nominalTagihan,
          total_terbayar: Number(detail.nominal),
          status: newStatus,
          kelebihan: kelebihan
        })
    }
  }

  // 4. Buat transaksi kas (Pemasukan)
  // Check for existing transaction using source_id = sesi.id to prevent duplicates
  const { data: existingTrx } = await admin
    .from('kas_transaksi')
    .select('id')
    .or(`trx_id_external.eq.JMP-${sesi.tanggal.replace(/-/g, '')},source_id.eq.${sesiId}`)
    .maybeSingle()

  let kasTransactionId: string | undefined
  if (!existingTrx) {
    const { data: trxData, error: trxError } = await admin
      .from('kas_transaksi')
      .insert({
        trx_id_external: `JMP-${sesi.tanggal.replace(/-/g, '')}`,
        source_id: sesiId,
        tanggal: sesi.tanggal,
        tipe: 'MASUK',
        kategori: 'IURAN_BULANAN',
        uraian: `Jimpitan ${formatTanggal(sesi.tanggal)}`,
        nominal: calculatedTotal,
        metode_bayar: 'TUNAI',
        sumber_dana: 'JIMPITAN',
        catatan: `Otomatis dari ACC jimpitan sesi ${sesi.id}`,
        created_by: profile.id,
      })
      .select('id')
      .single()
    if (trxError) return { error: `Gagal membuat transaksi kas: ${trxError.message}` }
    kasTransactionId = trxData?.id
  } else {
    kasTransactionId = existingTrx.id
  }

  // 5. Update status sesi menjadi APPROVED
  const { error: updateError } = await admin
    .from('jimpitan_sesi')
    .update({
      status: 'APPROVED',
      approved_by: profile.id,
      approved_by_user_id: profile.id,
      approved_by_name: profile.nama_kk,
      approved_at: new Date().toISOString(),
      kas_transaction_id: kasTransactionId,
      total_nominal: calculatedTotal,
      total_pendapatan: calculatedTotal,
      jumlah_warga_bayar: calculatedCount,
      jumlah_penjaga_hadir: attendanceCount ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sesiId)

  if (updateError) return { error: updateError.message }

  // 5. Revalidate semua halaman terkait
  revalidatePath('/dashboard/kas')
  revalidatePath('/dashboard/jimpitan')
  revalidatePath('/dashboard')
  revalidatePath('/warga')
  revalidatePath('/warga/ronda')
  revalidatePath(`/warga/jimpitan/${sesiId}`)
  revalidatePath(`/dashboard/jimpitan/${sesiId}`)
  
  return { success: true }
}

// =====================================================
// BENDAHARA: REJECT SESI
// =====================================================
export async function rejectSesi(sesiId: string, alasan: string) {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  if (!['BENDAHARA', 'KETUA_RT', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya bendahara/ketua yang boleh reject' }
  }

  const admin = createAdminClient()
  // Reject = kembalikan ke AKTIF (bukan status final) agar inputter bisa revisi
  const { error } = await admin
    .from('jimpitan_sesi')
    .update({
      status: 'AKTIF',
      catatan: (alasan ? `[REJECTED] ${alasan}\n` : '[REJECTED]\n') + ' ',
      updated_at: new Date().toISOString(),
    })
    .eq('id', sesiId)
    .eq('status', 'SUBMITTED')

  if (error) return { error: error.message }

  revalidatePath('/dashboard/kas')
  revalidatePath('/dashboard/jimpitan')
  revalidatePath('/warga/ronda')
  revalidatePath(`/warga/jimpitan/${sesiId}`)
  return { success: true }
}

// =====================================================
// PENGURUS: INPUT MANUAL JIMPITAN (untuk tanggal lampau)
// Membutuhkan ACC dari Bendahara
// =====================================================
export async function pengurusInputJimpitanManual(formData: FormData): Promise<{
  success?: boolean
  error?: string
  sesiId?: string
}> {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Anda belum login sebagai pengurus' }
  if (!['KETUA_RT', 'BENDAHARA', 'SEKRETARIS'].includes(profile.role)) {
    return { error: 'Hanya Ketua, Sekretaris, atau Bendahara yang boleh input manual' }
  }

  const tanggal = formData.get('tanggal') as string
  const detailsJson = formData.get('details') as string | null
  if (!tanggal) return { error: 'Tanggal wajib dipilih' }
  if (!detailsJson) return { error: 'Data detail jimpitan wajib diisi' }

  let details: Array<{ profileId: string; nominal: number; isBayar: boolean }> = []
  try {
    details = JSON.parse(detailsJson)
  } catch (e) {
    return { error: 'Format data detail tidak valid' }
  }

  const admin = createAdminClient()

  // 1. Cek apakah sudah ada sesi AKTIF/SUBMITTED untuk tanggal ini
  const { data: existing } = await admin
    .from('jimpitan_sesi')
    .select('id, status')
    .eq('tanggal', tanggal)
    .in('status', ['AKTIF', 'SUBMITTED', 'DRAFT'])
    .maybeSingle()

  if (existing) {
    return { error: `Sesi jimpitan tanggal ini sudah ada (Status: ${existing.status}).` }
  }

  // 2. Buat sesi baru dengan status SUBMITTED agar perlu ACC
  const { data: sesi, error: sesiErr } = await admin
    .from('jimpitan_sesi')
    .insert({
      tanggal,
      waktu_mulai: new Date().toISOString(),
      status: 'SUBMITTED',
      input_by: profile.id,
      nama_inputter_snapshot: profile.nama_kk,
      blok_inputter_snapshot: profile.blok,
      created_by_user_id: profile.id,
      created_by_name: profile.nama_kk,
      created_by_role: profile.role,
      created_from: 'dashboard_pengurus',
      submitted_by_user_id: profile.id,
      submitted_by_name: profile.nama_kk,
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (sesiErr || !sesi) {
    return { error: sesiErr?.message || 'Gagal membuat sesi jimpitan manual' }
  }

  const sesiId = sesi.id

  // 3. Ambil data profile untuk snapshot
  const profileIds = details.map(d => d.profileId)
  const { data: profiles, error: profilesErr } = await admin
    .from('profiles')
    .select('id, nama_kk, login_id')
    .in('id', profileIds)

  if (profilesErr) {
    await admin.from('jimpitan_sesi').delete().eq('id', sesiId)
    return { error: `Gagal mengambil data warga: ${profilesErr.message}` }
  }
  if (!profiles) {
    await admin.from('jimpitan_sesi').delete().eq('id', sesiId)
    return { error: 'Data warga tidak ditemukan' }
  }

  // 4. Insert detail
  const detailRows = details.map(d => {
    const p = profiles.find(prof => prof.id === d.profileId)
    if (!p) return null
    return {
      sesi_id: sesiId,
      profile_id: p.id,
      login_id: p.login_id,
      nama_kk_snapshot: p.nama_kk,
      nominal: d.nominal,
      is_bayar: d.isBayar,
      status_bayar: d.isBayar ? 'BAYAR' : 'BELUM',
    }
  }).filter(Boolean)

  if (detailRows.length === 0) {
    await admin.from('jimpitan_sesi').delete().eq('id', sesiId)
    return { error: 'Tidak ada data detail yang valid untuk dimasukkan' }
  }

  const { error: detailErr } = await admin
    .from('jimpitan_detail')
    .insert(detailRows)

  if (detailErr) {
    await admin.from('jimpitan_sesi').delete().eq('id', sesiId)
    return { error: `Gagal memasukkan detail: ${detailErr.message}` }
  }

  revalidatePath('/dashboard/jimpitan')
  revalidatePath('/dashboard/kas')
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/jimpitan/${sesiId}`)

  return { success: true, sesiId }
}

export async function tambahJadwalRonda(formData: FormData) {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  if (!['KETUA_RT', 'SEKRETARIS', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya ketua/sekretaris yang boleh tambah jadwal' }
  }

  const tanggal = formData.get('tanggal') as string
  const profileId = formData.get('profileId') as string

  if (!tanggal || !profileId) return { error: 'Data tidak lengkap' }

  const admin = createAdminClient()
  const dt = new Date(tanggal)
  const mingguKe = Math.ceil(dt.getDate() / 7)

  const { data: warga } = await admin
    .from('profiles')
    .select('nama_kk, blok, nomor_rumah')
    .eq('id', profileId)
    .single()

  if (!warga) return { error: 'Profile tidak ditemukan' }

  const { error } = await admin.from('jadwal_ronda').insert({
    tanggal,
    minggu_ke: mingguKe,
    bulan: dt.getMonth() + 1,
    tahun: dt.getFullYear(),
    penjaga_profile_id: profileId,
    nama_penjaga_snapshot: warga.nama_kk,
    blok_snapshot: warga.blok,
    nomor_rumah_snapshot: warga.nomor_rumah,
  })

  if (error) return { error: error.message }

  revalidatePath('/dashboard/ronda')
  revalidatePath('/warga/ronda')
  return { success: true }
}

export async function hapusJadwalRonda(id: string) {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  if (!['KETUA_RT', 'SEKRETARIS', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Tidak punya akses' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('jadwal_ronda')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/ronda')
  revalidatePath('/warga/ronda')
  return { success: true }
}

// =====================================================
// PENGURUS: INPUT MANUAL TRANSAKSI KAS
// =====================================================
export async function tambahTransaksiKas(formData: FormData) {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  // Bendahara/Ketua/Sekretaris/Superadmin boleh input manual
  if (!['BENDAHARA', 'KETUA_RT', 'SEKRETARIS', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya pengurus yang boleh input transaksi' }
  }

  const tipe = (formData.get('tipe') as string)?.toUpperCase()
  const tanggal = formData.get('tanggal') as string
  const kategori = (formData.get('kategori') as string)?.toUpperCase()
  const uraian = (formData.get('uraian') as string)?.trim()
  const nominalStr = formData.get('nominal') as string
  const metodeBayar = (formData.get('metode_bayar') as string) || null
  const sumberDana = (formData.get('sumber_dana') as string) || null
  const ditalangiOleh = (formData.get('ditalangi_oleh') as string)?.trim() || null
  const catatan = (formData.get('catatan') as string)?.trim() || null
  const danaKhususId = (formData.get('dana_khusus_id') as string)?.trim()
  const profileIdPembayaran = (formData.get('profile_id') as string)?.trim()
  const notaFile = formData.get('nota') as File | null

  // Upload nota
  let notaUrl: string | null = null
  try {
    notaUrl = await uploadAttachment(notaFile)
  } catch (e) {
    return { error: (e as Error).message }
  }

  // Validasi
  if (!['MASUK', 'KELUAR'].includes(tipe)) {
    return { error: 'Tipe harus MASUK atau KELUAR' }
  }
  if (!tanggal) return { error: 'Tanggal wajib diisi' }
  if (!kategori) return { error: 'Kategori wajib diisi' }
  if (!uraian) return { error: 'Uraian wajib diisi' }
  const nominal = Number(nominalStr)
  if (!Number.isFinite(nominal) || nominal <= 0) {
    return { error: 'Nominal harus angka > 0' }
  }

  const admin = createAdminClient()

  // If it's MERTI DUSUN / DANA KHUSUS, process it first
  if (danaKhususId && profileIdPembayaran) {
    // Get tagihan
    const { data: tagihan } = await admin
      .from('dana_khusus_tagihan')
      .select('id')
      .eq('dana_khusus_id', danaKhususId)
      .eq('profile_id', profileIdPembayaran)
      .single()
    if (!tagihan) {
      return { error: 'Tagihan tidak ditemukan untuk warga ini' }
    }
    // Get profile data
    const { data: targetProfile } = await admin
      .from('profiles')
      .select('id, login_id, nama_kk')
      .eq('id', profileIdPembayaran)
      .single()
    if (!targetProfile) {
      return { error: 'Profile tidak ditemukan' }
    }
    // Insert payment
    const { error: payErr } = await admin
      .from('dana_khusus_pembayaran')
      .insert({
        dana_khusus_id: danaKhususId,
        tagihan_id: tagihan.id,
        profile_id: targetProfile.id,
        login_id: targetProfile.login_id,
        nominal,
        metode: metodeBayar || 'TUNAI',
        tanggal_bayar: tanggal,
        catatan,
        input_by: profile.id,
        bukti_ref: `DK-${danaKhususId.slice(0, 8)}-${Date.now()}`,
      })
    if (payErr) {
      return { error: 'Gagal mencatat pembayaran dana khusus' }
    }
    revalidatePath('/dashboard/dana-khusus')
    revalidatePath(`/dashboard/dana-khusus/${danaKhususId}`)
    revalidatePath('/warga/dana-khusus')
  }

  const { error } = await admin.from('kas_transaksi').insert({
    tanggal,
    tipe,
    kategori,
    uraian,
    nominal,
    metode_bayar: metodeBayar,
    sumber_dana: sumberDana,
    ditalangi_oleh: sumberDana === 'DITALANGI' ? ditalangiOleh : null,
    status_talangan: sumberDana === 'DITALANGI' ? 'BELUM_DIGANTI' : null,
    catatan,
    created_by: profile.nama_kk ?? profile.role,
    nota_url: notaUrl,
  })

  if (error) return { error: error.message }

  revalidatePath('/dashboard/kas')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function hapusTransaksiKas(id: string) {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  if (!['BENDAHARA', 'KETUA_RT', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya bendahara/ketua yang boleh hapus transaksi' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('kas_transaksi')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/kas')
  revalidatePath('/dashboard')
  return { success: true }
}

// =====================================================
// PENGURUS: EDIT TRANSAKSI KAS (untuk koreksi input keliru)
// Hanya bendahara/ketua yang boleh edit
// Field yang bisa diedit: uraian, nominal, catatan, tanggal, kategori.
// Tipe (MASUK/KELUAR) tidak bisa diedit — untuk itu hapus lalu buat ulang.
// Setiap edit menambahkan suffix audit "✏️ diedit <oleh> <tgl>" ke catatan
// agar konsistensi audit trail tetap terjaga.
// =====================================================
export async function editTransaksiKas(formData: FormData) {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  if (!['BENDAHARA', 'KETUA_RT', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya bendahara/ketua yang boleh edit transaksi' }
  }

  const id = formData.get('id') as string
  const uraian = (formData.get('uraian') as string)?.trim()
  const nominalStr = formData.get('nominal') as string
  const tanggal = formData.get('tanggal') as string
  const kategori = (formData.get('kategori') as string)?.trim().toUpperCase()
  const catatanInput = (formData.get('catatan') as string)?.trim() || null

  if (!id) return { error: 'ID transaksi tidak ada' }
  if (!uraian) return { error: 'Uraian wajib diisi' }
  const nominal = Number(nominalStr)
  if (!Number.isFinite(nominal) || nominal <= 0) {
    return { error: 'Nominal harus angka > 0' }
  }
  if (!tanggal) return { error: 'Tanggal wajib diisi' }
  if (!kategori) return { error: 'Kategori wajib diisi' }

  const adminCheck = createAdminClient()

  // Ambil tipe transaksi asli — supaya validasi kategori
  // sesuai konteks (KELUAR LAINNYA vs MASUK LAINNYA).
  const { data: trxRow } = await adminCheck
    .from('kas_transaksi')
    .select('tipe')
    .eq('id', id)
    .maybeSingle()
  const trxTipe = (trxRow?.tipe as 'MASUK' | 'KELUAR' | undefined) ?? undefined

  // Validasi 3 lapis (semua harus lolos untuk safety):
  //  1. Ada di kas_kategori dengan (kode, tipe) sesuai → valid
  //  2. Ada di kas_kategori dengan kode yg sama (tipe apapun) → valid
  //  3. Whitelist legacy (hardcoded lama) → valid
  //  4. SUDAH pernah dipakai di kas_transaksi → valid (legacy usage)
  //  5. Kalau semua gagal → error
  const { data: katMatchTipe } = await adminCheck
    .from('kas_kategori')
    .select('kode, is_active')
    .eq('kode', kategori)
    .eq('tipe', trxTipe ?? 'MASUK')
    .maybeSingle()
  const { data: katAnyTipe } = !katMatchTipe ? await adminCheck
    .from('kas_kategori')
    .select('kode, is_active')
    .eq('kode', kategori)
    .maybeSingle() : { data: null }
  const { count: usageCount } = await adminCheck
    .from('kas_transaksi')
    .select('id', { count: 'exact', head: true })
    .eq('kategori', kategori)
  const LEGACY_KATEGORI = new Set(['PENGELUARAN_ATK', 'SALDO_AWAL', 'LAINNYA'])
  const kategoriValid =
    (katMatchTipe !== null && katMatchTipe.is_active) ||
    (katAnyTipe !== null && (katAnyTipe as { is_active: boolean }).is_active) ||
    LEGACY_KATEGORI.has(kategori) ||
    (usageCount ?? 0) > 0
  if (!kategoriValid) {
    return {
      error: `Kategori "${kategori}" tidak dikenal dan belum pernah dipakai. Buka Kelola Kategori untuk menambahkannya.`,
    }
  }

  // Pakai admin client yang sama untuk update
  // (adminCheck di atas sudah dipakai untuk validasi kategori)
  const admin = adminCheck

  // Tambah suffix audit ke catatan (tidak menimpa catatan user)
  const auditSuffix = `✏️ diedit ${profile.nama_kk ?? profile.role} ${new Date().toLocaleDateString('id-ID')}`
  const catatanFinal = catatanInput
    ? `${catatanInput} · ${auditSuffix}`
    : auditSuffix

  // Update semua field yang boleh diedit.
  // Tipe (MASUK/KELUAR) tidak diubah di sini — klien yang memanggil harus
  // konsisten (kategori harus sesuai tipe aslinya).
  const { error } = await admin
    .from('kas_transaksi')
    .update({
      uraian,
      nominal,
      catatan: catatanFinal,
      tanggal,
      kategori,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/kas')
  revalidatePath('/dashboard')
  // Juga revalidate path dinamis (mis. /dashboard/kas/[id])
  revalidatePath('/dashboard/kas/[id]', 'page')
  return { success: true }
}

// =====================================================
// KAS KATEGORI: master kategori dinamis
// Disimpan di tabel kas_kategori (lihat sql/55).
// Pengurus bisa tambah/edit/nonaktifkan kategori dari UI.
// =====================================================

export type KasKategori = {
  id: string
  tipe: 'MASUK' | 'KELUAR'
  kode: string
  label: string
  urutan: number
  is_active: boolean
}

// Ambil semua kategori aktif. Dipakai oleh form tambah/edit transaksi
// dan dialog Kelola Kategori.
export async function getKasKategori(): Promise<KasKategori[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('kas_kategori')
    .select('id, tipe, kode, label, urutan, is_active')
    .eq('is_active', true)
    .order('tipe', { ascending: true })
    .order('urutan', { ascending: true })
    .order('label', { ascending: true })
  return (data ?? []) as KasKategori[]
}

// Ambil SEMUA kategori (termasuk non-aktif) untuk dialog Kelola.
export async function getAllKasKategori(): Promise<KasKategori[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('kas_kategori')
    .select('id, tipe, kode, label, urutan, is_active')
    .order('tipe', { ascending: true })
    .order('urutan', { ascending: true })
    .order('label', { ascending: true })
  return (data ?? []) as KasKategori[]
}

// Tambah kategori baru. Hanya bendahara/ketua/superadmin.
export async function addKasKategori(formData: FormData): Promise<{
  success?: boolean
  error?: string
  id?: string
}> {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  if (!['BENDAHARA', 'KETUA_RT', 'SEKRETARIS', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya pengurus yang boleh menambah kategori' }
  }

  const tipe = (formData.get('tipe') as string)?.toUpperCase()
  const kodeRaw = (formData.get('kode') as string)?.trim().toUpperCase().replace(/\s+/g, '_')
  const label = (formData.get('label') as string)?.trim()
  const urutan = Number(formData.get('urutan') ?? 100)

  if (!['MASUK', 'KELUAR'].includes(tipe)) {
    return { error: 'Tipe harus MASUK atau KELUAR' }
  }
  if (!kodeRaw) return { error: 'Kode kategori wajib diisi (huruf/angka/underscore)' }
  if (!/^[A-Z0-9_]+$/.test(kodeRaw)) {
    return { error: 'Kode hanya boleh huruf, angka, dan underscore' }
  }
  if (!label) return { error: 'Label kategori wajib diisi' }
  if (label.length > 50) return { error: 'Label maksimal 50 karakter' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('kas_kategori')
    .insert({
      tipe,
      kode: kodeRaw,
      label,
      urutan: Number.isFinite(urutan) ? urutan : 100,
      is_active: true,
    })
    .select('id')
    .single()

  if (error) {
    if (error.message?.includes('duplicate') || error.code === '23505') {
      return { error: `Kategori "${kodeRaw}" untuk ${tipe} sudah ada` }
    }
    return { error: error.message }
  }

  revalidatePath('/dashboard/kas')
  revalidatePath('/dashboard')
  return { success: true, id: data?.id }
}

// Edit label / urutan / status aktif. Kode & tipe TIDAK bisa diubah.
export async function editKasKategori(formData: FormData): Promise<{
  success?: boolean
  error?: string
}> {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  if (!['BENDAHARA', 'KETUA_RT', 'SEKRETARIS', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya pengurus yang boleh edit kategori' }
  }

  const id = formData.get('id') as string
  const label = (formData.get('label') as string)?.trim()
  const urutan = Number(formData.get('urutan') ?? 100)
  const isActive = formData.get('is_active') === 'true'

  if (!id) return { error: 'ID kategori tidak ada' }
  if (!label) return { error: 'Label kategori wajib diisi' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('kas_kategori')
    .update({
      label,
      urutan: Number.isFinite(urutan) ? urutan : 100,
      is_active: isActive,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/kas')
  revalidatePath('/dashboard')
  return { success: true }
}

// Nonaktifkan kategori (soft delete). Tidak hapus fisik karena
// transaksi lama masih referensi ke kode ini.
export async function nonaktifkanKasKategori(id: string): Promise<{
  success?: boolean
  error?: string
}> {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  if (!['BENDAHARA', 'KETUA_RT', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya bendahara/ketua yang boleh nonaktifkan kategori' }
  }
  if (!id) return { error: 'ID kategori tidak ada' }

  const admin = createAdminClient()
  // Cek apakah ada transaksi yang masih pakai kategori ini
  const { count } = await admin
    .from('kas_transaksi')
    .select('id', { count: 'exact', head: true })
    .eq('kategori', (
      await admin.from('kas_kategori').select('kode, tipe').eq('id', id).single()
    ).data?.kode ?? '__none__')

  const { error } = await admin
    .from('kas_kategori')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/kas')
  revalidatePath('/dashboard')
  return {
    success: true,
    ...(count && count > 0
      ? { error: `Kategori dipakai di ${count} transaksi (dinonaktifkan, tapi data lama tetap aman)` }
      : {}),
  }
}

// =====================================================
// EXPORT LAPORAN KAS BULANAN (CSV)
// FIX Problem #2: Fitur export laporan bulanan (Pemasukan, Pengeluaran, Saldo)
//
// Dipakai oleh /dashboard/kas dengan date range filter.
// Format CSV:
//   - Section 1: Ringkasan (Pemasukan, Pengeluaran, Saldo)
//   - Section 2: Detail transaksi (sorted by tanggal ASC)
//
// Return: string CSV (UTF-8 BOM untuk Excel compatibility)
// =====================================================
export async function exportLaporanKas(formData: FormData): Promise<{
  success?: boolean
  error?: string
  csv?: string
  filename?: string
}> {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  if (!['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya pengurus yang boleh export laporan' }
  }

  const startDate = formData.get('startDate') as string
  const endDate = formData.get('endDate') as string
  const tipeFilter = (formData.get('tipe') as string) ?? ''  // '', 'MASUK', 'KELUAR'

  if (!startDate || !endDate) {
    return { error: 'Tanggal awal & akhir wajib diisi' }
  }

  const admin = createAdminClient()
  let query = admin
    .from('kas_transaksi')
    .select('tanggal, tipe, kategori, uraian, nominal, login_id, metode_bayar, sumber_dana, ditalangi_oleh, catatan, created_by, created_at')
    .gte('tanggal', startDate)
    .lte('tanggal', endDate)
    .order('tanggal', { ascending: true })
    .order('created_at', { ascending: true })

  if (tipeFilter === 'MASUK' || tipeFilter === 'KELUAR') {
    query = query.eq('tipe', tipeFilter)
  }

  const { data: trx, error } = await query
  if (error) return { error: error.message }

  const rows = trx ?? []

  // Compute summary
  const totalMasuk = rows
    .filter((r) => r.tipe === 'MASUK')
    .reduce((s, r) => s + Number(r.nominal), 0)
  const totalKeluar = rows
    .filter((r) => r.tipe === 'KELUAR')
    .reduce((s, r) => s + Number(r.nominal), 0)
  const jumlahMasuk = rows.filter((r) => r.tipe === 'MASUK').length
  const jumlahKeluar = rows.filter((r) => r.tipe === 'KELUAR').length

  // Compute saldo berjalan (running balance) — asumsikan data di-sort ASC
  // Kita butuh SEMUA transaksi sebelum startDate untuk saldo awal
  const { data: trxSebelum } = await admin
    .from('kas_transaksi')
    .select('tipe, nominal')
    .lt('tanggal', startDate)

  const saldoAwal = (trxSebelum ?? [])
    .reduce((s, r) => s + (r.tipe === 'MASUK' ? Number(r.nominal) : -Number(r.nominal)), 0)

  // Group by date for running balance
  let runningSaldo = saldoAwal
  const enrichedRows = rows.map((r) => {
    if (r.tipe === 'MASUK') runningSaldo += Number(r.nominal)
    else runningSaldo -= Number(r.nominal)
    return { ...r, saldo_berjalan: runningSaldo }
  })

  // ===== Build CSV =====
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    // Escape quotes and wrap with quotes if contains comma/quote/newline
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }

  const lines: string[] = []

  // Header section
  lines.push('LAPORAN KAS RT 03')
  lines.push(`Periode,${escape(startDate)},s/d,${escape(endDate)}`)
  lines.push(`Tipe Filter,${escape(tipeFilter || 'SEMUA (MASUK + KELUAR)')}`)
  lines.push(`Digenerate,${escape(new Date().toLocaleString('id-ID'))}`)
  lines.push(`Oleh,${escape(profile.nama_kk)} (${escape(profile.role)})`)
  lines.push('')

  // Section 1: Ringkasan
  lines.push('RINGKASAN')
  lines.push('Komponen,Nilai')
  lines.push(`Saldo Awal (sebelum ${escape(startDate)}),${saldoAwal}`)
  lines.push(`Total Pemasukan,${totalMasuk}`)
  lines.push(`Jumlah Transaksi Pemasukan,${jumlahMasuk}`)
  lines.push(`Total Pengeluaran,${totalKeluar}`)
  lines.push(`Jumlah Transaksi Pengeluaran,${jumlahKeluar}`)
  lines.push(`Saldo Periode Ini (Pemasukan - Pengeluaran),${totalMasuk - totalKeluar}`)
  lines.push(`Saldo Akhir (Saldo Awal + Saldo Periode),${saldoAwal + (totalMasuk - totalKeluar)}`)
  lines.push('')

  // Section 2: Breakdown per kategori
  const kategoriMap = new Map<string, { masuk: number; keluar: number }>()
  for (const r of rows) {
    const k = r.kategori || 'LAINNYA'
    if (!kategoriMap.has(k)) kategoriMap.set(k, { masuk: 0, keluar: 0 })
    const v = kategoriMap.get(k)!
    if (r.tipe === 'MASUK') v.masuk += Number(r.nominal)
    else v.keluar += Number(r.nominal)
  }
  lines.push('BREAKDOWN PER KATEGORI')
  lines.push('Kategori,Total Pemasukan,Total Pengeluaran,Net')
  for (const [k, v] of Array.from(kategoriMap.entries()).sort()) {
    lines.push(`${escape(k)},${v.masuk},${v.keluar},${v.masuk - v.keluar}`)
  }
  lines.push('')

  // Section 3: Detail transaksi
  lines.push('DETAIL TRANSAKSI')
  lines.push('Tanggal,Tipe,Kategori,Uraian,Nominal,Metode Bayar,Sumber Dana,Login ID,Ditalangi Oleh,Saldo Berjalan,Catatan,Input Oleh')
  for (const r of enrichedRows) {
    lines.push([
      escape(r.tanggal),
      escape(r.tipe),
      escape(r.kategori),
      escape(r.uraian),
      Number(r.nominal),
      escape(r.metode_bayar ?? ''),
      escape(r.sumber_dana ?? ''),
      escape(r.login_id ?? ''),
      escape(r.ditalangi_oleh ?? ''),
      r.saldo_berjalan,
      escape(r.catatan ?? ''),
      escape(r.created_by ?? ''),
    ].join(','))
  }

  // CSV with UTF-8 BOM for Excel compatibility
  const csv = '\uFEFF' + lines.join('\n')
  const filename = `Laporan_Kas_${startDate}_sd_${endDate}.csv`

  return { success: true, csv, filename }
}

// =====================================================
// EXPORT LAPORAN KAS BULANAN (PDF - DATA)
// FIX Problem #3: Tambah fitur export laporan bulanan RT ke PDF
//
// Server action: hitung semua data summary + transaksi untuk dirender
// sebagai PDF oleh client component (export-laporan-pdf-button.tsx)
// dengan jspdf + jspdf-autotable.
//
// Return: JSON data siap-render (bukan binary PDF, supaya tidak
//         membebani bundle Next.js dengan library PDF di server).
// =====================================================
export type LaporanKasData = {
  startDate: string
  endDate: string
  tipeFilter: string
  generator: string
  saldoAwal: number
  totalMasuk: number
  totalKeluar: number
  jumlahMasuk: number
  jumlahKeluar: number
  saldoAkhir: number
  kategoriBreakdown: Array<{
    kategori: string
    masuk: number
    keluar: number
  }>
  detailRows: Array<{
    tanggal: string
    tipe: 'MASUK' | 'KELUAR'
    kategori: string
    uraian: string
    nominal: number
    loginId: string | null
    saldoBerjalan: number
  }>
}

export async function exportLaporanKasPDFData(formData: FormData): Promise<{
  success?: boolean
  error?: string
  data?: LaporanKasData
}> {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  if (!['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya pengurus yang boleh export laporan' }
  }

  const startDate = formData.get('startDate') as string
  const endDate = formData.get('endDate') as string
  const tipeFilter = (formData.get('tipe') as string) ?? ''

  if (!startDate || !endDate) {
    return { error: 'Tanggal awal & akhir wajib diisi' }
  }

  const admin = createAdminClient()
  let query = admin
    .from('kas_transaksi')
    .select('tanggal, tipe, kategori, uraian, nominal, login_id')
    .gte('tanggal', startDate)
    .lte('tanggal', endDate)
    .order('tanggal', { ascending: true })
    .order('created_at', { ascending: true })

  if (tipeFilter === 'MASUK' || tipeFilter === 'KELUAR') {
    query = query.eq('tipe', tipeFilter)
  }

  const { data: trx, error } = await query
  if (error) return { error: error.message }

  const rows = trx ?? []

  // Compute summary
  const totalMasuk = rows
    .filter((r) => r.tipe === 'MASUK')
    .reduce((s, r) => s + Number(r.nominal), 0)
  const totalKeluar = rows
    .filter((r) => r.tipe === 'KELUAR')
    .reduce((s, r) => s + Number(r.nominal), 0)
  const jumlahMasuk = rows.filter((r) => r.tipe === 'MASUK').length
  const jumlahKeluar = rows.filter((r) => r.tipe === 'KELUAR').length

  // Saldo awal (semua transaksi sebelum startDate)
  const { data: trxSebelum } = await admin
    .from('kas_transaksi')
    .select('tipe, nominal')
    .lt('tanggal', startDate)

  const saldoAwal = (trxSebelum ?? [])
    .reduce((s, r) => s + (r.tipe === 'MASUK' ? Number(r.nominal) : -Number(r.nominal)), 0)
  const saldoAkhir = saldoAwal + (totalMasuk - totalKeluar)

  // Breakdown per kategori
  const kategoriMap = new Map<string, { masuk: number; keluar: number }>()
  for (const r of rows) {
    const k = r.kategori || 'LAINNYA'
    if (!kategoriMap.has(k)) kategoriMap.set(k, { masuk: 0, keluar: 0 })
    const v = kategoriMap.get(k)!
    if (r.tipe === 'MASUK') v.masuk += Number(r.nominal)
    else v.keluar += Number(r.nominal)
  }
  const kategoriBreakdown = Array.from(kategoriMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kategori, v]) => ({ kategori, masuk: v.masuk, keluar: v.keluar }))

  // Detail rows dengan running balance
  let runningSaldo = saldoAwal
  const detailRows = rows.map((r) => {
    if (r.tipe === 'MASUK') runningSaldo += Number(r.nominal)
    else runningSaldo -= Number(r.nominal)
    return {
      tanggal: r.tanggal,
      tipe: r.tipe as 'MASUK' | 'KELUAR',
      kategori: r.kategori || 'LAINNYA',
      uraian: r.uraian,
      nominal: Number(r.nominal),
      loginId: r.login_id,
      saldoBerjalan: runningSaldo,
    }
  })

  return {
    success: true,
    data: {
      startDate,
      endDate,
      tipeFilter,
      generator: profile.nama_kk ?? 'Pengurus',
      saldoAwal,
      totalMasuk,
      totalKeluar,
      jumlahMasuk,
      jumlahKeluar,
      saldoAkhir,
      kategoriBreakdown,
      detailRows,
    },
  }
}

// =====================================================
// PENGURUS: KELOLA KELEBIHAN PEMBAYARAN JIMPITAN
// =====================================================

export async function setKelebihanTujuan(formData: FormData): Promise<{
  success?: boolean
  error?: string
}> {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  if (!isPengurus(profile)) return { error: 'Hanya pengurus yang boleh mengelola kelebihan' }

  const tagihanId = formData.get('tagihanId') as string
  const tujuan = formData.get('tujuan') as string
  const catatan = (formData.get('catatan') as string)?.trim() || null

  if (!tagihanId || !tujuan) return { error: 'Data tidak lengkap' }
  if (!['BULAN_DEPAN', 'HIBAH'].includes(tujuan)) return { error: 'Tujuan tidak valid' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('jimpitan_tagihan')
    .update({ kelebihan_tujuan: tujuan, kelebihan_catatan: catatan, updated_at: new Date().toISOString() })
    .eq('id', tagihanId)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/iuran')
  return { success: true }
}

// =====================================================
// RONDA ATTENDANCE: Submit absensi ronda untuk sesi tertentu
// =====================================================
export async function submitRondaAttendance(
  sesiId: string,
  attendanceData: Array<{
    profileId: string
    isPresent: boolean
    isPengganti: boolean
    penggantiDariId: string | null
    catatan: string | null
  }>
): Promise<{ success?: boolean; error?: string }> {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  if (!['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya pengurus yang boleh menginput absensi ronda' }
  }

  const admin = createAdminClient()

  // 1. Validasi sesi ada
  const { data: sesi } = await admin
    .from('jimpitan_sesi')
    .select('id, tanggal')
    .eq('id', sesiId)
    .maybeSingle()

  if (!sesi) return { error: 'Sesi tidak ditemukan' }

  try {
    // 2. Ambil data profil untuk snapshot
    const profileIds = attendanceData.map(d => d.profileId)
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, nama_kk, login_id')
      .in('id', profileIds)
    
    if (!profiles) return { error: 'Gagal mengambil data profil' }

    // 3. Bersihkan absensi lama untuk sesi ini (jika ada)
    const { error: clearErr } = await admin
      .from('ronda_attendance')
      .delete()
      .eq('sesi_id', sesiId)

    if (clearErr) return { error: `Gagal membersihkan data lama: ${clearErr.message}` }

    // 4. Insert data baru
    const attendanceRows = attendanceData.map(d => {
      const p = profiles.find(prof => prof.id === d.profileId)
      if (!p) return null
      return {
        sesi_id: sesiId,
        profile_id: p.id,
        login_id: p.login_id,
        nama_snapshot: p.nama_kk,
        hadir: d.isPresent,
        is_pengganti: d.isPengganti,
        pengganti_dari_id: d.penggantiDariId,
        pengganti_dari_nama: d.isPengganti ? p.nama_kk : null,
        catatan: d.catatan || null,
      }
    }).filter(Boolean)

    const { error: insertErr } = await admin
      .from('ronda_attendance')
      .insert(attendanceRows)

    if (insertErr) return { error: insertErr.message }

    revalidatePath('/dashboard/ronda')
    revalidatePath('/warga/ronda')
    revalidatePath(`/dashboard/jimpitan/${sesiId}`)
    revalidatePath(`/warga/jimpitan/${sesiId}`)

    return { success: true }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function pindahkanKelebihanKeBulanDepan(tagihanId: string): Promise<{
  success?: boolean
  error?: string
}> {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  if (!isPengurus(profile)) return { error: 'Hanya pengurus yang boleh memindahkan kelebihan' }

  const admin = createAdminClient()

  // 1. Ambil tagihan sekarang
  const { data: tagihanSekarang, error: errTagihan } = await admin
    .from('jimpitan_tagihan')
    .select('id, profile_id, periode_bulan, kelebihan, total_terbayar, nominal_tagihan')
    .eq('id', tagihanId)
    .single()
  if (errTagihan) return { error: errTagihan.message }
  if (!tagihanSekarang) return { error: 'Tagihan tidak ditemukan' }
  if (!(tagihanSekarang.kelebihan > 0)) return { error: 'Tidak ada kelebihan untuk dipindahkan' }

  // 2. Hitung periode bulan depan
  const bulanIni = new Date(tagihanSekarang.periode_bulan)
  const bulanDepan = new Date(bulanIni.getFullYear(), bulanIni.getMonth() + 1, 1)
  const periodeBulanDepan = bulanDepan.toISOString().slice(0, 10)

  // 3. Ambil profil untuk tarif default
  const { data: profil, error: errProfil } = await admin
    .from('profiles')
    .select('kategori_tarif')
    .eq('id', tagihanSekarang.profile_id)
    .single()

  const tarifDefault: Record<string, number> = { STANDAR: 15000, KURANG: 10000, ISTIMEWA: 20000 }
  const nominalTagihanDefault = tarifDefault[profil?.kategori_tarif ?? 'STANDAR'] ?? 15000

  // 4. Ambil atau buat tagihan bulan depan
  const { data: tagihanDepan, error: errTagihanDepan } = await admin
    .from('jimpitan_tagihan')
    .select('*')
    .eq('profile_id', tagihanSekarang.profile_id)
    .eq('periode_bulan', periodeBulanDepan)
    .maybeSingle()

  if (errTagihanDepan && errTagihanDepan.code !== 'PGRST116') {
    return { error: errTagihanDepan.message }
  }

  const kelebihan = tagihanSekarang.kelebihan
  let newTotalTerbayarDepan
  let newStatusDepan: 'BELUM' | 'CICIL' | 'LUNAS' | 'LEBIH' = 'BELUM'

  if (tagihanDepan) {
    newTotalTerbayarDepan = Number(tagihanDepan.total_terbayar) + kelebihan
    if (newTotalTerbayarDepan === Number(tagihanDepan.nominal_tagihan)) {
      newStatusDepan = 'LUNAS'
    } else if (newTotalTerbayarDepan > Number(tagihanDepan.nominal_tagihan)) {
      newStatusDepan = 'LEBIH'
    } else if (newTotalTerbayarDepan > 0) {
      newStatusDepan = 'CICIL'
    }

    const kelebihanBaruDepan = Math.max(0, newTotalTerbayarDepan - Number(tagihanDepan.nominal_tagihan))

    const { error: updateErr } = await admin
      .from('jimpitan_tagihan')
      .update({
        total_terbayar: newTotalTerbayarDepan,
        status: newStatusDepan,
        kelebihan: kelebihanBaruDepan,
        updated_at: new Date().toISOString()
      })
      .eq('id', tagihanDepan.id)

    if (updateErr) return { error: updateErr.message }
  } else {
    // Buat tagihan baru
    newTotalTerbayarDepan = kelebihan
    if (newTotalTerbayarDepan === nominalTagihanDefault) {
      newStatusDepan = 'LUNAS'
    } else if (newTotalTerbayarDepan > nominalTagihanDefault) {
      newStatusDepan = 'LEBIH'
    } else if (newTotalTerbayarDepan > 0) {
      newStatusDepan = 'CICIL'
    }

    const { error: insertErr } = await admin
      .from('jimpitan_tagihan')
      .insert({
        profile_id: tagihanSekarang.profile_id,
        periode_bulan: periodeBulanDepan,
        nominal_tagihan: nominalTagihanDefault,
        total_terbayar: newTotalTerbayarDepan,
        status: newStatusDepan,
        kelebihan: Math.max(0, newTotalTerbayarDepan - nominalTagihanDefault),
      })

    if (insertErr) return { error: insertErr.message }
  }

  // 5. Kurangi total terbayar dan kelebihan di tagihan sekarang
  const newTotalTerbayarSekarang = Number(tagihanSekarang.total_terbayar) - kelebihan
  let newStatusSekarang: 'BELUM' | 'CICIL' | 'LUNAS' | 'LEBIH' = 'BELUM'
  if (newTotalTerbayarSekarang === Number(tagihanSekarang.nominal_tagihan)) {
    newStatusSekarang = 'LUNAS'
  } else if (newTotalTerbayarSekarang > Number(tagihanSekarang.nominal_tagihan)) {
    newStatusSekarang = 'LEBIH'
  } else if (newTotalTerbayarSekarang > 0) {
    newStatusSekarang = 'CICIL'
  }

  const { error: updateSekarangErr } = await admin
    .from('jimpitan_tagihan')
    .update({
      total_terbayar: newTotalTerbayarSekarang,
      status: newStatusSekarang,
      kelebihan: 0,
      kelebihan_tujuan: null,
      kelebihan_catatan: `Dipindahkan ke bulan ${periodeBulanDepan}`,
      updated_at: new Date().toISOString()
    })
    .eq('id', tagihanId)

  if (updateSekarangErr) return { error: updateSekarangErr.message }

  revalidatePath('/dashboard/iuran')
  return { success: true }
}