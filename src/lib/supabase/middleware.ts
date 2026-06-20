import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Deteksi env masih placeholder
const IS_PLACEHOLDER_ENV =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'your-anon-public-key-here' ||
  process.env.NEXT_PUBLIC_SUPABASE_URL === ''

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Pass pathname ke server components via header
  // (server components tidak punya usePathname, jadi pakai headers())
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  // DEV FALLBACK: kalau env masih placeholder, lewatkan auth check
  if (IS_PLACEHOLDER_ENV) {
    // /warga tetap butuh session cookie, /dashboard di-bypass untuk dev
    if (pathname === '/warga' || pathname.startsWith('/warga/')) {
      const wargaSession = request.cookies.get('warga_session')?.value
      if (!wargaSession) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
      }
    }
    return response
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // PENTING: harus dipanggil agar session Supabase di-refresh
  const { data: { user } } = await supabase.auth.getUser()

  const wargaSession = request.cookies.get('warga_session')?.value

  // ---- Path publik (tanpa auth) ----
  const isPublicPath =
    pathname === '/login' ||
    pathname === '/' ||
    pathname === '/welcome' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')

  // ---- WARGA area (/warga/*): butuh cookie warga_session ----
  const isWargaArea = pathname === '/warga' || pathname.startsWith('/warga/')

  if (isWargaArea) {
    if (!wargaSession) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    // Cookie ada → layout akan validasi token via RPC
    return response
  }

  // ---- PENGURUS area (/dashboard/*): butuh Supabase Auth user ----
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // JANGAN auto-redirect /login → /dashboard saat user sudah login.
  // Alasan: kalau WARGA yang sedang login mengunjungi /login
  // (misal salah klik), redirect ke /dashboard malah bikin loop
  // karena (dashboard)/layout akan render 403.
  // Biarkan user eksplisit navigate sendiri.

  return response
}
