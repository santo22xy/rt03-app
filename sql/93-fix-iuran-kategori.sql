-- =====================================================
-- SQL 93: Fix kategori warga pada jimpitan_tagihan
--
-- BUG: Juli 2026 semua warga jadi "Khusus" karena:
-- 1. Trigger sync_jimpitan_tagihan_from_pembayaran() INSERT tanpa kategori → NULL
-- 2. accSesi() INSERT tanpa kategori → NULL
-- 3. Halaman iuran: NULL kategori tampil "Khusus" (fallback salah)
--
-- FIX:
-- 1. Update trigger untuk menyertakan kategori saat INSERT
-- 2. Backfill kategori NULL dari profiles.kategori_tarif
-- 3. Buat RPC sync_kategori_warga() untuk sinkronisasi manual
-- =====================================================

-- =====================================================
-- STEP 1: Fix trigger sync_jimpitan_tagihan_from_pembayaran
-- Tambahkan kategori saat INSERT baru (ON CONFLICT DO UPDATE tidak mengubah kategori)
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
  v_kategori_tarif TEXT;
  v_kategori_tagihan TEXT;
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

  -- Ambil kategori_tarif dari profiles → mapping ke kategori tagihan
  SELECT UPPER(COALESCE(kategori_tarif, 'NORMAL')) INTO v_kategori_tarif
  FROM profiles WHERE id = v_profile_id;

  v_kategori_tagihan := CASE
    WHEN v_kategori_tarif = 'KHUSUS' THEN 'PERLU_KONFIRMASI'
    ELSE 'NORMAL'
  END;

  -- Upsert ke jimpitan_tagihan
  INSERT INTO jimpitan_tagihan (
    profile_id, login_id, nama_kk_snapshot, periode_bulan,
    nominal_tagihan, total_terbayar, status, kategori, updated_at
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
    v_kategori_tagihan,
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

-- Re-create trigger (idempotent)
DROP TRIGGER IF EXISTS trg_sync_tagihan_from_pembayaran ON iuran_pembayaran;
CREATE TRIGGER trg_sync_tagihan_from_pembayaran
AFTER INSERT OR UPDATE OR DELETE ON iuran_pembayaran
FOR EACH ROW
EXECUTE FUNCTION sync_jimpitan_tagihan_from_pembayaran();

-- =====================================================
-- STEP 2: Backfill kategori NULL dari profiles.kategori_tarif
-- Ini memperbaiki data Juli 2026 dan semua periode lain
-- yang kategori-nya NULL karena bug sebelumnya.
-- TIDAK mengubah: nominal_tagihan, total_terbayar, status, pembayaran
-- =====================================================
UPDATE jimpitan_tagihan jt
SET kategori = CASE
    WHEN UPPER(COALESCE(p.kategori_tarif, 'NORMAL')) = 'KHUSUS' THEN 'PERLU_KONFIRMASI'
    ELSE 'NORMAL'
  END
FROM profiles p
WHERE jt.profile_id = p.id
  AND (jt.kategori IS NULL OR jt.kategori = '');

-- =====================================================
-- STEP 3: Preview hasil perbaiki kategori (verifikasi)
-- =====================================================
SELECT 'a_backfill_summary' AS s,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE kategori = 'NORMAL') AS normal,
  COUNT(*) FILTER (WHERE kategori = 'PERLU_KONFIRMASI') AS khusus,
  COUNT(*) FILTER (WHERE kategori IS NULL OR kategori = '') AS masih_null
FROM jimpitan_tagihan;

SELECT 'b_juli_kategori' AS s,
  jt.login_id,
  jt.nama_kk_snapshot,
  jt.kategori AS kategori_tagihan,
  p.kategori_tarif AS kategori_profile,
  jt.nominal_tagihan,
  jt.total_terbayar,
  jt.status
FROM jimpitan_tagihan jt
JOIN profiles p ON p.id = jt.profile_id
WHERE jt.periode_bulan = '2026-07-01'
ORDER BY jt.login_id;

-- =====================================================
-- STEP 4: RPC sync_kategori_warga(periode)
-- Sinkronisasi kategori jimpitan_tagihan dari profiles.kategori_tarif
-- untuk periode tertentu. Tidak mengubah pembayaran/status.
-- =====================================================
CREATE OR REPLACE FUNCTION sync_kategori_warga(p_periode DATE)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  UPDATE jimpitan_tagihan jt
  SET kategori = CASE
      WHEN UPPER(COALESCE(p.kategori_tarif, 'NORMAL')) = 'KHUSUS' THEN 'PERLU_KONFIRMASI'
      ELSE 'NORMAL'
    END
  FROM profiles p
  WHERE jt.profile_id = p.id
    AND jt.periode_bulan = p_periode
    AND jt.kategori IS DISTINCT FROM (
      CASE
        WHEN UPPER(COALESCE(p.kategori_tarif, 'NORMAL')) = 'KHUSUS' THEN 'PERLU_KONFIRMASI'
        ELSE 'NORMAL'
      END
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'updated', v_count,
    'message', v_count || ' kategori warga diperbarui untuk periode ' || p_periode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_kategori_warga(DATE) TO authenticated;

-- =====================================================
-- STEP 5: RPC sync_all_kategori_warga()
-- Sinkronisasi SEMUA periode sekaligus
-- =====================================================
CREATE OR REPLACE FUNCTION sync_all_kategori_warga()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  UPDATE jimpitan_tagihan jt
  SET kategori = CASE
      WHEN UPPER(COALESCE(p.kategori_tarif, 'NORMAL')) = 'KHUSUS' THEN 'PERLU_KONFIRMASI'
      ELSE 'NORMAL'
    END
  FROM profiles p
  WHERE jt.profile_id = p.id
    AND jt.kategori IS DISTINCT FROM (
      CASE
        WHEN UPPER(COALESCE(p.kategori_tarif, 'NORMAL')) = 'KHUSUS' THEN 'PERLU_KONFIRMASI'
        ELSE 'NORMAL'
      END
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'updated', v_count,
    'message', v_count || ' kategori warga diperbarui di semua periode'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_all_kategori_warga() TO authenticated;

NOTIFY pgrst, 'reload schema';
