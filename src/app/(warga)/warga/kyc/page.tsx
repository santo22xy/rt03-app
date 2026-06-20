import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { KycForm, type KycFormData } from './kyc-form'
import { CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

const ADMIN_WA = '6285328815155'  // E.164 format

export default async function KycPage() {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('warga_session')?.value
  if (!sessionToken) redirect('/login')

  const admin = createAdminClient()
  const { data: profileId } = await admin.rpc('get_warga_from_session', {
    p_token: sessionToken,
  })
  if (!profileId) redirect('/login')

  const { data: profile } = await admin
    .from('profiles')
    .select(`
      id, login_id, nama_kk, blok, nomor_rumah, role, is_active,
      kyc_status, kyc_nama_ktp, kyc_status_keluarga, kyc_no_wa,
      kyc_nama_istri, kyc_nama_anak, kyc_catatan,
      kyc_submitted_at, kyc_verified_at, kyc_rejected_reason
    `)
    .eq('id', profileId)
    .single()

  if (!profile || !profile.is_active) {
    cookieStore.delete('warga_session')
    redirect('/login')
  }

  // Pengurus yang akses /warga/kyc → redirect ke /warga
  if (profile.role !== 'WARGA') {
    redirect('/warga')
  }

  // === TAMPILAN BERDASARKAN STATUS ===

  if (profile.kyc_status === 'VERIFIED') {
    return (
      <div className="max-w-md mx-auto pt-8">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-3xl p-8 shadow-xl shadow-emerald-500/20 text-center">
          <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Akun Terverifikasi ✓</h1>
          <p className="text-emerald-50 text-sm">
            Akun Anda sudah diverifikasi. Nikmati semua fitur aplikasi.
          </p>
          {profile.kyc_verified_at && (
            <p className="text-[10px] text-emerald-100 mt-3">
              Diverifikasi: {new Date(profile.kyc_verified_at).toLocaleString('id-ID', {
                day: 'numeric', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          )}
          <a
            href="/warga"
            className="inline-block mt-6 px-6 py-2.5 bg-white text-emerald-700 font-semibold rounded-xl hover:bg-emerald-50 transition-colors"
          >
            Buka Beranda →
          </a>
        </div>
      </div>
    )
  }

  if (profile.kyc_status === 'PENDING') {
    return (
      <div className="max-w-md mx-auto pt-8 space-y-4">
        <div className="bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-3xl p-8 shadow-xl shadow-amber-500/20 text-center">
          <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
            <Clock className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Menunggu Verifikasi</h1>
          <p className="text-amber-50 text-sm">
            Pengajuan KYC Anda sudah kami terima dan sedang diperiksa pengurus RT.
          </p>
          {profile.kyc_submitted_at && (
            <p className="text-[10px] text-amber-100 mt-3">
              Dikirim: {new Date(profile.kyc_submitted_at).toLocaleString('id-ID', {
                day: 'numeric', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          )}
        </div>

        {/* Detail pengajuan */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Detail Pengajuan
          </p>
          <DetailRow label="Nama KTP" value={profile.kyc_nama_ktp} />
          <DetailRow label="Status" value={profile.kyc_status_keluarga} />
          <DetailRow label="No WA" value={profile.kyc_no_wa} />
          {profile.kyc_nama_istri && (
            <DetailRow label="Istri" value={profile.kyc_nama_istri} />
          )}
          {Array.isArray(profile.kyc_nama_anak) && profile.kyc_nama_anak.length > 0 && (
            <DetailRow
              label="Anak"
              value={profile.kyc_nama_anak.join(', ')}
            />
          )}
          {profile.kyc_catatan && (
            <DetailRow label="Catatan" value={profile.kyc_catatan} />
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">
            <p className="font-semibold mb-1">Belum ada kabar?</p>
            <p>Pastikan Anda sudah mengirim foto KTP & KK via WhatsApp ke admin (0853-2881-5155). Biasanya verifikasi dilakukan 1-3 hari kerja.</p>
          </div>
        </div>
      </div>
    )
  }

  // Status: UNVERIFIED atau REJECTED → tampilkan form
  const initialData: KycFormData = {
    namaKtp: profile.kyc_nama_ktp ?? '',
    statusKeluarga: (profile.kyc_status_keluarga as KycFormData['statusKeluarga']) ?? null,
    noWa: profile.kyc_no_wa ?? '',
    namaIstri: profile.kyc_nama_istri ?? '',
    anak1: profile.kyc_nama_anak?.[0] ?? '',
    anak2: profile.kyc_nama_anak?.[1] ?? '',
    anak3: profile.kyc_nama_anak?.[2] ?? '',
    catatan: profile.kyc_catatan ?? '',
  }

  return (
    <div className="max-w-2xl mx-auto pt-4 pb-8">
      {/* Hero */}
      <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 text-white rounded-3xl p-6 shadow-xl shadow-emerald-500/20 mb-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">Verifikasi Akun</h1>
            <p className="text-emerald-50 text-xs mt-0.5">
              Lengkapi data KK & KTP untuk mengaktifkan semua fitur
            </p>
          </div>
        </div>

        {/* Alur dalam 3 langkah */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 space-y-2 mt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">
            📋 3 Langkah Mudah
          </p>
          <ol className="space-y-1.5 text-xs">
            <li className="flex items-start gap-2">
              <span className="font-bold text-white bg-white/20 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px]">1</span>
              <span>Isi data diri & keluarga di form ini</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-white bg-white/20 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px]">2</span>
              <span>Kirim pesan WhatsApp ke admin (otomatis) + attach foto KTP & KK</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-white bg-white/20 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px]">3</span>
              <span>Tunggu ACC dari pengurus (1-3 hari kerja)</span>
            </li>
          </ol>
        </div>
      </div>

      {/* Notifikasi REJECTED (kalau ada) */}
      {profile.kyc_status === 'REJECTED' && profile.kyc_rejected_reason && (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-900 mb-1">
              Pengajuan Sebelumnya Ditolak
            </p>
            <p className="text-xs text-red-800">
              <span className="font-semibold">Alasan:</span> {profile.kyc_rejected_reason}
            </p>
            <p className="text-xs text-red-700 mt-2">
              💡 Perbaiki data Anda lalu ajukan ulang.
            </p>
          </div>
        </div>
      )}

      {/* Privacy notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900">
          <p className="font-semibold mb-1">🔒 Privasi Data Anda</p>
          <p>
            Foto KTP & KK <span className="font-bold">TIDAK</span> disimpan di server.
            Foto hanya diproses di HP Anda dan dikirim manual via WhatsApp ke admin
            (0853-2881-5155).
          </p>
        </div>
      </div>

      {/* Form */}
      <KycForm
        initialData={initialData}
        adminWa={ADMIN_WA}
        profile={{
          loginId: profile.login_id,
          namaKk: profile.nama_kk,
          blok: profile.blok,
          nomorRumah: profile.nomor_rumah,
        }}
      />
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider shrink-0">
        {label}
      </span>
      <span className="text-slate-900 font-medium text-right break-words">
        {value ?? '-'}
      </span>
    </div>
  )
}
