import { createAdminClient } from '@/lib/supabase/server'
import { WargaClient } from './warga-client'
import type { Profile } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function DashboardWargaPage() {
  const admin = createAdminClient()
  
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, login_id, nama_kk, blok, nomor_rumah, no_hp, role, kategori_tarif, is_active, created_at, kyc_status, kyc_submitted_at, kyc_verified_at')
    .eq('role', 'WARGA')  // ambil hanya warga (exclude pengurus)
    .neq('blok', 'X')     // sembunyikan akun superadmin (blok X)
    .order('blok', { ascending: true })
    .order('nomor_rumah', { ascending: true, nullsFirst: false })
    .order('login_id', { ascending: true })

  // Ambil juga pengurus untuk ditampilkan di section terpisah
  const { data: pengurus } = await admin
    .from('profiles')
    .select('id, login_id, nama_kk, blok, nomor_rumah, no_hp, role, kategori_tarif, is_active, created_at')
    .in('role', ['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS'])
    .neq('blok', 'X')     // sembunyikan akun superadmin (blok X)
    .order('role')

  // Ambil stats KYC untuk badge
  const { data: kycStats } = await admin
    .from('v_kyc_stats')
    .select('*')
    .maybeSingle()

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-destructive/10 text-destructive rounded-xl p-4">
          Gagal memuat data warga: {error.message}
        </div>
      </div>
    )
  }

  return (
    <WargaClient
      warga={(profiles as Profile[]) ?? []}
      pengurus={(pengurus as Profile[]) ?? []}
      kycPendingCount={kycStats?.total_pending ?? 0}
    />
  )
}
