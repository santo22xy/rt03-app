-- =====================================================
-- 30: KYC Tables - Verifikasi Warga via WhatsApp
-- Jalankan di Supabase SQL Editor
--
-- ⚠️  PENTING: JALANKAN 30a-kyc-prepare-enum.sql DULU! ⚠️
-- File ini menggunakan value 'SUPERADMIN' di enum user_role.
-- Jika enum belum punya value tersebut, query ini akan error.
-- Urutan yang benar:
--   1. Jalankan 30a-kyc-prepare-enum.sql (sendiri, 1x query)
--   2. Baru jalankan file ini (30-kyc-tables.sql)
--
-- Konsep:
--   - Setelah login, WARGA wajib submit data KK/KTP
--   - Foto TIDAK disimpan di server (dikirim via WA manual)
--   - Superadmin Bulk-ACC dari menu User Management
--   - Pengurus (KETUA_RT/BENDAHARA/SEKRETARIS/PENGURUS/SUPERADMIN) skip KYC
-- =====================================================

-- =====================================================
-- STEP 1: Tambah kolom KYC ke profiles
-- =====================================================

-- Status verifikasi
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (kyc_status IN ('UNVERIFIED','PENDING','VERIFIED','REJECTED'));

-- Data yang di-submit warga
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kyc_nama_ktp text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kyc_status_keluarga text
    CHECK (kyc_status_keluarga IN ('KEPALA_KELUARGA','ISTRI','ANAK','FAMILI_LAIN','LAINNYA') OR kyc_status_keluarga IS NULL);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kyc_no_wa text;

-- Data KK (istri + max 3 anak, sesuai spec)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kyc_nama_istri text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kyc_nama_anak jsonb DEFAULT '[]'::jsonb;
  -- format: ["Andi", "Budi", "Citra"] (max 3)

-- Catatan tambahan dari warga (opsional)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kyc_catatan text;

-- Tracking waktu & admin
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kyc_verified_at timestamptz;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kyc_verified_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kyc_rejected_reason text;

-- Index untuk query "list KYC pending"
CREATE INDEX IF NOT EXISTS idx_profiles_kyc_status
  ON profiles(kyc_status)
  WHERE role = 'WARGA' AND kyc_status = 'PENDING';

-- Index untuk filter warga aktif by KYC
CREATE INDEX IF NOT EXISTS idx_profiles_kyc_role_status
  ON profiles(role, kyc_status);

-- =====================================================
-- STEP 2: Tabel audit log (WAJIB untuk compliance)
-- =====================================================
CREATE TABLE IF NOT EXISTS kyc_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action      text NOT NULL
                CHECK (action IN ('SUBMITTED','VERIFIED','REJECTED','RE_SUBMITTED','RESET')),
  actor_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  notes       text,
  metadata    jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_audit_user
  ON kyc_audit_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kyc_audit_actor
  ON kyc_audit_log(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kyc_audit_action
  ON kyc_audit_log(action, created_at DESC);

-- =====================================================
-- STEP 3: Trigger - auto-set kyc_submitted_at saat SUBMITTED
-- =====================================================
CREATE OR REPLACE FUNCTION trg_set_kyc_submitted_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Hanya set saat transisi dari non-PENDING ke PENDING
  IF NEW.kyc_status = 'PENDING'
     AND (OLD.kyc_status IS NULL OR OLD.kyc_status <> 'PENDING') THEN
    NEW.kyc_submitted_at := NOW();
  END IF;

  -- Set verified_at saat transisi ke VERIFIED
  IF NEW.kyc_status = 'VERIFIED'
     AND (OLD.kyc_status IS NULL OR OLD.kyc_status <> 'VERIFIED') THEN
    NEW.kyc_verified_at := NOW();
    NEW.kyc_rejected_reason := NULL;  -- clear reason kalau re-verify
  END IF;

  -- Set verified_by kalau ada dan status VERIFIED
  -- (verified_by di-set di aplikasi, bukan di trigger, untuk fleksibilitas)

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_kyc_timestamps ON profiles;
CREATE TRIGGER trg_profiles_kyc_timestamps
BEFORE UPDATE OF kyc_status ON profiles
FOR EACH ROW
EXECUTE FUNCTION trg_set_kyc_submitted_at();

-- =====================================================
-- STEP 4: Grandfather clause
-- Warga lama (sudah ada sebelum KYC) otomatis VERIFIED
-- supaya tidak terkunci setelah migration
-- =====================================================
DO $$
DECLARE
  v_updated INT := 0;
BEGIN
  UPDATE profiles
  SET
    kyc_status = 'VERIFIED',
    kyc_verified_at = COALESCE(created_at, NOW()),
    kyc_verified_by = NULL  -- NULL = auto-verified oleh sistem
  WHERE
    role = 'WARGA'
    AND is_active = TRUE
    AND kyc_status = 'UNVERIFIED';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Auto-verified % existing WARGA (grandfather clause)', v_updated;
END $$;

-- =====================================================
-- STEP 5: View untuk Superadmin Panel - list KYC pending
-- =====================================================
CREATE OR REPLACE VIEW v_kyc_pending AS
SELECT
  p.id,
  p.login_id,
  p.nama_kk,
  p.blok,
  p.nomor_rumah,
  p.role,
  p.is_active,
  p.kyc_status,
  p.kyc_nama_ktp,
  p.kyc_status_keluarga,
  p.kyc_no_wa,
  p.kyc_nama_istri,
  p.kyc_nama_anak,
  p.kyc_catatan,
  p.kyc_submitted_at,
  p.kyc_verified_at,
  p.kyc_verified_by,
  p.kyc_rejected_reason,
  EXTRACT(DAY FROM NOW() - p.kyc_submitted_at)::int AS days_waiting
FROM profiles p
WHERE p.role = 'WARGA'
  AND p.kyc_status = 'PENDING'
ORDER BY p.kyc_submitted_at ASC;  -- yang paling lama nunggu di atas

-- =====================================================
-- STEP 6: View untuk statistik KYC
-- =====================================================
CREATE OR REPLACE VIEW v_kyc_stats AS
SELECT
  COUNT(*) FILTER (WHERE kyc_status = 'UNVERIFIED') AS total_unverified,
  COUNT(*) FILTER (WHERE kyc_status = 'PENDING')   AS total_pending,
  COUNT(*) FILTER (WHERE kyc_status = 'VERIFIED')  AS total_verified,
  COUNT(*) FILTER (WHERE kyc_status = 'REJECTED')  AS total_rejected,
  COUNT(*) FILTER (WHERE kyc_status = 'VERIFIED' AND kyc_verified_by IS NULL) AS total_grandfathered,
  COUNT(*) FILTER (WHERE kyc_status = 'VERIFIED' AND kyc_verified_by IS NOT NULL) AS total_manual_verified,
  COUNT(*) AS total_warga
FROM profiles
WHERE role = 'WARGA' AND is_active = TRUE;

-- =====================================================
-- STEP 7: RLS Policies
-- =====================================================

-- Enable RLS untuk audit log
ALTER TABLE kyc_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin bisa read semua audit log
DROP POLICY IF EXISTS "Admin read kyc_audit_log" ON kyc_audit_log;
CREATE POLICY "Admin read kyc_audit_log"
  ON kyc_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('KETUA_RT','BENDAHARA','SEKRETARIS','PENGURUS','SUPERADMIN')
    )
  );

-- Hanya server action (admin client) yang insert, jadi RLS insert tidak perlu policy
-- (admin client bypass RLS)

-- User bisa read audit log miliknya sendiri
DROP POLICY IF EXISTS "User read own kyc_audit_log" ON kyc_audit_log;
CREATE POLICY "User read own kyc_audit_log"
  ON kyc_audit_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- =====================================================
-- STEP 8: Helper function - bulk verify KYC
-- Dipanggil dari server action (admin client)
-- Return: array of {user_id, success, error}
-- =====================================================
CREATE OR REPLACE FUNCTION bulk_verify_kyc(
  p_user_ids uuid[],
  p_actor_id uuid
)
RETURNS TABLE (
  user_id uuid,
  success boolean,
  error_msg text
)
LANGUAGE plpgsql
SECURITY DEFINER  -- bypass RLS untuk efficiency
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_actor_role text;
BEGIN
  -- Validasi actor
  SELECT role INTO v_actor_role
  FROM profiles WHERE id = p_actor_id;

  IF v_actor_role NOT IN ('KETUA_RT','BENDAHARA','SEKRETARIS','PENGURUS','SUPERADMIN') THEN
    RAISE EXCEPTION 'Actor tidak punya hak verifikasi';
  END IF;

  -- Loop setiap user
  FOREACH v_user_id IN ARRAY p_user_ids
  LOOP
    BEGIN
      -- Update status
      UPDATE profiles
      SET
        kyc_status = 'VERIFIED',
        kyc_verified_by = p_actor_id,
        kyc_verified_at = NOW(),
        kyc_rejected_reason = NULL
      WHERE
        id = v_user_id
        AND role = 'WARGA'
        AND kyc_status = 'PENDING';

      IF NOT FOUND THEN
        RETURN QUERY SELECT v_user_id, FALSE, 'User tidak ditemukan atau bukan PENDING'::text;
        CONTINUE;
      END IF;

      -- Insert audit log
      INSERT INTO kyc_audit_log (user_id, action, actor_id)
      VALUES (v_user_id, 'VERIFIED', p_actor_id);

      RETURN QUERY SELECT v_user_id, TRUE, NULL::text;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_user_id, FALSE, SQLERRM::text;
    END;
  END LOOP;
END;
$$;

-- =====================================================
-- STEP 9: Helper function - bulk reject KYC
-- =====================================================
CREATE OR REPLACE FUNCTION bulk_reject_kyc(
  p_user_ids uuid[],
  p_actor_id uuid,
  p_reason text
)
RETURNS TABLE (
  user_id uuid,
  success boolean,
  error_msg text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_actor_role text;
BEGIN
  SELECT role INTO v_actor_role
  FROM profiles WHERE id = p_actor_id;

  IF v_actor_role NOT IN ('KETUA_RT','BENDAHARA','SEKRETARIS','PENGURUS','SUPERADMIN') THEN
    RAISE EXCEPTION 'Actor tidak punya hak reject';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi';
  END IF;

  FOREACH v_user_id IN ARRAY p_user_ids
  LOOP
    BEGIN
      UPDATE profiles
      SET
        kyc_status = 'REJECTED',
        kyc_rejected_reason = p_reason
      WHERE
        id = v_user_id
        AND role = 'WARGA'
        AND kyc_status = 'PENDING';

      IF NOT FOUND THEN
        RETURN QUERY SELECT v_user_id, FALSE, 'User tidak ditemukan atau bukan PENDING'::text;
        CONTINUE;
      END IF;

      INSERT INTO kyc_audit_log (user_id, action, actor_id, notes)
      VALUES (v_user_id, 'REJECTED', p_actor_id, p_reason);

      RETURN QUERY SELECT v_user_id, TRUE, NULL::text;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_user_id, FALSE, SQLERRM::text;
    END;
  END LOOP;
END;
$$;

-- =====================================================
-- VERIFIKASI
-- =====================================================
SELECT '=== STRUKTUR profiles KYC ===' AS section;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name LIKE 'kyc_%'
ORDER BY ordinal_position;

SELECT '=== STRUKTUR kyc_audit_log ===' AS section;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'kyc_audit_log'
ORDER BY ordinal_position;

SELECT '=== STATS KYC ===' AS section;
SELECT * FROM v_kyc_stats;

SELECT '=== GRANDfathered WARGA (auto-verified) ===' AS section;
SELECT login_id, nama_kk, blok, nomor_rumah
FROM profiles
WHERE role = 'WARGA'
  AND is_active = TRUE
  AND kyc_status = 'VERIFIED'
  AND kyc_verified_by IS NULL
ORDER BY blok, nomor_rumah::int;

SELECT '=== PENDING KYC (seharusnya kosong) ===' AS section;
SELECT * FROM v_kyc_pending;

-- DONE
SELECT '=== DONE. KYC migration berhasil. ===' AS done;
