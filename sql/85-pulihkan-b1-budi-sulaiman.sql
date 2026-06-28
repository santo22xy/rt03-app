-- =====================================================
-- SQL 85: Pulihkan B-1 (Budi Sulaiman) sebagai KETUA_RT
--
-- Issue: Budi Sulaiman (login_id=B-1) sebagai KETUA_RT
--        statusnya tidak konsisten di beberapa tempat.
--        Sudah beberapa SQL dijalankan untuk fix (22, 34, 44,
--        53, 79/81) tapi masih ada kemungkinan data korup.
--
-- Kemungkinan penyebab "belum pulih":
--   1. nama_kk masih 'Bpk. Budi S.' (truncated dari SQL 22)
--      atau 'Budi Sulaiman' (dari SQL 34) atau 'Bpk. Budi
--      Sulaiman' (dari SQL 53) — yang terbaru adalah 'Bpk.
--      Budi Sulaiman', tapi kalau pernah di-restore backup
--      mungkin kembali ke nama lama.
--   2. role ke-reset ke 'WARGA' (bukan 'KETUA_RT')
--   3. is_active = FALSE (kena toggle nonaktif)
--   4. is_pengurus_aktif = FALSE (kolom gak ke-update)
--   5. auth user untuk ketua@rt03.id tidak ada / beda UUID
--      dengan profiles.id untuk B-1
--   6. profiles.id untuk B-1 beda dengan auth.users.id
--      (login pengurus via email/password akan gagal)
--
-- Fix (idempotent, aman di-run ulang):
--   1. Diagnosa lengkap state B-1 saat ini
--   2. UPDATE profiles: role, is_active, is_pengurus_aktif,
--      nama_kk, blok, nomor_rumah
--   3. Sync profiles.id dengan auth.users.id untuk ketua@rt03.id
--      (kalau beda, migrasi FK references dulu lalu UPDATE)
--   4. Refresh PostgREST cache
--   5. Verifikasi akhir: B-1 muncul sebagai KETUA_RT di
--      v_pengurus_aktif
-- =====================================================

-- SECTION A: Diagnosa state B-1 saat ini
SELECT '=== A. STATE B-1 SAAT INI ===' AS section;

-- A.1 Profile
SELECT 'a1_profile' AS s,
  id, login_id, nama_kk, role, blok, nomor_rumah, no_hp,
  is_active, is_pengurus_aktif, kategori_tarif,
  created_at, updated_at
FROM profiles
WHERE login_id = 'B-1';

-- A.2 Auth user (cocokkan UUID profiles dengan auth.users)
-- Pakai UNION agar tidak perlu FULL OUTER JOIN dengan kondisi konstanta
-- (FULL OUTER JOIN hanya support merge/hash join dengan kolom-ke-kolom)
SELECT 'a2_auth_match' AS s,
  au.id AS auth_id,
  au.email,
  p.id AS profile_id,
  p.login_id,
  CASE WHEN au.id = p.id THEN '✓ UUID MATCH'
       WHEN au.id IS NULL THEN '✗ AUTH USER TIDAK ADA'
       WHEN p.id IS NULL THEN '✗ PROFILE TIDAK ADA'
       ELSE '✗ UUID MISMATCH - PERLU SYNC'
  END AS status
FROM profiles p
INNER JOIN auth.users au ON au.email = 'ketua@rt03.id' AND p.login_id = 'B-1'
UNION ALL
SELECT 'a2_auth_match_only_profile' AS s,
  NULL::uuid AS auth_id,
  NULL::text AS email,
  p.id AS profile_id,
  p.login_id,
  CASE WHEN TRUE THEN '✗ AUTH USER TIDAK ADA' END AS status
FROM profiles p
WHERE p.login_id = 'B-1'
  AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.email = 'ketua@rt03.id')
UNION ALL
SELECT 'a2_auth_match_only_auth' AS s,
  au.id AS auth_id,
  au.email,
  NULL::uuid AS profile_id,
  NULL::text AS login_id,
  CASE WHEN TRUE THEN '✗ PROFILE TIDAK ADA' END AS status
FROM auth.users au
WHERE au.email = 'ketua@rt03.id'
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.login_id = 'B-1');

-- A.3 Apakah B-1 muncul di v_pengurus_aktif?
SELECT 'a3_v_pengurus_aktif' AS s,
  login_id, nama_kk, role, blok, nomor_rumah, is_active
FROM v_pengurus_aktif
WHERE login_id = 'B-1';

-- A.4 Hitung pengurus aktif keseluruhan
SELECT 'a4_pengurus_total' AS s,
  COUNT(*) AS total_pengurus_aktif,
  COUNT(*) FILTER (WHERE role = 'KETUA_RT') AS total_ketua_rt
FROM v_pengurus_aktif;

-- SECTION B: Fix profiles B-1 (idempotent)
SELECT '=== B. FIX PROFILES B-1 ===' AS section;

-- B.1 + B.2 + B.3: Gabung dalam satu DO block supaya deklarasi variable aman
DO $fix_b1$
DECLARE
  v_id UUID;
  v_auth_id UUID;
  v_profile_id UUID;
  v_exists_auth BOOLEAN;
  v_updated INT;
  v_rec RECORD;
BEGIN
  -- B.1: Pastikan profile B-1 ada
  SELECT id INTO v_id FROM profiles WHERE login_id = 'B-1';

  -- Ambil auth.users.id untuk ketua@rt03.id (kalau ada)
  SELECT id INTO v_auth_id FROM auth.users WHERE email = 'ketua@rt03.id';
  v_exists_auth := v_auth_id IS NOT NULL;

  IF v_id IS NULL THEN
    RAISE NOTICE '⚠️ B-1 TIDAK ADA di profiles! Akan di-INSERT.';
    -- Pakai UUID dari auth.users untuk konsistensi login
    IF v_auth_id IS NULL THEN
      v_id := gen_random_uuid();
      RAISE NOTICE '  Auth user ketua@rt03.id tidak ada, generate UUID baru: %', v_id;
    ELSE
      v_id := v_auth_id;
      RAISE NOTICE '  Pakai UUID dari auth.users: %', v_id;
    END IF;

    INSERT INTO profiles (
      id, login_id, nama_kk, blok, nomor_rumah,
      role, is_active, kategori_tarif, no_hp
    )
    VALUES (
      v_id, 'B-1', 'Bpk. Budi Sulaiman', 'B', 1,
      'KETUA_RT', TRUE, 'NORMAL', NULL
    );
    RAISE NOTICE '  ✓ Profile B-1 dibuat dengan id=%', v_id;
  ELSE
    RAISE NOTICE '  Profile B-1 ada (id=%)', v_id;
  END IF;

  -- B.2: Sync profiles.id dengan auth.users.id (kalau beda)
  -- URUTAN YANG BENAR:
  --   (a) disable trigger
  --   (b) UPDATE profiles.id ke UUID auth (parent PK berubah; FK references
  --       di child tables jadi stale, tapi constraint FK tidak langsung
  --       di-revalidate sampai child di-UPDATE/INSERT)
  --   (c) Migrate SEMUA FK references dari UUID lama ke UUID auth
  --   (d) re-enable trigger
  --
  --   Kalau urutan dibalik (FK migrate dulu sebelum parent PK berubah),
  --   UPDATE ke UUID baru akan GAGAL karena UUID baru belum ada di profiles.
  IF v_exists_auth THEN
    SELECT id INTO v_profile_id FROM profiles WHERE login_id = 'B-1';
    IF v_profile_id IS DISTINCT FROM v_auth_id THEN
      RAISE NOTICE '  ⚠️ UUID mismatch: profile=%, auth=% — migrating', v_profile_id, v_auth_id;

      -- (a) Disable trigger supaya tidak fire selama perubahan PK
      IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_is_pengurus_aktif') THEN
        ALTER TABLE profiles DISABLE TRIGGER trg_sync_is_pengurus_aktif;
      END IF;

      -- (b) Update profile.id ke UUID auth (parent PK berubah)
      UPDATE profiles SET id = v_auth_id WHERE id = v_profile_id;

      -- (c) Migrate FK references secara DINAMIS via information_schema.
      --     Ini otomatis mencakup SEMUA kolom FK yang reference profiles(id),
      --     termasuk: profile_id, profile_asli_id, profile_pengganti_id,
      --     penjaga_profile_id, profile_id_petugas, acd_by_profile_id,
      --     created_by, input_by, approved_by, pengganti_dari_id, dst.
      FOR v_rec IN
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND ccu.table_name = 'profiles'
          AND ccu.column_name = 'id'
          AND ccu.table_schema = 'public'
      LOOP
        EXECUTE format(
          'UPDATE %I SET %I = $1 WHERE %I = $2',
          v_rec.table_name, v_rec.column_name, v_rec.column_name
        ) USING v_auth_id, v_profile_id;
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated > 0 THEN
          RAISE NOTICE '    Migrated % rows in %.%', v_updated, v_rec.table_name, v_rec.column_name;
        END IF;
      END LOOP;

      -- (d) Re-enable trigger
      IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_is_pengurus_aktif') THEN
        ALTER TABLE profiles ENABLE TRIGGER trg_sync_is_pengurus_aktif;
      END IF;

      RAISE NOTICE '  ✓ UUID disinkronkan ke %', v_auth_id;
    ELSE
      RAISE NOTICE '  ✓ UUID sudah match (%)', v_auth_id;
    END IF;
  ELSE
    RAISE NOTICE '  ⚠️ Auth user ketua@rt03.id belum ada. Buat manual via Supabase Dashboard atau script create-pengurus.mjs';
  END IF;

  -- B.3: Set role = KETUA_RT, is_active = TRUE, dst
  UPDATE profiles
  SET role = 'KETUA_RT',
      is_active = TRUE,
      is_pengurus_aktif = TRUE,
      nama_kk = 'Bpk. Budi Sulaiman',
      blok = 'B',
      nomor_rumah = 1,
      kategori_tarif = COALESCE(kategori_tarif, 'NORMAL'),
      updated_at = NOW()
  WHERE login_id = 'B-1';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE '  ✓ Profile B-1 di-UPDATE (% row)', v_updated;

  -- B.4: Ensure trigger sync_is_pengurus_aktif exists
  -- (kalau pernah ke-drop, kita re-create)
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_is_pengurus_aktif'
  ) THEN
    CREATE OR REPLACE FUNCTION sync_is_pengurus_aktif()
    RETURNS TRIGGER LANGUAGE plpgsql AS $func$
    BEGIN
      NEW.is_pengurus_aktif := (NEW.role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'))
        AND NEW.is_active = TRUE;
      RETURN NEW;
    END;
    $func$;

    DROP TRIGGER IF EXISTS trg_sync_is_pengurus_aktif ON profiles;
    CREATE TRIGGER trg_sync_is_pengurus_aktif
    BEFORE INSERT OR UPDATE OF role, is_active ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION sync_is_pengurus_aktif();

    RAISE NOTICE '  ✓ Trigger sync_is_pengurus_aktif di-recreate';

    -- Re-apply untuk semua row
    UPDATE profiles
    SET is_pengurus_aktif = (role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'))
                          AND is_active = TRUE;
  END IF;
END $fix_b1$;

-- SECTION C: Pastikan juga C-2 (Bendahara) & B-5 (Sekretaris) konsisten
-- (tidak terkait langsung dgn issue, tapi untuk memastikan pengurus
--  lain tidak corrupt oleh trigger re-create)
SELECT '=== C. SANITY CHECK PENGURUS LAIN ===' AS section;

UPDATE profiles
SET is_active = TRUE,
    is_pengurus_aktif = (role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN')),
    updated_at = NOW()
WHERE login_id IN ('B-5', 'C-2', 'X-0')
  AND (is_active = FALSE OR is_pengurus_aktif = FALSE);

-- SECTION D: Sinkronkan data ke tabel lain yang punya snapshot
SELECT '=== D. SYNC SNAPSHOT KE TABEL LAIN ===' AS section;

-- D.1 Sync nama_kk ke ronda_kelompok
UPDATE ronda_kelompok rk
SET nama_kk_snapshot = p.nama_kk
FROM profiles p
WHERE rk.profile_id = p.id
  AND p.login_id = 'B-1'
  AND rk.nama_kk_snapshot IS DISTINCT FROM p.nama_kk;

-- D.2 Sync nama ke ronda_attendance
UPDATE ronda_attendance ra
SET nama_kk_snapshot = p.nama_kk,
    nama_snapshot = p.nama_kk
FROM profiles p
WHERE ra.profile_id = p.id
  AND p.login_id = 'B-1'
  AND (
    ra.nama_kk_snapshot IS DISTINCT FROM p.nama_kk
    OR (ra.nama_snapshot IS DISTINCT FROM p.nama_kk AND ra.nama_snapshot IS NOT NULL)
  );

-- SECTION E: Refresh PostgREST cache
SELECT '=== E. REFRESH POSTGREST CACHE ===' AS section;
NOTIFY pgrst, 'reload schema';

-- SECTION F: Verifikasi akhir
SELECT '=== F.1 PROFILE B-1 SETELAH FIX ===' AS section;
SELECT id, login_id, nama_kk, role, blok, nomor_rumah,
       is_active, is_pengurus_aktif, kategori_tarif
FROM profiles
WHERE login_id = 'B-1';

SELECT '=== F.2 B-1 DI v_pengurus_aktif ===' AS section;
SELECT login_id, nama_kk, role, blok, nomor_rumah, is_active
FROM v_pengurus_aktif
WHERE login_id = 'B-1';

SELECT '=== F.3 TOTAL PENGURUS AKTIF ===' AS section;
SELECT
  role,
  COUNT(*) AS total
FROM v_pengurus_aktif
GROUP BY role
ORDER BY role;

SELECT '=== F.4 SUMMARY ===' AS section;
SELECT
  (SELECT COUNT(*) FROM profiles WHERE login_id = 'B-1') AS b1_exists,
  (SELECT COUNT(*) FROM profiles WHERE login_id = 'B-1' AND role = 'KETUA_RT') AS b1_is_ketua_rt,
  (SELECT COUNT(*) FROM profiles WHERE login_id = 'B-1' AND is_active = TRUE) AS b1_is_active,
  (SELECT COUNT(*) FROM profiles WHERE login_id = 'B-1' AND is_pengurus_aktif = TRUE) AS b1_is_pengurus_aktif,
  (SELECT COUNT(*) FROM v_pengurus_aktif WHERE login_id = 'B-1') AS b1_in_view,
  (SELECT COUNT(*) FROM v_pengurus_aktif WHERE role = 'KETUA_RT') AS total_ketua_rt_in_view,
  CASE
    WHEN (SELECT COUNT(*) FROM v_pengurus_aktif WHERE login_id = 'B-1') = 1
     AND (SELECT COUNT(*) FROM v_pengurus_aktif WHERE role = 'KETUA_RT') >= 1
    THEN '✅ B-1 SUDAH PULIH - muncul sebagai KETUA_RT di v_pengurus_aktif'
    ELSE '❌ MASIH BELUM PULIH - cek section di atas'
  END AS status;
