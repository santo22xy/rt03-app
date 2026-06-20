-- =====================================================
-- 99c: CEK kenapa tagihan warga gak ke-update
-- Run di Supabase SQL Editor
-- =====================================================

-- A. Tagihan A-1 di jimpitan_tagihan
SELECT '=== A. JIMPITAN_TAGIHAN A-1 ===' AS section;
SELECT login_id, periode_bulan, nominal_tagihan, total_terbayar, status, kategori
FROM jimpitan_tagihan
WHERE login_id = 'A-1';

-- B. Pembayaran A-1 di kas_transaksi
SELECT '=== B. KAS_TRANSAAKSI A-1 ===' AS section;
SELECT tanggal, kategori, uraian, nominal, login_id
FROM kas_transaksi
WHERE login_id = 'A-1'
ORDER BY tanggal;

-- C. Pembayaran A-1 di iuran_pembayaran (kalau ada)
SELECT '=== C. IURAN_PEMBAYARAN A-1 ===' AS section;
SELECT nominal, metode, created_at, catatan
FROM iuran_pembayaran
WHERE login_id = 'A-1';

-- D. Test query yang dipakai WARGA view (simulasi)
SELECT '=== D. SIMULASI QUERY WARGA ===' AS section;
SELECT
  t.login_id,
  t.periode_bulan,
  t.nominal_tagihan,
  t.total_terbayar,
  t.status,
  EXTRACT(YEAR FROM t.periode_bulan) AS tahun
FROM jimpitan_tagihan t
WHERE t.login_id = 'A-1'
  AND EXTRACT(YEAR FROM t.periode_bulan) = 2026;

-- E. Test RLS — query sebagai anon, harusnya 0 row
SELECT '=== E. RLS CHECK (jika 0 row = anon di-block) ===' AS section;
SELECT COUNT(*) AS tagihan_visible_to_anon
FROM jimpitan_tagihan
WHERE login_id = 'A-1';

-- F. Jadwal ronda
SELECT '=== F. JADWAL RONDA ===' AS section;
SELECT tanggal, minggu_ke, nama_penjaga_snapshot, blok_snapshot
FROM jadwal_ronda
WHERE tahun = 2026
ORDER BY tanggal;
