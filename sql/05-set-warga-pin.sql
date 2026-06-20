-- =====================================================
-- Tambah fungsi set_warga_pin (untuk register)
-- Agar hash PIN ter-encrypt dengan benar
-- =====================================================

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

GRANT EXECUTE ON FUNCTION public.set_warga_pin(TEXT, TEXT) TO anon, authenticated;