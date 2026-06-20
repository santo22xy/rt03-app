-- =====================================================
-- 32: RESET PASSWORD PENGURUS (BEDA PER USER)
-- Reset password 3 pengurus ke nilai yang ditentukan
-- =====================================================
--
-- PASSWORD DEFAULT (silakan edit di bawah jika ingin berbeda):
--   B-1 (Ketua RT)    → Rt03Ketua2026
--   B-5 (Sekretaris)  → Rt03Sekret2026
--   C-2 (Bendahara)   → Rt03Bendahara2026
--
-- CARA PAKAI:
-- 1. Buka Supabase Dashboard → SQL Editor
-- 2. Paste & Run seluruh script
-- 3. Catat email pengurus dari PREVIEW
-- 4. Login di /login (tombol kecil "Login Pengurus")
-- =====================================================

-- =====================================================
-- KONFIGURASI PASSWORD PER PENGURUS
-- Edit di sini kalau ingin ganti password
-- =====================================================
DO $$
BEGIN
  -- (Placeholder section — password aktual ada di DO block bawah)
  PERFORM 1;
END $$;

-- =====================================================
-- PREVIEW: Lihat pengurus yang akan di-reset
-- =====================================================
SELECT '=== PREVIEW: PENGURUS YANG AKAN DI-RESET ===' AS section;
SELECT
  p.login_id,
  p.nama_kk,
  p.role,
  u.email,
  CASE p.role
    WHEN 'KETUA_RT'   THEN 'Rt03Ketua2026'
    WHEN 'SEKRETARIS' THEN 'Rt03Sekret2026'
    WHEN 'BENDAHARA'  THEN 'Rt03Bendahara2026'
  END AS password_baru
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS')
  AND p.is_active = TRUE
ORDER BY
  CASE p.role WHEN 'KETUA_RT' THEN 1 WHEN 'BENDAHARA' THEN 2 WHEN 'SEKRETARIS' THEN 3 END;

-- =====================================================
-- RESET: Update encrypted_password per pengurus
-- crypt() dengan gen_salt('bf', 10) = bcrypt cost 10 (standar Supabase)
-- =====================================================
DO $$
DECLARE
  v_pw_ketua     TEXT := 'Rt03Ketua2026';
  v_pw_sekret    TEXT := 'Rt03Sekret2026';
  v_pw_bendahara TEXT := 'Rt03Bendahara2026';
  v_target RECORD;
  v_password TEXT;
  v_updated INT := 0;
  v_count INT := 0;
BEGIN
  RAISE NOTICE '=== MULAI RESET PASSWORD PENGURUS ===';
  RAISE NOTICE 'Ketua RT    (B-1) -> %', v_pw_ketua;
  RAISE NOTICE 'Sekretaris  (B-5) -> %', v_pw_sekret;
  RAISE NOTICE 'Bendahara   (C-2) -> %', v_pw_bendahara;
  RAISE NOTICE '';

  FOR v_target IN
    SELECT u.id, u.email, p.login_id, p.nama_kk, p.role
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS')
      AND p.is_active = TRUE
    ORDER BY
      CASE p.role WHEN 'KETUA_RT' THEN 1 WHEN 'BENDAHARA' THEN 2 WHEN 'SEKRETARIS' THEN 3 END
  LOOP
    -- Tentukan password berdasarkan role
    v_password := CASE v_target.role
      WHEN 'KETUA_RT'   THEN v_pw_ketua
      WHEN 'SEKRETARIS' THEN v_pw_sekret
      WHEN 'BENDAHARA'  THEN v_pw_bendahara
      ELSE NULL
    END;

    IF v_password IS NULL THEN
      RAISE NOTICE '⚠ SKIP [%] % - role % tidak punya password default',
        v_target.login_id, v_target.nama_kk, v_target.role;
      CONTINUE;
    END IF;

    UPDATE auth.users
    SET
      encrypted_password = crypt(v_password, gen_salt('bf', 10)),
      updated_at = now()
    WHERE id = v_target.id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated > 0 THEN
      v_count := v_count + 1;
      RAISE NOTICE '✓ [%] % (%) - email: %',
        v_target.login_id, v_target.nama_kk, v_target.role, v_target.email;
    ELSE
      RAISE NOTICE '✗ GAGAL [%] % (%)',
        v_target.login_id, v_target.nama_kk, v_target.role;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '=== SELESAI: % pengurus di-reset ===', v_count;
END $$;

-- =====================================================
-- VERIFIKASI: Pastikan hash berubah dengan format valid
-- =====================================================
SELECT '=== VERIFIKASI HASH ===' AS section;
SELECT
  p.login_id,
  p.nama_kk,
  p.role,
  u.email,
  LEFT(u.encrypted_password, 7) AS hash_prefix,
  LENGTH(u.encrypted_password)   AS hash_length,
  CASE
    WHEN u.encrypted_password IS NULL THEN '✗ KOSONG'
    WHEN u.encrypted_password LIKE '$2a$10$%'
      OR u.encrypted_password LIKE '$2b$10$%' THEN '✓ bcrypt cost 10'
    ELSE '? format lain'
  END AS hash_status,
  u.updated_at
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS')
  AND p.is_active = TRUE
ORDER BY
  CASE p.role WHEN 'KETUA_RT' THEN 1 WHEN 'BENDAHARA' THEN 2 WHEN 'SEKRETARIS' THEN 3 END;

-- =====================================================
-- TEST VERIFIKASI PASSWORD (simulasi login)
-- =====================================================
SELECT '=== TEST VERIFIKASI PASSWORD ===' AS section;
DO $$
DECLARE
  v_pw_ketua     TEXT := 'Rt03Ketua2026';
  v_pw_sekret    TEXT := 'Rt03Sekret2026';
  v_pw_bendahara TEXT := 'Rt03Bendahara2026';
  v_target RECORD;
  v_test_pw TEXT;
  v_match BOOLEAN;
BEGIN
  RAISE NOTICE 'Simulasi login dengan password yang baru di-set:';
  RAISE NOTICE '';

  FOR v_target IN
    SELECT u.id, u.email, u.encrypted_password, p.login_id, p.nama_kk, p.role
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS')
      AND p.is_active = TRUE
    ORDER BY
      CASE p.role WHEN 'KETUA_RT' THEN 1 WHEN 'BENDAHARA' THEN 2 WHEN 'SEKRETARIS' THEN 3 END
  LOOP
    v_test_pw := CASE v_target.role
      WHEN 'KETUA_RT'   THEN v_pw_ketua
      WHEN 'SEKRETARIS' THEN v_pw_sekret
      WHEN 'BENDAHARA'  THEN v_pw_bendahara
      ELSE NULL
    END;

    IF v_test_pw IS NULL THEN
      CONTINUE;
    END IF;

    -- bcrypt check: crypt(password_plain, hash) = hash if match
    v_match := (v_target.encrypted_password = crypt(v_test_pw, v_target.encrypted_password));

    RAISE NOTICE '% [%] % (%) -> %',
      CASE WHEN v_match THEN '✓ COCOK' ELSE '✗ GAGAL' END,
      v_target.login_id,
      v_target.nama_kk,
      v_target.role,
      v_target.email;
  END LOOP;
END $$;

-- =====================================================
-- INSTRUKSI LOGIN
-- =====================================================
-- 1. Buka http://localhost:3000/login
-- 2. Scroll ke bawah, cari tombol/link kecil "Login Pengurus"
--    (easter egg tersembunyi di footer / bawah form warga)
-- 3. Masukkan:
--    Email:    (lihat dari kolom email di PREVIEW di atas)
--    Password: sesuai role:
--      - Ketua RT (B-1)    → Rt03Ketua2026
--      - Sekretaris (B-5)  → Rt03Sekret2026
--      - Bendahara (C-2)   → Rt03Bendahara2026
-- =====================================================