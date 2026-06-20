-- =====================================================
-- 54: Fix FK constraint ronda_attendance_jadwal_ronda_id_fkey
--      → ganti reference dari jadwal_ronda.id ke jimpitan_sesi.id
--
-- Issue:
--   SQL 51 rename kolom jadwal_ronda_id → sesi_id, tapi FK constraint
--   masih reference ke jadwal_ronda.id. Jadi insert/upsert dengan
--   sesi_id (UUID jimpitan_sesi) ditolak karena FK expects UUID
--   jadwal_ronda:
--     "insert or update on table 'ronda_attendance' violates
--      foreign key constraint 'ronda_attendance_jadwal_ronda_id_fkey'"
--
-- Fix: Drop FK lama + tambah FK baru pointing ke jimpitan_sesi.id
-- =====================================================

-- SECTION A: Diagnosa FK constraint yg masih salah
SELECT '=== A.1 Diagnosa kolom sesi_id ===' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ronda_attendance'
  AND column_name IN ('sesi_id', 'jadwal_ronda_id');

SELECT '=== A.2 Diagnosa FK constraint ===' AS section;
SELECT
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'ronda_attendance'::regclass
  AND contype = 'f';

-- SECTION B: Drop FK lama + tambah FK baru
SELECT '=== B. Drop & recreate FK constraint ===' AS section;
DO $$
BEGIN
  -- Drop FK ke jadwal_ronda.id kalau ada
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ronda_attendance_jadwal_ronda_id_fkey'
      AND conrelid = 'ronda_attendance'::regclass
  ) THEN
    ALTER TABLE ronda_attendance
      DROP CONSTRAINT ronda_attendance_jadwal_ronda_id_fkey;
    RAISE NOTICE '✓ Dropped FK lama: ronda_attendance_jadwal_ronda_id_fkey';
  END IF;

  -- Drop FK ke jimpitan_sesi.id kalau ada (kalau sebelumnya sudah benar)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname LIKE '%sesi_id%fkey'
      AND conrelid = 'ronda_attendance'::regclass
      AND contype = 'f'
  ) THEN
    ALTER TABLE ronda_attendance
      DROP CONSTRAINT ronda_attendance_sesi_id_fkey;
    RAISE NOTICE '✓ Dropped existing FK: ronda_attendance_sesi_id_fkey';
  END IF;

  -- Tambah FK baru pointing ke jimpitan_sesi.id
  ALTER TABLE ronda_attendance
    ADD CONSTRAINT ronda_attendance_sesi_id_fkey
    FOREIGN KEY (sesi_id)
    REFERENCES jimpitan_sesi(id)
    ON DELETE CASCADE;
  RAISE NOTICE '✓ Added FK baru: ronda_attendance_sesi_id_fkey → jimpitan_sesi.id';
END $$;

-- SECTION C: Refresh PostgREST schema cache
SELECT '=== C. Refresh PostgREST schema cache ===' AS section;
NOTIFY pgrst, 'reload schema';

-- SECTION D: Verifikasi
SELECT '=== D.1 FK constraint setelah ALTER ===' AS section;
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'ronda_attendance'::regclass
  AND contype = 'f';

SELECT '=== D.2 Test insert valid (seharusnya sukses) ===' AS section;
-- Ambil 1 sesi yg ada
DO $$
DECLARE
  v_sesi_id UUID;
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_sesi_id FROM jimpitan_sesi WHERE status = 'AKTIF' LIMIT 1;
  SELECT profile_id INTO v_profile_id FROM ronda_kelompok WHERE is_active = TRUE LIMIT 1;

  IF v_sesi_id IS NOT NULL AND v_profile_id IS NOT NULL THEN
    -- Coba insert dummy (akan di-rollback)
    BEGIN
      INSERT INTO ronda_attendance (sesi_id, profile_id, is_pengganti)
      VALUES (v_sesi_id, v_profile_id, false);
      DELETE FROM ronda_attendance WHERE sesi_id = v_sesi_id AND profile_id = v_profile_id;
      RAISE NOTICE '✅ TEST INSERT BERHASIL - FK constraint valid';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '❌ TEST INSERT GAGAL: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE '⚠️ Skip test - tidak ada sesi/profile untuk test';
  END IF;
END $$;

SELECT '=== D.3 Summary ===' AS section;
SELECT
  (SELECT COUNT(*) FROM pg_constraint
   WHERE conname = 'ronda_attendance_sesi_id_fkey'
     AND conrelid = 'ronda_attendance'::regclass
     AND contype = 'f') AS fk_baru_exists,
  (SELECT COUNT(*) FROM pg_constraint
   WHERE conname = 'ronda_attendance_jadwal_ronda_id_fkey'
     AND conrelid = 'ronda_attendance'::regclass
     AND contype = 'f') AS fk_lama_exists,
  CASE
    WHEN (SELECT COUNT(*) FROM pg_constraint
          WHERE conname = 'ronda_attendance_sesi_id_fkey'
            AND conrelid = 'ronda_attendance'::regclass
            AND contype = 'f') = 1
     AND (SELECT COUNT(*) FROM pg_constraint
          WHERE conname = 'ronda_attendance_jadwal_ronda_id_fkey'
            AND conrelid = 'ronda_attendance'::regclass
            AND contype = 'f') = 0
    THEN '✅ FIX BERHASIL - FK constraint sudah benar'
    ELSE '⚠️ Cek lagi - mungkin FK belum di-drop atau di-add'
  END AS status;
