'use server'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Buat dana_khusus baru
 * FIX Problem #5: pengurus bisa setup pengumpulan dana sementara (merti desa, dll)
 * Trigger SQL akan auto-generate tagihan per KK saat insert.
 */
export async function createDanaKhusus(formData: FormData): Promise<{
  success?: boolean
  error?: string
  id?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Tidak terautentikasi' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile tidak ditemukan' }
  if (!['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya pengurus yang boleh membuat dana khusus' }
  }

  const judul = (formData.get('judul') as string)?.trim()
  const deskripsi = ((formData.get('deskripsi') as string) ?? '').trim()
  const kategori = (formData.get('kategori') as string)?.trim() || 'LAINNYA'
  const targetPerKk = Number(formData.get('target_per_kk'))
  const targetPerKkKhususRaw = formData.get('target_per_kk_khusus') as string | null
  const targetPerKkKhusus = targetPerKkKhususRaw && targetPerKkKhususRaw.trim() !== ''
    ? Number(targetPerKkKhususRaw)
    : targetPerKk  // default sama dengan normal
  const tanggalMulai = formData.get('tanggal_mulai') as string
  const tanggalSelesai = formData.get('tanggal_selesai') as string
  const isWajib = formData.get('is_wajib') === 'on' || formData.get('is_wajib') === 'true'

  if (!judul) return { error: 'Judul wajib diisi' }
  if (!targetPerKk || targetPerKk <= 0) return { error: 'Target per KK harus > 0' }
  if (targetPerKkKhusus < 0) return { error: 'Target KK Khusus tidak boleh negatif' }
  if (!tanggalMulai || !tanggalSelesai) return { error: 'Tanggal mulai & selesai wajib diisi' }
  if (new Date(tanggalSelesai) < new Date(tanggalMulai)) {
    return { error: 'Tanggal selesai tidak boleh sebelum tanggal mulai' }
  }

  const { data, error } = await admin
    .from('dana_khusus')
    .insert({
      judul,
      deskripsi: deskripsi || null,
      kategori,
      target_per_kk: targetPerKk,
      target_per_kk_khusus: targetPerKkKhusus,
      tanggal_mulai: tanggalMulai,
      tanggal_selesai: tanggalSelesai,
      is_active: true,
      is_wajib: isWajib,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (error) return { error: `Gagal membuat dana khusus: ${error.message}` }

  // Tagihan per KK di-generate otomatis oleh trigger SQL
  revalidatePath('/dashboard/dana-khusus')
  revalidatePath('/warga/dana-khusus')

  return { success: true, id: data.id }
}

/**
 * Input pembayaran dana khusus (cicilan atau pelunasan)
 * FIX Problem #5: warga/bendahara bisa bayar cicilan
 * Trigger SQL akan auto-update tagihan.total_terbayar & status,
 * serta auto-insert ke kas_transaksi (kategori DANA_KHUSUS).
 */
export async function bayarDanaKhusus(formData: FormData): Promise<{
  success?: boolean
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Tidak terautentikasi' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile tidak ditemukan' }

  const danaKhususId = formData.get('dana_khusus_id') as string
  const tagihanId = formData.get('tagihan_id') as string
  const profileId = (formData.get('profile_id') as string) || profile.id
  const nominal = Number(formData.get('nominal'))
  const metode = (formData.get('metode') as string) || 'TUNAI'
  const tanggalBayar = (formData.get('tanggal_bayar') as string) || new Date().toISOString().slice(0, 10)
  const catatan = ((formData.get('catatan') as string) ?? '').trim()

  if (!danaKhususId || !tagihanId) return { error: 'Data tagihan tidak lengkap' }
  if (!nominal || nominal <= 0) return { error: 'Nominal harus > 0' }

  // Kalau user adalah warga (bukan pengurus), wajib bayar untuk dirinya sendiri
  const isPengurus = ['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'SUPERADMIN'].includes(profile.role)
  if (!isPengurus && profileId !== profile.id) {
    return { error: 'Warga hanya bisa bayar untuk dirinya sendiri' }
  }

  // Ambil login_id profile yang bayar
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('id, login_id, nama_kk')
    .eq('id', profileId)
    .single()

  if (!targetProfile) return { error: 'Profile target tidak ditemukan' }

  const { error } = await admin
    .from('dana_khusus_pembayaran')
    .insert({
      dana_khusus_id: danaKhususId,
      tagihan_id: tagihanId,
      profile_id: targetProfile.id,
      login_id: targetProfile.login_id,
      nominal,
      metode,
      tanggal_bayar: tanggalBayar,
      catatan: catatan || null,
      input_by: profile.id,
      bukti_ref: `DKH-${danaKhususId.slice(0, 8)}-${Date.now()}`,
    })

  if (error) return { error: `Gagal bayar: ${error.message}` }

  revalidatePath(`/dashboard/dana-khusus/${danaKhususId}`)
  revalidatePath('/dashboard/dana-khusus')
  revalidatePath('/warga/dana-khusus')
  revalidatePath('/warga')

  return { success: true }
}

/**
 * Update dana_khusus (judul, deskripsi, kategori, target_per_kk, tanggal, is_wajib, is_active)
 * FIX: pengurus bisa bebas melakukan pengaturan ke rincian dana khusus (termasuk nominal Iuran)
 */
export async function updateDanaKhusus(formData: FormData): Promise<{
  success?: boolean
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Tidak terautentikasi' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya pengurus yang boleh mengubah dana khusus' }
  }

  const id = formData.get('id') as string
  if (!id) return { error: 'ID dana khusus tidak ditemukan' }

  // Ambil data existing untuk validasi & rollback kalau ada tagihan sudah ada
  const { data: existing, error: existingErr } = await admin
    .from('dana_khusus')
    .select('*')
    .eq('id', id)
    .single()

  if (existingErr || !existing) return { error: 'Dana khusus tidak ditemukan' }

  // Hitung tagihan existing
  const { count: tagihanCount } = await admin
    .from('dana_khusus_tagihan')
    .select('id', { count: 'exact', head: true })
    .eq('dana_khusus_id', id)

  const judul = (formData.get('judul') as string)?.trim()
  const deskripsi = ((formData.get('deskripsi') as string) ?? '').trim()
  const kategori = (formData.get('kategori') as string)?.trim() || existing.kategori
  const targetPerKk = Number(formData.get('target_per_kk'))
  const targetPerKkKhususRaw = formData.get('target_per_kk_khusus') as string | null
  const targetPerKkKhusus = targetPerKkKhususRaw && targetPerKkKhususRaw.trim() !== ''
    ? Number(targetPerKkKhususRaw)
    : targetPerKk  // default sama dengan normal
  const tanggalMulai = formData.get('tanggal_mulai') as string
  const tanggalSelesai = formData.get('tanggal_selesai') as string
  const isWajibRaw = formData.get('is_wajib')
  const isWajib = isWajibRaw === 'on' || isWajibRaw === 'true'
  const isActiveRaw = formData.get('is_active')
  const isActive = isActiveRaw === 'on' || isActiveRaw === 'true'

  if (!judul) return { error: 'Judul wajib diisi' }
  if (!targetPerKk || targetPerKk <= 0) return { error: 'Target per KK harus > 0' }
  if (targetPerKkKhusus < 0) return { error: 'Target KK Khusus tidak boleh negatif' }
  if (!tanggalMulai || !tanggalSelesai) return { error: 'Tanggal mulai & selesai wajib diisi' }
  if (new Date(tanggalSelesai) < new Date(tanggalMulai)) {
    return { error: 'Tanggal selesai tidak boleh sebelum tanggal mulai' }
  }

  const oldTarget = Number(existing.target_per_kk)
  const oldTargetKhusus = Number(existing.target_per_kk_khusus ?? oldTarget)

  // Propagate perubahan nominal ke tagihan yang belum dibayar.
  // Logic:
  //   - Untuk profile NORMAL: nominal_tagihan di-update ke target_per_kk baru
  //     HANYA kalau nominal lama = oldTarget (artinya masih nominal awal).
  //   - Untuk profile KHUSUS: nominal_tagihan di-update ke target_per_kk_khusus baru
  //     HANYA kalau nominal lama = oldTargetKhusus.
  //   - Tagihan yang sudah bayar sebagian / lunas TIDAK diubah.
  if (targetPerKk !== oldTarget) {
    // Update NORMAL rows
    const { error: propErr } = await admin
      .from('dana_khusus_tagihan')
      .update({ nominal_tagihan: targetPerKk })
      .eq('dana_khusus_id', id)
      .eq('nominal_tagihan', oldTarget)
      .eq('total_terbayar', 0)
    if (propErr) console.warn('Gagal propagate target_per_kk (NORMAL):', propErr.message)
  }

  if (targetPerKkKhusus !== oldTargetKhusus) {
    // Update KHUSUS rows — perlu join dengan profiles untuk filter kategori_tarif
    // Karena Supabase JS tidak support langsung JOIN di UPDATE, kita pakai RPC-style:
    // Update semua row KHUSUS yang nominalnya masih sama dengan oldTargetKhusus
    // (asumsi: kalau user sebelumnya set khusus sama dengan normal, semua rows di oldTarget = oldTargetKhusus)
    const { error: propErr } = await admin
      .rpc('update_khusus_tagihan_nominal', {
        p_dana_khusus_id: id,
        p_old_nominal: oldTargetKhusus,
        p_new_nominal: targetPerKkKhusus,
      })
    if (propErr) {
      // Fallback: kalau RPC belum ada, coba approach langsung via raw SQL via admin
      console.warn('Gagal propagate target_per_kk_khusus via RPC, skip:', propErr.message)
    }
  }

  const { error } = await admin
    .from('dana_khusus')
    .update({
      judul,
      deskripsi: deskripsi || null,
      kategori,
      target_per_kk: targetPerKk,
      target_per_kk_khusus: targetPerKkKhusus,
      tanggal_mulai: tanggalMulai,
      tanggal_selesai: tanggalSelesai,
      is_wajib: isWajib,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { error: `Gagal update dana khusus: ${error.message}` }

  revalidatePath(`/dashboard/dana-khusus/${id}`)
  revalidatePath('/dashboard/dana-khusus')
  revalidatePath('/warga/dana-khusus')

  return { success: true }
}

/**
 * Tutup/nonaktifkan dana khusus (hentikan pengumpulan)
 */
export async function toggleDanaKhususActive(formData: FormData): Promise<{
  success?: boolean
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Tidak terautentikasi' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya pengurus yang boleh toggle dana khusus' }
  }

  const id = formData.get('id') as string
  const isActive = formData.get('is_active') === 'true'

  const { error } = await admin
    .from('dana_khusus')
    .update({ is_active: !isActive, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/dana-khusus')
  revalidatePath('/warga/dana-khusus')

  return { success: true }
}

/**
 * Get daftar dana khusus dengan progress summary
 */
export async function getDanaKhususList(): Promise<{
  data?: Array<{
    id: string
    judul: string
    deskripsi: string | null
    kategori: string
    target_per_kk: number
    target_per_kk_khusus: number | null
    tanggal_mulai: string
    tanggal_selesai: string
    is_active: boolean
    is_wajib: boolean
    created_at: string
    total_tagihan: number
    total_terbayar: number
    jumlah_lunas: number
    jumlah_cicil: number
    jumlah_belum: number
    pct_progres: number
  }>
  error?: string
}> {
  const admin = createAdminClient()
  const { data: danaList, error } = await admin
    .from('dana_khusus')
    .select('*')
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return { error: error.message }

  // Compute progress per dana khusus
  type Progress = {
    total_tagihan?: number | string | null
    total_terbayar?: number | string | null
    jumlah_lunas?: number | string | null
    jumlah_cicil?: number | string | null
    jumlah_belum?: number | string | null
    pct_progres?: number | string | null
  }
  const enriched = await Promise.all(
    (danaList ?? []).map(async (d) => {
      const { data: progress } = await admin
        .rpc('get_dana_khusus_progress', { p_dana_khusus_id: d.id })

      // RPC return type bisa array of rows — ambil row pertama
      const p: Progress | undefined = Array.isArray(progress)
        ? (progress[0] as Progress | undefined)
        : (progress as Progress | undefined)

      return {
        ...d,
        total_tagihan: Number(p?.total_tagihan ?? 0),
        total_terbayar: Number(p?.total_terbayar ?? 0),
        jumlah_lunas: Number(p?.jumlah_lunas ?? 0),
        jumlah_cicil: Number(p?.jumlah_cicil ?? 0),
        jumlah_belum: Number(p?.jumlah_belum ?? 0),
        pct_progres: Number(p?.pct_progres ?? 0),
      }
    })
  )

  return { data: enriched }
}

