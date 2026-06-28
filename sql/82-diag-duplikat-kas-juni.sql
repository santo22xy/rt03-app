-- =====================================================
-- SQL 82: Diagnosa duplikat kas_transaksi Juni 2026
--
-- Tujuan: Cari entry duplikat di tanggal 6, 13, 16, 20 Juni 2026
-- (terutama yang auto-generated oleh trigger ACC + backfill manual)
-- =====================================================

-- =====================================================
-- A. Semua transaksi Juni 2026 grouped by tanggal
-- =====================================================
SELECT 'a_juni_per_tanggal' AS s,
  tanggal::text,
  COUNT(*) AS jumlah_trx,
  COUNT(*) FILTER (WHERE tipe = 'MASUK') AS jumlah_masuk,
  COUNT(*) FILTER (WHERE tipe = 'KELUAR') AS jumlah_keluar,
  SUM(nominal) FILTER (WHERE tipe = 'MASUK') AS total_masuk,
  SUM(nominal) FILTER (WHERE tipe = 'KELUAR') AS total_keluar
FROM kas_transaksi
WHERE tanggal BETWEEN '2026-06-01' AND '2026-06-30'
GROUP BY tanggal
ORDER BY tanggal;

-- =====================================================
-- B. Detail lengkap 6, 13, 16, 20 Juni 2026
-- =====================================================
SELECT 'b_detail_4_tanggal' AS s,
  tanggal::text,
  tipe,
  kategori,
  uraian,
  nominal,
  trx_id_external,
  login_id,
  catatan,
  created_by,
  created_at::text
FROM kas_transaksi
WHERE tanggal IN ('2026-06-06', '2026-06-13', '2026-06-16', '2026-06-20')
ORDER BY tanggal, created_at;

-- =====================================================
-- C. Deteksi duplikat (group by tanggal + nominal + kategori)
-- =====================================================
SELECT 'c_duplikat_groups' AS s,
  tanggal::text,
  kategori,
  tipe,
  nominal,
  COUNT(*) AS jumlah_duplikat,
  ARRAY_AGG(trx_id_external ORDER BY created_at) AS external_ids,
  ARRAY_AGG(created_by ORDER BY created_at) AS created_by_list,
  ARRAY_AGG(uraian ORDER BY created_at) AS uraian_list
FROM kas_transaksi
WHERE tanggal BETWEEN '2026-06-01' AND '2026-06-30'
GROUP BY tanggal, kategori, tipe, nominal
HAVING COUNT(*) > 1
ORDER BY jumlah_duplikat DESC, tanggal;

-- =====================================================
-- D. Khusus duplikat JMP-* (entry auto dari trigger ACC)
-- =====================================================
SELECT 'd_jmp_duplikat' AS s,
  trx_id_external,
  tanggal::text,
  nominal,
  uraian,
  created_by,
  created_at::text
FROM kas_transaksi
WHERE trx_id_external LIKE 'JMP-%'
   OR trx_id_external LIKE 'DKH-%'
ORDER BY tanggal, created_at;

-- =====================================================
-- E. Ringkasan saldo akhir 16 Juni (sebelum ada koreksi)
-- =====================================================
SELECT 'e_saldo_16_juni' AS s,
  COUNT(*) AS total_trx,
  SUM(nominal) FILTER (WHERE tipe = 'MASUK') AS total_masuk,
  SUM(nominal) FILTER (WHERE tipe = 'KELUAR') AS total_keluar,
  SUM(nominal) FILTER (WHERE tipe = 'MASUK') - SUM(nominal) FILTER (WHERE tipe = 'KELUAR') AS net_16_juni
FROM kas_transaksi
WHERE tanggal = '2026-06-16';

-- =====================================================
-- F. Siapa saja yang create transaksi 16 Juni?
-- =====================================================
SELECT 'f_created_by_16_juni' AS s,
  created_by,
  kategori,
  COUNT(*) AS jumlah
FROM kas_transaksi
WHERE tanggal = '2026-06-16'
GROUP BY created_by, kategori
ORDER BY created_by, jumlah DESC;

NOTIFY pgrst, 'reload schema';
