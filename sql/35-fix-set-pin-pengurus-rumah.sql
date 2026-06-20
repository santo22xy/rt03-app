-- =====================================================
-- 35-FIX-SET-PIN-PENGURUS-RUMAH
-- Agar pengurus (Ketua RT, Bendahara, Sekretaris) yang
-- punya alamat rumah (B-1, B-5, C-2) bisa login via form
-- PIN warga juga, sama seperti B-5 yang sudah di-set
-- di script 34.
--
-- PIN default = 123456 (sama dengan default warga).
-- Pengurus bisa ganti via Dashboard > Warga > Reset PIN.
--
-- X-0 (Superadmin placeholder) TIDAK di-set PIN-nya
-- karena bukan alamat rumah nyata (Blok X No 0 tidak ada).
-- =====================================================

UPDATE profiles
SET pin_hash = crypt('123456', gen_salt('bf', 10))
WHERE login_id IN ('B-1', 'C-2')
  AND pin_hash IS NULL;

-- =====================================================
-- Verifikasi
-- =====================================================
SELECT '=== PIN PENGURUS ===' AS section;

SELECT
  login_id,
  nama_kk,
  role::TEXT,
  CASE
    WHEN pin_hash IS NOT NULL THEN '✓ PIN SET (' || (pin_hash IS NOT NULL)::TEXT || ')'
    ELSE '✗ BELUM ADA PIN'
  END AS pin_status,
  is_active
FROM profiles
WHERE login_id IN ('B-1','B-5','C-2','X-0')
ORDER BY CASE login_id WHEN 'B-1' THEN 1 WHEN 'B-5' THEN 2 WHEN 'C-2' THEN 3 WHEN 'X-0' THEN 4 ELSE 9 END;

-- =====================================================
-- Test verifikasi PIN
-- =====================================================
SELECT '=== TEST VERIFIKASI PIN ===' AS section;

SELECT
  login_id,
  CASE
    WHEN pin_hash = crypt('123456', pin_hash) THEN '✓ PIN 123456 COCOK'
    WHEN pin_hash IS NULL THEN '— (no pin)'
    ELSE '✗ PIN BEDA'
  END AS test_pin_default
FROM profiles
WHERE login_id IN ('B-1','B-5','C-2','X-0')
ORDER BY CASE login_id WHEN 'B-1' THEN 1 WHEN 'B-5' THEN 2 WHEN 'C-2' THEN 3 WHEN 'X-0' THEN 4 ELSE 9 END;