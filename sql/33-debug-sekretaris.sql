-- =====================================================
-- 33-DEBUG-SEKRETARIS: Cek kenapa sekretaris masih "non aktif"
-- Jalankan sebagai SQL Editor Supabase (admin, bypass RLS)
-- =====================================================

-- 1) Cari user sekretaris di auth.users
SELECT '=== AUTH.USERS untuk sekretaris@rt03.id ===' AS section;
SELECT id, email, email_confirmed_at IS NOT NULL AS email_confirmed,
       encrypted_password IS NOT NULL AS has_password,
       created_at, updated_at
FROM auth.users
WHERE email = 'sekretaris@rt03.id';

-- 2) Cari profile B-5 (login_id sekretaris)
SELECT '=== PROFILES dg login_id = B-5 ===' AS section;
SELECT id, login_id, role::TEXT, is_active, nama_kk, created_at
FROM profiles
WHERE login_id = 'B-5';

-- 3) Cek APAKAH id profile B-5 == id auth.users sekretaris
SELECT '=== COMPARE: profile B-5 id vs auth.users sekretaris id ===' AS section;
SELECT
  (SELECT id FROM profiles WHERE login_id = 'B-5')                AS profile_id,
  (SELECT id FROM auth.users WHERE email = 'sekretaris@rt03.id')  AS auth_id,
  CASE
    WHEN (SELECT id FROM profiles WHERE login_id = 'B-5') IS NULL
      THEN '✗ PROFILE B-5 TIDAK ADA — perlu INSERT'
    WHEN (SELECT id FROM profiles WHERE login_id = 'B-5') <>
         (SELECT id FROM auth.users WHERE email = 'sekretaris@rt03.id')
      THEN '✗ ID BEDA — perlu migrasi ulang'
    ELSE '✓ ID COCOK'
  END AS diagnosa;

-- 4) Cek is_active profile B-5
SELECT '=== IS_ACTIVE PROFILE B-5 ===' AS section;
SELECT login_id, is_active,
       CASE WHEN is_active THEN '✓ AKTIF' ELSE '✗ NON-AKTIF' END AS status
FROM profiles WHERE login_id = 'B-5';

-- 5) Cek SEMUA policy select di profiles (full detail)
SELECT '=== FULL POLICY DETAIL ===' AS section;
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- 6) Cek FORCE ROW LEVEL SECURITY
SELECT '=== FORCE RLS? ===' AS section;
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class WHERE relname = 'profiles' AND relnamespace = 'public'::regnamespace;

-- 7) Cek grants di table profiles untuk role authenticated
SELECT '=== GRANTS PROFILES ===' AS section;
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY grantee, privilege_type;