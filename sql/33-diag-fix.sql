-- =====================================================
-- 33-DIAG-FIX: Cek konflik profile.id d421051f-...
-- =====================================================

SELECT
  'PROFILE DI id d421051f...' AS info,
  login_id,
  role::TEXT,
  nama_kk,
  is_active::TEXT
FROM profiles
WHERE id = 'd421051f-3e5c-4c6a-8138-a279e8d6fc6e'

UNION ALL

SELECT
  'PROFILE DENGAN login_id B-1',
  id::TEXT,
  role::TEXT,
  nama_kk,
  is_active::TEXT
FROM profiles
WHERE login_id = 'B-1'

UNION ALL

SELECT
  'SEMUA profile dg id = salah satu auth.users.id',
  p.login_id,
  p.role::TEXT,
  p.id::TEXT,
  u.email
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email IN ('ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id')

UNION ALL

SELECT
  'SEMUA profile dg login_id pengurus',
  login_id,
  role::TEXT,
  id::TEXT,
  is_active::TEXT
FROM profiles
WHERE login_id IN ('B-1','B-5','C-2','X-0')

ORDER BY 1, 2 NULLS LAST;