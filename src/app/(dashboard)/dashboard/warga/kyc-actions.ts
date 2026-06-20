'use server'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type KycBulkActionState = {
  error?: string
  success?: string
  details?: {
    success_count: number
    failed_count: number
    failed: { user_id: string; reason: string }[]
  }
}

// =========================================================
// Verify KYC (bulk)
// Multi-select di superadmin User Management
// =========================================================
export async function verifyKycBulk(formData: FormData): Promise<KycBulkActionState> {
  const userIdsRaw = formData.get('userIds')
  if (!userIdsRaw) return { error: 'Tidak ada user yang dipilih' }

  const userIds: string[] = JSON.parse(String(userIdsRaw))
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return { error: 'Tidak ada user yang dipilih' }
  }
  if (userIds.length > 50) {
    return { error: 'Maksimal 50 user per aksi' }
  }

  // Ambil actor (admin yang login)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Tidak terautentikasi' }

  const admin = createAdminClient()
  const { data: actor } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!actor || !['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'].includes(actor.role)) {
    return { error: 'Tidak punya hak akses' }
  }

  // Panggil RPC function (atomic + audit log)
  const { data, error } = await admin.rpc('bulk_verify_kyc', {
    p_user_ids: userIds,
    p_actor_id: actor.id,
  })

  if (error) {
    return { error: 'Gagal verifikasi: ' + error.message }
  }

  // Hitung success/fail
  const results = (data ?? []) as { user_id: string; success: boolean; error_msg: string | null }[]
  const successCount = results.filter(r => r.success).length
  const failedItems = results
    .filter(r => !r.success)
    .map(r => ({ user_id: r.user_id, reason: r.error_msg ?? 'Unknown error' }))

  revalidatePath('/dashboard/warga/kyc')
  revalidatePath('/dashboard/warga')
  revalidatePath('/warga/kyc')
  revalidatePath('/warga')

  if (successCount === 0) {
    return {
      error: 'Tidak ada user yang berhasil diverifikasi',
      details: {
        success_count: 0,
        failed_count: failedItems.length,
        failed: failedItems,
      },
    }
  }

  return {
    success: `${successCount} warga berhasil diverifikasi${failedItems.length > 0 ? `, ${failedItems.length} gagal` : ''}`,
    details: {
      success_count: successCount,
      failed_count: failedItems.length,
      failed: failedItems,
    },
  }
}

// =========================================================
// Reject KYC (bulk)
// =========================================================
export async function rejectKycBulk(formData: FormData): Promise<KycBulkActionState> {
  const userIdsRaw = formData.get('userIds')
  if (!userIdsRaw) return { error: 'Tidak ada user yang dipilih' }

  const userIds: string[] = JSON.parse(String(userIdsRaw))
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return { error: 'Tidak ada user yang dipilih' }
  }

  const reason = String(formData.get('reason') ?? '').trim()
  if (!reason || reason.length < 5) {
    return { error: 'Alasan penolakan minimal 5 karakter' }
  }
  if (reason.length > 500) {
    return { error: 'Alasan penolakan maksimal 500 karakter' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Tidak terautentikasi' }

  const admin = createAdminClient()
  const { data: actor } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!actor || !['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'].includes(actor.role)) {
    return { error: 'Tidak punya hak akses' }
  }

  const { data, error } = await admin.rpc('bulk_reject_kyc', {
    p_user_ids: userIds,
    p_actor_id: actor.id,
    p_reason: reason,
  })

  if (error) {
    return { error: 'Gagal reject: ' + error.message }
  }

  const results = (data ?? []) as { user_id: string; success: boolean; error_msg: string | null }[]
  const successCount = results.filter(r => r.success).length

  revalidatePath('/dashboard/warga/kyc')
  revalidatePath('/dashboard/warga')
  revalidatePath('/warga/kyc')

  if (successCount === 0) {
    return { error: 'Tidak ada user yang berhasil di-reject' }
  }

  return {
    success: `${successCount} warga di-reject`,
    details: {
      success_count: successCount,
      failed_count: results.length - successCount,
      failed: results.filter(r => !r.success).map(r => ({ user_id: r.user_id, reason: r.error_msg ?? 'Unknown' })),
    },
  }
}

// =========================================================
// Reset KYC (untuk re-submit)
// =========================================================
export async function resetKyc(formData: FormData): Promise<KycBulkActionState> {
  const id = String(formData.get('userId') ?? '')
  if (!id) return { error: 'User ID tidak valid' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Tidak terautentikasi' }

  const admin = createAdminClient()
  const { data: actor } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!actor || !['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'].includes(actor.role)) {
    return { error: 'Tidak punya hak akses' }
  }

  const { error } = await admin
    .from('profiles')
    .update({
      kyc_status: 'UNVERIFIED',
      kyc_submitted_at: null,
      kyc_verified_at: null,
      kyc_verified_by: null,
      kyc_rejected_reason: null,
    })
    .eq('id', id)

  if (error) return { error: 'Gagal reset: ' + error.message }

  await admin.from('kyc_audit_log').insert({
    user_id: id,
    action: 'RESET',
    actor_id: actor.id,
    notes: 'Reset status KYC oleh admin',
  })

  revalidatePath('/dashboard/warga/kyc')
  return { success: 'Status KYC direset ke UNVERIFIED' }
}
