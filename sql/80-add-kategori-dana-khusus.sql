-- =====================================================
-- SQL 80: Tambah kategori DANA_KHUSUS ke kas_kategori
-- FIX Problem #5: kategori kas khusus untuk transaksi dana khusus
-- Schema kas_kategori: (id, tipe, kode, label, urutan, is_active, ...)
-- =====================================================

INSERT INTO kas_kategori (tipe, kode, label, urutan)
VALUES ('MASUK', 'DANA_KHUSUS', 'Dana Khusus', 5)
ON CONFLICT (tipe, kode) DO UPDATE SET
  label = EXCLUDED.label,
  is_active = TRUE,
  urutan = EXCLUDED.urutan;

-- Verifikasi
SELECT 'a_kategori' AS s, tipe, kode, label, urutan, is_active
FROM kas_kategori
WHERE kode = 'DANA_KHUSUS'
ORDER BY tipe, urutan;

SELECT 'b_all_kategori_masuk' AS s, kode, label, urutan
FROM kas_kategori
WHERE tipe = 'MASUK' AND is_active = TRUE
ORDER BY urutan;

NOTIFY pgrst, 'reload schema';
