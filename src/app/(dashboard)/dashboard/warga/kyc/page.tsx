import Link from 'next/link'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  ShieldCheck, Clock, XCircle, Users, AlertCircle,
  ArrowLeft,
} from 'lucide-react'
import { KycManagement } from './kyc-management'

export const dynamic = 'force-dynamic'

export default async function DashboardKycPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: actor } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!actor || !['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'].includes(actor.role)) {
    redirect('/login')
  }

  // Ambil data KYC pending via view
  const { data: pendingList } = await admin
    .from('v_kyc_pending')
    .select('*')

  // Ambil statistik
  const { data: statsData } = await admin
    .from('v_kyc_stats')
    .select('*')
    .single()

  // Ambil KYC rejected (untuk referensi)
  const { data: rejectedList } = await admin
    .from('profiles')
    .select('id, login_id, nama_kk, blok, nomor_rumah, kyc_status, kyc_rejected_reason, kyc_submitted_at')
    .eq('role', 'WARGA')
    .eq('kyc_status', 'REJECTED')
    .order('kyc_submitted_at', { ascending: false })
    .limit(20)

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/warga"
          className="inline-flex items-center justify-center h-9 w-9 rounded-xl hover:bg-muted"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
              Verifikasi Warga
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold leading-tight">KYC Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verifikasi data KK & KTP warga yang submit via WhatsApp
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Pending"
          value={statsData?.total_pending ?? 0}
          icon={Clock}
          gradient="from-amber-500 to-orange-500"
          highlight={(statsData?.total_pending ?? 0) > 0}
        />
        <StatCard
          label="Terverifikasi"
          value={statsData?.total_verified ?? 0}
          icon={ShieldCheck}
          gradient="from-emerald-500 to-teal-500"
        />
        <StatCard
          label="Ditolak"
          value={statsData?.total_rejected ?? 0}
          icon={XCircle}
          gradient="from-red-500 to-rose-500"
        />
        <StatCard
          label="Belum Submit"
          value={statsData?.total_unverified ?? 0}
          icon={Users}
          gradient="from-slate-400 to-slate-500"
        />
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900">
          <p className="font-semibold mb-1">📱 Cara Kerja KYC</p>
          <p>Warga submit form + kirim foto via WA. Admin lihat di sini, cek data, lalu bulk ACC.</p>
          <p className="mt-1 text-blue-700">Foto KTP/KK TIDAK tersimpan di server — admin cek dari chat WA warga.</p>
        </div>
      </div>

      {/* Main management UI (client component) */}
      <KycManagement
        pending={pendingList ?? []}
        rejected={rejectedList ?? []}
        actorId={actor.id}
      />
    </div>
  )
}

function StatCard({
  label, value, icon: Icon, gradient, highlight = false,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  gradient: string
  highlight?: boolean
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} text-white p-4 shadow-lg ${highlight ? 'ring-2 ring-amber-400 animate-pulse-slow' : ''}`}>
      <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -mr-8 -mt-8" />
      <div className="relative">
        <Icon className="w-5 h-5 text-white/80 mb-1.5" />
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-[10px] uppercase tracking-wider text-white/90 font-semibold mt-0.5">
          {label}
        </p>
      </div>
    </div>
  )
}
