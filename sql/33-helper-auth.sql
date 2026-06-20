-- =====================================================
-- 33-HELPER-AUTH: Buat function SECURITY DEFINER untuk
--   query auth.users dari SQL Editor (yang tidak punya
--   akses langsung ke schema auth)
-- =====================================================

-- Drop kalau ada
DROP FUNCTION IF EXISTS public.get_auth_user_id(TEXT);
DROP FUNCTION IF EXISTS public.get_auth_user_email(TEXT);
DROP FUNCTION IF EXISTS public.diag_login_pengurus();

-- 1) Lookup auth.users.id berdasarkan email
CREATE OR REPLACE FUNCTION public.get_auth_user_id(p_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id FROM auth.users WHERE email = p_email LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_user_id(TEXT) TO anon, authenticated, postgres;

-- 2) Lookup email berdasarkan auth.users.id
CREATE OR REPLACE FUNCTION public.get_auth_user_email(p_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT email FROM auth.users WHERE id = p_id LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_user_email(UUID) TO anon, authenticated, postgres;

-- 3) All-in-one: diagnosa login pengurus
--    Returns: login_id, profile_id, auth_id, id_match, is_active, profile_exists
CREATE OR REPLACE FUNCTION public.diag_login_pengurus(p_login_id TEXT, p_email TEXT)
RETURNS TABLE(
  login_id     TEXT,
  profile_id   UUID,
  auth_id      UUID,
  id_match     TEXT,
  is_active    BOOLEAN,
  profile_role TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT
    p.login_id,
    p.id                                                         AS profile_id,
    (SELECT id FROM auth.users WHERE email = p_email)            AS auth_id,
    CASE
      WHEN p.id IS NULL                                          THEN 'PROFILE TIDAK ADA'
      WHEN (SELECT id FROM auth.users WHERE email = p_email) IS NULL THEN 'AUTH USER TIDAK ADA'
      WHEN p.id = (SELECT id FROM auth.users WHERE email = p_email) THEN 'ID COCOK'
      ELSE 'ID BEDA'
    END                                                          AS id_match,
    p.is_active,
    p.role::TEXT                                                 AS profile_role
  FROM profiles p
  WHERE p.login_id = p_login_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.diag_login_pengurus(TEXT, TEXT) TO anon, authenticated, postgres;