-- =====================================================
-- 24: Generate jimpitan_sesi & jimpitan_detail dari kas_transaksi
-- Strategi: group by kas_transaksi.catatan (yg ada "ronda 06" / "ronda 13")
-- =====================================================

-- =====================================================
-- STEP A: BERSIHKAN data lama (idempotent)
-- Hapus sesi & detail untuk Juni 2026
-- =====================================================
DELETE FROM jimpitan_detail WHERE sesi_id IN (
  SELECT id FROM jimpitan_sesi WHERE tanggal IN ('2026-06-06','2026-06-13','2026-06-20','2026-06-27')
);
DELETE FROM jimpitan_sesi WHERE tanggal IN ('2026-06-06','2026-06-13','2026-06-20','2026-06-27');

-- Tambah UNIQUE INDEX (defensif, untuk ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS idx_jimpitan_detail_sesi_profile
  ON jimpitan_detail(sesi_id, profile_id);

-- =====================================================
-- STEP B: Insert jimpitan_sesi (1 row per Sabtu)
-- Ambil info ketua kelompok dari jadwal_ronda
-- =====================================================
INSERT INTO jimpitan_sesi (
  tanggal, kelompok_id, profile_id_petugas, nama_petugas_snapshot,
  status, total_pendapatan, catatan, acd_by_profile_id, acc_at, created_at
)
SELECT
  jr.tanggal,
  'K' || jr.minggu_ke AS kelompok_id,
  jr.penjaga_profile_id,
  jr.nama_penjaga_snapshot,
  'ACC' AS status,
  0 AS total_pendapatan,  -- di-update setelah detail masuk
  'Generate otomatis dari kas_transaksi (script 24)' AS catatan,
  jr.penjaga_profile_id AS acd_by,
  NOW() AS acc_at,
  NOW() AS created_at
FROM jadwal_ronda jr
WHERE jr.tahun = 2026
  AND jr.tanggal <= CURRENT_DATE  -- hanya sesi yang sudah lewat
ON CONFLICT (tanggal, kelompok_id) DO NOTHING;

-- =====================================================
-- STEP C: Insert jimpitan_detail (per KK per sesi)
-- Loop kas_transaksi dengan kategori IURAN_BULANAN
-- Match catatan ke tanggal sesi: "ronda 06" → sesi 06, "ronda 13" → sesi 13
-- =====================================================
DO $$
DECLARE
  v_sesi_id UUID;
  v_sesi_tanggal DATE;
  v_kelompok_id TEXT;
  v_profile_id UUID;
  v_login TEXT;
  v_nama_kk TEXT;
  v_nominal NUMERIC;
  v_kategori TEXT;
  v_tanggal DATE;
  v_catatan TEXT;
  v_minggu INT;
  v_inserted INT := 0;
  v_skipped INT := 0;
  v_06_count INT := 0;
  v_13_count INT := 0;
BEGIN
  FOR v_login, v_nominal, v_tanggal, v_kategori, v_catatan IN
    SELECT
      kt.login_id,
      kt.nominal,
      kt.tanggal,
      kt.kategori,
      kt.catatan
    FROM kas_transaksi kt
    WHERE kt.tipe = 'MASUK'
      AND kt.kategori = 'IURAN_BULANAN'
      AND kt.login_id IS NOT NULL
      AND kt.login_id <> ''
      -- Hanya yang ada catatan ronda Juni 2026
      AND (kt.catatan ILIKE '%ronda 06 Juni 2026%' OR kt.catatan ILIKE '%ronda 13 Juni 2026%')
    ORDER BY kt.catatan, kt.tanggal, kt.id
  LOOP
    -- Tentukan tanggal sesi dari catatan (BUKAN dari v_tanggal!)
    IF v_catatan ILIKE '%ronda 06 Juni 2026%' THEN
      v_minggu := 1;
    ELSIF v_catatan ILIKE '%ronda 13 Juni 2026%' THEN
      v_minggu := 2;
    ELSE
      v_minggu := NULL;
    END IF;

    IF v_minggu IS NOT NULL THEN
      SELECT id, tanggal, kelompok_id
        INTO v_sesi_id, v_sesi_tanggal, v_kelompok_id
      FROM jimpitan_sesi
      WHERE kelompok_id = 'K' || v_minggu
      LIMIT 1;

      -- Get profile & nama_kk
      SELECT id, nama_kk INTO v_profile_id, v_nama_kk
      FROM profiles WHERE login_id = v_login;

      IF v_sesi_id IS NOT NULL AND v_profile_id IS NOT NULL THEN
        INSERT INTO jimpitan_detail (
          sesi_id, profile_id, login_id, nama_kk_snapshot,
          nominal, status_bayar, catatan, created_at
        )
        VALUES (
          v_sesi_id, v_profile_id, v_login, v_nama_kk,
          v_nominal, 'BAYAR', 'Auto dari kas_transaksi ' || v_tanggal::TEXT, NOW()
        )
        ON CONFLICT (sesi_id, profile_id) DO UPDATE SET
          nominal = EXCLUDED.nominal,
          status_bayar = 'BAYAR',
          catatan = EXCLUDED.catatan;
        v_inserted := v_inserted + 1;
        IF v_minggu = 1 THEN
          v_06_count := v_06_count + 1;
        ELSE
          v_13_count := v_13_count + 1;
        END IF;
      ELSE
        v_skipped := v_skipped + 1;
        RAISE NOTICE 'SKIP % (sesi/profile not found, minggu=%)', v_login, v_minggu;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE '=== DETAIL: inserted=% (06=%, 13=%), skipped=%', v_inserted, v_06_count, v_13_count, v_skipped;
END $$;

-- =====================================================
-- STEP D: Update total_pendapatan di jimpitan_sesi
-- Hitung ulang dari jimpitan_detail
-- =====================================================
UPDATE jimpitan_sesi js
SET total_pendapatan = COALESCE((
  SELECT SUM(jd.nominal)
  FROM jimpitan_detail jd
  WHERE jd.sesi_id = js.id AND jd.status_bayar = 'BAYAR'
), 0);

-- =====================================================
-- STEP E: Verifikasi
-- =====================================================
SELECT '=== A. JIMPITAN_SESI ===' AS section;
SELECT id, tanggal, kelompok_id, nama_petugas_snapshot, status, total_pendapatan
FROM jimpitan_sesi
WHERE tanggal IN ('2026-06-06','2026-06-13','2026-06-20','2026-06-27')
ORDER BY tanggal;

SELECT '=== B. JIMPITAN_DETAIL COUNT PER SESI ===' AS section;
SELECT
  js.tanggal,
  js.kelompok_id,
  COUNT(jd.id) AS jumlah_warga_bayar,
  SUM(jd.nominal) AS total_nominal
FROM jimpitan_sesi js
LEFT JOIN jimpitan_detail jd ON jd.sesi_id = js.id
WHERE js.tanggal IN ('2026-06-06','2026-06-13','2026-06-20','2026-06-27')
GROUP BY js.tanggal, js.kelompok_id
ORDER BY js.tanggal;

SELECT '=== C. DETAIL SESI 06 JUNI ===' AS section;
SELECT jd.login_id, jd.nama_kk_snapshot, jd.nominal, jd.status_bayar
FROM jimpitan_detail jd
JOIN jimpitan_sesi js ON js.id = jd.sesi_id
WHERE js.tanggal = '2026-06-06'
ORDER BY jd.login_id;

SELECT '=== D. DETAIL SESI 13 JUNI ===' AS section;
SELECT jd.login_id, jd.nama_kk_snapshot, jd.nominal, jd.status_bayar
FROM jimpitan_detail jd
JOIN jimpitan_sesi js ON js.id = jd.sesi_id
WHERE js.tanggal = '2026-06-13'
ORDER BY jd.login_id;

SELECT '=== E. SUMMARY ===' AS section;
SELECT
  (SELECT COUNT(*) FROM jimpitan_sesi WHERE tanggal <= CURRENT_DATE) AS sesi_selesai,
  (SELECT COUNT(*) FROM jimpitan_detail) AS total_detail,
  (SELECT SUM(total_pendapatan) FROM jimpitan_sesi) AS total_pendapatan,
  (SELECT saldo_akhir FROM v_saldo_kas) AS saldo_kas_real;
