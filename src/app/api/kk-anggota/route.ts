import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const profileId = request.nextUrl.searchParams.get('profileId')
  
  if (!profileId) {
    return NextResponse.json({ error: 'profileId required' }, { status: 400 })
  }

  // Verify user is pengurus
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch anggota
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('kk_anggota')
    .select('id, nama, nik, hubungan, tanggal_lahir, jenis_kelamin, pekerjaan, is_active')
    .eq('profile_id', profileId)
    .eq('is_active', true)
    .order('hubungan', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ anggota: data ?? [] })
}