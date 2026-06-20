export type UserRole = 'WARGA' | 'PENGURUS' | 'KETUA_RT' | 'BENDAHARA' | 'SEKRETARIS' | 'SUPERADMIN'

export type KategoriTarif = 'NORMAL' | 'JANDA'

export type KycStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED'

export type KycStatusKeluarga =
  | 'KEPALA_KELUARGA'
  | 'ISTRI'
  | 'ANAK'
  | 'FAMILI_LAIN'
  | 'LAINNYA'

export interface Profile {
  id: string
  login_id: string
  blok: string
  nomor_rumah: string
  nama_kk: string
  nik: string | null
  no_hp: string | null
  pin_hash: string | null
  role: UserRole
  kategori_tarif: KategoriTarif
  is_active: boolean
  avatar_url: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // KYC (verifikasi warga via WhatsApp)
  kyc_status: KycStatus
  kyc_nama_ktp: string | null
  kyc_status_keluarga: KycStatusKeluarga | null
  kyc_no_wa: string | null
  kyc_nama_istri: string | null
  kyc_nama_anak: string[]
  kyc_catatan: string | null
  kyc_submitted_at: string | null
  kyc_verified_at: string | null
  kyc_verified_by: string | null
  kyc_rejected_reason: string | null
}

export interface KycAuditLog {
  id: string
  user_id: string
  action: 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'RE_SUBMITTED' | 'RESET'
  actor_id: string
  notes: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface KKAnggota {
  id: string
  profile_id: string
  nama: string
  nik: string | null
  hubungan: string
  tanggal_lahir: string | null
  jenis_kelamin: 'L' | 'P' | null
  pekerjaan: string | null
  is_active: boolean
  created_at: string
}

export interface IuranTagihan {
  id: string
  profile_id: string
  login_id: string
  periode_bulan: string  // 'YYYY-MM-DD'
  nominal: number
  total_terbayar: number
  sisa: number
  status: 'BELUM_BAYAR' | 'CICIL' | 'LUNAS'
  jatuh_tempo: string | null
  created_at: string
  updated_at: string
  // joined
  profile?: Profile
}

export interface IuranPembayaran {
  id: string
  tagihan_id: string
  profile_id: string
  login_id: string
  periode_bulan: string
  nominal: number
  metode: 'CASH' | 'TRANSFER' | 'QRIS'
  tanggal_bayar: string
  bukti_url: string | null
  catatan: string | null
  input_by: string | null
  created_at: string
}

export interface InfoPengumuman {
  id: string
  judul: string
  konten: string
  gambar_url: string | null
  priority: 'DARURAT' | 'PENTING' | 'NORMAL'
  is_published: boolean
  published_at: string | null
  publish_by: string | null
  target: string
  created_at: string
  updated_at: string
}

export const PENGURUS_ROLES: UserRole[] = [
  'PENGURUS',
  'KETUA_RT',
  'BENDAHARA',
  'SEKRETARIS',
  'SUPERADMIN',
]

export function isPengurus(role?: UserRole | null): boolean {
  return role ? PENGURUS_ROLES.includes(role) : false
}

/**
 * User yang WAJIB submit KYC (role WARGA yang belum VERIFIED)
 * Pengurus & Superadmin tidak perlu KYC.
 */
export function needsKyc(
  role: UserRole,
  kycStatus: KycStatus
): boolean {
  if (role !== 'WARGA') return false
  return kycStatus !== 'VERIFIED'
}

export const KYC_STATUS_LABEL: Record<KycStatus, string> = {
  UNVERIFIED: 'Belum Submit',
  PENDING: 'Menunggu Verifikasi',
  VERIFIED: 'Terverifikasi',
  REJECTED: 'Ditolak',
}

export const KYC_STATUS_COLOR: Record<KycStatus, string> = {
  UNVERIFIED: 'bg-slate-100 text-slate-600 border-slate-200',
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  VERIFIED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
}

export const KYC_KELUARGA_LABEL: Record<KycStatusKeluarga, string> = {
  KEPALA_KELUARGA: 'Kepala Keluarga',
  ISTRI: 'Istri',
  ANAK: 'Anak',
  FAMILI_LAIN: 'Famili Lain',
  LAINNYA: 'Lainnya',
}