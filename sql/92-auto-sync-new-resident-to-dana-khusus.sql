-- =====================================================
-- SQL 92: Auto-sync warga baru ke dana khusus aktif
-- FIX: Warga baru yang ditambahkan pengurus harus otomatis
-- masuk ke seluruh dana khusus yang masih aktif.
-- =====================================================

-- Trigger function: saat profile baru INSERT atau is_active berubah jadi TRUE,
-- buat tagihan untuk semua dana_khusus yang aktif.
CREATE OR REPLACE FUNCTION auto_sync_new_resident_to_dana_khusus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dk RECORD;
  v_nominal INT;
BEGIN
  -- Hanya proses jika warga aktif, punya blok & nomor rumah, dan bukan superadmin
  IF NEW.is_active IS NOT TRUE
     OR NEW.blok IS NULL
     OR NEW.nomor_rumah IS NULL
     OR NEW.login_id = 'X-0' THEN
    RETURN NEW;
  END IF;

  -- Untuk setiap dana_khusus yang masih aktif
  FOR dk IN
    SELECT id, target_per_kk, target_per_kk_khusus
    FROM dana_khusus
    WHERE is_active = TRUE
  LOOP
    -- Hitung nominal berdasarkan kategori_tarif
    v_nominal := CASE
      WHEN NEW.kategori_tarif = 'KHUSUS' THEN COALESCE(dk.target_per_kk_khusus, dk.target_per_kk)
      ELSE dk.target_per_kk
    END;

    -- Insert jika belum ada (UNIQUE constraint mencegah duplikat)
    INSERT INTO dana_khusus_tagihan (
      dana_khusus_id, profile_id, login_id, nama_kk_snapshot, nominal_tagihan
    ) VALUES (
      dk.id, NEW.id, NEW.login_id, NEW.nama_kk, v_nominal
    )
    ON CONFLICT (dana_khusus_id, profile_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger: AFTER INSERT on profiles (warga baru)
DROP TRIGGER IF EXISTS trg_auto_sync_new_resident ON profiles;
CREATE TRIGGER trg_auto_sync_new_resident
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION auto_sync_new_resident_to_dana_khusus();

-- Trigger: AFTER UPDATE of is_active on profiles (warga diaktifkan kembali)
DROP TRIGGER IF EXISTS trg_auto_sync_reactivated_resident ON profiles;
CREATE TRIGGER trg_auto_sync_reactivated_resident
AFTER UPDATE OF is_active ON profiles
FOR EACH ROW
WHEN (NEW.is_active = TRUE AND OLD.is_active = FALSE)
EXECUTE FUNCTION auto_sync_new_resident_to_dana_khusus();

-- RPC: Sinkronisasi manual - tambahkan warga aktif yang belum punya tagihan
-- ke dana khusus aktif (untuk data lama yang terlewat)
CREATE OR REPLACE FUNCTION sync_dana_khusus_participants(p_dana_khusus_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dk RECORD;
  v_count INT := 0;
  v_nominal INT;
BEGIN
  SELECT id, target_per_kk, target_per_kk_khusus, is_active INTO dk
  FROM dana_khusus WHERE id = p_dana_khusus_id;

  IF dk.id IS NULL THEN
    RETURN json_build_object('error', 'Dana khusus tidak ditemukan');
  END IF;

  INSERT INTO dana_khusus_tagihan (
    dana_khusus_id, profile_id, login_id, nama_kk_snapshot, nominal_tagihan
  )
  SELECT
    dk.id, p.id, p.login_id, p.nama_kk,
    CASE
      WHEN p.kategori_tarif = 'KHUSUS' THEN COALESCE(dk.target_per_kk_khusus, dk.target_per_kk)
      ELSE dk.target_per_kk
    END
  FROM profiles p
  WHERE p.is_active = TRUE
    AND p.login_id != 'X-0'
    AND p.blok IS NOT NULL
    AND p.nomor_rumah IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM dana_khusus_tagihan t
      WHERE t.dana_khusus_id = dk.id AND t.profile_id = p.id
    )
  ON CONFLICT (dana_khusus_id, profile_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'added', v_count,
    'message', v_count || ' warga baru ditambahkan ke dana khusus'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_dana_khusus_participants(UUID) TO authenticated;

-- RPC: Sinkronisasi SEMUA dana khusus aktif sekaligus
CREATE OR REPLACE FUNCTION sync_all_active_dana_khusus()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dk RECORD;
  v_total INT := 0;
  v_count INT;
BEGIN
  FOR dk IN SELECT id FROM dana_khusus WHERE is_active = TRUE LOOP
    INSERT INTO dana_khusus_tagihan (
      dana_khusus_id, profile_id, login_id, nama_kk_snapshot, nominal_tagihan
    )
    SELECT
      dk.id, p.id, p.login_id, p.nama_kk,
      CASE
        WHEN p.kategori_tarif = 'KHUSUS' THEN COALESCE(
          (SELECT target_per_kk_khusus FROM dana_khusus WHERE id = dk.id),
          (SELECT target_per_kk FROM dana_khusus WHERE id = dk.id)
        )
        ELSE (SELECT target_per_kk FROM dana_khusus WHERE id = dk.id)
      END
    FROM profiles p
    WHERE p.is_active = TRUE
      AND p.login_id != 'X-0'
      AND p.blok IS NOT NULL
      AND p.nomor_rumah IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM dana_khusus_tagihan t
        WHERE t.dana_khusus_id = dk.id AND t.profile_id = p.id
      )
    ON CONFLICT (dana_khusus_id, profile_id) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'total_added', v_total,
    'message', v_total || ' warga baru ditambahkan ke semua dana khusus aktif'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_all_active_dana_khusus() TO authenticated;

NOTIFY pgrst, 'reload schema';
