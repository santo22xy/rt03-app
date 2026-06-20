-- =====================================================
-- 99: DIAGNOSTIC - Kenapa role pengurus gak ngefek?
-- Run file ini TERPISAH, paste SEMUA output
-- =====================================================

-- 1. APAKAH B-1 dan C-2 ADA di tabel profiles?
SELECT '=== 1. CEK KEBERADAAN B-1, B-5, C-2 ===' AS section;
SELECT login_id, nama_kk, role, is_active, blok, nomor_rumah
FROM profiles
WHERE login_id IN ('B-1','B-5','C-2')
ORDER BY login_id;

-- 2. SEMUA profil yang role-nya bukan WARGA
SELECT '=== 2. SEMUA PROFIL NON-WARGA ===' AS section;
SELECT login_id, nama_kk, role, is_active
FROM profiles
WHERE role <> 'WARGA' OR role IS NULL
ORDER BY login_id;

-- 3. CHECK CONSTRAINT di kolom role
SELECT '=== 3. CHECK CONSTRAINT ROLE ===' AS section;
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'profiles'::regclass
  AND contype = 'c';

-- 4. COLUMN DEFINITION lengkap
SELECT '=== 4. COLUMN DEFINITION PROFILES ===' AS section;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 5. RLS POLICIES untuk profiles (mungkin block UPDATE)
SELECT '=== 5. RLS POLICIES PROFILES ===' AS section;
SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
ORDER BY policyname;

-- 6. RLS enabled?
SELECT '=== 6. RLS STATUS ===' AS section;
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname = 'profiles';

-- 7. TEST UPDATE langsung (lihat row count)
DO $$
DECLARE
  v_count_b1 INT;
  v_count_c2 INT;
  v_count_b5 INT;
BEGIN
  RAISE NOTICE '--- TEST UPDATE RESULTS ---';

  UPDATE profiles SET role = 'KETUA_RT' WHERE login_id = 'B-1';
  GET DIAGNOSTICS v_count_b1 = ROW_COUNT;
  RAISE NOTICE 'B-1 -> KETUA_RT: % row(s) updated', v_count_b1;

  UPDATE profiles SET role = 'BENDAHARA' WHERE login_id = 'C-2';
  GET DIAGNOSTICS v_count_c2 = ROW_COUNT;
  RAISE NOTICE 'C-2 -> BENDAHARA: % row(s) updated', v_count_c2;

  UPDATE profiles SET role = 'SEKRETARIS' WHERE login_id = 'B-5';
  GET DIAGNOSTICS v_count_b5 = ROW_COUNT;
  RAISE NOTICE 'B-5 -> SEKRETARIS: % row(s) updated', v_count_b5;
END $$;

-- 8. HASIL AKHIR setelah UPDATE
SELECT '=== 8. HASIL SETELAH UPDATE ===' AS section;
SELECT login_id, nama_kk, role
FROM profiles
WHERE login_id IN ('B-1','B-5','C-2')
ORDER BY login_id;

-- 9. TOTAL final
SELECT '=== 9. TOTAL FINAL ===' AS section;
SELECT
  (SELECT COUNT(*) FROM profiles WHERE is_active=TRUE) AS total_aktif,
  (SELECT COUNT(*) FROM profiles WHERE is_active=TRUE AND role='WARGA') AS total_warga,
  (SELECT COUNT(*) FROM profiles WHERE is_active=TRUE AND role='KETUA_RT') AS total_ketua,
  (SELECT COUNT(*) FROM profiles WHERE is_active=TRUE AND role='BENDAHARA') AS total_bendahara,
  (SELECT COUNT(*) FROM profiles WHERE is_active=TRUE AND role='SEKRETARIS') AS total_sekretaris;
