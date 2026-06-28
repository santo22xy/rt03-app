import { BulkInputIuran } from '../bulk-input-client'
import { Banknote, Sparkles } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function BulkInputIuranPage() {
  const admin = createAdminClient()

  // Verify user is pengurus
  const { data: { user } } = await admin.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['BENDAHARA', 'KETUA_RT', 'SUPERADMIN'].includes(profile.role)) {
    redirect('/dashboard')
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-emerald-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
            Bulk Input Bendahara
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Banknote className="w-7 h-7 text-emerald-600" />
          Input Iuran Massal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Input nominal iuran bulanan untuk banyak warga sekaligus. Tagihan & kas otomatis update.
        </p>
      </div>

      <BulkInputIuran />
    </div>
  )
}
