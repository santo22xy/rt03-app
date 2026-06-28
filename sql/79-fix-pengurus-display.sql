-- =====================================================
-- SQL 79: Fix data pengurus + tambah kolom penanda ketua RT
-- Tujuan: pastikan Pak RT punya role KETUA_RT & muncul di pengurus list
-- =====================================================

-- =====================================================
-- STEP 1: Update role Pak RT ke KETUA_RT (kalau nama mengandung "ketua"/"rt")
-- HATI-HATI: jalankan ini hanya setelah cek section B di SQL 75
-- =====================================================
-- UPDATE profiles
-- SET role = 'KETUA_RT'
-- WHERE nama_kk ILIKE '%ketua%'
--    OR nama_kk ILIKE '%pak rt%'
--    OR nama_kk ILIKE '%bapak rt%'
--    OR login_id IN ('RT-1', 'KETUA-RT', 'CHAIRMAN');

-- =====================================================
-- STEP 2: Tambah kolom is_pengurus_aktif (boolean) untuk konsistensi display
-- Otomatis sync via trigger saat role/profile berubah
-- =====================================================
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_pengurus_aktif'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_pengurus_aktif BOOLEAN NOT NULL DEFAULT FALSE;

    -- Backfill: true untuk role pengurus (exclude WARGA)
    UPDATE profiles
    SET is_pengurus_aktif = (role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'))
    WHERE is_active = TRUE;

    -- Trigger auto-update saat role berubah
    CREATE OR REPLACE FUNCTION sync_is_pengurus_aktif()
    RETURNS TRIGGER LANGUAGE plpgsql AS $func$
    BEGIN
      NEW.is_pengurus_aktif := (NEW.role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'))
        AND NEW.is_active = TRUE;
      RETURN NEW;
    END;
    $func$;

    DROP TRIGGER IF EXISTS trg_sync_is_pengurus_aktif ON profiles;
    CREATE TRIGGER trg_sync_is_pengurus_aktif
    BEFORE INSERT OR UPDATE OF role, is_active ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION sync_is_pengurus_aktif();
  END IF;
END $do$;

-- =====================================================
-- STEP 3: View v_pengurus_aktif untuk konsistensi query
-- =====================================================
CREATE OR REPLACE VIEW v_pengurus_aktif AS
SELECT
  p.id, p.login_id, p.nama_kk, p.role, p.blok, p.nomor_rumah,
  p.no_hp, p.is_active, p.is_pengurus_aktif, p.created_at,
  CASE p.role
    WHEN 'KETUA_RT' THEN 1
    WHEN 'BENDAHARA' THEN 2
    WHEN 'SEKRETARIS' THEN 3
    WHEN 'PENGURUS' THEN 4
    WHEN 'SUPERADMIN' THEN 5
    ELSE 99
  END AS role_order
FROM profiles p
WHERE p.is_pengurus_aktif = TRUE
ORDER BY role_order, p.blok, p.nomor_rumah, p.login_id;

-- =====================================================
-- STEP 4: RLS untuk view
-- =====================================================
GRANT SELECT ON v_pengurus_aktif TO anon, authenticated;

-- =====================================================
-- STEP 5: Verifikasi
-- =====================================================
SELECT 'a_pengurus_list' AS s,
  login_id, nama_kk, role, blok, nomor_rumah, is_active, is_pengurus_aktif
FROM v_pengurus_aktif
ORDER BY role_order, login_id;

SELECT 'b_total' AS s, COUNT(*) AS total_pengurus_aktif FROM v_pengurus_aktif;

SELECT 'c_pak_rt_check' AS s,
  login_id, nama_kk, role, is_pengurus_aktif, blok, nomor_rumah
FROM profiles
WHERE login_id ILIKE '%rt%'
   OR nama_kk ILIKE '%ketua%'
   OR nama_kk ILIKE '%pak rt%'
ORDER BY login_id;

NOTIFY pgrst, 'reload schema';
