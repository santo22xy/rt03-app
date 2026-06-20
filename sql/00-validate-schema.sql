-- =====================================================
-- 00: VALIDASI SCHEMA & DATA PRE-FLIGHT CHECK
-- Jalankan script ini DULUAN sebelum run 21 atau 22
-- Untuk tahu semua requirement, NOT NULL columns, FK, dan UNIQUE
-- Compatible dengan Supabase SQL editor (no \echo)
-- =====================================================

-- SECTION 1: NOT NULL COLUMNS di tabel-tabel yang dipakai
SELECT '=== 1. NOT NULL COLUMNS ===' AS section;
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'iuran_pembayaran','iuran_tagihan','iuran_tarif',
    'jimpitan_tarif','jimpitan_tagihan',
    'jadwal_ronda','ronda_swap','jimpitan_sesi','jimpitan_detail',
    'ronda_attendance','ronda_kelompok',
    'kas_transaksi','app_settings','profiles'
  )
  AND is_nullable = 'NO'
  AND column_name NOT IN ('id','created_at')
ORDER BY table_name, ordinal_position;

-- SECTION 2: UNIQUE CONSTRAINTS & INDEXES
SELECT '=== 2. UNIQUE CONSTRAINTS & INDEXES ===' AS section;
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN (
    'iuran_pembayaran','iuran_tagihan','iuran_tarif',
    'jimpitan_tarif','jimpitan_tagihan',
    'jadwal_ronda','ronda_swap','jimpitan_sesi','jimpitan_detail',
    'ronda_attendance','ronda_kelompok',
    'kas_transaksi','app_settings','profiles'
  )
  AND tc.constraint_type IN ('UNIQUE','PRIMARY KEY','FOREIGN KEY')
GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- SECTION 3: CEK TABEL APA SAJA YANG ADA
SELECT '=== 3. TABEL EXISTENCE CHECK ===' AS section;
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

-- SECTION 4: ROW COUNTS
SELECT '=== 4. ROW COUNTS ===' AS section;
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

-- SECTION 5: iuran_pembayaran FULL SCHEMA
SELECT '=== 5. iuran_pembayaran SCHEMA ===' AS section;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'iuran_pembayaran'
ORDER BY ordinal_position;

-- SECTION 6: FK yang reference profiles
SELECT '=== 6. FK TO profiles ===' AS section;
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
  AND tc.table_schema = ccu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'profiles'
ORDER BY tc.table_name, kcu.column_name;

-- SECTION 7: LOGIN_ID apa saja yang ada di profiles
SELECT '=== 7. PROFILES LIST ===' AS section;
SELECT login_id, nama_kk, blok, nomor_rumah, role, is_active
FROM profiles
ORDER BY login_id;

-- SECTION 8: SIMULASI INSERT iuran_pembayaran (DRY RUN)
SELECT '=== 8. DRY RUN SIMULASI PEMBAYARAN ===' AS section;
WITH pembayaran_simulasi AS (
  SELECT
    jp.login_id,
    jp.profile_id,
    t.id AS tagihan_id,
    t.periode_bulan,
    t.nominal_tagihan,
    COALESCE(SUM(kt.nominal) FILTER (WHERE kt.tipe = 'MASUK' AND kt.kategori = 'IURAN_BULANAN'), 0) AS total_bayar
  FROM jimpitan_tagihan t
  JOIN jimpitan_tarif jp ON jp.profile_id = t.profile_id
  LEFT JOIN kas_transaksi kt ON kt.login_id = jp.login_id AND kt.tipe = 'MASUK' AND kt.kategori = 'IURAN_BULANAN'
  WHERE t.periode_bulan = '2026-06-01'
  GROUP BY jp.login_id, jp.profile_id, t.id, t.periode_bulan, t.nominal_tagihan
)
SELECT * FROM pembayaran_simulasi ORDER BY login_id LIMIT 30;

-- SECTION 9: RLS POLICIES
SELECT '=== 9. RLS POLICIES ===' AS section;
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('iuran_pembayaran','iuran_tagihan','jadwal_ronda','kas_transaksi','jimpitan_tarif','jimpitan_tagihan')
ORDER BY tablename, policyname;

-- SECTION 10: FULL SCHEMA untuk tabel yang sering bermasalah
SELECT '=== 10. FULL SCHEMA DETAIL ===' AS section;
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('iuran_pembayaran','iuran_tagihan','jadwal_ronda','kas_transaksi','jimpitan_tarif','jimpitan_tagihan')
ORDER BY c.table_name, c.ordinal_position;

-- DONE
SELECT '=== DONE. Review output di atas ===' AS done;
