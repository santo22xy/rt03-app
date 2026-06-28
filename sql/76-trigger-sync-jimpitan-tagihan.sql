-- =====================================================
-- SQL 76: Trigger sync jimpitan_tagihan saat iuran_pembayaran berubah
--
-- FIX Problem #4: "data di warga belum berubah setelah ACC jimpitan"
--
-- Sebelumnya: trigger on_jimpitan_sesi_approved() insert ke iuran_pembayaran
-- tapi jimpitan_tagihan.total_terbayar & status TIDAK ter-update otomatis.
-- Akibatnya warga yang seharusnya LUNAS / CICIL masih tampil BELUM.
--
-- FIX: Trigger ini auto-update jimpitan_tagihan.total_terbayar & status
-- setiap ada INSERT/UPDATE/DELETE di iuran_pembayaran.
-- =====================================================

-- =====================================================
-- STEP 1: Function sync jimpitan_tagihan dari iuran_pembayaran
-- =====================================================
CREATE OR REPLACE FUNCTION sync_jimpitan_tagihan_from_pembayaran()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_periode DATE;
  v_total INT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_profile_id := OLD.profile_id;
    v_periode := OLD.periode_bulan;
  ELSE
    v_profile_id := NEW.profile_id;
    v_periode := NEW.periode_bulan;
  END IF;

  -- Hitung ulang total_terbayar
  SELECT COALESCE(SUM(nominal), 0)::INT INTO v_total
  FROM iuran_pembayaran
  WHERE profile_id = v_profile_id
    AND periode_bulan = v_periode
    AND (confirmed IS NULL OR confirmed = TRUE);

  -- Upsert ke jimpitan_tagihan
  INSERT INTO jimpitan_tagihan (
    profile_id, login_id, nama_kk_snapshot, periode_bulan,
    nominal_tagihan, total_terbayar, status, updated_at
  )
  SELECT
    v_profile_id, p.login_id, p.nama_kk, v_periode,
    COALESCE(t.nominal_aktif, 0), v_total,
    CASE
      WHEN v_total > COALESCE(t.nominal_aktif, 0) AND COALESCE(t.nominal_aktif, 0) > 0 THEN 'LEBIH'
      WHEN v_total = COALESCE(t.nominal_aktif, 0) AND v_total > 0 THEN 'LUNAS'
      WHEN v_total > 0 THEN 'CICIL'
      ELSE 'BELUM'
    END,
    NOW()
  FROM profiles p
  LEFT JOIN jimpitan_tarif t
    ON t.profile_id = p.id AND t.is_active = TRUE
  WHERE p.id = v_profile_id
  ON CONFLICT (profile_id, periode_bulan) DO UPDATE SET
    total_terbayar = EXCLUDED.total_terbayar,
    status = EXCLUDED.status,
    updated_at = NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- =====================================================
-- STEP 2: Pasang trigger
-- =====================================================
DROP TRIGGER IF EXISTS trg_sync_tagihan_from_pembayaran ON iuran_pembayaran;
CREATE TRIGGER trg_sync_tagihan_from_pembayaran
AFTER INSERT OR UPDATE OR DELETE ON iuran_pembayaran
FOR EACH ROW
EXECUTE FUNCTION sync_jimpitan_tagihan_from_pembayaran();

-- =====================================================
-- STEP 3: Backfill semua jimpitan_tagihan dari iuran_pembayaran
-- =====================================================
DO $$
DECLARE
  v_row RECORD;
  v_updated INT := 0;
BEGIN
  FOR v_row IN
    SELECT DISTINCT profile_id, periode_bulan
    FROM iuran_pembayaran
    WHERE confirmed IS NULL OR confirmed = TRUE
  LOOP
    -- Recalculate manual (idempotent)
    UPDATE jimpitan_tagihan t
    SET total_terbayar = sub.total,
        status = CASE
          WHEN sub.total > t.nominal_tagihan AND t.nominal_tagihan > 0 THEN 'LEBIH'
          WHEN sub.total = t.nominal_tagihan AND sub.total > 0 THEN 'LUNAS'
          WHEN sub.total > 0 THEN 'CICIL'
          ELSE 'BELUM'
        END,
        updated_at = NOW()
    FROM (
      SELECT COALESCE(SUM(nominal), 0)::INT AS total
      FROM iuran_pembayaran
      WHERE profile_id = v_row.profile_id
        AND periode_bulan = v_row.periode_bulan
        AND (confirmed IS NULL OR confirmed = TRUE)
    ) sub
    WHERE t.profile_id = v_row.profile_id
      AND t.periode_bulan = v_row.periode_bulan;

    v_updated := v_updated + 1;
  END LOOP;

  RAISE NOTICE 'Synced % (profile, periode) tagihan dari iuran_pembayaran', v_updated;
END $$;

-- =====================================================
-- STEP 4: Verifikasi
-- =====================================================
SELECT 'a_juni_summary' AS s,
  COUNT(*) AS total_tagihan,
  SUM(nominal_tagihan) AS total_nominal,
  SUM(total_terbayar) AS total_terbayar,
  COUNT(*) FILTER (WHERE status = 'LUNAS') AS lunas,
  COUNT(*) FILTER (WHERE status = 'CICIL') AS cicil,
  COUNT(*) FILTER (WHERE status = 'BELUM') AS belum,
  COUNT(*) FILTER (WHERE status = 'LEBIH') AS lebih
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01';

SELECT 'b_changed' AS s,
  login_id, nama_kk_snapshot,
  nominal_tagihan, total_terbayar, status
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01'
  AND status IN ('LUNAS', 'CICIL', 'LEBIH')
ORDER BY status DESC, login_id
LIMIT 10;

NOTIFY pgrst, 'reload schema';
