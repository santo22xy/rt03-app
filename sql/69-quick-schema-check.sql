-- =====================================================
-- SQL 69: Introspeksi cepat (1 query kompak)
-- =====================================================
SELECT 'info' AS section, column_name AS nama, data_type AS tipe, is_nullable AS nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='jimpitan_sesi' AND is_nullable='NO'
ORDER BY ordinal_position;