-- =====================================================
-- SQL 47: DETECT KOLOM INPUTTER + ADD JIKA BELUM ADA
-- =====================================================
-- Mungkin kolom input_by namanya beda (inputter_id, dll)
-- Kita list SEMUA kolom UUID di jimpitan_sesi + tambah kalau perlu
-- =====================================================

-- =====================================================
-- A. LIST SEMUA KOLOM jimpitan_sesi
-- =====================================================

SELECT '=== ALL COLUMNS jimpitan_sesi ===' AS section;
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'jimpitan_sesi'
ORDER BY ordinal_position;

-- =====================================================
-- B. LIST SEMUA KOLOM UUID (FK candidates)
-- =====================================================

SELECT '=== UUID COLUMNS (FK candidates) ===' AS section;
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'jimpitan_sesi'
  AND data_type = 'uuid';

-- =====================================================
-- C. ADD KOLOM input_by JIKA BELUM ADA
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SECTION C: ADD input_by JIKA BELUM ADA ===';

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jimpitan_sesi'
      AND column_name = 'input_by'
  ) THEN
    ALTER TABLE jimpitan_sesi ADD COLUMN input_by UUID REFERENCES profiles(id);
    RAISE NOTICE '✓ ADDED: input_by (UUID FK ke profiles)';
  ELSE
    RAISE NOTICE '✓ EXISTS: input_by sudah ada';
  END IF;
END $$;

-- =====================================================
-- D. BACKFILL DARI PROFILES BERDASARKAN NAMA SNAPSHOT
-- =====================================================

DO $$
DECLARE
  v_updated INT := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SECTION D: BACKFILL input_by DARI PROFILES BERDASARKAN NAMA ===';

  -- Kalau nama_inputter_snapshot match dengan profiles.nama_kk,
  -- backfill input_by dari profiles.id
  UPDATE jimpitan_sesi s
    SET input_by = p.id
    FROM profiles p
    WHERE s.input_by IS NULL
      AND s.nama_inputter_snapshot IS NOT NULL
      AND LOWER(TRIM(p.nama_kk)) = LOWER(TRIM(REGEXP_REPLACE(s.nama_inputter_snapshot, '\s*\(Pengurus\)\s*', '', 'g')));
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Backfilled input_by untuk % records (match by nama)', v_updated;
END $$;

-- =====================================================
-- E. VERIFIKASI
-- =====================================================

SELECT '=== STATE SETELAH FIX ===' AS section;
SELECT
  s.tanggal,
  s.nama_inputter_snapshot AS nama,
  s.blok_inputter_snapshot AS blok,
  s.input_by,
  p.nama_kk AS profile_nama,
  CASE WHEN s.input_by IS NOT NULL THEN '✓ Linked' ELSE '⚠ Null' END AS status
FROM jimpitan_sesi s
LEFT JOIN profiles p ON p.id = s.input_by
ORDER BY s.tanggal DESC
LIMIT 10;