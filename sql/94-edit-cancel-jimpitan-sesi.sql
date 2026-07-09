-- =====================================================
-- SQL 94: Edit & Batalkan Sesi Jimpitan (Submitted + Approved)
--
-- Fitur: Bendahara dapat mengedit dan membatalkan sesi submitted/approved
-- dengan audit log, soft delete, dan penanganan transaksi kas.
--
-- Strategi kas:
--   - Edit approved: UPDATE nominal kas_transaksi yang sama (via kas_transaction_id)
--   - Cancel approved: void kas_transaksi (voided=true, void_reason) + buat reversal
-- =====================================================

-- =====================================================
-- STEP 1: Kolom baru pada jimpitan_sesi
-- =====================================================
ALTER TABLE jimpitan_sesi
  ADD COLUMN IF NOT EXISTS revised_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revised_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS revision_reason TEXT,
  ADD COLUMN IF NOT EXISTS revision_count INT NOT NULL DEFAULT 0;

-- =====================================================
-- STEP 2: Kolom baru pada kas_transaksi untuk void/reversal
-- =====================================================
ALTER TABLE kas_transaksi
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS voided BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversal_of UUID REFERENCES kas_transaksi(id);

-- Index untuk pencarian cepat
CREATE INDEX IF NOT EXISTS idx_kas_transaksi_source ON kas_transaksi(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_kas_transaksi_voided ON kas_transaksi(voided) WHERE voided = TRUE;

-- =====================================================
-- STEP 3: Backfill source_type dan source_id dari sesi yang sudah ada
-- =====================================================
UPDATE kas_transaksi kt
SET source_type = 'jimpitan_sesi',
    source_id = js.id
FROM jimpitan_sesi js
WHERE js.kas_transaction_id = kt.id
  AND kt.source_type IS NULL;

-- =====================================================
-- STEP 4: Tabel audit log jimpitan
-- =====================================================
CREATE TABLE IF NOT EXISTS jimpitan_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module          TEXT NOT NULL DEFAULT 'jimpitan',
  session_id      UUID NOT NULL REFERENCES jimpitan_sesi(id),
  action          TEXT NOT NULL,
  old_data        JSONB,
  new_data        JSONB,
  old_total       NUMERIC(12,2),
  new_total       NUMERIC(12,2),
  reason          TEXT,
  changed_by      UUID REFERENCES profiles(id),
  changed_by_name TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  affected_cash_transaction_id UUID REFERENCES kas_transaksi(id)
);

CREATE INDEX IF NOT EXISTS idx_jimpitan_audit_session ON jimpitan_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_jimpitan_audit_action ON jimpitan_audit_log(action);

ALTER TABLE jimpitan_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jimpitan_audit_read_pengurus" ON jimpitan_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
  );
CREATE POLICY "jimpitan_audit_insert_system" ON jimpitan_audit_log
  FOR INSERT WITH CHECK (TRUE);

-- =====================================================
-- STEP 5: RPC edit_jimpitan_submitted
-- Edit sesi yang masih SUBMITTED (belum masuk kas)
-- =====================================================
CREATE OR REPLACE FUNCTION edit_jimpitan_submitted(
  p_sesi_id UUID,
  p_changed_by UUID,
  p_changed_by_name TEXT,
  p_reason TEXT,
  p_details JSONB,        -- [{profile_id, login_id, nama_kk_snapshot, nominal, is_bayar, status_bayar}]
  p_attendance JSONB,      -- [{profile_id, nama_snapshot, login_id}]
  p_catatan TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sesi RECORD;
  v_detail JSONB;
  v_att JSONB;
  v_total NUMERIC := 0;
  v_jumlah_bayar INT := 0;
  v_jumlah_hadir INT := 0;
  v_old_data JSONB;
BEGIN
  -- Validasi sesi
  SELECT * INTO v_sesi FROM jimpitan_sesi WHERE id = p_sesi_id FOR UPDATE;
  IF v_sesi.id IS NULL THEN
    RETURN json_build_object('error', 'Sesi tidak ditemukan');
  END IF;
  IF v_sesi.status NOT IN ('SUBMITTED', 'AKTIF', 'DRAFT') THEN
    RETURN json_build_object('error', 'Hanya sesi SUBMITTED/AKTIF/DRAFT yang bisa diedit');
  END IF;

  -- Simpan data lama untuk audit
  SELECT json_build_object(
    'total_nominal', v_sesi.total_nominal,
    'jumlah_warga_bayar', v_sesi.jumlah_warga_bayar,
    'jumlah_penjaga_hadir', v_sesi.jumlah_penjaga_hadir,
    'catatan', v_sesi.catatan
  ) INTO v_old_data;

  -- Hapus detail lama, insert baru
  DELETE FROM jimpitan_detail WHERE sesi_id = p_sesi_id;

  IF p_details IS NOT NULL AND jsonb_array_length(p_details) > 0 THEN
    FOR v_detail IN SELECT * FROM jsonb_array_elements(p_details)
    LOOP
      INSERT INTO jimpitan_detail (
        sesi_id, profile_id, login_id, nama_kk_snapshot,
        nominal, is_bayar, status_bayar
      ) VALUES (
        p_sesi_id,
        (v_detail->>'profile_id')::UUID,
        v_detail->>'login_id',
        v_detail->>'nama_kk_snapshot',
        COALESCE((v_detail->>'nominal')::INT, 0),
        COALESCE((v_detail->>'is_bayar')::BOOLEAN, FALSE),
        COALESCE(v_detail->>'status_bayar', 'BELUM')
      );

      v_total := v_total + COALESCE((v_detail->>'nominal')::INT, 0);
      IF COALESCE((v_detail->>'is_bayar')::BOOLEAN, FALSE) THEN
        v_jumlah_bayar := v_jumlah_bayar + 1;
      END IF;
    END LOOP;
  END IF;

  -- Update absensi: hapus lama, insert baru
  DELETE FROM ronda_attendance WHERE sesi_id = p_sesi_id;
  IF p_attendance IS NOT NULL AND jsonb_array_length(p_attendance) > 0 THEN
    FOR v_att IN SELECT * FROM jsonb_array_elements(p_attendance)
    LOOP
      INSERT INTO ronda_attendance (
        sesi_id, profile_id, nama_snapshot, login_id
      ) VALUES (
        p_sesi_id,
        (v_att->>'profile_id')::UUID,
        v_att->>'nama_snapshot',
        v_att->>'login_id'
      );
      v_jumlah_hadir := v_jumlah_hadir + 1;
    END LOOP;
  END IF;

  -- Update sesi
  UPDATE jimpitan_sesi SET
    total_nominal = v_total,
    total_pendapatan = v_total,
    jumlah_warga_bayar = v_jumlah_bayar,
    jumlah_penjaga_hadir = v_jumlah_hadir,
    catatan = COALESCE(p_catatan, catatan),
    revised_at = NOW(),
    revised_by = p_changed_by,
    revision_reason = p_reason,
    revision_count = revision_count + 1,
    updated_at = NOW()
  WHERE id = p_sesi_id;

  -- Audit log
  INSERT INTO jimpitan_audit_log (
    session_id, action, old_data,
    new_data, old_total, new_total,
    reason, changed_by, changed_by_name
  ) VALUES (
    p_sesi_id, 'edit_submitted', v_old_data,
    json_build_object('total_nominal', v_total, 'jumlah_warga_bayar', v_jumlah_bayar, 'jumlah_penjaga_hadir', v_jumlah_hadir, 'catatan', p_catatan),
    (v_old_data->>'total_nominal')::NUMERIC, v_total,
    p_reason, p_changed_by, p_changed_by_name
  );

  RETURN json_build_object(
    'success', true,
    'new_total', v_total,
    'jumlah_bayar', v_jumlah_bayar,
    'jumlah_hadir', v_jumlah_hadir,
    'message', 'Sesi berhasil diperbarui'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION edit_jimpitan_submitted(UUID, UUID, TEXT, TEXT, JSONB, JSONB, TEXT) TO authenticated;

-- =====================================================
-- STEP 6: RPC cancel_jimpitan_submitted
-- Batalkan sesi yang belum masuk kas
-- =====================================================
CREATE OR REPLACE FUNCTION cancel_jimpitan_submitted(
  p_sesi_id UUID,
  p_cancelled_by UUID,
  p_cancelled_by_name TEXT,
  p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sesi RECORD;
  v_old_data JSONB;
BEGIN
  SELECT * INTO v_sesi FROM jimpitan_sesi WHERE id = p_sesi_id FOR UPDATE;
  IF v_sesi.id IS NULL THEN
    RETURN json_build_object('error', 'Sesi tidak ditemukan');
  END IF;
  IF v_sesi.status NOT IN ('DRAFT', 'AKTIF', 'SUBMITTED') THEN
    RETURN json_build_object('error', 'Sesi ini tidak bisa dibatalkan dari status saat ini');
  END IF;

  SELECT json_build_object(
    'status', v_sesi.status,
    'total_nominal', v_sesi.total_nominal,
    'jumlah_warga_bayar', v_sesi.jumlah_warga_bayar
  ) INTO v_old_data;

  UPDATE jimpitan_sesi SET
    status = 'CANCELLED',
    cancelled_by_user_id = p_cancelled_by,
    cancelled_by_name = p_cancelled_by_name,
    cancelled_at = NOW(),
    cancel_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_sesi_id;

  INSERT INTO jimpitan_audit_log (
    session_id, action, old_data, new_data,
    old_total, reason, changed_by, changed_by_name
  ) VALUES (
    p_sesi_id, 'cancel_submitted', v_old_data,
    json_build_object('status', 'CANCELLED'),
    v_sesi.total_nominal, p_reason, p_cancelled_by, p_cancelled_by_name
  );

  RETURN json_build_object('success', true, 'message', 'Sesi berhasil dibatalkan');
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_jimpitan_submitted(UUID, UUID, TEXT, TEXT) TO authenticated;

-- =====================================================
-- STEP 7: RPC edit_jimpitan_approved
-- Edit sesi yang sudah APPROVED (sudah masuk kas)
-- WAJIB alasan, update kas_transaksi yang sama
-- =====================================================
CREATE OR REPLACE FUNCTION edit_jimpitan_approved(
  p_sesi_id UUID,
  p_changed_by UUID,
  p_changed_by_name TEXT,
  p_reason TEXT,
  p_details JSONB,
  p_attendance JSONB,
  p_catatan TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sesi RECORD;
  v_detail JSONB;
  v_att JSONB;
  v_total NUMERIC := 0;
  v_jumlah_bayar INT := 0;
  v_jumlah_hadir INT := 0;
  v_old_data JSONB;
  v_old_total NUMERIC;
  v_diff NUMERIC;
BEGIN
  SELECT * INTO v_sesi FROM jimpitan_sesi WHERE id = p_sesi_id FOR UPDATE;
  IF v_sesi.id IS NULL THEN
    RETURN json_build_object('error', 'Sesi tidak ditemukan');
  END IF;
  IF v_sesi.status <> 'APPROVED' THEN
    RETURN json_build_object('error', 'Hanya sesi APPROVED yang bisa diedit dengan fungsi ini');
  END IF;
  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
    RETURN json_build_object('error', 'Alasan perubahan wajib diisi minimal 5 karakter');
  END IF;

  v_old_total := COALESCE(v_sesi.total_nominal, 0);

  SELECT json_build_object(
    'total_nominal', v_sesi.total_nominal,
    'jumlah_warga_bayar', v_sesi.jumlah_warga_bayar,
    'jumlah_penjaga_hadir', v_sesi.jumlah_penjaga_hadir,
    'catatan', v_sesi.catatan,
    'status', v_sesi.status
  ) INTO v_old_data;

  -- Update detail: hapus lama, insert baru
  DELETE FROM jimpitan_detail WHERE sesi_id = p_sesi_id;
  IF p_details IS NOT NULL AND jsonb_array_length(p_details) > 0 THEN
    FOR v_detail IN SELECT * FROM jsonb_array_elements(p_details)
    LOOP
      INSERT INTO jimpitan_detail (
        sesi_id, profile_id, login_id, nama_kk_snapshot,
        nominal, is_bayar, status_bayar
      ) VALUES (
        p_sesi_id,
        (v_detail->>'profile_id')::UUID,
        v_detail->>'login_id',
        v_detail->>'nama_kk_snapshot',
        COALESCE((v_detail->>'nominal')::INT, 0),
        COALESCE((v_detail->>'is_bayar')::BOOLEAN, FALSE),
        COALESCE(v_detail->>'status_bayar', 'BELUM')
      );
      v_total := v_total + COALESCE((v_detail->>'nominal')::INT, 0);
      IF COALESCE((v_detail->>'is_bayar')::BOOLEAN, FALSE) THEN
        v_jumlah_bayar := v_jumlah_bayar + 1;
      END IF;
    END LOOP;
  END IF;

  -- Update absensi
  DELETE FROM ronda_attendance WHERE sesi_id = p_sesi_id;
  IF p_attendance IS NOT NULL AND jsonb_array_length(p_attendance) > 0 THEN
    FOR v_att IN SELECT * FROM jsonb_array_elements(p_attendance)
    LOOP
      INSERT INTO ronda_attendance (sesi_id, profile_id, nama_snapshot, login_id)
      VALUES (
        p_sesi_id,
        (v_att->>'profile_id')::UUID,
        v_att->>'nama_snapshot',
        v_att->>'login_id'
      );
      v_jumlah_hadir := v_jumlah_hadir + 1;
    END LOOP;
  END IF;

  -- Update sesi
  UPDATE jimpitan_sesi SET
    total_nominal = v_total,
    total_pendapatan = v_total,
    jumlah_warga_bayar = v_jumlah_bayar,
    jumlah_penjaga_hadir = v_jumlah_hadir,
    catatan = COALESCE(p_catatan, catatan),
    revised_at = NOW(),
    revised_by = p_changed_by,
    revision_reason = p_reason,
    revision_count = revision_count + 1,
    updated_at = NOW()
  WHERE id = p_sesi_id;

  -- Update transaksi kas yang terkait (jangan buat baru)
  v_diff := v_total - v_old_total;
  IF v_sesi.kas_transaction_id IS NOT NULL AND v_diff <> 0 THEN
    UPDATE kas_transaksi SET
      nominal = v_total,
      catatan = COALESCE(p_catatan, catatan) || ' [diedit ' || p_changed_by_name || ' ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') || ']'
    WHERE id = v_sesi.kas_transaction_id
      AND voided = FALSE;
  END IF;

  -- Audit log
  INSERT INTO jimpitan_audit_log (
    session_id, action, old_data,
    new_data, old_total, new_total,
    reason, changed_by, changed_by_name,
    affected_cash_transaction_id
  ) VALUES (
    p_sesi_id, 'edit_approved', v_old_data,
    json_build_object('total_nominal', v_total, 'jumlah_warga_bayar', v_jumlah_bayar, 'jumlah_penjaga_hadir', v_jumlah_hadir, 'catatan', p_catatan),
    v_old_total, v_total,
    p_reason, p_changed_by, p_changed_by_name,
    v_sesi.kas_transaction_id
  );

  RETURN json_build_object(
    'success', true,
    'old_total', v_old_total,
    'new_total', v_total,
    'diff', v_diff,
    'message', 'Sesi approved berhasil diperbarui. Transaksi kas telah disesuaikan.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION edit_jimpitan_approved(UUID, UUID, TEXT, TEXT, JSONB, JSONB, TEXT) TO authenticated;

-- =====================================================
-- STEP 8: RPC cancel_jimpitan_approved
-- Batalkan sesi yang sudah APPROVED (sudah masuk kas)
-- Void kas_transaksi + buat transaksi reversal
-- =====================================================
CREATE OR REPLACE FUNCTION cancel_jimpitan_approved(
  p_sesi_id UUID,
  p_cancelled_by UUID,
  p_cancelled_by_name TEXT,
  p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sesi RECORD;
  v_old_data JSONB;
  v_kas RECORD;
  v_reversal_id UUID;
BEGIN
  SELECT * INTO v_sesi FROM jimpitan_sesi WHERE id = p_sesi_id FOR UPDATE;
  IF v_sesi.id IS NULL THEN
    RETURN json_build_object('error', 'Sesi tidak ditemukan');
  END IF;
  IF v_sesi.status <> 'APPROVED' THEN
    RETURN json_build_object('error', 'Hanya sesi APPROVED yang bisa dibatalkan dengan fungsi ini');
  END IF;
  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
    RETURN json_build_object('error', 'Alasan pembatalan wajib diisi minimal 5 karakter');
  END IF;

  SELECT json_build_object(
    'status', v_sesi.status,
    'total_nominal', v_sesi.total_nominal,
    'jumlah_warga_bayar', v_sesi.jumlah_warga_bayar,
    'kas_transaction_id', v_sesi.kas_transaction_id
  ) INTO v_old_data;

  -- 1. Void transaksi kas terkait (jangan hapus)
  IF v_sesi.kas_transaction_id IS NOT NULL THEN
    SELECT * INTO v_kas FROM kas_transaksi WHERE id = v_sesi.kas_transaction_id;

    IF v_kas.id IS NOT NULL AND v_kas.voided = FALSE THEN
      -- Void transaksi lama
      UPDATE kas_transaksi SET
        voided = TRUE,
        voided_at = NOW(),
        voided_by = p_cancelled_by,
        void_reason = 'Pembatalan sesi jimpitan: ' || p_reason
      WHERE id = v_kas.id;

      -- Buat transaksi reversal (KELUAR) untuk menyeimbangkan kas
      INSERT INTO kas_transaksi (
        trx_id_external, tanggal, tipe, kategori, uraian, nominal,
        metode_bayar, sumber_dana, catatan, created_by,
        source_type, source_id
      ) VALUES (
        'REV-' || v_kas.trx_id_external || '-' || EXTRACT(EPOCH FROM NOW())::INT,
        CURRENT_DATE,
        'KELUAR',
        'REVERSAL_JIMPITAN',
        'Reversal: ' || v_kas.uraian,
        v_kas.nominal,
        v_kas.metode_bayar,
        v_kas.sumber_dana,
        'Pembatalan sesi jimpitan oleh ' || p_cancelled_by_name || '. Alasan: ' || p_reason,
        p_cancelled_by_name,
        'jimpitan_sesi',
        p_sesi_id
      )
      RETURNING id INTO v_reversal_id;
    END IF;
  END IF;

  -- 2. Tandai sesi sebagai CANCELLED
  UPDATE jimpitan_sesi SET
    status = 'CANCELLED',
    cancelled_by_user_id = p_cancelled_by,
    cancelled_by_name = p_cancelled_by_name,
    cancelled_at = NOW(),
    cancel_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_sesi_id;

  -- 3. Audit log
  INSERT INTO jimpitan_audit_log (
    session_id, action, old_data, new_data,
    old_total, new_total,
    reason, changed_by, changed_by_name,
    affected_cash_transaction_id
  ) VALUES (
    p_sesi_id, 'cancel_approved', v_old_data,
    json_build_object('status', 'CANCELLED', 'voided_kas_id', v_sesi.kas_transaction_id, 'reversal_kas_id', v_reversal_id),
    v_sesi.total_nominal, 0,
    p_reason, p_cancelled_by, p_cancelled_by_name,
    v_sesi.kas_transaction_id
  );

  RETURN json_build_object(
    'success', true,
    'voided_kas_id', v_sesi.kas_transaction_id,
    'reversal_kas_id', v_reversal_id,
    'old_total', v_sesi.total_nominal,
    'message', 'Sesi berhasil dibatalkan. Transaksi kas telah di-void dan reversal dibuat.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_jimpitan_approved(UUID, UUID, TEXT, TEXT) TO authenticated;

-- =====================================================
-- STEP 9: Update RLS - bendahara boleh update sesi approved
-- =====================================================
DROP POLICY IF EXISTS "jimpitan_sesi_update_inputter_or_pengurus" ON jimpitan_sesi;
CREATE POLICY "jimpitan_sesi_update_pengurus" ON jimpitan_sesi
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('BENDAHARA', 'KETUA_RT', 'SEKRETARIS', 'SUPERADMIN')
    )
  );

-- =====================================================
-- STEP 10: Verifikasi
-- =====================================================
SELECT 'a_new_columns_sesi' AS s,
  column_name, data_type
FROM information_schema.columns
WHERE table_name = 'jimpitan_sesi'
  AND column_name IN ('revised_at', 'revised_by', 'revision_reason', 'revision_count')
ORDER BY column_name;

SELECT 'b_new_columns_kas' AS s,
  column_name, data_type
FROM information_schema.columns
WHERE table_name = 'kas_transaksi'
  AND column_name IN ('source_type', 'source_id', 'voided', 'voided_at', 'voided_by', 'void_reason', 'reversal_of')
ORDER BY column_name;

SELECT 'c_audit_table' AS s,
  COUNT(*) AS columns
FROM information_schema.columns
WHERE table_name = 'jimpitan_audit_log';

SELECT 'd_rpc_functions' AS s,
  routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('edit_jimpitan_submitted', 'cancel_jimpitan_submitted', 'edit_jimpitan_approved', 'cancel_jimpitan_approved')
ORDER BY routine_name;

NOTIFY pgrst, 'reload schema';
