-- =====================================================
-- 36-DIAG-CEK-FINANCIAL-DATA
-- Script untuk memastikan data finansial dashboard tersinkron.
-- Run di Supabase SQL Editor.
--
-- Output diharapkan (juni 2026):
--   A. jumlah jimpitan_tagihan untuk 2026-06-01 ≈ 29 row
--      (sum nominal_tagihan seharusnya > 0)
--   B. jumlah jimpitan_sesi status=ACC bulan 6/2026 > 0
--      (sum total_pendapatan seharusnya > 0)
--   C. profile is_active count total = 30 (29 warga + 1 X-0 admin)
--      tanpa X-0 = 29
-- =====================================================

-- A. Tagihan Juni 2026
SELECT '=== A. JIMPITAN_TAGIHAN JUNI 2026 ===' AS section;
SELECT
  COUNT(*) AS jumlah_tagihan,
  SUM(nominal_tagihan) AS total_nominal,
  SUM(total_terbayar) AS total_terbayar,
  SUM(nominal_tagihan - total_terbayar) AS total_sisa,
  COUNT(*) FILTER (WHERE status = 'LUNAS') AS lunas_count,
  COUNT(*) FILTER (WHERE status = 'CICIL') AS cicil_count,
  COUNT(*) FILTER (WHERE status = 'BELUM') AS belum_count
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01';

-- B. Sesi Jimpitan ACC bulan ini
SELECT '=== B. JIMPITAN_SESI ACC JUNI 2026 ===' AS section;
SELECT
  COUNT(*) AS jumlah_sesi,
  SUM(total_pendapatan) AS total_pendapatan
FROM jimpitan_sesi
WHERE status = 'ACC'
  AND tanggal >= '2026-06-01'
  AND tanggal < '2026-07-01';

-- C. Profile is_active (warga aktif)
SELECT '=== C. PROFILES IS_ACTIVE ===' AS section;
SELECT
  COUNT(*) AS total_aktif,
  COUNT(*) FILTER (WHERE login_id != 'X-0') AS warga_aktif_dashboard,
  COUNT(*) FILTER (WHERE role = 'WARGA') AS role_warga,
  COUNT(*) FILTER (WHERE role IN ('KETUA_RT','BENDAHARA','SEKRETARIS','PENGURUS')) AS pengurus,
  COUNT(*) FILTER (WHERE role = 'SUPERADMIN') AS superadmin
FROM profiles
WHERE is_active = TRUE;

-- D. Detail B-5 (Budi Setiawan)
SELECT '=== D. JIMPITAN_TAGIHAN B-5 ===' AS section;
SELECT login_id, periode_bulan, nominal_tagihan, total_terbayar, status
FROM jimpitan_tagihan
WHERE login_id = 'B-5'
ORDER BY periode_bulan DESC
LIMIT 5;

-- E. Sample jimpitan_sesi terbaru
SELECT '=== E. JIMPITAN_SESI 5 TERBARU ===' AS section;
SELECT id, tanggal, status, total_pendapatan, nama_petugas_snapshot
FROM jimpitan_sesi
ORDER BY tanggal DESC
LIMIT 5;