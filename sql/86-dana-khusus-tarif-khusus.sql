-- =====================================================
-- SQL 86: Tambah Iuran Khusus (KK kategori_tarif = KHUSUS)
--         ke dana_khusus
--
-- Issue: Selama ini dana_khusus hanya punya 1 nominal (target_per_kk)
--        untuk semua KK. Tapi di lingkungan RT 03 ada KK kategori
--        KHUSUS (single parent / janda / kondisi khusus lain) yang
--        biasanya bayar lebih rendah.
--
-- Fix:
--   1. Tambah kolom target_per_kk_khusus di dana_khusus
--      (NULL = sama dengan target_per_kk, backward compatible)
--   2. Backfill existing rows: target_per_kk_khusus = target_per_kk
--   3. Update trigger auto_create_dana_khusus_tagihan supaya
--      nominal_tagihan disesuaikan dengan kategori_tarif profile:
--        - NORMAL → target_per_kk
--        - KHUSUS → target_per_kk_khusus (atau target_per_kk kalau NULL)
--   4. Backfill existing tagihan yang masih nominal lama dan
--      belum dibayar
--
-- AMAN di-run ulang (idempotent).
-- =====================================================

-- =====================================================
-- STEP 1: Tambah kolom target_per_kk_khusus
-- =====================================================
ALTER TABLE dana_khusus
  ADD COLUMN IF NOT EXISTS target_per_kk_khusus INT;

-- Backfill: kalau NULL, set sama dengan target_per_kk
UPDATE dana_khusus
  SET target_per_kk_khusus = target_per_kk
  WHERE target_per_kk_khusus IS NULL;

-- =====================================================
-- STEP 2: Update trigger auto_create_dana_khusus_tagihan
--         supaya nominal_tagihan disesuaikan dengan kategori_tarif
-- =====================================================
CREATE OR REPLACE FUNCTION auto_create_dana_khusus_tagihan()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_p INTEGER := 0;
  v_n INTEGER := 0;
  v_k INTEGER := 0;
BEGIN
  INSERT INTO dana_khusus_tagihan (
    dana_khusus_id, profile_id, login_id, nama_kk_snapshot, nominal_tagihan
  )
  SELECT
    NEW.id, p.id, p.login_id, p.nama_kk,
    CASE
      WHEN p.kategori_tarif = 'KHUSUS'
        THEN COALESCE(NEW.target_per_kk_khusus, NEW.target_per_kk)
      ELSE NEW.target_per_kk
    END
  FROM profiles p
  WHERE p.is_active = TRUE
    AND p.login_id != 'X-0'
    AND p.blok IS NOT NULL
    AND p.nomor_rumah IS NOT NULL;

  GET DIAGNOSTICS v_p = ROW_COUNT;

  -- Hitung breakdown
  SELECT
    COUNT(*) FILTER (WHERE p.kategori_tarif = 'NORMAL'),
    COUNT(*) FILTER (WHERE p.kategori_tarif = 'KHUSUS')
  INTO v_n, v_k
  FROM profiles p
  WHERE p.is_active = TRUE
    AND p.login_id != 'X-0'
    AND p.blok IS NOT NULL
    AND p.nomor_rumah IS NOT NULL;

  RAISE NOTICE 'Created % tagihan rows for dana_khusus: % (NORMAL: %, KHUSUS: %)',
    v_p, NEW.judul, v_n, v_k;
  RETURN NEW;
END;
$$;

-- Trigger sudah ada dari SQL 77, tapi re-create supaya pick up function baru
DROP TRIGGER IF EXISTS trg_auto_create_dana_khusus_tagihan ON dana_khusus;
CREATE TRIGGER trg_auto_create_dana_khusus_tagihan
AFTER INSERT ON dana_khusus
FOR EACH ROW
WHEN (NEW.is_active = TRUE)
EXECUTE FUNCTION auto_create_dana_khusus_tagihan();

-- =====================================================
-- STEP 3: Backfill existing tagihan yang masih 0 terbayar
--         dan nominal_tagihan masih sama dengan target_per_kk
--         (artinya belum di-tagging khusus, perlu disesuaikan)
--
-- Logika:
--   Hanya update tagihan yang:
--     - total_terbayar = 0 (belum dibayar)
--     - profile.kategori_tarif = 'KHUSUS'
--     - dana_khusus.target_per_kk_khusus IS DISTINCT FROM target_per_kk
--       (artinya ada perbedaan nominal)
-- =====================================================
DO $backfill$
DECLARE
  v_updated INT := 0;
  v_total_khusus INT := 0;
BEGIN
  -- Hitung berapa row KHUSUS yang akan kena
  SELECT COUNT(*) INTO v_total_khusus
  FROM dana_khusus_tagihan t
  JOIN profiles p ON p.id = t.profile_id
  JOIN dana_khusus d ON d.id = t.dana_khusus_id
  WHERE p.kategori_tarif = 'KHUSUS'
    AND t.total_terbayar = 0
    AND d.target_per_kk_khusus IS DISTINCT FROM d.target_per_kk;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'BACKFILL TAGIHAN KHUSUS';
  RAISE NOTICE 'Tagihan KHUSUS yang akan di-update: %', v_total_khusus;
  RAISE NOTICE '========================================';

  UPDATE dana_khusus_tagihan t
  SET nominal_tagihan = d.target_per_kk_khusus,
      updated_at = NOW()
  FROM profiles p, dana_khusus d
  WHERE p.id = t.profile_id
    AND d.id = t.dana_khusus_id
    AND p.kategori_tarif = 'KHUSUS'
    AND t.total_terbayar = 0
    AND d.target_per_kk_khusus IS DISTINCT FROM d.target_per_kk;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Updated % tagihan rows', v_updated;
END $backfill$;

-- =====================================================
-- STEP 4: RPC function untuk propagate perubahan target_per_kk_khusus
--         ke tagihan profile KHUSUS yang belum dibayar.
--
-- Dipanggil dari updateDanaKhusus action.
-- =====================================================
CREATE OR REPLACE FUNCTION update_khusus_tagihan_nominal(
  p_dana_khusus_id UUID,
  p_old_nominal INT,
  p_new_nominal INT
)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_updated INT := 0;
BEGIN
  UPDATE dana_khusus_tagihan t
  SET nominal_tagihan = p_new_nominal,
      updated_at = NOW()
  FROM profiles p
  WHERE p.id = t.profile_id
    AND t.dana_khusus_id = p_dana_khusus_id
    AND p.kategori_tarif = 'KHUSUS'
    AND t.nominal_tagihan = p_old_nominal
    AND t.total_terbayar = 0;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'update_khusus_tagihan_nominal: updated % rows', v_updated;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION update_khusus_tagihan_nominal TO authenticated;
GRANT EXECUTE ON FUNCTION update_khusus_tagihan_nominal TO service_role;

-- =====================================================
-- STEP 5: Verifikasi
-- =====================================================
SELECT 'a_schema' AS s,
  column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dana_khusus'
  AND column_name IN ('target_per_kk', 'target_per_kk_khusus')
ORDER BY column_name;

SELECT 'b_dana_khusus_with_khusus' AS s,
  judul, target_per_kk, target_per_kk_khusus,
  CASE WHEN target_per_kk = target_per_kk_khusus THEN 'SAMA' ELSE 'BEDA' END AS status
FROM dana_khusus
ORDER BY created_at DESC;

SELECT 'c_tagihan_breakdown' AS s,
  d.judul,
  COUNT(*) AS total_tagihan,
  COUNT(*) FILTER (WHERE p.kategori_tarif = 'NORMAL') AS tagihan_normal,
  COUNT(*) FILTER (WHERE p.kategori_tarif = 'KHUSUS') AS tagihan_khusus,
  SUM(t.nominal_tagihan) AS total_nominal_tagihan,
  SUM(t.total_terbayar) AS total_terbayar
FROM dana_khusus_tagihan t
JOIN dana_khusus d ON d.id = t.dana_khusus_id
JOIN profiles p ON p.id = t.profile_id
GROUP BY d.judul, d.created_at
ORDER BY d.created_at DESC;

SELECT 'd_trigger' AS s,
  trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'dana_khusus'
ORDER BY trigger_name;

-- =====================================================
-- STEP 6: Refresh PostgREST cache
-- =====================================================
NOTIFY pgrst, 'reload schema';