'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

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
      // FIX: pengurus yang buat sesi manual → langsung APPROVED (skip alur ACC)
      // biar total_pendapatan langsung terhitung di dashboard
      status: 'APPROVED',
      approved_by: profile.id,
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

  // WARGA wajib window check. PENGURUS bebas (untuk uji coba).
  if (!isPengurus(profile)) {
    const admin = createAdminClient()
    const { data: isOpen } = await admin.rpc('is_jimpitan_window_open')
    if (!isOpen) {
      return { error: 'Window jimpitan tertutup. Hanya pengurus yang bisa membuat sesi di luar window.' }
    }
  }

  const admin = createAdminClient()

  // Cek apakah sudah ada sesi untuk tanggal ini
  const { data: existing } = await admin
    .from('jimpitan_sesi')
    .select('id, input_by, status')
    .eq('tanggal', tanggal)
    .in('status', ['AKTIF', 'SUBMITTED'])
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
      // FIX: pengurus yang input manual → langsung APPROVED biar langsung
      // masuk dashboard "Iuran Bulan Ini" tanpa alur ACC terpisah.
      // Warga biasa tetap AKTIF dan perlu submit + ACC oleh bendahara.
      ...(isPengurus(profile)
        ? {
            status: 'APPROVED',
            approved_by: profile.id,
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
// BULK: tandai semua warga BELUM BAYAR
// =====================================================
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

  // 1. Save details first to ensure they are in DB before status change
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
          return {
            sesi_id: sesiId,
            profile_id: p.id,
            login_id: p.login_id,
            nama_kk_snapshot: p.nama_kk,
            blok_snapshot: p.blok,
            nomor_rumah_snapshot: p.nomor_rumah,
            nominal: d?.nominal ?? 0,
            is_bayar: d?.is_bayar ?? false,
            status_bayar: d?.is_bayar ? 'BAYAR' : 'BELUM',
          }
        })

        const { error: upsertError } = await admin
          .from('jimpitan_detail')
          .upsert(rows, { onConflict: 'sesi_id,profile_id' })

        if (upsertError) throw upsertError
      }
    } catch (e: any) {
      return { error: `Gagal menyimpan detail jimpitan: ${e.message}` }
    }
  }
}

// =====================================================
// BENDAHARA: ACC SESI
// =====================================================
export async function accSesi(sesiId: string) {
  const profile = await getCurrentUser()
  if (!profile) return { error: 'Tidak terautentikasi' }
  if (!['BENDAHARA', 'KETUA_RT', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya bendahara/ketua yang boleh ACC' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('jimpitan_sesi')
    .update({
      status: 'APPROVED',
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sesiId)
    .eq('status', 'SUBMITTED')

  if (error) return { error: error.message }

  revalidatePath('/dashboard/kas')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/iuran')
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
// PENGURUS: KELOLA JADWAL RONDA
// =====================================================
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