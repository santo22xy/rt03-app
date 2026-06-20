-- =====================================================
-- 30e: RESET SEMUA WARGA → UNVERIFIED + PIN 123456
-- Jalankan untuk fresh-start KYC
-- Pengurus (KETUA_RT/BENDAHARA/SEKRETARIS/PENGURUS/SUPERADMIN)
-- TIDAK di-reset (mereka skip KYC by role)
-- =====================================================

-- Step 1: Reset status KYC semua WARGA ke UNVERIFIED
UPDATE profiles
SET
  kyc_status = 'UNVERIFIED',
  kyc_nama_ktp = NULL,
  kyc_status_keluarga = NULL,
  kyc_no_wa = NULL,
  kyc_nama_istri = NULL,
  kyc_nama_anak = '[]'::jsonb,
  kyc_catatan = NULL,
  kyc_submitted_at = NULL,
  kyc_verified_at = NULL,
  kyc_verified_by = NULL,
  kyc_rejected_reason = NULL
WHERE role = 'WARGA' AND is_active = TRUE;

-- Step 2: Set PIN 123456 untuk semua WARGA yang belum punya PIN
DO $$
DECLARE
  r RECORD;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT id, login_id, nama_kk
    FROM profiles
    WHERE role = 'WARGA'
      AND is_active = TRUE
      AND (pin_hash IS NULL OR pin_hash = '')
  LOOP
    PERFORM set_warga_pin(p_login_id := r.login_id, p_pin := '123456');
    v_count := v_count + 1;
    RAISE NOTICE 'PIN 123456 di-set untuk % (%)', r.login_id, r.nama_kk;
  END LOOP;
  RAISE NOTICE '=== % warga di-set PIN 123456 ===', v_count;
END $$;

-- Step 3: Verifikasi
SELECT
  login_id,
  nama_kk,
  CASE WHEN pin_hash IS NULL THEN '❌ NULL' ELSE '✓ OK' END AS pin,
  kyc_status
FROM profiles
WHERE role = 'WARGA' AND is_active = TRUE
ORDER BY login_id
LIMIT 10;

-- Step 4: Pastikan pengurus tetap utuh (skip KYC)
SELECT
  login_id,
  nama_kk,
  role,
  kyc_status
FROM profiles
WHERE role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN')
ORDER BY role;
