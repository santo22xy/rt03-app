-- =====================================================
-- 33: RESET PASSWORD PENGURUS + SUPERADMIN
-- Strategi: pakai pg_constraint + CTE atomic DELETE
-- =====================================================

-- =====================================================
-- STEP 1: UPGRADE role profile B-1/B-5/C-2
-- =====================================================
UPDATE profiles SET role = 'KETUA_RT'
  WHERE login_id = 'B-1' AND role <> 'KETUA_RT';

UPDATE profiles SET role = 'SEKRETARIS'
  WHERE login_id = 'B-5' AND role <> 'SEKRETARIS';

UPDATE profiles SET role = 'BENDAHARA'
  WHERE login_id = 'C-2' AND role <> 'BENDAHARA';

-- =====================================================
-- STEP 2: Buat profile X-0 (Superadmin) kalau belum ada
-- =====================================================
INSERT INTO profiles (id, login_id, nama_kk, role, is_active, kategori_tarif, blok, nomor_rumah, catatan)
SELECT u.id, 'X-0', 'Admin RT03 (Superadmin)', 'SUPERADMIN', TRUE, 'NORMAL', 'X', 0,
       'Auto-created by 33-reset-password-pengurus-dan-superadmin.sql'
FROM auth.users u
WHERE u.email = 'admin@rt03.id'
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.login_id = 'X-0');

-- =====================================================
-- STEP 3: MIGRASI profiles.id → auth.users.id
-- Auto-detect semua FK via pg_constraint
-- =====================================================
DO $$
DECLARE
  v_old_id UUID;
  v_new_id UUID;
  v_login  TEXT;
  v_count  INT;
  v_total_deleted INT := 0;
  v_total_migrated INT := 0;

  v_fk_record RECORD;
  v_sql TEXT;
  v_fk_count INT := 0;
BEGIN
  -- ====================================================
  -- 3A. DROP SEMUA FK constraint yang reference profiles(id)
  -- ====================================================
  FOR v_fk_record IN
    SELECT c.conname AS constraint_name,
           t.relname AS table_name,
           n.nspname AS schema_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.profiles'::regclass
  LOOP
    v_sql := format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
                    v_fk_record.schema_name,
                    v_fk_record.table_name,
                    v_fk_record.constraint_name);
    EXECUTE v_sql;
    v_fk_count := v_fk_count + 1;
  END LOOP;
  RAISE NOTICE '=== Total FK di-drop: % ===', v_fk_count;

  -- ====================================================
  -- 3B. MIGRATE profiles.id dengan CTE atomic
  -- Hapus dulu profile auto-created, baru migrate
  -- ====================================================
  FOR v_login, v_old_id, v_new_id IN
    SELECT p.login_id, p.id, u.id
    FROM profiles p
    JOIN auth.users u ON u.email IN (
      'ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id'
    )
    WHERE p.login_id IN ('B-1','B-5','C-2','X-0')
      AND p.id <> u.id
  LOOP
    RAISE NOTICE '';
    RAISE NOTICE '=== Migrasi % : % → % ===', v_login, v_old_id, v_new_id;

    -- 3B.0 Hapus profile yang akan jadi konflik (id = v_new_id tapi bukan profile kita)
    -- CTE atomic: hapus dalam 1 transaksi
    WITH deleted AS (
      DELETE FROM profiles
      WHERE id = v_new_id
        AND login_id <> v_login
      RETURNING id, login_id
    )
    SELECT COUNT(*) INTO v_count FROM deleted;
    v_total_deleted := v_total_deleted + v_count;
    IF v_count > 0 THEN
      RAISE NOTICE '  Hapus profile konflik (id=%): % rows', v_new_id, v_count;
    END IF;

    -- 3B.1 UPDATE semua kolom FK: old_id → new_id
    FOR v_fk_record IN
      SELECT t.relname AS table_name,
             a.attname AS column_name,
             n.nspname AS schema_name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
      WHERE c.contype = 'f'
        AND c.confrelid = 'public.profiles'::regclass
    LOOP
      v_sql := format('UPDATE %I.%I SET %I = %L WHERE %I = %L',
                      v_fk_record.schema_name,
                      v_fk_record.table_name,
                      v_fk_record.column_name, v_new_id,
                      v_fk_record.column_name, v_old_id);
      EXECUTE v_sql;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count > 0 THEN
        RAISE NOTICE '  %.% : % rows', v_fk_record.table_name, v_fk_record.column_name, v_count;
      END IF;
    END LOOP;

    -- 3B.2 UPDATE profiles SET id = v_new_id WHERE id = v_old_id
    UPDATE profiles SET id = v_new_id WHERE id = v_old_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  profiles.id updated: % rows', v_count;
    v_total_migrated := v_total_migrated + v_count;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '=== TOTAL: % profile di-migrate, % konflik dihapus ===', v_total_migrated, v_total_deleted;

  -- ====================================================
  -- 3C. RE-ADD semua FK constraint
  -- ====================================================
  v_fk_count := 0;
  FOR v_fk_record IN
    SELECT DISTINCT
      t.relname AS table_name,
      a.attname AS column_name,
      n.nspname AS schema_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.profiles'::regclass
  LOOP
    DECLARE
      v_on_delete TEXT;
    BEGIN
      v_on_delete := CASE
        WHEN v_fk_record.column_name IN ('created_by','kyc_verified_by',
                                          'acd_by_profile_id','profile_id_petugas',
                                          'actor_id','validated_by','publish_by',
                                          'input_by','petugas_id','pengganti_id')
          THEN 'SET NULL'
        ELSE 'CASCADE'
      END;

      v_sql := format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I
           FOREIGN KEY (%I) REFERENCES profiles(id) ON DELETE %s',
        v_fk_record.schema_name,
        v_fk_record.table_name,
        v_fk_record.table_name || '_' || v_fk_record.column_name || '_fkey',
        v_fk_record.column_name,
        v_on_delete
      );
      EXECUTE v_sql;
      v_fk_count := v_fk_count + 1;
    END;
  END LOOP;
  RAISE NOTICE '=== Total FK di-re-add: % ===', v_fk_count;
END $$;

-- =====================================================
-- STEP 4: RESET password di auth.users
-- =====================================================
DO $$
DECLARE
  v_pw_ketua     TEXT := 'Rt03Ketua2026';
  v_pw_sekret    TEXT := 'Rt03Sekret2026';
  v_pw_bendahara TEXT := 'Rt03Bendahara2026';
  v_pw_superadmin TEXT := 'Rt03Admin2026';
  v_target RECORD;
  v_password TEXT;
  v_updated INT;
  v_count INT := 0;
BEGIN
  FOR v_target IN
    SELECT u.id, u.email
    FROM auth.users u
    WHERE u.email IN ('ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id')
  LOOP
    v_password := CASE v_target.email
      WHEN 'ketua@rt03.id'      THEN v_pw_ketua
      WHEN 'sekretaris@rt03.id' THEN v_pw_sekret
      WHEN 'bendahara@rt03.id'  THEN v_pw_bendahara
      WHEN 'admin@rt03.id'      THEN v_pw_superadmin
      ELSE NULL
    END;

    IF v_password IS NULL THEN CONTINUE; END IF;

    UPDATE auth.users
    SET
      encrypted_password = crypt(v_password, gen_salt('bf', 10)),
      updated_at = now()
    WHERE id = v_target.id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated > 0 THEN v_count := v_count + 1; END IF;
  END LOOP;

  CREATE TEMP TABLE IF NOT EXISTS _reset_summary (
    total_reset INT,
    waktu_reset TIMESTAMPTZ
  );
  DELETE FROM _reset_summary;
  INSERT INTO _reset_summary VALUES (v_count, now());
END $$;

-- =====================================================
-- STEP 5: SUMMARY
-- =====================================================
SELECT
  total_reset AS jumlah_user_berhasil_di_reset,
  waktu_reset AS waktu_reset
FROM _reset_summary;

-- =====================================================
-- STEP 6: VERIFIKASI AKHIR
-- =====================================================
SELECT
  p.login_id,
  p.role,
  p.is_active,
  u.email,
  CASE WHEN p.id = u.id THEN '✓ ID MATCH' ELSE '✗ ID BEDA' END AS id_check,
  CASE
    WHEN u.encrypted_password = crypt(
      CASE u.email
        WHEN 'ketua@rt03.id'      THEN 'Rt03Ketua2026'
        WHEN 'sekretaris@rt03.id' THEN 'Rt03Sekret2026'
        WHEN 'bendahara@rt03.id'  THEN 'Rt03Bendahara2026'
        WHEN 'admin@rt03.id'      THEN 'Rt03Admin2026'
        ELSE ''
      END,
      u.encrypted_password
    ) THEN '✓ COCOK'
    ELSE '✗ GAGAL'
  END AS password_test
FROM profiles p
JOIN auth.users u ON u.email IN ('ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id')
WHERE p.login_id IN ('B-1','B-5','C-2','X-0')
ORDER BY
  CASE p.login_id
    WHEN 'B-1' THEN 1
    WHEN 'B-5' THEN 2
    WHEN 'C-2' THEN 3
    WHEN 'X-0' THEN 4
    ELSE 9
  END;

-- =====================================================
-- STEP 7: VERIFIKASI FK — tagihan masih nge-link
-- =====================================================
SELECT
  p.login_id,
  COUNT(jt.id) AS jumlah_jimpitan_tagihan
FROM profiles p
LEFT JOIN jimpitan_tagihan jt ON jt.profile_id = p.id
WHERE p.login_id IN ('B-1','B-5','C-2','X-0')
GROUP BY p.login_id
ORDER BY p.login_id;

-- =====================================================
-- INSTRUKSI LOGIN
-- =====================================================
-- 1. Buka http://localhost:3000/login
-- 2. Scroll ke bawah, cari tombol/link kecil "Login Pengurus"
-- 3. Masukkan email + password:
--
--    | Login ID | Role         | Email               | Password           |
--    |----------|--------------|---------------------|--------------------|
--    | B-1      | Ketua RT     | ketua@rt03.id       | Rt03Ketua2026      |
--    | B-5      | Sekretaris   | sekretaris@rt03.id  | Rt03Sekret2026     |
--    | C-2      | Bendahara    | bendahara@rt03.id   | Rt03Bendahara2026  |
--    | X-0      | Superadmin   | admin@rt03.id       | Rt03Admin2026      |
-- =====================================================