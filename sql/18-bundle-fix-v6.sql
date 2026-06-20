-- =====================================================
-- Bundle v6: pgcrypto + drop FK + recreate functions + sample
-- Jalankan di Supabase SQL Editor
-- =====================================================

-- STEP 1: Enable pgcrypto (letakkan functions di schema 'extensions')
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- STEP 2: Drop FK
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- STEP 3: Recreate functions dengan search_path yang benar
--         (pgcrypto install di schema 'extensions' di Supabase)
DROP FUNCTION IF EXISTS public.verify_warga_pin(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.hash_warga_pin(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.set_warga_pin(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.create_warga_session(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_warga_from_session(TEXT) CASCADE;

CREATE OR REPLACE FUNCTION public.verify_warga_pin(
  p_login_id TEXT, p_pin TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_hash TEXT;
BEGIN
  SELECT pin_hash INTO v_hash
  FROM profiles
  WHERE login_id = UPPER(p_login_id) AND is_active = TRUE
  LIMIT 1;
  IF v_hash IS NULL THEN RETURN FALSE; END IF;
  RETURN v_hash = crypt(p_pin, v_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_warga_pin(
  p_login_id TEXT, p_pin TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE profiles
  SET pin_hash = crypt(p_pin, gen_salt('bf', 10))
  WHERE login_id = UPPER(p_login_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.hash_warga_pin(p_pin TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public, extensions
AS $$ SELECT crypt(p_pin, gen_salt('bf', 10)); $$;

-- Session functions (tidak butuh pgcrypto, tapi tetep di-set)
CREATE OR REPLACE FUNCTION public.create_warga_session(p_profile_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_token TEXT;
BEGIN
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO warga_sessions (token, profile_id, expires_at)
  VALUES (v_token, p_profile_id, NOW() + INTERVAL '7 days');
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_warga_from_session(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_profile_id UUID;
BEGIN
  SELECT profile_id INTO v_profile_id
  FROM warga_sessions
  WHERE token = p_token AND expires_at > NOW()
  LIMIT 1;
  RETURN v_profile_id;
END;
$$;

-- Grant
GRANT EXECUTE ON FUNCTION public.verify_warga_pin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_warga_pin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hash_warga_pin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_warga_session(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_warga_from_session(TEXT) TO anon, authenticated;

-- STEP 4: Insert 5 sample (skip konflik)
INSERT INTO profiles (id, login_id, nama_kk, blok, nomor_rumah, no_hp, kategori_tarif, role, is_active)
VALUES 
  (gen_random_uuid(), 'A-1', 'Budi Santoso', 'A', '1', '6281234567890', 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'A-2', 'Siti Aminah', 'A', '2', '6281234567891', 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'B-1', 'Joko Widodo', 'B', '1', NULL, 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'B-5', 'Sumiati', 'B', '5', '6281234567892', 'JANDA', 'WARGA', TRUE),
  (gen_random_uuid(), 'C-3', 'Agus Salim', 'C', '3', '6281234567893', 'NORMAL', 'WARGA', FALSE)
ON CONFLICT DO NOTHING;

-- STEP 5: Set PIN
SELECT set_warga_pin('A-1', '123456');
SELECT set_warga_pin('A-2', '123456');
SELECT set_warga_pin('B-5', '123456');
SELECT set_warga_pin('C-3', '123456');

-- =====================================================
-- VERIFIKASI
-- =====================================================

SELECT login_id, nama_kk, blok, nomor_rumah, role, is_active,
       (pin_hash IS NOT NULL) as has_pin
FROM profiles 
ORDER BY role DESC, blok, nomor_rumah::int NULLS LAST, login_id;

SELECT verify_warga_pin('A-1', '123456') as A1_benar,
       verify_warga_pin('A-1', '000000') as A1_salah;
