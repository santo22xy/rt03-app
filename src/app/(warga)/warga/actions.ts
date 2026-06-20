'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

// Logout khusus warga: hapus session token & cookie
export async function logoutWarga() {
  const cookieStore = await cookies()
  const token = cookieStore.get('warga_session')?.value

  if (token) {
    const admin = createAdminClient()
    // Hapus session dari tabel warga_sessions
    await admin.from('warga_sessions').delete().eq('token', token)
  }

  cookieStore.delete('warga_session')
  redirect('/login')
}
