'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type WargaFormState = {
  error?: string
  success?: string
}

const BLOK_VALID = ['A', 'B', 'C', 'D']

// =========================================================
// Tambah warga baru (oleh pengurus)
// =========================================================
export async function tambahWarga(
  _prev: WargaFormState,
  formData: FormData
): Promise<WargaFormState> {
  const blok = String(formData.get('blok') ?? '').trim().toUpperCase()
  const nomorRumah = String(formData.get('nomorRumah') ?? '').trim()
  const namaKK = String(formData.get('namaKK') ?? '').trim()
  const noHp = String(formData.get('noHp') ?? '').trim()
  const kategoriTarif = String(formData.get('kategoriTarif') ?? 'NORMAL')
  const pinAwal = String(formData.get('pinAwal') ?? '').trim()

  // Validasi
  if (!BLOK_VALID.includes(blok)) {
    return { error: 'Blok harus A, B, C, atau D' }
  }
  if (!/^\d{1,3}$/.test(nomorRumah)) {
    return { error: 'Nomor rumah harus angka (max 3 digit)' }
  }
  if (!namaKK) {
    return { error: 'Nama Kepala Keluarga wajib diisi' }
  }
  if (!/^\d{6}$/.test(pinAwal)) {
    return { error: 'PIN awal harus 6 digit angka' }
  }
  if (!['NORMAL', 'KHUSUS'].includes(kategoriTarif)) {
    return { error: 'Kategori tarif tidak valid' }
  }

  const loginId = `${blok}-${nomorRumah}`
  const noHpNorm = noHp ? noHp.replace(/\D/g, '').replace(/^0/, '62') : null

  const admin = createAdminClient()

  // Cek duplikat
  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('login_id', loginId)
    .maybeSingle()

  if (existing) {
    return { error: `Login ID ${loginId} sudah dipakai warga lain` }
  }

  // Insert
  const { error: insErr } = await admin
    .from('profiles')
    .insert({
      id: crypto.randomUUID(),
      login_id: loginId,
      nama_kk: namaKK,
      blok,
      nomor_rumah: nomorRumah,
      no_hp: noHpNorm,
      kategori_tarif: kategoriTarif,
      role: 'WARGA',
      is_active: true,
    })

  if (insErr) {
    return { error: 'Gagal menambah warga: ' + insErr.message }
  }

  // Set PIN awal
  const { error: pinErr } = await admin.rpc('set_warga_pin', {
    p_login_id: loginId,
    p_pin: pinAwal,
  })

  if (pinErr) {
    // Rollback insert kalau PIN gagal
    await admin.from('profiles').delete().eq('login_id', loginId)
    return { error: 'Gagal set PIN: ' + pinErr.message }
  }

  revalidatePath('/dashboard/warga')
  return { success: `Warga ${namaKK} (${loginId}) berhasil ditambahkan` }
}

// =========================================================
// Edit data warga (tanpa ubah PIN)
// =========================================================
export async function editWarga(
  _prev: WargaFormState,
  formData: FormData
): Promise<WargaFormState> {
  const id = String(formData.get('id') ?? '')
  const namaKK = String(formData.get('namaKK') ?? '').trim()
  const noHp = String(formData.get('noHp') ?? '').trim()
  const kategoriTarif = String(formData.get('kategoriTarif') ?? 'NORMAL')
  const isActive = formData.get('isActive') === 'on'

  if (!id) return { error: 'ID warga tidak valid' }
  if (!namaKK) return { error: 'Nama Kepala Keluarga wajib diisi' }
  if (!['NORMAL', 'KHUSUS'].includes(kategoriTarif)) {
    return { error: 'Kategori tarif tidak valid' }
  }

  const noHpNorm = noHp ? noHp.replace(/\D/g, '').replace(/^0/, '62') : null

  const admin = createAdminClient()

  // Ambil kategori_tarif lama SEBELUM update, untuk propagate perubahan
  const { data: oldProfile } = await admin
    .from('profiles')
    .select('kategori_tarif')
    .eq('id', id)
    .single()

  const oldKategori = oldProfile?.kategori_tarif ?? 'NORMAL'

  const { error } = await admin
    .from('profiles')
    .update({
      nama_kk: namaKK,
      no_hp: noHpNorm,
      kategori_tarif: kategoriTarif,
      is_active: isActive,
    })
    .eq('id', id)

  if (error) {
    return { error: 'Gagal update: ' + error.message }
  }

  // SELALU cek tagihan & sinkronkan (idempotent), bukan cuma saat ganti kategori.
  // Ini untuk handle kasus: warga ditandai KHUSUS tapi tagihan lama masih nominal Normal,
  // sehingga saat ini user re-save, tagihan ikut ter-update.
  const propagated = await propagateKategoriTarifToTagihan(admin, id, kategoriTarif)

  revalidatePath('/dashboard/warga')
  revalidatePath('/dashboard/dana-khusus')
  revalidatePath('/warga/dana-khusus')

  if (propagated > 0) {
    return {
      success: `Data warga diperbarui. ${propagated} tagihan dana khusus disesuaikan ke tarif ${kategoriTarif === 'KHUSUS' ? 'Khusus' : 'Normal'}.`,
    }
  }
  return { success: 'Data warga berhasil diperbarui' }
}

/**
 * Update nominal_tagihan untuk profile tertentu di semua dana_khusus aktif
 * yang belum dibayar (total_terbayar = 0).
 *
 * KHUSUS → pakai target_per_kk_khusus (fallback ke target_per_kk kalau NULL/sama)
 * NORMAL → pakai target_per_kk
 *
 * Tagihan yang sudah bayar sebagian/lunas/lebih TIDAK diubah.
 */
async function propagateKategoriTarifToTagihan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  profileId: string,
  newKategori: 'NORMAL' | 'KHUSUS'
): Promise<number> {
  // Ambil semua dana_khusus aktif + target amounts
  const { data: danaList } = await admin
    .from('dana_khusus')
    .select('id, target_per_kk, target_per_kk_khusus')
    .eq('is_active', true)

  if (!danaList || danaList.length === 0) return 0

  // Ambil tagihan profile ini yang belum dibayar
  const danaIds = danaList.map((d: { id: string }) => d.id)
  const { data: tagihanRows } = await admin
    .from('dana_khusus_tagihan')
    .select('id, dana_khusus_id, nominal_tagihan')
    .eq('profile_id', profileId)
    .in('dana_khusus_id', danaIds)
    .eq('total_terbayar', 0)

  if (!tagihanRows || tagihanRows.length === 0) return 0

  // Hitung nominal baru per tagihan, update satu-satu (idempotent)
  let count = 0
  for (const t of tagihanRows) {
    const dk = danaList.find((d: { id: string }) => d.id === t.dana_khusus_id)
    if (!dk) continue

    const newNominal = newKategori === 'KHUSUS'
      ? (dk.target_per_kk_khusus ?? dk.target_per_kk)
      : dk.target_per_kk

    // Skip kalau sudah sama (idempotent)
    if (Number(t.nominal_tagihan) === Number(newNominal)) continue

    const { error } = await admin
      .from('dana_khusus_tagihan')
      .update({ nominal_tagihan: newNominal, updated_at: new Date().toISOString() })
      .eq('id', t.id)

    if (!error) count++
  }
  return count
}

// =========================================================
// Reset PIN warga
// =========================================================
export async function resetPinWarga(
  _prev: WargaFormState,
  formData: FormData
): Promise<WargaFormState> {
  const id = String(formData.get('id') ?? '')
  const pinBaru = String(formData.get('pinBaru') ?? '').trim()
  const pinConfirm = String(formData.get('pinConfirm') ?? '').trim()

  if (!id) return { error: 'ID warga tidak valid' }
  if (!/^\d{6}$/.test(pinBaru)) {
    return { error: 'PIN baru harus 6 digit angka' }
  }
  if (pinBaru !== pinConfirm) {
    return { error: 'Konfirmasi PIN belum sama' }
  }

  const admin = createAdminClient()

  // Ambil login_id dulu
  const { data: profile, error: getErr } = await admin
    .from('profiles')
    .select('login_id')
    .eq('id', id)
    .single()

  if (getErr || !profile) {
    return { error: 'Warga tidak ditemukan' }
  }

  // Set PIN
  const { error: pinErr } = await admin.rpc('set_warga_pin', {
    p_login_id: profile.login_id,
    p_pin: pinBaru,
  })

  if (pinErr) {
    return { error: 'Gagal reset PIN: ' + pinErr.message }
  }

  revalidatePath('/dashboard/warga')
  return { success: `PIN ${profile.login_id} berhasil direset` }
}

// =========================================================
// Hapus warga (soft delete: set is_active=false)
// =========================================================
export async function nonaktifkanWarga(formData: FormData): Promise<WargaFormState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'ID tidak valid' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return { error: 'Gagal menonaktifkan: ' + error.message }

  revalidatePath('/dashboard/warga')
  return { success: 'Warga dinonaktifkan' }
}

// =========================================================
// Aktifkan kembali
// =========================================================
export async function aktifkanWarga(formData: FormData): Promise<WargaFormState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'ID tidak valid' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ is_active: true })
    .eq('id', id)

  if (error) return { error: 'Gagal mengaktifkan: ' + error.message }

  revalidatePath('/dashboard/warga')
  return { success: 'Warga diaktifkan kembali' }
}

// =========================================================
// Tambah anggota KK
// =========================================================
export async function tambahAnggotaKK(
  _prev: WargaFormState,
  formData: FormData
): Promise<WargaFormState> {
  const profileId = String(formData.get('profileId') ?? '')
  const nama = String(formData.get('nama') ?? '').trim()
  const nik = String(formData.get('nik') ?? '').trim()
  const hubungan = String(formData.get('hubungan') ?? '').trim()
  const tanggalLahir = String(formData.get('tanggalLahir') ?? '').trim()
  const jenisKelamin = String(formData.get('jenisKelamin') ?? '').trim()
  const pekerjaan = String(formData.get('pekerjaan') ?? '').trim()

  if (!profileId) return { error: 'Profile ID tidak valid' }
  if (!nama) return { error: 'Nama wajib diisi' }
  if (!hubungan) return { error: 'Hubungan keluarga wajib diisi' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('kk_anggota')
    .insert({
      profile_id: profileId,
      nama,
      nik: nik || null,
      hubungan,
      tanggal_lahir: tanggalLahir || null,
      jenis_kelamin: (jenisKelamin === 'L' || jenisKelamin === 'P') ? jenisKelamin : null,
      pekerjaan: pekerjaan || null,
      is_active: true,
    })

  if (error) {
    return { error: 'Gagal menambah anggota: ' + error.message }
  }

  revalidatePath('/dashboard/warga')
  return { success: `Anggota ${nama} ditambahkan` }
}

// =========================================================
// Hapus anggota KK
// =========================================================
export async function hapusAnggotaKK(formData: FormData): Promise<WargaFormState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'ID tidak valid' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('kk_anggota')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return { error: 'Gagal menghapus: ' + error.message }

  revalidatePath('/dashboard/warga')
  return { success: 'Anggota KK dihapus' }
}
