-- =====================================================
-- 31: LIST EMAIL PENGURUS
-- Tujuan: Melihat email pengurus yang terdaftar di Supabase Auth
-- untuk reset password via Dashboard
-- =====================================================
--
-- CARA PAKAI:
-- 1. Buka Supabase Dashboard → SQL Editor
-- 2. Paste query di bawah
-- 3. Run
-- 4. Catat email yang muncul
-- 5. Reset via: Authentication → Users → cari email → Reset password
-- =====================================================

-- =====================================================
-- QUERY 1: Semua user pengurus (auth.users JOIN profiles)
-- =====================================================
SELECT
  u.id                                    AS auth_user_id,
  u.email                                 AS email_login,
  u.created_at                            AS tgl_dibuat,
  u.email_confirmed_at IS NOT NULL        AS email_confirmed,
  p.login_id                              AS rt_login_id,
  p.nama_kk                               AS nama,
  p.role                                  AS role_rt,
  p.blok                                  AS blok,
  p.nomor_rumah                           AS no_rumah,
  p.is_active                             AS aktif
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN')
ORDER BY
  CASE p.role
    WHEN 'KETUA_RT'    THEN 1
    WHEN 'BENDAHARA'   THEN 2
    WHEN 'SEKRETARIS'  THEN 3
    WHEN 'PENGURUS'    THEN 4
    WHEN 'SUPERADMIN'  THEN 5
    ELSE 9
  END,
  u.email;

-- =====================================================
-- QUERY 2: Hanya profile.role pengurus (cek konsistensi role)
-- =====================================================
SELECT '=== PROFILES YANG ROLE PENGURUS (tanpa auth account) ===' AS section;
SELECT
  login_id,
  nama_kk,
  role,
  blok,
  nomor_rumah,
  is_active
FROM profiles
WHERE role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN')
  AND is_active = TRUE
ORDER BY login_id;

-- =====================================================
-- QUERY 3: Cek apakah ada auth.users TANPA profiles
-- (kemungkinan orphan pengurus yang lupa dibuat profile)
-- =====================================================
SELECT '=== AUTH USERS YANG TIDAK ADA DI PROFILES ===' AS section;
SELECT
  u.id,
  u.email,
  u.created_at,
  '(tidak ada di profiles)' AS catatan
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL
ORDER BY u.created_at DESC;

-- =====================================================
-- QUERY 4: Summary
-- =====================================================
SELECT '=== RINGKASAN ===' AS section;
SELECT
  (SELECT COUNT(*) FROM auth.users)                        AS total_auth_users,
  (SELECT COUNT(*) FROM profiles WHERE role = 'KETUA_RT' AND is_active = TRUE)   AS total_ketua,
  (SELECT COUNT(*) FROM profiles WHERE role = 'BENDAHARA' AND is_active = TRUE)  AS total_bendahara,
  (SELECT COUNT(*) FROM profiles WHERE role = 'SEKRETARIS' AND is_active = TRUE) AS total_sekretaris,
  (SELECT COUNT(*) FROM profiles WHERE role = 'PENGURUS' AND is_active = TRUE)   AS total_pengurus,
  (SELECT COUNT(*) FROM profiles WHERE role = 'SUPERADMIN' AND is_active = TRUE) AS total_superadmin;

-- =====================================================
-- LANGKAH SELANJUTNYA (setelah dapat email):
-- =====================================================
-- A. VIA DASHBOARD (paling mudah):
--    1. Buka: https://supabase.com/dashboard/project/kjnmyiqzamftysgndbne/auth/users
--    2. Paste email di kolom search
--    3. Klik user → titik tiga (⋮) → "Send recovery email"
--       (link reset akan dikirim ke email pengurus)
--    ATAU
--    3. Klik user → "Reset password" → ketik password baru → Save
--
-- B. VIA SQL (langsung set password baru, tanpa dashboard):
--    Lihat: sql/32-reset-password-pengurus.sql (akan dibuatkan jika diminta)
-- =====================================================