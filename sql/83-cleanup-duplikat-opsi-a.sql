-- =====================================================
-- SQL 83: CLEANUP duplikat - Opsi A
--
-- Strategi: Keep 2 entry auto JMP-20260606 & JMP-20260613
--           Hapus 33 entry manual IURAN_BULANAN tanggal 16 Juni 2026
--
-- SAFETY: Sebelum hapus, migrate data ke iuran_pembayaran
--         (kalau login_id ada) supaya data warga tidak hilang
-- =====================================================

-- =====================================================
-- STEP 1: Preview 33 entry manual yang akan dihapus
-- =====================================================
SELECT 'a_preview_delete' AS s,
  id,
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
WHERE tanggal = '2026-06-16'
  AND kategori = 'IURAN_BULANAN'
ORDER BY created_at;

-- =====================================================
-- STEP 2: Cek apakah login_id tersedia (kalau ada, migrate dulu)
-- =====================================================
SELECT 'b_login_id_check' AS s,
  COUNT(*) AS total_entries,
  COUNT(login_id) AS with_login_id,
  COUNT(*) - COUNT(login_id) AS without_login_id,
  SUM(nominal) AS total_nominal,
  COUNT(DISTINCT login_id) AS unique_warga
FROM kas_transaksi
WHERE tanggal = '2026-06-16'
  AND kategori = 'IURAN_BULANAN';

-- =====================================================
-- STEP 3: Mapping manual entry → iuran_pembayaran
-- Cek entry mana yang akan dibuatkan iuran_pembayaran
-- =====================================================
SELECT 'c_pembayaran_preview' AS s,
  kt.id AS kas_id,
  kt.login_id,
  kt.nominal,
  kt.tanggal::text,
  kt.catatan AS kas_catatan,
  p.id AS profile_id,
  p.nama_kk,
  -- Cek apakah iuran_pembayaran sudah ada
  EXISTS (
    SELECT 1 FROM iuran_pembayaran ip
    WHERE ip.profile_id = p.id
      AND ip.periode_bulan = '2026-06-01'
      AND ip.nominal = kt.nominal
  ) AS already_has_pembayaran
FROM kas_transaksi kt
LEFT JOIN profiles p ON p.login_id = kt.login_id
WHERE kt.tanggal = '2026-06-16'
  AND kt.kategori = 'IURAN_BULANAN'
ORDER BY kt.login_id;

-- =====================================================
-- STEP 4: Migrate ke iuran_pembayaran
-- Hanya untuk entry dengan login_id valid & belum ada iuran_pembayaran
-- Insert dengan periode_bulan = '2026-06-01' (asumsi bulan Juni)
-- =====================================================
DO $mig$
DECLARE
  v_kt RECORD;
  v_inserted INT := 0;
  v_skipped INT := 0;
BEGIN
  FOR v_kt IN
    SELECT kt.id, kt.login_id, kt.nominal, kt.tanggal, kt.catatan
    FROM kas_transaksi kt
    INNER JOIN profiles p ON p.login_id = kt.login_id
    WHERE kt.tanggal = '2026-06-16'
      AND kt.kategori = 'IURAN_BULANAN'
      AND kt.login_id IS NOT NULL
      -- Skip kalau iuran_pembayaran sudah ada
      AND NOT EXISTS (
        SELECT 1 FROM iuran_pembayaran ip
        WHERE ip.profile_id = p.id
          AND ip.periode_bulan = '2026-06-01'
          AND ip.nominal = kt.nominal
      )
  LOOP
    INSERT INTO iuran_pembayaran (
      profile_id, login_id, periode_bulan, nominal,
      tanggal_bayar, metode_bayar, catatan, confirmed, bukti_ref
    )
    SELECT
      p.id, p.login_id, '2026-06-01', v_kt.nominal,
      v_kt.tanggal, 'TUNAI',
      COALESCE(v_kt.catatan, 'Migrasi dari kas_transaksi manual 16 Jun 2026'),
      TRUE, 'MIGRATE-KT-' || v_kt.id
    FROM profiles p
    WHERE p.login_id = v_kt.login_id;

    v_inserted := v_inserted + 1;
  END LOOP;

  RAISE NOTICE 'Migrated % entries to iuran_pembayaran', v_inserted;
END $mig$;

-- =====================================================
-- STEP 5: VERIFIKASI post-migration - apakah duplikat iuran_pembayaran terjadi?
-- =====================================================
SELECT 'd_post_migrate_check' AS s,
  login_id,
  COUNT(*) AS pembayaran_count,
  SUM(nominal) AS total_nominal
FROM iuran_pembayaran
WHERE periode_bulan = '2026-06-01'
GROUP BY login_id
HAVING COUNT(*) > 1
ORDER BY pembayaran_count DESC
LIMIT 10;

-- =====================================================
-- STEP 6: BARU HAPUS 33 entry manual dari kas_transaksi
-- Hanya hapus entry IURAN_BULANAN tanggal 16 Juni 2026
-- JANGAN sentuh entry DANA_KHUSUS atau auto JMP-* / DKH-*
-- =====================================================
DO $del$
DECLARE
  v_deleted INT := 0;
BEGIN
  DELETE FROM kas_transaksi
  WHERE tanggal = '2026-06-16'
    AND kategori = 'IURAN_BULANAN';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % kas_transaksi entries (manual IURAN_BULANAN 16 Juni)', v_deleted;
END $del$;

-- =====================================================
-- STEP 7: VERIFIKASI FINAL - saldo buku kas
-- =====================================================
SELECT 'e_post_delete_summary' AS s,
  tanggal::text,
  COUNT(*) AS jumlah_trx,
  SUM(nominal) FILTER (WHERE tipe = 'MASUK') AS total_masuk,
  SUM(nominal) FILTER (WHERE tipe = 'KELUAR') AS total_keluar
FROM kas_transaksi
WHERE tanggal BETWEEN '2026-06-01' AND '2026-06-30'
GROUP BY tanggal
ORDER BY tanggal;

-- =====================================================
-- STEP 8: Running balance (saldo berjalan) sampai 21 Juni 2026
-- =====================================================
SELECT 'f_saldo_berjalan' AS s,
  sub.tanggal::text,
  sub.masuk,
  sub.keluar,
  sub.net,
  SUM(sub.net) OVER (ORDER BY sub.tanggal) AS saldo_berjalan
FROM (
  SELECT
    tanggal,
    SUM(nominal) FILTER (WHERE tipe = 'MASUK') AS masuk,
    SUM(nominal) FILTER (WHERE tipe = 'KELUAR') AS keluar,
    SUM(nominal) FILTER (WHERE tipe = 'MASUK')
      - SUM(nominal) FILTER (WHERE tipe = 'KELUAR') AS net
  FROM kas_transaksi
  WHERE tanggal BETWEEN '2026-06-01' AND '2026-06-30'
  GROUP BY tanggal
) sub
ORDER BY sub.tanggal;

-- =====================================================
-- STEP 9: iuran_pembayaran Juni 2026 summary
-- =====================================================
SELECT 'g_pembayaran_juni' AS s,
  COUNT(*) AS total_pembayaran,
  COUNT(DISTINCT profile_id) AS jumlah_warga,
  SUM(nominal) AS total_nominal,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '5 minutes') AS migrated_count
FROM iuran_pembayaran
WHERE periode_bulan = '2026-06-01';

-- =====================================================
-- STEP 10: jimpitan_tagihan Juni 2026 - status warga update dari trigger?
-- =====================================================
SELECT 'h_tagihan_juni_status' AS s,
  COUNT(*) AS total_tagihan,
  COUNT(*) FILTER (WHERE status = 'LUNAS') AS lunas,
  COUNT(*) FILTER (WHERE status = 'CICIL') AS cicil,
  COUNT(*) FILTER (WHERE status = 'BELUM') AS belum,
  COUNT(*) FILTER (WHERE status = 'LEBIH') AS lebih,
  SUM(total_terbayar) AS sum_terbayar,
  SUM(nominal_tagihan) AS sum_tagihan
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01';

NOTIFY pgrst, 'reload schema';
