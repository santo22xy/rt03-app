-- Cek apakah function set_warga_pin sudah benar
SELECT 
  p.proname, 
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid) as returns
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace 
  AND p.proname = 'set_warga_pin';

-- Kalau args menunjukkan TEXT, TEXT → function sudah benar
-- Tapi kalau ada multiple signature, akan ada 2 baris

-- DROP semua signature untuk bersih
DROP FUNCTION IF EXISTS public.set_warga_pin(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.set_warga_pin(unknown, unknown) CASCADE;
DROP FUNCTION IF EXISTS public.set_warga_pin() CASCADE;

-- Create ulang dengan signature eksplisit
CREATE OR REPLACE FUNCTION public.set_warga_pin(p_login_id TEXT, p_pin TEXT)
RETURNS VOID
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

GRANT EXECUTE ON FUNCTION public.set_warga_pin(TEXT, TEXT) TO anon, authenticated;

-- Test
SELECT set_warga_pin('A-1', '123456');
SELECT set_warga_pin('A-2', '123456');
SELECT set_warga_pin('B-1', '123456');
SELECT set_warga_pin('B-5', '123456');
SELECT set_warga_pin('C-3', '123456');

-- Verifikasi
SELECT login_id, (pin_hash IS NOT NULL) as has_pin, length(pin_hash) as hash_len
FROM profiles WHERE role = 'WARGA' ORDER BY login_id;