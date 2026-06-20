-- =====================================================
-- 40-FIX-PROFILES-RLS-NO-RECURSION
-- Fix infinite recursion di RLS policy profiles
-- yang menyebabkan SEMUA query ke tabel yg reference profiles
-- (kas_transaksi, jadwal_ronda, dll) gagal dengan:
--   "infinite recursion detected in policy for relation 'profiles'"
--
-- ROOT CAUSE:
-- Policy profiles lama pakai EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
-- Saat RLS evaluate query ke profiles lain (mis. kas_transaksi -> cek profiles.role),
-- Postgres detect recursion karena policy profiles query profiles itu sendiri.
--
-- FIX:
-- - Pakai auth.jwt()->>'app_metadata'->>'role' untuk cek role
-- - Tidak query ke tabel profiles lagi (no recursion)
-- =====================================================

-- Lihat semua policy profiles yang ada
SELECT '=== EXISTING PROFILES POLICIES (akan di-drop) ===' AS section;
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- =====================================================
-- Step 1: DROP semua policy profiles
-- =====================================================
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

-- =====================================================
-- Step 2: CREATE policy profiles yang AMAN (no recursion)
-- - SELECT: TRUE untuk semua (semua boleh baca, termasuk anon untuk list warga)
-- - INSERT: hanya user yg insert diri sendiri (auth.uid() = id)
-- - UPDATE: diri sendiri ATAU pengurus (via JWT app_metadata)
-- - DELETE: hanya SUPERADMIN (via JWT app_metadata)
-- =====================================================

CREATE POLICY "profiles_read_all" ON profiles
  FOR SELECT USING (TRUE);

CREATE POLICY "profiles_insert_self" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own_or_pengurus" ON profiles
  FOR UPDATE USING (
    auth.uid() = id
    OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN
       ('KETUA_RT','BENDAHARA','SEKRETARIS','PENGURUS','SUPERADMIN')
  );

CREATE POLICY "profiles_delete_superadmin" ON profiles
  FOR DELETE USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'SUPERADMIN'
  );

-- =====================================================
-- Step 3: SYNC app_metadata.role untuk SEMUA user pengurus
-- Supaya JWT bisa di-trust untuk cek role (no recursion)
-- =====================================================
DO $$
DECLARE
  v_user RECORD;
  v_updated INT := 0;
BEGIN
  FOR v_user IN
    SELECT au.id, p.role, p.nama_kk
    FROM auth.users au
    JOIN profiles p ON p.id = au.id
    WHERE p.role IS NOT NULL
  LOOP
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                            || jsonb_build_object('role', v_user.role)
    WHERE id = v_user.id;
    v_updated := v_updated + 1;
    RAISE NOTICE 'Set role=% untuk % (%)', v_user.role, v_user.nama_kk, v_user.id;
  END LOOP;
  RAISE NOTICE 'Total updated: %', v_updated;
END $$;

-- =====================================================
-- Step 4: VERIFIKASI
-- =====================================================
SELECT '=== PROFILES POLICIES SETELAH FIX ===' AS section;
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

SELECT '=== JWT APP_METADATA ===' AS section;
SELECT
  au.email,
  au.raw_app_meta_data ->> 'role' AS jwt_role,
  p.role AS profile_role
FROM auth.users au
JOIN profiles p ON p.id = au.id
ORDER BY au.email;

-- Test query simple ke profiles (sebelumnya error recursion)
SELECT '=== TEST SELECT PROFILES ===' AS section;
SELECT COUNT(*) AS total_profiles FROM profiles;

-- Test query ke kas_transaksi via anon-like context
SELECT '=== TEST SELECT KAS_TRANSAKSI ===' AS section;
SELECT COUNT(*) AS total_kas, SUM(nominal) FILTER (WHERE tipe='MASUK') AS total_masuk
FROM kas_transaksi;