-- =====================================================
-- 30c: VERIFIKASI HASIL KYC MIGRATION
-- Jalankan untuk cek semua schema & data sudah benar
-- =====================================================

-- 1. Cek enum user_role punya SUPERADMIN
SELECT
  t.typname AS enum_name,
  array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname = 'user_role'
GROUP BY t.typname;

-- 2. Cek kolom KYC di profiles
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name LIKE 'kyc_%'
ORDER BY ordinal_position;

-- 3. Cek tabel kyc_audit_log
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'kyc_audit_log'
ORDER BY ordinal_position;

-- 4. Cek function bulk_verify_kyc & bulk_reject_kyc
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('bulk_verify_kyc', 'bulk_reject_kyc')
ORDER BY p.proname;

-- 5. Cek views
SELECT table_name, view_definition
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('v_kyc_pending', 'v_kyc_stats');

-- 6. Cek KYC stats (warga existing auto-verified?)
SELECT * FROM v_kyc_stats;

-- 7. Cek warga existing (semua harus VERIFIED oleh grandfather clause)
SELECT
  role,
  kyc_status,
  COUNT(*) AS jumlah
FROM profiles
WHERE is_active = TRUE
GROUP BY role, kyc_status
ORDER BY role, kyc_status;

-- 8. Cek sample warga yang sudah di-verify
SELECT login_id, nama_kk, blok, nomor_rumah, kyc_status, kyc_verified_at
FROM profiles
WHERE role = 'WARGA' AND is_active = TRUE
ORDER BY blok, nomor_rumah::int
LIMIT 5;
