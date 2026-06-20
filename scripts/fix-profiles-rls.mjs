// Execute SQL fix via service_role
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import fs from 'fs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function execSql(label, sql) {
  console.log(`\n=== ${label} ===`)
  const { data, error } = await sb.rpc('exec_sql', { p_sql: sql }).then(r => r, () => null)
  if (error) console.error('RPC error:', error.message)
  return data
}

async function run() {
  // Hapus semua policy profiles
  const dropPolicies = `
    DO $$
    DECLARE v_p TEXT;
    BEGIN
      FOR v_p IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'profiles'
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', v_p);
      END LOOP;
    END $$;`
  await execSql('Drop profiles policies', dropPolicies)

  // Buat policy read all (paling penting)
  await execSql('Create profiles_read_all', `CREATE POLICY "profiles_read_all" ON profiles FOR SELECT USING (TRUE);`)

  // Policy insert self
  await execSql('Create profiles_insert_self', `CREATE POLICY "profiles_insert_self" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);`)

  // Policy update own atau pengurus
  // Pakai auth.jwt()->>app_metadata->>role untuk avoid recursion
  await execSql('Create profiles_update_own', `
    CREATE POLICY "profiles_update_own_or_pengurus" ON profiles
    FOR UPDATE USING (
      auth.uid() = id
      OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('KETUA_RT','BENDAHARA','SEKRETARIS','PENGURUS','SUPERADMIN')
    );`)

  // Policy delete superadmin
  await execSql('Create profiles_delete_superadmin', `
    CREATE POLICY "profiles_delete_superadmin" ON profiles
    FOR DELETE USING (
      COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'SUPERADMIN'
    );`)

  // Set app_metadata.role untuk semua user pengurus
  await execSql('Sync app_metadata.role', `
    DO $$
    DECLARE
      v_user RECORD;
    BEGIN
      FOR v_user IN
        SELECT au.id, p.role
        FROM auth.users au
        JOIN profiles p ON p.id = au.id
      LOOP
        UPDATE auth.users
        SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_user.role)
        WHERE id = v_user.id;
      END LOOP;
    END $$;`)

  // Verifikasi
  await execSql('List profiles policies', `
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
    ORDER BY policyname;`)
}

run().catch(console.error).finally(() => process.exit())