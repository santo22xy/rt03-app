-- =====================================================
-- 37-REGEN-JIMPITAN-TAGIHAN-JUNI-2026
-- Re-generate tagihan Juni 2026 untuk semua KK aktif,
-- LALU sync total_terbayar dari kas_transaksi (IURAN_BULANAN).
-- AMAN: hanya drop & recreate jimpitan_tagihan.
-- TIDAK menghapus: jimpitan_sesi, kas_transaksi, profiles, dll.
--
-- Setelah selesai, dashboard akan menampilkan:
--   - WARGA AKTIF: 29 (sudah exclude X-0)
--   - SISA TAGIHAN: total nominal_tagihan - total_terbayar
--   - jumlah per status: LUNAS | CICIL | BELUM (real-time sync)
-- =====================================================

-- =====================================================
-- STEP 1: Drop dan recreate jimpitan_tagihan
-- =====================================================
DROP TABLE IF EXISTS jimpitan_tagihan CASCADE;

CREATE TABLE jimpitan_tagihan (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  login_id          TEXT NOT NULL,
  nama_kk_snapshot  TEXT NOT NULL,
  periode_bulan     DATE NOT NULL,
  nominal_tagihan   INT NOT NULL DEFAULT 0,
  total_terbayar    INT NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'BELUM',  -- BELUM | CICIL | LUNAS
  kategori          TEXT,
  catatan           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, periode_bulan)
);

CREATE INDEX idx_jimpitan_tagihan_profile ON jimpitan_tagihan(profile_id);
CREATE INDEX idx_jimpitan_tagihan_periode ON jimpitan_tagihan(periode_bulan DESC);

-- RLS (samakan dengan existing)
ALTER TABLE jimpitan_tagihan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jimpitan_tagihan_read_all" ON jimpitan_tagihan;
DROP POLICY IF EXISTS "jimpitan_tagihan_write_pengurus" ON jimpitan_tagihan;
DROP POLICY IF EXISTS "jimpitan_tagihan_read_own" ON jimpitan_tagihan;
CREATE POLICY "jimpitan_tagihan_read_all" ON jimpitan_tagihan FOR SELECT USING (TRUE);
CREATE POLICY "jimpitan_tagihan_write_pengurus" ON jimpitan_tagihan FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

-- =====================================================
-- STEP 2: Generate tagihan Juni 2026 untuk semua KK
--         di jimpitan_tarif yang is_active=TRUE
--         Pakai status 'BELUM' (sesuai script 27 normalization)
-- =====================================================
DO $$
DECLARE
  v_tarif RECORD;
  v_inserted INT := 0;
  v_total_nominal BIGINT := 0;
BEGIN
  FOR v_tarif IN
    SELECT t.profile_id, t.login_id, t.nama_kk, t.nominal_aktif, t.kategori, t.catatan
    FROM jimpitan_tarif t
    WHERE t.is_active = TRUE
      AND t.login_id != 'X-0'   -- skip superadmin placeholder
  LOOP
    INSERT INTO jimpitan_tagihan (
      profile_id, login_id, nama_kk_snapshot, periode_bulan,
      nominal_tagihan, total_terbayar, status, kategori, catatan
    )
    VALUES (
      v_tarif.profile_id, v_tarif.login_id, v_tarif.nama_kk, '2026-06-01',
      v_tarif.nominal_aktif, 0, 'BELUM', v_tarif.kategori, v_tarif.catatan
    );
    v_inserted := v_inserted + 1;
    v_total_nominal := v_total_nominal + v_tarif.nominal_aktif;
  END LOOP;

  RAISE NOTICE 'Generated % tagihan rows, total nominal = Rp %', v_inserted, v_total_nominal;
END $$;

-- =====================================================
-- STEP 3: SYNC total_terbayar dari kas_transaksi
--         (kategori=IURAN_BULANAN, semua KK yg sudah setor)
-- =====================================================
DO $$
DECLARE
  v_updated INT := 0;
BEGIN
  UPDATE jimpitan_tagihan t
  SET total_terbayar = sub.total,
      updated_at = NOW()
  FROM (
    SELECT
      kt.login_id,
      SUM(kt.nominal)::NUMERIC AS total
    FROM kas_transaksi kt
    WHERE kt.tipe = 'MASUK'
      AND kt.kategori = 'IURAN_BULANAN'
      AND kt.login_id IS NOT NULL
      AND kt.login_id <> ''
    GROUP BY kt.login_id
  ) sub
  WHERE t.login_id = sub.login_id
    AND t.periode_bulan = '2026-06-01';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Synced total_terbayar untuk % tagihan dari kas_transaksi', v_updated;
END $$;

-- =====================================================
-- STEP 4: UPDATE status berdasarkan total_terbayar vs nominal_tagihan
--         Pakai enum: BELUM | CICIL | LUNAS | LEBIH (kelebihan bayar)
-- =====================================================
UPDATE jimpitan_tagihan
SET status = CASE
      WHEN total_terbayar >  nominal_tagihan THEN 'LEBIH'  -- kelebihan bayar
      WHEN total_terbayar =  nominal_tagihan THEN 'LUNAS'  -- pas
      WHEN total_terbayar >  0                THEN 'CICIL' -- sebagian
      WHEN total_terbayar =  0                THEN 'BELUM' -- belum bayar
    END,
    updated_at = NOW()
WHERE periode_bulan = '2026-06-01';

-- =====================================================
-- STEP 5: Verifikasi hasil
-- =====================================================
SELECT '=== A. HASIL GENERATE ===' AS section;

SELECT
  COUNT(*) AS jumlah_tagihan,
  SUM(nominal_tagihan) AS total_nominal,
  SUM(total_terbayar) AS total_terbayar,
  SUM(nominal_tagihan - total_terbayar) AS total_sisa,
  SUM(GREATEST(total_terbayar - nominal_tagihan, 0)) AS total_kelebihan,
  COUNT(*) FILTER (WHERE status = 'LUNAS') AS lunas,
  COUNT(*) FILTER (WHERE status = 'CICIL') AS cicil,
  COUNT(*) FILTER (WHERE status = 'BELUM') AS belum,
  COUNT(*) FILTER (WHERE status = 'LEBIH') AS lebih
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01';

-- Sample 5 row pertama
SELECT '=== B. SAMPLE 5 TAGIHAN ===' AS section;
SELECT login_id, nama_kk_snapshot, nominal_tagihan, total_terbayar, status, kategori
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01'
ORDER BY login_id
LIMIT 5;

-- Cek B-5 (Budi Setiawan) — harusnya DIBAYAR 5000, status CICIL
SELECT '=== C. CEK B-5 BUDI SETIAWAN ===' AS section;
SELECT login_id, nama_kk_snapshot, nominal_tagihan, total_terbayar,
       (nominal_tagihan - total_terbayar) AS sisa, status
FROM jimpitan_tagihan
WHERE login_id = 'B-5' AND periode_bulan = '2026-06-01';

-- Daftar semua KK yang sudah bayar (LUNAS + CICIL + LEBIH)
SELECT '=== D. WARGA YANG SUDAH BAYAR (LUNAS/CICIL/LEBIH) ===' AS section;
SELECT login_id, nama_kk_snapshot, nominal_tagihan, total_terbayar,
       (total_terbayar - nominal_tagihan) AS kelebihan, status
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01'
  AND status IN ('LUNAS', 'CICIL', 'LEBIH')
ORDER BY status DESC, login_id;

-- Daftar semua KK yang BELUM bayar
SELECT '=== E. WARGA YANG BELUM BAYAR ===' AS section;
SELECT login_id, nama_kk_snapshot, nominal_tagihan, status
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01'
  AND status = 'BELUM'
ORDER BY login_id;