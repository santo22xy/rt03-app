-- =====================================================
-- Aktifkan pgcrypto (WAJIB untuk crypt/gen_salt)
-- Jalankan ini DULU sebelum create function
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hapus function lama yang mungkin broken
DROP FUNCTION IF EXISTS public.set_warga_pin(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.verify_warga_pin(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.hash_warga_pin(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.create_warga_session(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_warga_from_session(TEXT) CASCADE;

-- Recreate verify_warga_pin
CREATE OR REPLACE FUNCTION public.verify_warga_pin(
  p_login_id TEXT,
  p_pin TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT pin_hash INTO v_hash
  FROM profiles
  WHERE login_id = UPPER(p_login_id) AND is_active = TRUE
  LIMIT 1;

  IF v_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN v_hash = crypt(p_pin, v_hash);
END;
$$;

-- set_warga_pin
CREATE OR REPLACE FUNCTION public.set_warga_pin(
  p_login_id TEXT,
  p_pin TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET pin_hash = crypt(p_pin, gen_salt('bf', 10))
  WHERE login_id = UPPER(p_login_id);
END;
$$;

-- create_warga_session
CREATE OR REPLACE FUNCTION public.create_warga_session(p_profile_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO warga_sessions (token, profile_id, expires_at)
  VALUES (v_token, p_profile_id, NOW() + INTERVAL '7 days');
  RETURN v_token;
END;
$$;

-- Grant
GRANT EXECUTE ON FUNCTION public.verify_warga_pin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_warga_pin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_warga_session(UUID) TO anon, authenticated;

-- Test pgcrypto langsung
SELECT crypt('test', gen_salt('bf', 10)) as sample_hash;

-- Verify functions exist
SELECT proname FROM pg_proc 
WHERE pronamespace = 'public'::regnamespace 
  AND proname IN ('set_warga_pin','verify_warga_pin','create_warga_session')
ORDER BY proname;