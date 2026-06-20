-- =====================================================
-- Diagnosa + fix trigger auth.users
-- Jalankan step by step, lihat error di setiap step
-- =====================================================

-- STEP 1: Cek struktur profiles saat ini
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- STEP 2: Lihat semua trigger di auth.users
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'auth' AND event_object_table = 'users';

-- STEP 3: Disable trigger (solusi cepat) supaya bisa create user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- STEP 4: Sekarang coba Create User lagi via Dashboard
-- Kalau masih error, berarti masalah bukan di trigger kita
-- Mungkin ada trigger dari extension lain (misal: Supabase Auth hooks)

-- STEP 5: Cek SEMUA trigger di auth schema (bukan hanya yang kita buat)
SELECT 
  n.nspname AS schema,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  p.proname AS function_name,
  t.tgenabled AS enabled
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE n.nspname = 'auth' AND c.relname = 'users'
  AND NOT t.tgisinternal;  -- skip system triggers

-- STEP 6: Cek RLS policies di profiles
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles';

-- STEP 7: Cek log error terbaru (kalau ada)
-- Kalau ada kolom "Database error", cek di sini:
-- Supabase Dashboard → Logs → Database → cari error
-- Atau jalankan query ini untuk lihat session activity:
SELECT datname, usename, application_name, client_addr, state, query_start, LEFT(query, 200) as query
FROM pg_stat_activity
WHERE datname = current_database()
  AND state != 'idle'
ORDER BY query_start DESC NULLS LAST
LIMIT 10;