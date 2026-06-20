-- =====================================================
-- 51: Fix ronda_attendance - tambah semua kolom yg hilang
--
-- Issue:
--   SQL 21 bikin tabel ronda_attendance TANPA kolom:
--     - nama_snapshot
--     - pengganti_dari_id
--     - pengganti_dari_nama
--     - sesi_id (punya jadwal_ronda_id, beda!)
--   Lalu SQL 20 CREATE TABLE IF NOT EXISTS jadi no-op.
--
--   Akibatnya query PostgREST yang pakai kolom2 ini return
--   error "Could not find the column ... in the schema cache":
--     - toggleKehadiran() → pakai nama_snapshot, pengganti_dari_id, pengganti_dari_nama
--     - submitSesi()      → pakai nama_snapshot
--     - swapAnggota()     → pakai nama_snapshot, pengganti_dari_id, pengganti_dari_nama
--
-- Fix: ALTER TABLE ADD COLUMN IF NOT EXISTS (semua idempotent).
--      Migrasi data dari kolom lama (nama_kk_snapshot, jadwal_ronda_id)
--      kalau ada, supaya data historis tidak hilang.
-- =====================================================

-- SECTION A: Diagnosa - kolom yg ada saat ini
SELECT '=== A. Diagnosa kolom ronda_attendance ===' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ronda_attendance'
ORDER BY ordinal_position;

-- SECTION B: Tambah kolom yang hilang (idempotent)
SELECT '=== B. Add missing columns ===' AS section;
DO $$
BEGIN
  -- sesi_id (PostgREST & aksi butuh ini, bukan jadwal_ronda_id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ronda_attendance'
      AND column_name = 'sesi_id'
  ) THEN
    -- Kalau ada jadwal_ronda_id tapi tidak ada sesi_id, rename.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ronda_attendance'
        AND column_name = 'jadwal_ronda_id'
    ) THEN
      ALTER TABLE ronda_attendance RENAME COLUMN jadwal_ronda_id TO sesi_id;
      RAISE NOTICE '→ Renamed jadwal_ronda_id → sesi_id';
    ELSE
      ALTER TABLE ronda_attendance ADD COLUMN sesi_id UUID REFERENCES jimpitan_sesi(id) ON DELETE CASCADE;
      RAISE NOTICE '✓ Added sesi_id';
    END IF;
  ELSE
    RAISE NOTICE '→ sesi_id already exists';
  END IF;

  -- nama_snapshot
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ronda_attendance'
      AND column_name = 'nama_snapshot'
  ) THEN
    ALTER TABLE ronda_attendance ADD COLUMN nama_snapshot TEXT;
    RAISE NOTICE '✓ Added nama_snapshot';
  ELSE
    RAISE NOTICE '→ nama_snapshot already exists';
  END IF;

  -- Backfill nama_snapshot dari nama_kk_snapshot atau profiles.nama_kk
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ronda_attendance'
      AND column_name = 'nama_kk_snapshot'
  ) THEN
    UPDATE ronda_attendance
    SET nama_snapshot = nama_kk_snapshot
    WHERE nama_snapshot IS NULL;
    RAISE NOTICE '✓ Backfilled nama_snapshot from nama_kk_snapshot';
  ELSE
    UPDATE ronda_attendance ra
    SET nama_snapshot = p.nama_kk
    FROM profiles p
    WHERE ra.profile_id = p.id AND ra.nama_snapshot IS NULL;
    RAISE NOTICE '✓ Backfilled nama_snapshot from profiles.nama_kk';
  END IF;

  -- pengganti_dari_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ronda_attendance'
      AND column_name = 'pengganti_dari_id'
  ) THEN
    ALTER TABLE ronda_attendance ADD COLUMN pengganti_dari_id UUID REFERENCES profiles(id);
    RAISE NOTICE '✓ Added pengganti_dari_id';
  ELSE
    RAISE NOTICE '→ pengganti_dari_id already exists';
  END IF;

  -- pengganti_dari_nama
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ronda_attendance'
      AND column_name = 'pengganti_dari_nama'
  ) THEN
    ALTER TABLE ronda_attendance ADD COLUMN pengganti_dari_nama TEXT;
    RAISE NOTICE '✓ Added pengganti_dari_nama';
  ELSE
    RAISE NOTICE '→ pengganti_dari_nama already exists';
  END IF;

  -- Update jumlah_penjaga_hadir backfill helper (kalau perlu)
  -- (Tidak ada hubungannya dengan error, skip)
END $$;

-- SECTION C: Tambahkan UNIQUE constraint kalau belum ada
SELECT '=== C. UNIQUE constraint (sesi_id, profile_id) ===' AS section;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ronda_attendance_sesi_id_profile_id_key'
      AND conrelid = 'ronda_attendance'::regclass
  ) THEN
    -- Drop existing duplicate rows first (keep oldest)
    DELETE FROM ronda_attendance a
    USING ronda_attendance b
    WHERE a.ctid < b.ctid
      AND a.sesi_id = b.sesi_id
      AND a.profile_id = b.profile_id;
    -- Add unique
    ALTER TABLE ronda_attendance
      ADD CONSTRAINT ronda_attendance_sesi_id_profile_id_key
      UNIQUE (sesi_id, profile_id);
    RAISE NOTICE '✓ Added UNIQUE (sesi_id, profile_id)';
  ELSE
    RAISE NOTICE '→ UNIQUE (sesi_id, profile_id) already exists';
  END IF;

  -- Index untuk performa
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ronda_attendance_sesi'
  ) THEN
    CREATE INDEX idx_ronda_attendance_sesi ON ronda_attendance(sesi_id);
    RAISE NOTICE '✓ Created idx_ronda_attendance_sesi';
  END IF;
END $$;

-- SECTION D: Refresh PostgREST schema cache
SELECT '=== D. Refresh PostgREST schema cache ===' AS section;
NOTIFY pgrst, 'reload schema';

-- SECTION E: Verifikasi
SELECT '=== E. Verifikasi kolom setelah ALTER ===' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ronda_attendance'
ORDER BY ordinal_position;

SELECT '=== E2. Sample data ===' AS section;
SELECT
  ra.sesi_id,
  ra.profile_id,
  ra.nama_snapshot,
  ra.is_pengganti,
  ra.pengganti_dari_id,
  ra.pengganti_dari_nama,
  p.nama_kk AS current_nama
FROM ronda_attendance ra
LEFT JOIN profiles p ON p.id = ra.profile_id
ORDER BY ra.created_at DESC
LIMIT 10;

SELECT '=== E3. Summary ===' AS section;
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'ronda_attendance'
     AND column_name IN ('sesi_id', 'nama_snapshot', 'pengganti_dari_id', 'pengganti_dari_nama')) AS kolom_required_exists,
  (SELECT COUNT(*) FROM ronda_attendance WHERE nama_snapshot IS NOT NULL) AS row_with_snapshot,
  (SELECT COUNT(*) FROM ronda_attendance) AS total_row,
  CASE
    WHEN (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'ronda_attendance'
            AND column_name IN ('sesi_id', 'nama_snapshot', 'pengganti_dari_id', 'pengganti_dari_nama')) = 4
    THEN '✅ FIX BERHASIL - semua kolom ada, PostgREST sudah refresh'
    ELSE '❌ MASIH KURANG - cek kolom yg missing'
  END AS status;
