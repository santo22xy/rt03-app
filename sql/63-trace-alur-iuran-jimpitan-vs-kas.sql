-- =====================================================
-- SQL 63: Trace Alur Data Iuran — Jimpitan vs Buku Kas
-- Tujuan: jelaskan kenapa dashboard "Iuran Bulan Ini" muncul
--         tapi buku kas belum ada transaksi untuk tanggal ronda
-- =====================================================

-- =====================================================
-- A. Trigger & fungsi yang OTOMATIS jalan saat ACC sesi
-- =====================================================
SELECT '=== A. Trigger/fungsi aktif ===' AS section;
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'jimpitan_sesi'
ORDER BY trigger_name;

-- Fungsi: on_jimpitan_sesi_approved() → INSERT ke iuran_pembayaran (BUKAN kas_transaksi)
SELECT '=== A.2 Definisi on_jimpitan_sesi_approved() ===' AS section;
SELECT pg_get_functiondef(p.oid) AS function_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'on_jimpitan_sesi_approved'
  AND n.nspname = 'public';

-- =====================================================
-- B. Sesi Jimpitan Juni 2026 (status + total_pendapatan)
-- =====================================================
SELECT '=== B. Semua sesi Juni 2026 ===' AS section;
SELECT
  id,
  tanggal,
  status,
  total_pendapatan,
  jumlah_warga_bayar,
  approved_by,
  approved_at::date AS approved_date,
  input_by
FROM jimpitan_sesi
WHERE tanggal >= '2026-06-01' AND tanggal < '2026-07-01'
ORDER BY tanggal;

-- =====================================================
-- C. Buku Kas Juni 2026 (transaksi MASUK IURAN_BULANAN)
-- =====================================================
SELECT '=== C. Transaksi IURAN_BULANAN di kas_transaksi Juni ===' AS section;
SELECT
  tanggal,
  login_id,
  nominal,
  uraian,
  catatan
FROM kas_transaksi
WHERE tipe = 'MASUK' AND kategori = 'IURAN_BULANAN'
  AND tanggal >= '2026-06-01' AND tanggal < '2026-07-01'
ORDER BY tanggal, login_id;

-- =====================================================
-- D. Pembayaran Iuran (iuran_pembayaran) Juni 2026
-- Hasil trigger ACC sesi + import manual dari kas_transaksi
-- =====================================================
SELECT '=== D. iuran_pembayaran Juni 2026 ===' AS section;
SELECT
  ip.created_at::date AS tgl_catat,
  p.login_id,
  ip.nominal,
  ip.sumber,
  ip.bukti_ref,
  ip.catatan
FROM iuran_pembayaran ip
JOIN profiles p ON p.id = ip.profile_id
WHERE ip.periode_bulan = '2026-06-01'
ORDER BY ip.created_at, p.login_id;

-- =====================================================
-- E. Dashboard-relevant summary
-- =====================================================
SELECT '=== E. Summary ===' AS section;
SELECT
  (SELECT COUNT(*) FROM jimpitan_sesi WHERE status='APPROVED' AND tanggal BETWEEN '2026-06-01' AND '2026-06-30')
    AS sesi_approved_juni,
  (SELECT COALESCE(SUM(total_pendapatan),0) FROM jimpitan_sesi WHERE status='APPROVED' AND tanggal BETWEEN '2026-06-01' AND '2026-06-30')
    AS total_pendapatan_approved,
  (SELECT COUNT(*) FROM iuran_pembayaran WHERE periode_bulan='2026-06-01')
    AS iuran_pembayaran_rows,
  (SELECT COALESCE(SUM(nominal),0) FROM iuran_pembayaran WHERE periode_bulan='2026-06-01')
    AS total_iuran_pembayaran,
  (SELECT COUNT(*) FROM kas_transaksi WHERE tipe='MASUK' AND kategori='IURAN_BULANAN' AND tanggal BETWEEN '2026-06-01' AND '2026-06-30')
    AS kas_iuran_rows_juni,
  (SELECT COALESCE(SUM(nominal),0) FROM kas_transaksi WHERE tipe='MASUK' AND kategori='IURAN_BULANAN' AND tanggal BETWEEN '2026-06-01' AND '2026-06-30')
    AS kas_iuran_total_juni;