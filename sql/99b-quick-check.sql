-- =====================================================
-- 99b: QUICK CHECK KHUSUS SEBELUM RUN 21
-- Jalankan query ini, paste semua output
-- =====================================================

-- A. Tabel existence
SELECT 'A. TABEL EXISTENCE' AS section;
SELECT
  expected.tbl AS table_name,
  CASE WHEN t.table_name IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (VALUES
  ('profiles'),
  ('iuran_tarif'),('iuran_tagihan'),('iuran_pembayaran'),
  ('jadwal_ronda'),('ronda_swap'),('ronda_attendance'),('ronda_kelompok'),
  ('jimpitan_sesi'),('jimpitan_detail'),('jimpitan_tarif'),('jimpitan_tagihan'),
  ('kas_transaksi'),('app_settings')
) AS expected(tbl)
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = expected.tbl
ORDER BY status DESC, expected.tbl;

-- B. Row counts
SELECT 'B. ROW COUNTS' AS section;
SELECT 'profiles' AS tbl, COUNT(*) AS rows FROM profiles
UNION ALL SELECT 'iuran_tarif', COUNT(*) FROM iuran_tarif
UNION ALL SELECT 'iuran_tagihan', COUNT(*) FROM iuran_tagihan
UNION ALL SELECT 'iuran_pembayaran', COUNT(*) FROM iuran_pembayaran
UNION ALL SELECT 'jadwal_ronda', COUNT(*) FROM jadwal_ronda
UNION ALL SELECT 'ronda_kelompok', COUNT(*) FROM ronda_kelompok
UNION ALL SELECT 'ronda_swap', COUNT(*) FROM ronda_swap
UNION ALL SELECT 'jimpitan_sesi', COUNT(*) FROM jimpitan_sesi
UNION ALL SELECT 'jimpitan_detail', COUNT(*) FROM jimpitan_detail
UNION ALL SELECT 'jimpitan_tarif', COUNT(*) FROM jimpitan_tarif
UNION ALL SELECT 'jimpitan_tagihan', COUNT(*) FROM jimpitan_tagihan
UNION ALL SELECT 'kas_transaksi', COUNT(*) FROM kas_transaksi
UNION ALL SELECT 'app_settings', COUNT(*) FROM app_settings
ORDER BY tbl;

-- C. RLS policies
SELECT 'C. RLS POLICIES' AS section;
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('iuran_pembayaran','iuran_tagihan','jadwal_ronda','kas_transaksi','jimpitan_tarif','jimpitan_tagihan')
ORDER BY tablename, policyname;

-- D. Profile pengurus harus ada
SELECT 'D. PROFIL PENGURUS' AS section;
SELECT login_id, nama_kk, role
FROM profiles
WHERE login_id IN ('B-1','B-5','C-2')
ORDER BY login_id;
