-- Buat extension pgcrypto (untuk crypt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hapus function lama kalau ada (signature beda)
DROP FUNCTION IF EXISTS public.set_warga_pin(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.hash_warga_pin(TEXT);
DROP FUNCTION IF EXISTS public.verify_warga_pin(TEXT, TEXT);

-- Recreate semua function auth warga

-- 1) verify_warga_pin
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
  WHERE login_id = UPPER(p_login_id)
    AND is_active = TRUE
  LIMIT 1;

  IF v_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN v_hash = crypt(p_pin, v_hash);
END;
$$;

-- 2) hash_warga_pin
CREATE OR REPLACE FUNCTION public.hash_warga_pin(p_pin TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT crypt(p_pin, gen_salt('bf', 10));
$$;

-- 3) set_warga_pin (untuk register/reset)
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

-- 4) create_warga_session
CREATE TABLE IF NOT EXISTS public.warga_sessions (
  token TEXT PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_warga_sessions_profile ON warga_sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_warga_sessions_expires ON warga_sessions(expires_at);

ALTER TABLE public.warga_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warga_sessions_no_access" ON public.warga_sessions;
CREATE POLICY "warga_sessions_no_access" ON public.warga_sessions
  FOR ALL USING (FALSE) WITH CHECK (FALSE);

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

-- 5) get_warga_from_session
CREATE OR REPLACE FUNCTION public.get_warga_from_session(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT profile_id INTO v_profile_id
  FROM warga_sessions
  WHERE token = p_token
    AND expires_at > NOW()
  LIMIT 1;

  RETURN v_profile_id;
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.verify_warga_pin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hash_warga_pin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_warga_pin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_warga_session(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_warga_from_session(TEXT) TO anon, authenticated;

-- Verify
SELECT proname, pronargs
FROM pg_proc 
WHERE pronamespace = 'public'::regnamespace 
  AND proname IN ('verify_warga_pin','hash_warga_pin','set_warga_pin','create_warga_session','get_warga_from_session')
ORDER BY proname;