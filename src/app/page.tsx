import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/welcome')
  }

  // Pakai admin client (service_role) untuk bypass RLS — konsisten dengan
  // pattern di loginPengurus & dashboard layout
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'WARGA'
  
  // Arahkan sesuai role
  if (['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'].includes(role)) {
    redirect('/dashboard')
  } else {
    redirect('/warga')
  }
}