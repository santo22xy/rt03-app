-- =====================================================
-- SQL 68: Introspeksi schema aktual jimpitan_sesi & jimpitan_detail
-- =====================================================

-- A. Kolom jimpitan_sesi (beserta is_nullable & column_default)
SELECT '=== A. Kolom jimpitan_sesi ===' AS section;
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'jimpitan_sesi'
ORDER BY ordinal_position;

-- B. Kolom jimpitan_detail
SELECT '=== B. Kolom jimpitan_detail ===' AS section;
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'jimpitan_detail'
ORDER BY ordinal_position;

-- C. Cek sesi 6 & 13 Juni ada atau tidak
SELECT '=== C. Sesi Juni ===' AS section;
SELECT id, tanggal, status, total_pendapatan, input_by
FROM jimpitan_sesi
WHERE tanggal BETWEEN '2026-06-01' AND '2026-06-30'
ORDER BY tanggal;

-- D. Cek data kas_transaksi untuk "06 Juni 2026" & "13 Juni 2026"
SELECT '=== D.1 Kas transaksi LIKE 06 Juni 2026 ===' AS section;
SELECT COUNT(*) AS rows, COALESCE(SUM(nominal),0) AS total
FROM kas_transaksi
WHERE tipe='MASUK' AND kategori='IURAN_BULANAN'
  AND catatan LIKE '%06 Juni 2026%';

SELECT '=== D.2 Kas transaksi LIKE 13 Juni 2026 ===' AS section;
SELECT COUNT(*) AS rows, COALESCE(SUM(nominal),0) AS total
FROM kas_transaksi
WHERE tipe='MASUK' AND kategori='IURAN_BULANAN'
  AND catatan LIKE '%13 Juni 2026%';

-- F. Constraint NOT NULL info per kolom untuk jimpitan_sesi (sangat ringkas)
SELECT '=== F. NOT NULL kolom jimpitan_sesi ===' AS section;
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='jimpitan_sesi' AND is_nullable='NO'
ORDER BY ordinal_position;

-- E. Sample catatan kas_transaksi IURAN_BULANAN Juni (variasi format)
SELECT '=== E. Sample catatan kas_transaksi IURAN_BULANAN Juni ===' AS section;
SELECT DISTINCT catatan
FROM kas_transaksi
WHERE tipe='MASUK' AND kategori='IURAN_BULANAN'
  AND tanggal BETWEEN '2026-06-01' AND '2026-06-30'
ORDER BY catatan
LIMIT 20;