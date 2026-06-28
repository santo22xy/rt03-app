-- =====================================================
-- 60: Dokumentasi schema aktual `jimpitan_detail`
--
-- Issue:
--   sql/20-ronda-jimpitan-tables.sql mendokumentasikan kolom
--     nama_snapshot, blok_snapshot, nomor_rumah_snapshot
--   tapi DB aktual punya
--     login_id, nama_kk_snapshot, status_bayar
--   Hasilnya code TypeScript nge-insert kolom yang tidak ada →
--     error: "Could not find the 'blok_snapshot' column in the schema cache".
--
-- Fix:
--   Tidak ada ALTER TABLE — DB sudah benar. Cukup dokumentasikan
--   schema aktual di file ini supaya source-of-truth match.
-- =====================================================

-- SECTION A: Schema dokumentasi aktual `jimpitan_detail`
SELECT '=== A. Schema aktual jimpitan_detail ===' AS section;
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'jimpitan_detail'
ORDER BY ordinal_position;

-- SECTION B: Schema aktual `jimpitan_sesi` (sanity)
SELECT '=== B. Schema aktual jimpitan_sesi ===' AS section;
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'jimpitan_sesi'
ORDER BY ordinal_position;

-- SECTION C: Verifikasi index UNIQUE (sesi_id, profile_id)
SELECT '=== C. UNIQUE INDEX di jimpitan_detail ===' AS section;
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'jimpitan_detail'
ORDER BY indexname;

-- SECTION D: Pastikan konsistensi is_bayar ↔ status_bayar
-- (dari SQL 48: is_bayar boolean ditambahkan supaya code pakai,
--  tapi status_bayar TEXT asli DB tetap dipakai untuk kompatibilitas)
SELECT '=== D. Backfill status_bayar dari is_bayar kalau ada yg null/beda ===' AS section;
UPDATE jimpitan_detail
SET status_bayar = CASE WHEN is_bayar THEN 'BAYAR' ELSE 'BELUM' END
WHERE status_bayar IS NULL
   OR (status_bayar = 'BAYAR' AND NOT is_bayar)
   OR (status_bayar <> 'BAYAR' AND is_bayar);

-- SECTION E: Refresh PostgREST schema cache
SELECT '=== E. Refresh PostgREST cache ===' AS section;
NOTIFY pgrst, 'reload schema';

-- SECTION F: Summary
SELECT '=== F. Summary ===' AS section;
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'jimpitan_detail'
     AND column_name IN ('nama_snapshot', 'blok_snapshot', 'nomor_rumah_snapshot')
  ) AS old_phantom_columns_should_be_0,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'jimpitan_detail'
     AND column_name IN ('login_id', 'nama_kk_snapshot', 'status_bayar', 'is_bayar')
  ) AS new_real_columns_should_be_4,
  CASE
    WHEN (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'jimpitan_detail'
            AND column_name IN ('nama_snapshot', 'blok_snapshot', 'nomor_rumah_snapshot')
         ) = 0
     AND (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'jimpitan_detail'
            AND column_name IN ('login_id', 'nama_kk_snapshot', 'status_bayar', 'is_bayar')
         ) = 4
    THEN '✅ Schema DB sesuai ekspektasi code'
    ELSE '❌ Schema drift — cek section A'
  END AS status;