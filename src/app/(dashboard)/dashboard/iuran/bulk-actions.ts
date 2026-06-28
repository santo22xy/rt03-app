'use server'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * bulkInputIuranBendahara - FIX Problem #3
 *
 * Bendahara input iuran bulanan untuk banyak warga sekaligus (bulk).
 * Menggantikan input manual satu-satu di halaman /dashboard/iuran
 *
 * Alur:
 * 1. Validasi user role (BENDAHARA atau KETUA_RT)
 * 2. Validasi input: array of {profile_id, nominal}
 * 3. Untuk setiap entry:
 *    - INSERT ke iuran_pembayaran (dengan login_id, periode_bulan)
 *    - Trigger SQL akan auto-update jimpitan_tagihan.total_terbayar & status
 *    - INSERT ke kas_transaksi (kategori=IURAN_BULANAN, tipe=MASUK)
 * 4. Return summary
 */
export async function bulkInputIuranBendahara(formData: FormData): Promise<{
  success?: boolean
  error?: string
  count?: number
  total_nominal?: number
  inserted_payments?: number
  inserted_kas?: number
}> {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Tidak terautentikasi' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, nama_kk')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile tidak ditemukan' }
  if (!['BENDAHARA', 'KETUA_RT', 'SUPERADMIN'].includes(profile.role)) {
    return { error: 'Hanya Bendahara/Ketua RT yang boleh input iuran bulk' }
  }

  // Parse form data
  const periodeRaw = formData.get('periode') as string
  const entriesRaw = formData.get('entries') as string
  const tanggalRaw = (formData.get('tanggal_bayar') as string) ?? new Date().toISOString().slice(0, 10)
  const metodeRaw = (formData.get('metode_bayar') as string) ?? 'TUNAI'
  const catatanRaw = (formData.get('catatan') as string) ?? ''

  if (!periodeRaw) return { error: 'Periode wajib diisi' }
  if (!entriesRaw) return { error: 'Data entries kosong' }

  let entries: Array<{ profile_id: string; nominal: number }> = []
  try {
    entries = JSON.parse(entriesRaw)
  } catch {
    return { error: 'Format entries tidak valid' }
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return { error: 'Minimal 1 entry wajib diisi' }
  }

  // Filter: hanya entry dengan nominal > 0
  const validEntries = entries.filter(e => e.profile_id && Number(e.nominal) > 0)
  if (validEntries.length === 0) {
    return { error: 'Tidak ada entry dengan nominal > 0' }
  }

  // Convert periode ke format DATE (YYYY-MM-01)
  const periode = `${periodeRaw}-01`

  // Get profiles data untuk login_id & nama_kk
  const profileIds = validEntries.map(e => e.profile_id)
  const { data: profilesData, error: profileErr } = await admin
    .from('profiles')
    .select('id, login_id, nama_kk')
    .in('id', profileIds)

  if (profileErr) return { error: `Gagal ambil profiles: ${profileErr.message}` }
  const profileMap = new Map((profilesData ?? []).map(p => [p.id, p]))

  let insertedPayments = 0
  let insertedKas = 0
  let totalNominal = 0
  const errors: string[] = []

  // Generate prefix untuk bukti_ref
  const refPrefix = `BULK-${periodeRaw}-${Date.now()}`

  // Process setiap entry
  for (const entry of validEntries) {
    const p = profileMap.get(entry.profile_id)
    if (!p) {
      errors.push(`Profile ${entry.profile_id} tidak ditemukan`)
      continue
    }

    const nominal = Number(entry.nominal)
    totalNominal += nominal

    // Insert iuran_pembayaran — trigger akan auto-update jimpitan_tagihan
    const { error: payErr } = await admin
      .from('iuran_pembayaran')
      .insert({
        profile_id: p.id,
        login_id: p.login_id,
        periode_bulan: periode,
        nominal: nominal,
        tanggal_bayar: tanggalRaw,
        metode_bayar: metodeRaw,
        catatan: catatanRaw || `Bulk input iuran ${periodeRaw} oleh ${profile.nama_kk}`,
        confirmed: true,
        input_by: profile.id,
        bukti_ref: `${refPrefix}-${p.login_id}`,
      })
      .select('id')
      .single()

    if (payErr) {
      errors.push(`${p.login_id}: ${payErr.message}`)
      continue
    }
    insertedPayments++

    // Insert kas_transaksi (manual, supaya muncul di buku kas)
    const { error: kasErr } = await admin
      .from('kas_transaksi')
      .insert({
        trx_id_external: `${refPrefix}-KAS-${p.login_id}`,
        tanggal: tanggalRaw,
        tipe: 'MASUK',
        kategori: 'IURAN_BULANAN',
        uraian: `Iuran ${periodeRaw} - ${p.nama_kk}`,
        nominal: nominal,
        metode_bayar: metodeRaw,
        login_id: p.login_id,
        catatan: catatanRaw || `Bulk input iuran ${periodeRaw}`,
        created_by: profile.nama_kk,
      })

    if (kasErr) {
      // Non-fatal: pembayaran sudah masuk, kas gagal insert
      errors.push(`${p.login_id} (pembayaran OK, kas gagal): ${kasErr.message}`)
    } else {
      insertedKas++
    }
  }

  if (insertedPayments === 0) {
    return { error: `Gagal insert pembayaran: ${errors.slice(0, 3).join('; ')}` }
  }

  // Revalidate halaman terkait
  revalidatePath('/dashboard/iuran')
  revalidatePath('/dashboard/kas')
  revalidatePath('/dashboard')
  revalidatePath('/warga/iuran')
  revalidatePath('/warga')

  return {
    success: true,
    count: validEntries.length,
    total_nominal: totalNominal,
    inserted_payments: insertedPayments,
    inserted_kas: insertedKas,
    ...(errors.length > 0 ? { error: `Peringatan: ${errors.length} issue (lihat log)` } : {}),
  }
}

/**
 * Get list warga + tagihan untuk bulan tertentu (untuk form bulk input)
 */
export async function getWargaWithTagihan(periodeYYYYMM: string): Promise<{
  data?: Array<{
    profile_id: string
    login_id: string
    nama_kk: string
    blok: string
    nomor_rumah: string
    nominal_tagihan: number
    total_terbayar: number
    sisa: number
    status: 'BELUM' | 'CICIL' | 'LUNAS' | 'LEBIH'
    kategori_tarif: string
  }>
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Tidak terautentikasi' }

  const admin = createAdminClient()
  const periode = `${periodeYYYYMM}-01`

  // Ambil semua warga aktif + tagihan bulan ini (kalau ada)
  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('id, login_id, nama_kk, blok, nomor_rumah, kategori_tarif')
    .eq('role', 'WARGA')
    .eq('is_active', true)
    .neq('blok', 'X')
    .order('blok', { ascending: true })
    .order('nomor_rumah', { ascending: true })
    .order('login_id', { ascending: true })

  if (profErr) return { error: profErr.message }

  const { data: tagihanList } = await admin
    .from('jimpitan_tagihan')
    .select('profile_id, nominal_tagihan, total_terbayar, status')
    .eq('periode_bulan', periode)

  const tagihanMap = new Map((tagihanList ?? []).map(t => [t.profile_id, t]))

  // Get nominal default per kategori tarif
  const tarifDefault: Record<string, number> = {
    STANDAR: 3000,
    KURANG: 2000,
    ISTIMEWA: 5000,
  }

  return {
    data: (profiles ?? []).map(p => {
      const t = tagihanMap.get(p.id)
      const kategori = p.kategori_tarif ?? 'STANDAR'
      const nominalTagihan = t?.nominal_tagihan ?? tarifDefault[kategori] ?? 3000
      const totalTerbayar = t?.total_terbayar ?? 0
      const sisa = nominalTagihan - totalTerbayar
      let status: 'BELUM' | 'CICIL' | 'LUNAS' | 'LEBIH' = 'BELUM'
      if (totalTerbayar > nominalTagihan) status = 'LEBIH'
      else if (totalTerbayar === nominalTagihan && totalTerbayar > 0) status = 'LUNAS'
      else if (totalTerbayar > 0) status = 'CICIL'
      else status = 'BELUM'

      return {
        profile_id: p.id,
        login_id: p.login_id,
        nama_kk: p.nama_kk,
        blok: p.blok,
        nomor_rumah: p.nomor_rumah,
        nominal_tagihan: nominalTagihan,
        total_terbayar: totalTerbayar,
        sisa: sisa,
        status: status,
        kategori_tarif: kategori,
      }
    }),
  }
}
