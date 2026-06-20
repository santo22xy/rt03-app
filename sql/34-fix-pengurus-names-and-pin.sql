-- =====================================================
-- 34-FIX-PENGURUS-NAMES-AND-PIN
-- Update nama pengurus (Ketua, Bendahara, Sekretaris)
-- sesuai permintaan terbaru, dan set PIN untuk B-5
-- agar bisa login via form warga biasa.
--
-- Nama sebelumnya (placeholder 33-fix-missing-profiles):
--   B-1 (Ketua RT)   : 'Bpk. Budi Santoso (Ketua RT)'
--   C-2 (Bendahara)  : 'Bpk/Ibu Bendahara RT'
--   B-5 (Sekretaris) : 'Bpk/Ibu Sekretaris RT'  / 'Budi Setiawan'
--
-- Nama baru (sesuai permintaan user):
--   B-1 (Ketua RT)   : 'Budi Sulaiman'
--   C-2 (Bendahara)  : 'Setyo Budi'
--   B-5 (Sekretaris) : 'Budi Setiawan'
--
-- PIN untuk B-5 di-set ke 123456 (sama dengan default warga).
-- Bisa diganti via dashboard pengurus > Warga > Reset PIN.
-- =====================================================

-- =====================================================
-- STEP 1: UPDATE nama ketua, bendahara, sekretaris
-- =====================================================
UPDATE profiles SET nama_kk = 'Budi Sulaiman'
  WHERE login_id = 'B-1' AND role = 'KETUA_RT';

UPDATE profiles SET nama_kk = 'Setyo Budi'
  WHERE login_id = 'C-2' AND role = 'BENDAHARA';

UPDATE profiles SET nama_kk = 'Budi Setiawan'
  WHERE login_id = 'B-5' AND role = 'SEKRETARIS';

-- =====================================================
-- STEP 2: Set PIN 123456 untuk B-5 (wadah sekretaris)
-- Supaya user bisa login via form warga biasa dengan B-5 + 123456
-- (route ke /warga, sesi warga). Untuk akses /dashboard pengurus,
-- user tetap harus login via easter egg (klik logo 5x) dengan
-- email sekretaris@rt03.id + password.
-- =====================================================
UPDATE profiles
SET pin_hash = crypt('123456', gen_salt('bf', 10))
WHERE login_id = 'B-5' AND role = 'SEKRETARIS';

-- =====================================================
-- STEP 3: Verifikasi hasil
-- =====================================================
SELECT '=== HASIL UPDATE PENGURUS ===' AS section;

SELECT
  login_id,
  nama_kk,
  role::TEXT,
  is_active,
  CASE
    WHEN pin_hash IS NOT NULL THEN '✓ PIN SET'
    WHEN role IN ('KETUA_RT','BENDAHARA','SEKRETARIS','PENGURUS','SUPERADMIN')
      THEN '— (login via email/password)'
    ELSE '✗ BELUM ADA PIN'
  END AS pin_status
FROM profiles
WHERE login_id IN ('B-1','B-5','C-2','X-0')
ORDER BY CASE login_id WHEN 'B-1' THEN 1 WHEN 'B-5' THEN 2 WHEN 'C-2' THEN 3 WHEN 'X-0' THEN 4 ELSE 9 END;