-- =====================================================
-- Quick check tagihan update dari STEP A
-- =====================================================

-- A. Summary per status
SELECT 'A. SUMMARY PER STATUS' AS section;
SELECT status, COUNT(*) AS jumlah,
  SUM(nominal_tagihan) AS total_tagihan,
  SUM(total_terbayar) AS total_dibayar
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01'
GROUP BY status
ORDER BY status;

-- B. A-1 specific
SELECT 'B. A-1 SPECIFIC' AS section;
SELECT login_id, nominal_tagihan, total_terbayar, status, kategori
FROM jimpitan_tagihan
WHERE login_id = 'A-1' AND periode_bulan = '2026-06-01';

-- C. LUNAS
SELECT 'C. WARGA LUNAS' AS section;
SELECT login_id, nama_kk_snapshot, nominal_tagihan, total_terbayar
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01' AND status = 'LUNAS'
ORDER BY login_id;

-- D. SEBAGIAN
SELECT 'D. WARGA SEBAGIAN' AS section;
SELECT login_id, nama_kk_snapshot, nominal_tagihan, total_terbayar, status
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01' AND status = 'SEBAGIAN'
ORDER BY login_id;

-- E. BELUM BAYAR
SELECT 'E. WARGA BELUM BAYAR' AS section;
SELECT login_id, nama_kk_snapshot, nominal_tagihan, total_terbayar, status
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01' AND status = 'BELUM_BAYAR'
ORDER BY login_id;

-- F. JADWAL RONDA + count anggota
SELECT 'F. JADWAL RONDA + ANGGOTA' AS section;
SELECT
  jr.tanggal,
  jr.minggu_ke,
  jr.nama_penjaga_snapshot AS ketua,
  (SELECT COUNT(*) FROM ronda_kelompok WHERE kelompok_id = 'K' || jr.minggu_ke AND is_active = TRUE) AS jumlah_anggota
FROM jadwal_ronda jr
WHERE jr.tahun = 2026
ORDER BY jr.tanggal;
