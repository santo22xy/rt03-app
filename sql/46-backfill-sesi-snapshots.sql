-- =====================================================
-- SQL 46: BACKFILL SNAPSHOT FIELDS UNTUK RECORD EXISTING
-- =====================================================
-- FIX: Kolom inputter foreign key punya nama yang berbeda-beda
--      tergantung versi schema. Detect otomatis.
-- =====================================================

-- =====================================================
-- A. DETECT SCHEMA - Cari nama kolom yang relevan
-- =====================================================

SELECT '=== DETECT SCHEMA ===' AS section;
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'jimpitan_sesi'
  AND (
    column_name LIKE '%inputter%'
    OR column_name LIKE '%input_by%'
    OR column_name LIKE '%created_by%'
    OR column_name LIKE '%pencatat%'
    OR column_name LIKE '%petugas%'
    OR column_name = 'id_petugas'
  );

-- =====================================================
-- B. BACKFILL DINAMIS - coba beberapa kemungkinan nama
-- =====================================================

DO $$
DECLARE
  v_inputter_col TEXT;
  v_updated INT := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SECTION B: BACKFILL DINAMIS ===';

  -- Cari nama kolom inputter (prioritas: yang paling mungkin)
  SELECT column_name INTO v_inputter_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'jimpitan_sesi'
    AND data_type = 'uuid'
    AND (
      column_name LIKE '%inputter%'
      OR column_name LIKE '%input_by%'
      OR column_name LIKE '%created_by%'
      OR column_name LIKE '%petugas%'
      OR column_name LIKE '%pencatat%'
    )
  ORDER BY
    CASE column_name
      WHEN 'inputter_id' THEN 1
      WHEN 'input_by' THEN 2
      WHEN 'petugas_id' THEN 3
      WHEN 'pencatat_id' THEN 4
      WHEN 'created_by' THEN 5
      ELSE 6
    END
  LIMIT 1;

  IF v_inputter_col IS NULL THEN
    RAISE NOTICE '⚠ Tidak ada kolom UUID untuk inputter. Skip backfill dari profiles.';
    RAISE NOTICE '  Akan pakai placeholder saja.';
  ELSE
    RAISE NOTICE 'Kolom inputter terdeteksi: %', v_inputter_col;

    -- Backfill dengan dynamic column name
    EXECUTE format(
      'UPDATE jimpitan_sesi s
         SET nama_inputter_snapshot = COALESCE(s.nama_inputter_snapshot, p.nama_kk, ''(Tanpa Nama)''),
             blok_inputter_snapshot = COALESCE(s.blok_inputter_snapshot, p.blok, ''?'')
         FROM profiles p
         WHERE p.id = s.%I
           AND (s.nama_inputter_snapshot IS NULL OR s.blok_inputter_snapshot IS NULL)',
      v_inputter_col
    );
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'Backfilled % records dari profiles via kolom %', v_updated, v_inputter_col;
  END IF;
END $$;

-- =====================================================
-- C. PLACEHOLDER UNTUK ORPHAN RECORDS
-- =====================================================

DO $$
DECLARE
  v_updated INT := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SECTION C: PLACEHOLDER UNTUK RECORD NULL ===';

  UPDATE jimpitan_sesi
    SET
      nama_inputter_snapshot = COALESCE(nama_inputter_snapshot, 'Input Lama (Pra-Update)'),
      blok_inputter_snapshot = COALESCE(blok_inputter_snapshot, '?')
    WHERE nama_inputter_snapshot IS NULL OR blok_inputter_snapshot IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Filled placeholder for % records', v_updated;
END $$;

-- =====================================================
-- D. VERIFIKASI
-- =====================================================

SELECT '=== STATE SETELAH BACKFILL ===' AS section;
SELECT
  tanggal,
  nama_inputter_snapshot AS nama,
  blok_inputter_snapshot AS blok,
  status,
  to_char(waktu_mulai, 'YYYY-MM-DD HH24:MI') AS waktu_mulai
FROM jimpitan_sesi
ORDER BY created_at DESC NULLS LAST, tanggal DESC
LIMIT 10;

SELECT '=== SUMMARY ===' AS section;
SELECT
  COUNT(*) AS total_sesi,
  COUNT(*) FILTER (WHERE nama_inputter_snapshot IS NOT NULL) AS ada_nama,
  COUNT(*) FILTER (WHERE blok_inputter_snapshot IS NOT NULL) AS ada_blok
FROM jimpitan_sesi;