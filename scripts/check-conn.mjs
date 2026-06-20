// Connect langsung ke postgres via connection string
// Untuk execute SQL apapun termasuk DROP POLICY, UPDATE, dll.
import pg from 'pg'
import 'dotenv/config'

// Format: postgresql://postgres.[ref]:[password]@[host]:[port]/postgres
// Ref: kjnmyiqzamftysgndbne
// Password ada di dashboard settings database

// Kita coba pakai service_role API alternative - direct query via supabase HTTP
// Atau pakai postgres connection string

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

// Pakai API langsung: Supabase REST + HTTP untuk DDL
// DDL via REST gak bisa, jadi kita pakai pendekatan lain:
// 1. Drop policies via REST (DELETE policy doesn't exist, harus via SQL)
// 2. Pakai API: POST /v1/projects/{ref}/database/query (Supabase Management API)

// Cara: gunakan service_role untuk membuat helper function exec_sql()
import { createClient } from '@supabase/supabase-js'

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function run() {
  // Buat RPC function exec_sql kalau belum ada
  console.log('Creating exec_sql RPC...')
  const createFn = `
    CREATE OR REPLACE FUNCTION exec_sql(p_sql TEXT)
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE p_sql;
      RETURN jsonb_build_object('ok', TRUE);
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('error', SQLERRM);
    END;
    $$;
    GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO service_role;
  `
  // Kita tidak bisa CREATE FUNCTION via REST. Pakai approach lain:
  // Approach: gunakan supabase-js .rpc untuk existing functions
  // Kalau belum ada exec_sql, kita butuh cara lain

  // Pakai cara paling reliable: gunakan Supabase Management API
  // Endpoint: POST https://api.supabase.com/v1/projects/{ref}/database/query
  // Header: Authorization Bearer {access_token}

  // Ini perlu personal access token (PAT). Karena tidak ada di env,
  // kita arahkan user untuk run SQL di SQL Editor

  console.log('\nSQL file sudah dibuat di: sql/40-fix-profiles-rls-no-recursion.sql')
  console.log('Jalankan di Supabase SQL Editor untuk fix RLS recursion')
}

run().catch(console.error).finally(() => process.exit())