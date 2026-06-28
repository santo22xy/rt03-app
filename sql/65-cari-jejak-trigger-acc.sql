-- =====================================================
-- SQL 65: Cari jejak function/trigger ACC jimpitan
-- =====================================================

-- A. Cari on_jimpitan_sesi_approved di SEMUA schema
SELECT '=== A. Cari function di semua schema ===' AS section;
SELECT
  n.nspname AS schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname LIKE '%jimpitan%approved%'
   OR p.proname LIKE '%on_jimpitan%'
   OR p.proname = 'on_jimpitan_sesi_approved'
ORDER BY n.nspname, p.proname;

-- B. Daftar trigger di tabel jimpitan_sesi
SELECT '=== B. Trigger aktif di jimpitan_sesi ===' AS section;
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'jimpitan_sesi'
ORDER BY trigger_name;

-- C. Trigger di pg_trigger (raw, lengkap dengan function OID)
SELECT '=== C. pg_trigger untuk jimpitan_sesi ===' AS section;
SELECT
  t.tgname AS trigger_name,
  t.tgenabled AS enabled,
  t.tgtype,
  p.proname AS function_name,
  n.nspname AS function_schema,
  pg_get_triggerdef(t.oid) AS trigger_def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
LEFT JOIN pg_proc p ON p.oid = t.tgfoid
LEFT JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE c.relname = 'jimpitan_sesi'
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- D. Semua function di public schema yang ada hubungannya dgn jimpitan/iuran
SELECT '=== D. Function public schema (nama mengandung jimpitan/iuran) ===' AS section;
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE '%jimpitan%' OR p.proname LIKE '%iuran%' OR p.proname LIKE '%sync_%')
ORDER BY p.proname;

-- E. Schema yang ada tabel jimpitan_sesi (cek apakah table ada di public atau lain)
SELECT '=== E. Tabel jimpitan_sesi ===' AS section;
SELECT
  n.nspname AS schema,
  c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'jimpitan_sesi';