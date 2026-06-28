// Cari FK yg valid utk jimpitan_detail
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf8')
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

console.log('=== Cek FK yg ada di jimpitan_detail via information_schema ===')
// Coba SELECT informasi via view information_schema (REST-friendly? mungkin perlu workaround)
const { data, error } = await supabase.rpc('exec_sql', {
  p_sql: `
    SELECT conname, conrelid::regclass AS tbl, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'jimpitan_detail'::regclass AND contype = 'f'
    ORDER BY conname
  `
})
console.log('FK on jimpitan_detail:', data ?? error?.message)

// Sama untuk ronda_attendance
const { data: d2 } = await supabase.rpc('exec_sql', {
  p_sql: `
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'ronda_attendance'::regclass AND contype = 'f'
    ORDER BY conname
  `
})
console.log('\nFK on ronda_attendance:', d2 ?? error?.message)

// Cek juga jimpitan_sesi
const { data: d3 } = await supabase.rpc('exec_sql', {
  p_sql: `
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'jimpitan_sesi'::regclass AND contype = 'f'
    ORDER BY conname
  `
})
console.log('\nFK on jimpitan_sesi:', d3 ?? error?.message)

// Cek juga ronda_attendance.sesi_id
const { data: d4 } = await supabase.rpc('exec_sql', {
  p_sql: `
    SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('jimpitan_detail', 'jimpitan_sesi', 'ronda_attendance')
    ORDER BY tc.table_name, kcu.column_name
  `
})
console.log('\nAll FKs:', d4 ?? error?.message)