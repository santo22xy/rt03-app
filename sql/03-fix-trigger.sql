-- =====================================================
-- Fix trigger handle_new_user (Batch 2 issue)
-- Error: "Failed to create user: Database error creating new user"
-- Cause: trigger insert ke kolom email di profiles, tapi kolom itu tidak ada
-- =====================================================

-- 1) Cek dulu schema profiles saat ini
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 2) Hapus trigger lama
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 3) Buat ulang trigger function yang benar (tanpa kolom email)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    login_id,
    nama_kk,
    role,
    is_active
  )
  VALUES (
    NEW.id,
    LOWER(SPLIT_PART(NEW.email, '@', 1)) || '-' || SUBSTRING(NEW.id::text, 1, 8),
    COALESCE(
      NEW.raw_user_meta_data->>'nama_kk',
      SPLIT_PART(NEW.email, '@', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'role',
      'WARGA'
    ),
    TRUE
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- 4) Pasang ulang trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5) Verifikasi
SELECT trigger_name, event_manipulation, event_object_schema, event_object_table
FROM information_schema.triggers
WHERE event_object_schema = 'auth' AND event_object_table = 'users';