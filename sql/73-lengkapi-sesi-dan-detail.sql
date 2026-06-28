-- =====================================================
-- SQL 73: Lengkapi generate sesi 13 Juni + detail 6 & 13 + recalc
-- =====================================================

-- A. Cek sesi Juni saat ini
SELECT 'a_sesi' AS s, tanggal::text, status, total_pendapatan
FROM jimpitan_sesi
WHERE tanggal BETWEEN '2026-06-01' AND '2026-06-30'
ORDER BY tanggal;

-- B. Insert sesi 13 Juni (idempotent)
INSERT INTO jimpitan_sesi (tanggal, status, total_pendapatan, created_at)
SELECT '2026-06-13', 'APPROVED', 0, NOW()
WHERE NOT EXISTS (SELECT 1 FROM jimpitan_sesi WHERE tanggal = '2026-06-13')
RETURNING id, tanggal, status;

-- C. Insert detail 6 Juni (skip jika sudah ada)
INSERT INTO jimpitan_detail (
  sesi_id, profile_id, login_id, nama_kk_snapshot, nominal, status_bayar, is_bayar, created_at
)
SELECT
  (SELECT id FROM jimpitan_sesi WHERE tanggal='2026-06-06' LIMIT 1),
  p.id,
  p.login_id,
  p.nama_kk,
  kt.nominal::INT,
  'LUNAS',
  TRUE,
  kt.created_at
FROM kas_transaksi kt
JOIN profiles p ON p.login_id = kt.login_id
WHERE kt.tipe='MASUK' AND kt.kategori='IURAN_BULANAN'
  AND kt.catatan LIKE '%06 Juni 2026%'
  AND NOT EXISTS (
    SELECT 1 FROM jimpitan_detail jd
    WHERE jd.sesi_id = (SELECT id FROM jimpitan_sesi WHERE tanggal='2026-06-06' LIMIT 1)
      AND jd.profile_id = p.id
  );
-- Tampilkan hasil
SELECT 'c_detail_6jun_inserted' AS s, COUNT(*) AS rows
FROM jimpitan_detail
WHERE sesi_id = (SELECT id FROM jimpitan_sesi WHERE tanggal='2026-06-06' LIMIT 1);

-- D. Insert detail 13 Juni (skip jika sudah ada)
INSERT INTO jimpitan_detail (
  sesi_id, profile_id, login_id, nama_kk_snapshot, nominal, status_bayar, is_bayar, created_at
)
SELECT
  (SELECT id FROM jimpitan_sesi WHERE tanggal='2026-06-13' LIMIT 1),
  p.id,
  p.login_id,
  p.nama_kk,
  kt.nominal::INT,
  'LUNAS',
  TRUE,
  kt.created_at
FROM kas_transaksi kt
JOIN profiles p ON p.login_id = kt.login_id
WHERE kt.tipe='MASUK' AND kt.kategori='IURAN_BULANAN'
  AND kt.catatan LIKE '%13 Juni 2026%'
  AND NOT EXISTS (
    SELECT 1 FROM jimpitan_detail jd
    WHERE jd.sesi_id = (SELECT id FROM jimpitan_sesi WHERE tanggal='2026-06-13' LIMIT 1)
      AND jd.profile_id = p.id
  );
SELECT 'd_detail_13jun_inserted' AS s, COUNT(*) AS rows
FROM jimpitan_detail
WHERE sesi_id = (SELECT id FROM jimpitan_sesi WHERE tanggal='2026-06-13' LIMIT 1);

-- E. Force recalc total_pendapatan untuk semua sesi Juni
UPDATE jimpitan_sesi js SET
  total_pendapatan = COALESCE((
    SELECT SUM(nominal)::INT
    FROM jimpitan_detail jd
    WHERE jd.sesi_id = js.id AND jd.is_bayar = TRUE
  ), 0)
WHERE js.tanggal BETWEEN '2026-06-01' AND '2026-06-30';

SELECT 'e_after_recalc' AS s, tanggal::text, status, total_pendapatan
FROM jimpitan_sesi
WHERE tanggal BETWEEN '2026-06-01' AND '2026-06-30'
ORDER BY tanggal;