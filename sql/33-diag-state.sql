-- =====================================================
-- 33-DIAG: Diagnosa state profiles vs auth.users
-- Versi single SELECT (Supabase cuma tampilkan 1 result terakhir)
-- =====================================================

WITH diag AS (
  SELECT
    'A.Profile pengurus' AS kategori,
    p.login_id::TEXT       AS info1,
    p.role::TEXT           AS info2,
    p.id::TEXT             AS info3,
    p.is_active::TEXT      AS info4
  FROM profiles p
  WHERE p.login_id IN ('B-1','B-5','C-2','X-0')

  UNION ALL

  SELECT
    'B.Profile id=auth.users.id',
    p.login_id,
    p.role::TEXT,
    p.id::TEXT,
    u.email
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE u.email IN ('ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id')

  UNION ALL

  SELECT
    'C.Auth.users pengurus',
    u.email,
    u.id::TEXT,
    u.created_at::TEXT,
    NULL
  FROM auth.users u
  WHERE u.email IN ('ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id')

  UNION ALL

  SELECT
    'D.Profile id=ketua',
    p.login_id,
    p.role::TEXT,
    p.nama_kk,
    p.is_active::TEXT
  FROM profiles p
  WHERE p.id = 'd421051f-3e5c-4c6a-8138-a279e8d6fc6e'

  UNION ALL

  SELECT
    'E.Cross-check profiles↔auth',
    p.login_id,
    CASE WHEN p.id = u.id THEN 'ID MATCH' ELSE 'ID BEDA' END,
    p.id::TEXT,
    u.email
  FROM profiles p
  LEFT JOIN auth.users u ON u.email IN ('ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id')
  WHERE p.id IN (
    SELECT id FROM auth.users
    WHERE email IN ('ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id')
  )

  UNION ALL

  SELECT
    'G.Profile dgn login_id mirip',
    p.login_id,
    p.role::TEXT,
    p.id::TEXT,
    NULL
  FROM profiles p
  WHERE p.login_id ILIKE ANY(ARRAY['%ketua%','%sekret%','%bendahara%','%admin%'])
     OR p.login_id IS NULL

  ORDER BY 1, 2
)
SELECT * FROM diag;

-- FK list (tetap terpisah, 1 result)
SELECT
  t.relname AS table_name,
  c.conname AS constraint_name,
  n.nspname AS schema_name
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE c.contype = 'f'
  AND c.confrelid = 'public.profiles'::regclass
ORDER BY t.relname, c.conname;