-- =====================================================
-- SQL 75: Diagnosa Pak RT + cek state pengurus
-- Tujuan: Cari kenapa Pak RT tidak muncul / statusnya hilang
-- =====================================================

-- A. Distribusi role profiles
SELECT 'a_role_dist' AS s, role, COUNT(*) AS total
FROM profiles
GROUP BY role
ORDER BY role;

-- B. Daftar semua pengurus (exclude superadmin X-0)
SELECT 'b_pengurus' AS s,
  login_id, nama_kk, role, blok, nomor_rumah, is_active,
  kyc_status, no_hp
FROM profiles
WHERE role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS')
   OR login_id = 'X-0'  -- sertakan superadmin untuk verifikasi exclude
ORDER BY
  CASE role
    WHEN 'KETUA_RT' THEN 1
    WHEN 'BENDAHARA' THEN 2
    WHEN 'SEKRETARIS' THEN 3
    WHEN 'PENGURUS' THEN 4
    ELSE 5
  END,
  login_id;

-- C. Cari user dengan nama mengandung "RT" atau "Ketua"
SELECT 'c_cari_pakrt' AS s,
  login_id, nama_kk, role, blok, nomor_rumah, is_active
FROM profiles
WHERE nama_kk ILIKE '%ketua%'
   OR nama_kk ILIKE '%rt%'
   OR login_id ILIKE '%rt%'
ORDER BY role, login_id;

-- D. Profile dengan role WARGA tapi sebenarnya pengurus (mismatch)
SELECT 'd_role_mismatch' AS s,
  login_id, nama_kk, role, blok, nomor_rumah, is_active, no_hp
FROM profiles
WHERE is_active = TRUE
  AND (no_hp ILIKE '%ketua%' OR nama_kk ILIKE '%pak rt%' OR nama_kk ILIKE '%bapak rt%')
ORDER BY login_id;

-- E. Cek user yang baru diupdate (kemungkinan role diubah)
SELECT 'e_recent_update' AS s,
  login_id, nama_kk, role, is_active,
  created_at, updated_at
FROM profiles
WHERE updated_at > NOW() - INTERVAL '7 days'
ORDER BY updated_at DESC
LIMIT 20;

NOTIFY pgrst, 'reload schema';
