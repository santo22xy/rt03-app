-- =====================================================
-- 38-FIX-JIMPITAN-TARIF-PROFILE-ID-MIGRATION
-- Memperbaiki profile_id di jimpitan_tarif yang masih UUID lama
-- (sebelum migrasi profile ID oleh script 33-fix-migrate.sql).
--
-- Gejala:
--   ERROR: insert or update on table "jimpitan_tagihan"
--          violates foreign key constraint
--          "jimpitan_tagihan_profile_id_fkey"
-- =====================================================

-- =====================================================
-- STEP 1: Diagnosa - cek profile_id mana yang stale
-- =====================================================
SELECT '=== STEP 1: STALE PROFILE_ID DI JIMPITAN_TARIF ===' AS section;

SELECT
  t.login_id,
  t.profile_id AS tarif_profile_id,
  p.id AS current_profile_id,
  CASE
    WHEN p.id IS NULL THEN '✗ Profile hilang di tabel profiles'
    WHEN t.profile_id = p.id THEN '✓ Cocok'
    ELSE '✗ STALE - perlu migrasi'
  END AS status
FROM jimpitan_tarif t
LEFT JOIN profiles p ON p.login_id = t.login_id
ORDER BY t.login_id;

-- =====================================================
-- STEP 2: Sync profile_id di jimpitan_tarif ke profiles.id saat ini
-- (berdasarkan login_id yang matching)
-- =====================================================
SELECT '=== STEP 2: MIGRASI PROFILE_ID ===' AS section;

UPDATE jimpitan_tarif t
SET profile_id = p.id
FROM profiles p
WHERE p.login_id = t.login_id
  AND t.profile_id <> p.id;

-- =====================================================
-- STEP 3: Hapus jimpitan_tarif yang orphan (login_id tidak ada di profiles)
-- =====================================================
SELECT '=== STEP 3: HAPUS ORPHAN ===' AS section;

DELETE FROM jimpitan_tarif t
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = t.profile_id
);

-- =====================================================
-- STEP 4: Verifikasi
-- =====================================================
SELECT '=== STEP 4: VERIFIKASI ===' AS section;

SELECT
  COUNT(*) AS total_tarif,
  COUNT(*) FILTER (WHERE t.profile_id = p.id) AS matched,
  COUNT(*) FILTER (WHERE t.profile_id <> p.id OR p.id IS NULL) AS still_stale
FROM jimpitan_tarif t
LEFT JOIN profiles p ON p.id = t.profile_id;