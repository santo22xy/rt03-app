-- =====================================================
-- DIAGNOSTIC: Cek A-5, B-4, C-6 di kas_transaksi & jimpitan_tagihan
-- Jalankan di SQL Editor Supabase untuk verifikasi
-- =====================================================

-- A. Transaksi di kas_transaksi untuk 3 KK tsb (Juni 2026)
SELECT
  kt.login_id,
  kt.nama_kk AS nama_di_transaksi,
  kt.tanggal,
  kt.nominal,
  kt.kategori,
  kt.catatan,
  kt.bukti_ref
FROM kas_transaksi kt
WHERE kt.tipe = 'MASUK'
  AND kt.kategori = 'IURAN_BULANAN'
  AND kt.login_id IN ('A-5', 'B-4', 'C-6')
ORDER BY kt.login_id, kt.tanggal;

-- B. Status tagihan Juni 2026 untuk 3 KK tsb
SELECT
  jt.login_id,
  jt.nama_kk_snapshot,
  jt.nominal_tagihan,
  jt.total_terbayar,
  (jt.nominal_tagihan - jt.total_terbayar) AS sisa,
  jt.status,
  jt.kategori
FROM jimpitan_tagihan jt
WHERE jt.periode_bulan = '2026-06-01'
  AND jt.login_id IN ('A-5', 'B-4', 'C-6')
ORDER BY jt.login_id;

-- C. Cross-check: Apakah ada di kas_transaksi tapi TIDAK masuk ke jimpitan_tagihan?
--    (kategori selain IURAN_BULANAN, atau nominal_type beda, dll)
SELECT
  kt.login_id,
  kt.nama_kk,
  kt.nominal,
  kt.kategori,
  kt.catatan,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM jimpitan_tagihan jt
      WHERE jt.login_id = kt.login_id AND jt.periode_bulan = '2026-06-01'
    ) THEN 'TIDAK ADA TAGIHAN JUNI'
    WHEN jt.total_terbayar = 0 THEN 'TAGIHAN ADA TAPI BELUM SYNC'
    WHEN jt.total_terbayar > 0 AND jt.total_terbayar < jt.nominal_tagihan THEN 'SUDAH SYNC CICIL'
    WHEN jt.total_terbayar >= jt.nominal_tagihan THEN 'SUDAH SYNC LUNAS/LEBIH'
  END AS sync_status
FROM kas_transaksi kt
LEFT JOIN jimpitan_tagihan jt
  ON jt.login_id = kt.login_id AND jt.periode_bulan = '2026-06-01'
WHERE kt.tipe = 'MASUK'
  AND kt.kategori = 'IURAN_BULANAN'
  AND kt.login_id IN ('A-5', 'B-4', 'C-6')
ORDER BY kt.login_id, kt.tanggal;
