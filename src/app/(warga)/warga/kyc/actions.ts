'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import type { KycStatusKeluarga } from '@/lib/types'

export type KycSubmitState = {
  error?: string
  success?: string
}

const STATUS_KELUARGA_VALID: KycStatusKeluarga[] = [
  'KEPALA_KELUARGA',
  'ISTRI',
  'ANAK',
  'FAMILI_LAIN',
  'LAINNYA',
]

// Normalisasi No WA ke format E.164 (62xxx)
function normalizeWa(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 15) return null
  // 08xx → 628xx, +62xx → 62xx, 62xx → 62xx
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('8') && digits.length >= 10) return `62${digits}`
  return digits
}

// =========================================================
// Submit KYC oleh warga
// Hanya WARGA yang boleh submit. Status PENDING → tunggu ACC admin.
// =========================================================
export async function submitKyc(
  _prev: KycSubmitState,
  formData: FormData
): Promise<KycSubmitState> {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('warga_session')?.value
  if (!sessionToken) return { error: 'Sesi habis, silakan login ulang' }

  const admin = createAdminClient()
  const { data: profileId } = await admin.rpc('get_warga_from_session', {
    p_token: sessionToken,
  })
  if (!profileId) return { error: 'Sesi tidak valid' }

  // Validasi role
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('id, role, is_active, kyc_status, login_id, nama_kk')
    .eq('id', profileId)
    .single()
  if (profErr || !profile) return { error: 'Profile tidak ditemukan' }
  if (profile.role !== 'WARGA') {
    return { error: 'Fitur ini hanya untuk warga' }
  }
  if (!profile.is_active) {
    return { error: 'Akun nonaktif, hubungi pengurus' }
  }
  if (profile.kyc_status === 'VERIFIED') {
    return { error: 'Akun Anda sudah terverifikasi' }
  }

  // Ambil & validasi input
  const namaKtp = String(formData.get('namaKtp') ?? '').trim()
  const statusKeluarga = String(formData.get('statusKeluarga') ?? '').trim() as KycStatusKeluarga
  const noWaInput = String(formData.get('noWa') ?? '').trim()
  const namaIstri = String(formData.get('namaIstri') ?? '').trim() || null
  const anak1 = String(formData.get('anak1') ?? '').trim()
  const anak2 = String(formData.get('anak2') ?? '').trim()
  const anak3 = String(formData.get('anak3') ?? '').trim()
  const catatan = String(formData.get('catatan') ?? '').trim() || null

  if (!namaKtp || namaKtp.length < 3) {
    return { error: 'Nama KTP minimal 3 karakter' }
  }
  if (!STATUS_KELUARGA_VALID.includes(statusKeluarga)) {
    return { error: 'Status keluarga tidak valid' }
  }
  const noWa = normalizeWa(noWaInput)
  if (!noWa) {
    return { error: 'No WhatsApp tidak valid (contoh: 081234567890)' }
  }

  // Kumpulkan nama anak (max 3, skip yang kosong)
  const namaAnak: string[] = []
  for (const nama of [anak1, anak2, anak3]) {
    if (nama && nama.length >= 2) namaAnak.push(nama)
  }
  if (namaAnak.length > 3) {
    return { error: 'Maksimal 3 nama anak' }
  }

  // Update profile
  const { error: updErr } = await admin
    .from('profiles')
    .update({
      kyc_status: 'PENDING',
      kyc_nama_ktp: namaKtp,
      kyc_status_keluarga: statusKeluarga,
      kyc_no_wa: noWa,
      kyc_nama_istri: namaIstri,
      kyc_nama_anak: namaAnak,
      kyc_catatan: catatan,
      kyc_rejected_reason: null,  // clear reason kalau re-submit
    })
    .eq('id', profileId)

  if (updErr) {
    return { error: 'Gagal menyimpan: ' + updErr.message }
  }

  // Audit log
  const { error: logErr } = await admin.from('kyc_audit_log').insert({
    user_id: profileId,
    action: profile.kyc_status === 'REJECTED' ? 'RE_SUBMITTED' : 'SUBMITTED',
    actor_id: profileId,  // self-actor
    notes: 'Warga submit pengajuan KYC',
    metadata: {
      has_istri: !!namaIstri,
      jumlah_anak: namaAnak.length,
    },
  })
  if (logErr) {
    // Non-fatal: log error tapi tetap lanjut
    console.error('[submitKyc] audit log error:', logErr)
  }

  revalidatePath('/warga/kyc')
  revalidatePath('/warga')
  revalidatePath('/dashboard/warga')

  return {
    success:
      'Pengajuan KYC berhasil dikirim! Silakan klik tombol WhatsApp di bawah untuk mengirim pesan ke admin dengan foto KTP & KK.',
  }
}
