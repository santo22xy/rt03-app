-- =====================================================
-- 33-FIX-MISSING-PROFILES: Insert/update profile untuk
--   4 pengurus. TIDAK ALTER TABLE pada auth.users
--   (karena SQL Editor role bukan owner auth.users)
-- =====================================================

-- Helper: ambil auth.users.id berdasarkan email
-- Dibuat di sini supaya script self-contained
CREATE OR REPLACE FUNCTION public._get_auth_id(p_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id FROM auth.users WHERE email = p_email LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public._get_auth_id(TEXT) TO anon, authenticated, postgres;

-- =====================================================
-- STEP 1: DIAGNOSA state 4 pengurus
-- =====================================================
SELECT '=== DIAGNOSA STATE 4 PENGURUS ===' AS section;

SELECT
  v.login_id,
  v.auth_id,
  v.profile_id,
  v.role::TEXT                                        AS profile_role,
  v.is_active,
  CASE
    WHEN v.profile_id IS NULL                          THEN '✗ PROFILE TIDAK ADA'
    WHEN v.profile_id <> v.auth_id                     THEN '✗ ID BEDA'
    WHEN v.is_active = FALSE                           THEN '✗ NON-AKTIF'
    ELSE                                                    '✓ OK'
  END                                                 AS status
FROM (
  SELECT
    pl.login_id,
    public._get_auth_id(
      CASE pl.login_id
        WHEN 'B-1' THEN 'ketua@rt03.id'
        WHEN 'B-5' THEN 'sekretaris@rt03.id'
        WHEN 'C-2' THEN 'bendahara@rt03.id'
        WHEN 'X-0' THEN 'admin@rt03.id'
      END
    )                                                  AS auth_id,
    pl.id                                              AS profile_id,
    pl.role,
    pl.is_active
  FROM profiles pl
  WHERE pl.login_id IN ('B-1','B-5','C-2','X-0')
) v
ORDER BY v.login_id;

-- =====================================================
-- STEP 2: Buat profile yang hilang dengan id = auth.users.id
--         Pakai INSERT ... WHERE NOT EXISTS supaya idempotent
-- =====================================================

-- B-1: Ketua RT
INSERT INTO profiles (id, login_id, nama_kk, role, is_active, kategori_tarif, blok, nomor_rumah, catatan)
SELECT
  public._get_auth_id('ketua@rt03.id'),
  'B-1', 'Bpk. Budi Santoso (Ketua RT)', 'KETUA_RT', TRUE, 'NORMAL', 'B', 1,
  'Auto-created by 33-fix-missing-profiles'
WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE login_id = 'B-1');

-- B-5: Sekretaris
INSERT INTO profiles (id, login_id, nama_kk, role, is_active, kategori_tarif, blok, nomor_rumah, catatan)
SELECT
  public._get_auth_id('sekretaris@rt03.id'),
  'B-5', 'Bpk/Ibu Sekretaris RT', 'SEKRETARIS', TRUE, 'NORMAL', 'B', 5,
  'Auto-created by 33-fix-missing-profiles'
WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE login_id = 'B-5');

-- C-2: Bendahara
INSERT INTO profiles (id, login_id, nama_kk, role, is_active, kategori_tarif, blok, nomor_rumah, catatan)
SELECT
  public._get_auth_id('bendahara@rt03.id'),
  'C-2', 'Bpk/Ibu Bendahara RT', 'BENDAHARA', TRUE, 'NORMAL', 'C', 2,
  'Auto-created by 33-fix-missing-profiles'
WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE login_id = 'C-2');

-- X-0: Superadmin
INSERT INTO profiles (id, login_id, nama_kk, role, is_active, kategori_tarif, blok, nomor_rumah, catatan)
SELECT
  public._get_auth_id('admin@rt03.id'),
  'X-0', 'Admin RT03 (Superadmin)', 'SUPERADMIN', TRUE, 'NORMAL', 'X', 0,
  'Auto-created by 33-fix-missing-profiles'
WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE login_id = 'X-0');

-- =====================================================
-- STEP 3: Pastikan semua profile pengurus AKTIF
-- =====================================================
UPDATE profiles SET is_active = TRUE
WHERE login_id IN ('B-1','B-5','C-2','X-0') AND is_active = FALSE;

-- =====================================================
-- STEP 4: VERIFIKASI AKHIR
-- =====================================================
SELECT '=== HASIL AKHIR ===' AS section;

SELECT
  v.login_id,
  v.auth_id,
  v.profile_id,
  v.role::TEXT                                        AS profile_role,
  v.is_active,
  CASE
    WHEN v.profile_id IS NULL                          THEN '✗ PROFILE TIDAK ADA'
    WHEN v.profile_id <> v.auth_id                     THEN '✗ ID BEDA'
    WHEN v.is_active = FALSE                           THEN '✗ NON-AKTIF'
    ELSE                                                    '✓ OK'
  END                                                 AS status
FROM (
  SELECT
    pl.login_id,
    public._get_auth_id(
      CASE pl.login_id
        WHEN 'B-1' THEN 'ketua@rt03.id'
        WHEN 'B-5' THEN 'sekretaris@rt03.id'
        WHEN 'C-2' THEN 'bendahara@rt03.id'
        WHEN 'X-0' THEN 'admin@rt03.id'
      END
    )                                                  AS auth_id,
    pl.id                                              AS profile_id,
    pl.role,
    pl.is_active
  FROM profiles pl
  WHERE pl.login_id IN ('B-1','B-5','C-2','X-0')
) v
ORDER BY v.login_id;