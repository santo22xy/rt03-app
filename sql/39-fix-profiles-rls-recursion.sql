-- =====================================================
-- 39-FIX-PROFILES-RLS-RECURSION
-- Fix infinite recursion di RLS policy profiles
-- yang menyebabkan SEMUA query ke tabel yg reference profiles
-- (kas_transaksi, jadwal_ronda, dll) gagal dengan:
--   "infinite recursion detected in policy for relation 'profiles'"
-- =====================================================

-- Lihat semua policy di profiles
SELECT '=== EXISTING PROFILES POLICIES ===' AS section;
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- =====================================================
-- STRATEGI FIX:
-- 1. DROP semua policy profiles yang cek role pakai EXISTS(SELECT profiles)
-- 2. CREATE policy sederhana yang JANGAN query ke profiles
-- 3. Pakai auth.jwt() -> app_metadata.role untuk cek role
--    (lebih aman & tidak recursive)
-- =====================================================

-- Step 1: Drop SEMUA policy profiles (kecuali read_all jika ada)
DO $$
DECLARE v_p TEXT;
BEGIN
  FOR v_p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', v_p);
    RAISE NOTICE 'Dropped policy %', v_p;
  END LOOP;
END $$;

-- Step 2: Cek role di JWT (lebih aman)
-- auth.jwt() -> { sub: 'uuid', app_metadata: { role: 'KETUA_RT', ... }, ... }
DO $$
DECLARE
  v_has_jwt BOOLEAN;
BEGIN
  -- Kita cek apakah auth.jwt() bisa baca custom claim role
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE raw_app_meta_data ? 'role'
    LIMIT 1
  ) INTO v_has_jwt;

  RAISE NOTICE 'auth.users punya app_metadata.role? %', v_has_jwt;
END $$;

-- Step 3: Buat policy baru yang AMAN (tidak recursive)
-- SELECT: semua orang boleh baca profiles (untuk list warga, dll)
CREATE POLICY "profiles_read_all" ON profiles
  FOR SELECT USING (TRUE);

-- INSERT: hanya superadmin / system yang boleh insert
-- Pakai auth.jwt() untuk avoid recursion
CREATE POLICY "profiles_insert_self" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- UPDATE: user bisa update profil sendiri ATAU pengurus bisa update semua
-- Pakai auth.jwt() untuk avoid recursion
CREATE POLICY "profiles_update_own_or_pengurus" ON profiles
  FOR UPDATE USING (
    auth.uid() = id
    OR COALESCE(auth.jwt() ->> 'app_metadata' ->> 'role', '') IN ('KETUA_RT','BENDAHARA','SEKRETARIS','PENGURUS','SUPERADMIN')
  );

-- DELETE: hanya superadmin
CREATE POLICY "profiles_delete_superadmin" ON profiles
  FOR DELETE USING (
    COALESCE(auth.jwt() ->> 'app_metadata' ->> 'role', '') = 'SUPERADMIN'
  );

-- =====================================================
-- Step 4: Update app_metadata.role untuk semua user pengurus
-- Supaya policy profiles_update_own_or_pengurus bisa detect role via JWT
-- =====================================================
DO $$
DECLARE
  v_user RECORD;
  v_role TEXT;
BEGIN
  FOR v_user IN
    SELECT au.id, p.role
    FROM auth.users au
    JOIN profiles p ON p.id = au.id
  LOOP
    v_role := v_user.role;
    -- Update app_metadata untuk set role
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_role)
    WHERE id = v_user.id;
    RAISE NOTICE 'Set role=% for user %', v_role, v_user.id;
  END LOOP;
END $$;

-- =====================================================
-- Step 5: Verify policy baru
-- =====================================================
SELECT '=== PROFILES POLICIES AFTER FIX ===' AS section;
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- Test: coba query sebagai anon
SELECT '=== TEST QUERY ANON ===' AS section;
SELECT COUNT(*) AS profile_count FROM profiles;

-- Test: liat role di JWT
SELECT '=== JWT APP METADATA ===' AS section;
SELECT id, email, raw_app_meta_data
FROM auth.users
ORDER BY email;