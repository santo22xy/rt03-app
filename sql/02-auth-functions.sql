-- =====================================================
-- Fungsi tambahan untuk login warga (Batch 2)
-- Jalankan di Supabase SQL Editor setelah schema utama
-- =====================================================

-- 1) Fungsi verifikasi PIN warga
--    Menggunakan bcrypt comparison dari extension pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

  -- Compare dengan crypt() (bcrypt)
  RETURN v_hash = crypt(p_pin, v_hash);
END;
$$;

-- 2) Fungsi hash PIN (dipakai pengurus saat set/reset PIN warga)
CREATE OR REPLACE FUNCTION public.hash_warga_pin(p_pin TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT crypt(p_pin, gen_salt('bf', 10));
$$;

-- 3) Fungsi buat session warga (token random, simpan di tabel sessions)
CREATE TABLE IF NOT EXISTS public.warga_sessions (
  token TEXT PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_warga_sessions_profile ON warga_sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_warga_sessions_expires ON warga_sessions(expires_at);

ALTER TABLE public.warga_sessions ENABLE ROW LEVEL SECURITY;

-- Tidak ada policy SELECT/INSERT untuk user biasa (hanya SECURITY DEFINER RPC)
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
  -- Generate random 64-char token
  v_token := encode(gen_random_bytes(32), 'hex');
  
  INSERT INTO warga_sessions (token, profile_id, expires_at)
  VALUES (v_token, p_profile_id, NOW() + INTERVAL '7 days');
  
  RETURN v_token;
END;
$$;

-- 4) Fungsi resolve session warga dari token
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

-- 5) Grant execute untuk authenticated (dipakai via PostgREST RPC)
GRANT EXECUTE ON FUNCTION public.verify_warga_pin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hash_warga_pin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_warga_session(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_warga_from_session(TEXT) TO anon, authenticated;

-- 6) Bersihkan session expired (optional: jalankan via cron atau trigger)
-- DELETE FROM warga_sessions WHERE expires_at < NOW();

-- =====================================================
-- CARA PAKAI:
-- 
-- 1) Pengurus set PIN warga via SQL editor:
--    UPDATE profiles 
--    SET pin_hash = hash_warga_pin('123456') 
--    WHERE login_id = 'A-1';
--
-- 2) Warga login: panggil RPC verify_warga_pin('A-1', '123456')
--    kalau TRUE, panggil create_warga_session(profile_id) → dapat token
--    simpan token di cookie, redirect ke /warga
-- =====================================================