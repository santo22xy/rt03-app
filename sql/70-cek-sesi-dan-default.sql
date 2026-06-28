-- =====================================================
-- SQL 70: Cek apakah sesi 6 & 13 ada + cek default total_pendapatan
-- =====================================================
SELECT 'sesi_juni' AS section, tanggal::text, status, total_pendapatan
FROM jimpitan_sesi
WHERE tanggal BETWEEN '2026-06-01' AND '2026-06-30'
ORDER BY tanggal;

SELECT 'default_check' AS section, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='jimpitan_sesi'
  AND column_name IN ('total_pendapatan', 'status', 'tanggal');

SELECT 'all_columns_jimpitan_sesi' AS section, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='jimpitan_sesi'
ORDER BY ordinal_position;

SELECT 'all_columns_jimpitan_detail' AS section, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='jimpitan_detail'
ORDER BY ordinal_position;