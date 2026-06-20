-- =====================================================
-- 33-VERIFY-LOGIN: Cek kenapa login masih "non aktif"
-- =====================================================

-- 1) RLS status + policy profiles
SELECT '=== RLS STATUS PROFILES ===' AS section;
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class WHERE relname = 'profiles' AND relnamespace = 'public'::regnamespace;

SELECT '=== POLICIES ON PROFILES ===' AS section;
SELECT policyname, cmd, qual
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles';

-- 2) State profile vs auth.users (4 pengurus)
SELECT '=== STATE 4 PENGURUS (JOIN profiles × auth.users by EMAIL) ===' AS section;
SELECT
  u.email,
  u.id                                                    AS auth_id,
  p.id                                                    AS profile_id,
  p.login_id,
  p.role::TEXT                                            AS role,
  p.is_active,
  CASE WHEN p.id IS NULL              THEN '✗ PROFILE TIDAK ADA'
       WHEN p.id <> u.id              THEN '✗ ID BEDA (migrasi gagal)'
       WHEN p.is_active IS FALSE      THEN '✗ is_active = FALSE'
       ELSE                                '✓ OK'
  END                                                     AS diagnosa
FROM auth.users u
LEFT JOIN profiles p ON p.login_id IN ('B-1','B-5','C-2','X-0')
                    AND p.id = u.id
WHERE u.email IN ('ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id')
ORDER BY u.email;

-- 3) Semua profile dg login_id pengurus (cek duplikat)
SELECT '=== SEMUA PROFILE LOGIN_ID PENGURUS ===' AS section;
SELECT id, login_id, role::TEXT, is_active, nama_kk
FROM profiles
WHERE login_id IN ('B-1','B-5','C-2','X-0')
ORDER BY login_id;

-- 4) TEST: query sebagai role authenticated (simulasi app)
--     Pakai SET LOCAL role — tapi Supabase console tidak support,
--     jadi cek dari struktur: apakah ada policy USING(auth.uid()=id)?
SELECT '=== POLICY USING auth.uid() ? ===' AS section;
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
  AND qual LIKE '%auth.uid%';