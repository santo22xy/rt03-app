-- =====================================================
-- 33-FIX: Migration profiles.id dengan disable trigger
-- =====================================================

-- =====================================================
-- STEP 1: Disable trigger handle_new_user (sementara)
-- =====================================================
ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;

-- =====================================================
-- STEP 2: UPGRADE role profile B-1/B-5/C-2
-- =====================================================
UPDATE profiles SET role = 'KETUA_RT'
  WHERE login_id = 'B-1' AND role <> 'KETUA_RT';

UPDATE profiles SET role = 'SEKRETARIS'
  WHERE login_id = 'B-5' AND role <> 'SEKRETARIS';

UPDATE profiles SET role = 'BENDAHARA'
  WHERE login_id = 'C-2' AND role <> 'BENDAHARA';

-- =====================================================
-- STEP 3: Buat profile X-0 (Superadmin) kalau belum ada
-- =====================================================
INSERT INTO profiles (id, login_id, nama_kk, role, is_active, kategori_tarif, blok, nomor_rumah, catatan)
SELECT u.id, 'X-0', 'Admin RT03 (Superadmin)', 'SUPERADMIN', TRUE, 'NORMAL', 'X', 0,
       'Auto-created by 33-reset-password-pengurus-dan-superadmin.sql'
FROM auth.users u
WHERE u.email = 'admin@rt03.id'
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.login_id = 'X-0');

-- =====================================================
-- STEP 4: DIAGNOSA state SETELMAT trigger di-disable
-- =====================================================
SELECT '=== STATE SETELAH DISABLE TRIGGER ===' AS info;

SELECT 'Profile d421051f (target id ketua)' AS cek;
SELECT id, login_id, role::TEXT, nama_kk
FROM profiles WHERE id = 'd421051f-3e5c-4c6a-8138-a279e8d6fc6e';

SELECT 'Profile dg id = salah satu auth.users.id' AS cek;
SELECT p.login_id, p.id, u.email
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email IN ('ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id');

-- =====================================================
-- STEP 5: DROP SEMUA FK constraint
-- =====================================================
DO $$
DECLARE v_fk RECORD; v_sql TEXT; v_count INT := 0;
BEGIN
  FOR v_fk IN
    SELECT c.conname, t.relname AS tbl, n.nspname AS schema
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f' AND c.confrelid = 'public.profiles'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
                    v_fk.schema, v_fk.tbl, v_fk.conname);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '=== Total FK di-drop: % ===', v_count;
END $$;

-- =====================================================
-- STEP 6: MIGRATE profiles.id (4 pengurus sekaligus)
-- =====================================================
DO $$
DECLARE
  v_login TEXT;
  v_old_id UUID;
  v_new_id UUID;
  v_fk RECORD;
  v_sql TEXT;
  v_count INT;
  v_total INT := 0;
BEGIN
  FOR v_login, v_old_id, v_new_id IN
    SELECT p.login_id, p.id, u.id
    FROM profiles p
    JOIN auth.users u ON u.email IN (
      'ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id'
    )
    WHERE p.login_id IN ('B-1','B-5','C-2','X-0')
      AND p.id <> u.id
    ORDER BY p.login_id
  LOOP
    RAISE NOTICE '=== Migrasi % : % → % ===', v_login, v_old_id, v_new_id;

    -- 6.1 Hapus profile konflik (id = v_new_id tapi bukan profile kita)
    DELETE FROM profiles
    WHERE id = v_new_id AND login_id <> v_login;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE NOTICE '  Hapus profile konflik: % rows', v_count;
    END IF;

    -- 6.2 UPDATE semua kolom FK: old_id → new_id
    FOR v_fk IN
      SELECT t.relname AS tbl, a.attname AS col, n.nspname AS schema
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
      WHERE c.contype = 'f' AND c.confrelid = 'public.profiles'::regclass
    LOOP
      EXECUTE format('UPDATE %I.%I SET %I = %L WHERE %I = %L',
                      v_fk.schema, v_fk.tbl,
                      v_fk.col, v_new_id,
                      v_fk.col, v_old_id);
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count > 0 THEN
        RAISE NOTICE '  %.% : % rows', v_fk.tbl, v_fk.col, v_count;
      END IF;
    END LOOP;

    -- 6.3 UPDATE profiles SET id = v_new_id WHERE id = v_old_id
    UPDATE profiles SET id = v_new_id WHERE id = v_old_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  profiles.id updated: % rows', v_count;
    v_total := v_total + v_count;
  END LOOP;

  RAISE NOTICE '=== TOTAL profile di-migrate: % ===', v_total;
END $$;

-- =====================================================
-- STEP 7: RE-ADD SEMUA FK constraint
-- =====================================================
DO $$
DECLARE v_fk RECORD; v_sql TEXT; v_on_delete TEXT; v_count INT := 0;
BEGIN
  FOR v_fk IN
    SELECT DISTINCT t.relname AS tbl, a.attname AS col, n.nspname AS schema
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = 'public.profiles'::regclass
  LOOP
    v_on_delete := CASE
      WHEN v_fk.col IN ('created_by','kyc_verified_by','acd_by_profile_id',
                         'profile_id_petugas','actor_id','validated_by',
                         'publish_by','input_by','petugas_id','pengganti_id')
        THEN 'SET NULL'
      ELSE 'CASCADE'
    END;
    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES profiles(id) ON DELETE %s',
                    v_fk.schema, v_fk.tbl,
                    v_fk.tbl || '_' || v_fk.col || '_fkey',
                    v_fk.col, v_on_delete);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '=== Total FK di-re-add: % ===', v_count;
END $$;

-- =====================================================
-- STEP 8: RE-ENABLE trigger
-- =====================================================
ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;

-- =====================================================
-- STEP 9: RESET password
-- =====================================================
DO $$
DECLARE
  v_pw_ketua     TEXT := 'Rt03Ketua2026';
  v_pw_sekret    TEXT := 'Rt03Sekret2026';
  v_pw_bendahara TEXT := 'Rt03Bendahara2026';
  v_pw_superadmin TEXT := 'Rt03Admin2026';
  v_target RECORD; v_password TEXT; v_updated INT; v_count INT := 0;
BEGIN
  FOR v_target IN
    SELECT u.id, u.email FROM auth.users u
    WHERE u.email IN ('ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id')
  LOOP
    v_password := CASE v_target.email
      WHEN 'ketua@rt03.id'      THEN v_pw_ketua
      WHEN 'sekretaris@rt03.id' THEN v_pw_sekret
      WHEN 'bendahara@rt03.id'  THEN v_pw_bendahara
      WHEN 'admin@rt03.id'      THEN v_pw_superadmin
      ELSE NULL END;
    IF v_password IS NULL THEN CONTINUE; END IF;

    UPDATE auth.users SET encrypted_password = crypt(v_password, gen_salt('bf', 10)), updated_at = now()
    WHERE id = v_target.id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated > 0 THEN v_count := v_count + 1; END IF;
  END LOOP;
  CREATE TEMP TABLE IF NOT EXISTS _reset_summary (total_reset INT, waktu_reset TIMESTAMPTZ);
  DELETE FROM _reset_summary;
  INSERT INTO _reset_summary VALUES (v_count, now());
END $$;

-- =====================================================
-- STEP 10: SUMMARY
-- =====================================================
SELECT total_reset AS jumlah_user_berhasil_di_reset, waktu_reset FROM _reset_summary;

-- =====================================================
-- STEP 11: VERIFIKASI AKHIR
-- =====================================================
SELECT
  p.login_id, p.role::TEXT, p.is_active,
  u.email,
  CASE WHEN p.id = u.id THEN '✓ ID MATCH' ELSE '✗ ID BEDA' END AS id_check,
  CASE WHEN u.encrypted_password = crypt(
    CASE u.email
      WHEN 'ketua@rt03.id'      THEN 'Rt03Ketua2026'
      WHEN 'sekretaris@rt03.id' THEN 'Rt03Sekret2026'
      WHEN 'bendahara@rt03.id'  THEN 'Rt03Bendahara2026'
      WHEN 'admin@rt03.id'      THEN 'Rt03Admin2026'
      ELSE '' END, u.encrypted_password)
    THEN '✓ COCOK' ELSE '✗ GAGAL' END AS password_test
FROM profiles p
JOIN auth.users u ON u.email IN ('ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id')
WHERE p.login_id IN ('B-1','B-5','C-2','X-0')
ORDER BY CASE p.login_id WHEN 'B-1' THEN 1 WHEN 'B-5' THEN 2 WHEN 'C-2' THEN 3 WHEN 'X-0' THEN 4 ELSE 9 END;

-- =====================================================
-- STEP 12: VERIFIKASI FK
-- =====================================================
SELECT p.login_id, COUNT(jt.id) AS jumlah_jimpitan_tagihan
FROM profiles p
LEFT JOIN jimpitan_tagihan jt ON jt.profile_id = p.id
WHERE p.login_id IN ('B-1','B-5','C-2','X-0')
GROUP BY p.login_id
ORDER BY p.login_id;