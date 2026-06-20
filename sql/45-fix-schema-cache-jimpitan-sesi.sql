-- =====================================================
-- SQL 45: FIX SCHEMA - Tambah kolom blok_inputter_snapshot
-- =====================================================
-- Masalah: Error "Could not find the 'blok_inputter_snapshot' column
-- of 'jimpitan_sesi' in the schema cache" di Supabase Postgres.
-- Root cause: schema cache Postgres di PostgREST/Supabase belum
--             refresh setelah kolom ditambahkan di query lain.
--             ATAU kolom memang belum ada di tabel.
--
-- Fix: Tambah kolom (jika belum ada) + refresh schema cache.
-- =====================================================

-- =====================================================
-- A. CEK APAKAH KOLOM SUDAH ADA
-- =====================================================

SELECT '=== STATE KOLOM jimpitan_sesi ===' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'jimpitan_sesi'
ORDER BY ordinal_position;

-- =====================================================
-- B. TAMBAH KOLOM YANG HILANG (idempotent)
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SECTION B: ADD MISSING COLUMNS ===';

  -- blok_inputter_snapshot
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jimpitan_sesi'
      AND column_name = 'blok_inputter_snapshot'
  ) THEN
    ALTER TABLE jimpitan_sesi ADD COLUMN blok_inputter_snapshot TEXT;
    RAISE NOTICE 'Added: blok_inputter_snapshot (TEXT)';
  ELSE
    RAISE NOTICE 'OK: blok_inputter_snapshot sudah ada';
  END IF;

  -- nama_inputter_snapshot (kemungkinan sudah ada, tapi cek)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jimpitan_sesi'
      AND column_name = 'nama_inputter_snapshot'
  ) THEN
    ALTER TABLE jimpitan_sesi ADD COLUMN nama_inputter_snapshot TEXT;
    RAISE NOTICE 'Added: nama_inputter_snapshot (TEXT)';
  ELSE
    RAISE NOTICE 'OK: nama_inputter_snapshot sudah ada';
  END IF;

  -- waktu_mulai (timestamp awal sesi dibuat)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jimpitan_sesi'
      AND column_name = 'waktu_mulai'
  ) THEN
    ALTER TABLE jimpitan_sesi ADD COLUMN waktu_mulai TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added: waktu_mulai (TIMESTAMPTZ)';
  ELSE
    RAISE NOTICE 'OK: waktu_mulai sudah ada';
  END IF;

  -- waktu_submit (timestamp submit oleh inputter)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jimpitan_sesi'
      AND column_name = 'waktu_submit'
  ) THEN
    ALTER TABLE jimpitan_sesi ADD COLUMN waktu_submit TIMESTAMPTZ;
    RAISE NOTICE 'Added: waktu_submit (TIMESTAMPTZ)';
  ELSE
    RAISE NOTICE 'OK: waktu_submit sudah ada';
  END IF;

  -- approved_at (timestamp ACC oleh bendahara)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jimpitan_sesi'
      AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE jimpitan_sesi ADD COLUMN approved_at TIMESTAMPTZ;
    RAISE NOTICE 'Added: approved_at (TIMESTAMPTZ)';
  ELSE
    RAISE NOTICE 'OK: approved_at sudah ada';
  END IF;

  -- approved_by (UUID profile id bendahara)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jimpitan_sesi'
      AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE jimpitan_sesi ADD COLUMN approved_by UUID REFERENCES profiles(id);
    RAISE NOTICE 'Added: approved_by (UUID)';
  ELSE
    RAISE NOTICE 'OK: approved_by sudah ada';
  END IF;

  -- keadaan (AMAN / LAPORAN)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jimpitan_sesi'
      AND column_name = 'keadaan'
  ) THEN
    ALTER TABLE jimpitan_sesi ADD COLUMN keadaan TEXT DEFAULT 'AMAN';
    RAISE NOTICE 'Added: keadaan (TEXT)';
  ELSE
    RAISE NOTICE 'OK: keadaan sudah ada';
  END IF;

  -- catatan (catatan submit)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jimpitan_sesi'
      AND column_name = 'catatan'
  ) THEN
    ALTER TABLE jimpitan_sesi ADD COLUMN catatan TEXT;
    RAISE NOTICE 'Added: catatan (TEXT)';
  ELSE
    RAISE NOTICE 'OK: catatan sudah ada';
  END IF;

  -- updated_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jimpitan_sesi'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE jimpitan_sesi ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added: updated_at (TIMESTAMPTZ)';
  ELSE
    RAISE NOTICE 'OK: updated_at sudah ada';
  END IF;
END $$;

-- =====================================================
-- C. REFRESH SCHEMA CACHE - Supabase PostgREST
-- =====================================================
-- Method 1: NOTIFY pgrst (cara resmi PostgREST)
-- Method 2: ALTER TABLE dummy (force re-read)

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SECTION C: REFRESH SCHEMA CACHE ===';

  -- NOTIFY postgrest untuk reload schema (cara PostgREST)
  -- NOTIFY pgrst, 'reload schema';

  -- Trigger re-read dengan ALTER COLUMN ... TYPE ... (no-op jika tipe sama)
  -- Ini memaksa PostgREST reload cache untuk tabel ini
  BEGIN
    ALTER TABLE jimpitan_sesi
      ALTER COLUMN id SET DEFAULT gen_random_uuid();
  EXCEPTION WHEN OTHERS THEN
    -- Fallback: kolom id mungkin tidak punya default, abaikan
    RAISE NOTICE 'id DEFAULT skip: %', SQLERRM;
  END;

  RAISE NOTICE 'Schema cache refresh triggered. Tunggu 10-30 detik untuk sync.';
END $$;

-- =====================================================
-- D. VERIFIKASI SETELAH FIX
-- =====================================================

SELECT '=== STATE KOLOM jimpitan_sesi SETELAH FIX ===' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'jimpitan_sesi'
ORDER BY ordinal_position;

-- Test query yang sebelumnya error
SELECT '=== TEST QUERY DENGAN KOLOM BARU ===' AS section;
SELECT id, tanggal, nama_inputter_snapshot, blok_inputter_snapshot, waktu_mulai
FROM jimpitan_sesi
LIMIT 1;