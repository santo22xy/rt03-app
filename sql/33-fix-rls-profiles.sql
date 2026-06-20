-- =====================================================
-- 33-FIX-RLS-PROFILES: Pastikan profile bisa di-SELECT
--    oleh user yang sudah login (authenticated)
-- =====================================================

-- Drop policy lama kalau ada
DROP POLICY IF EXISTS "profiles_read_all"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own"     ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;

-- Policy 1: Setiap user login boleh baca profilenya sendiri
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Policy 2: Pengurus boleh baca semua profile (untuk lookup di dashboard)
CREATE POLICY "profiles_select_pengurus"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id = auth.uid()
        AND p2.role IN ('KETUA_RT','SEKRETARIS','BENDAHARA','PENGURUS','SUPERADMIN')
        AND p2.is_active = TRUE
    )
  );

-- Policy 3: Service role (PostgREST) tetap bisa baca semua
--    (Supabase auto-bypass untuk service_role key)
--    Tapi tambahkan fallback USING(TRUE) untuk anon (untuk ambil profil publik warga)
CREATE POLICY "profiles_read_anon"
  ON public.profiles
  FOR SELECT
  TO anon
  USING (TRUE);

-- Pastikan RLS aktif
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Verify
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;