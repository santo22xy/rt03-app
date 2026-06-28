import { createAdminClient } from '@/lib/supabase/server'
import { WargaClient } from './warga-client'
import type { Profile } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function DashboardWargaPage() {
  const admin = createAdminClient()

  // Ambil warga dengan role WARGA (exclude pengurus & superadmin)
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, login_id, nama_kk, blok, nomor_rumah, no_hp, role, kategori_tarif, is_active, created_at, kyc_status, kyc_submitted_at, kyc_verified_at')
    .eq('role', 'WARGA')
    .neq('blok', 'X')
    .order('blok', { ascending: true })
    .order('nomor_rumah', { ascending: true, nullsFirst: false })
    .order('login_id', { ascending: true })

  // Ambil SEMUA pengurus aktif (termasuk SUPERADMIN kecuali placeholder X-0)
  // FIX Problem #1: tampilkan Pak RT dengan role KETUA_RT secara eksplisit
  // Pakai view v_pengurus_aktif (kalau ada, dari SQL 79) — fallback ke query biasa
  let pengurus: Profile[] | null = null
  const { data: pengurusView } = await admin
    .from('v_pengurus_aktif')
    .select('id, login_id, nama_kk, blok, nomor_rumah, no_hp, role, kategori_tarif, is_active, created_at')
    .order('login_id', { ascending: true })

  if (pengurusView && pengurusView.length > 0) {
    pengurus = pengurusView as Profile[]
  } else {
    // Fallback: query langsung ke profiles untuk role pengurus (exclude superadmin placeholder)
    const { data: pengurusQuery } = await admin
      .from('profiles')
      .select('id, login_id, nama_kk, blok, nomor_rumah, no_hp, role, kategori_tarif, is_active, created_at')
      .in('role', ['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'])
      .neq('blok', 'X')
      .neq('login_id', 'X-0')
      .order('role')
    pengurus = (pengurusQuery as Profile[]) ?? []
  }

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
      pengurus={pengurus ?? []}
      kycPendingCount={kycStats?.total_pending ?? 0}
    />
  )
}
