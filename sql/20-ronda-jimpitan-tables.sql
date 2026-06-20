-- =====================================================
-- 20: Ronda & Jimpitan Tables + Jadwal
-- Jalankan di Supabase SQL Editor SETELAH 19-iuran-tables.sql
--
-- PENTING: Jika tabel profiles.role adalah enum user_role,
-- jalankan TERLEBIH DAHULU baris ALTER TYPE di bawah (Step 0)
-- sebagai query terpisah SEBELUM menjalankan sisanya.
-- =====================================================

-- =====================================================
-- STEP 0: Tambah SUPERADMIN ke enum user_role (jika ada)
-- Jalankan ini sebagai query TERPISAH terlebih dahulu
-- =====================================================
-- ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPERADMIN';
-- (Uncomment baris di atas dan jalankan sendiri jika enum ada)

-- Setelah ALTER TYPE selesai (running in separate transaction),
-- baru jalankan seluruh file ini.

-- =====================================================
-- STEP 1: Tabel JADWAL RONDA (rotation mingguan)
-- =====================================================
CREATE TABLE IF NOT EXISTS jadwal_ronda (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal               DATE NOT NULL,                -- Sabtu spesifik
  minggu_ke             INT NOT NULL,                 -- 1..5 dalam bulan
  bulan                 INT NOT NULL,                 -- 1..12
  tahun                 INT NOT NULL,                 -- 2026
  penjaga_profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nama_penjaga_snapshot TEXT NOT NULL,                -- snapshot nama KK
  blok_snapshot         TEXT NOT NULL,
  nomor_rumah_snapshot  TEXT NOT NULL,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tanggal, penjaga_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_jadwal_ronda_tanggal ON jadwal_ronda(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_jadwal_ronda_penjaga ON jadwal_ronda(penjaga_profile_id);

-- =====================================================
-- STEP 2: Tabel RONDA SWAP (penggantian sementara)
-- =====================================================
CREATE TABLE IF NOT EXISTS ronda_swap (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jadwal_ronda_id     UUID NOT NULL REFERENCES jadwal_ronda(id) ON DELETE CASCADE,
  tanggal             DATE NOT NULL,                  -- denormalized
  profile_asli_id     UUID NOT NULL REFERENCES profiles(id),
  profile_pengganti_id UUID NOT NULL REFERENCES profiles(id),
  nama_asli_snapshot  TEXT NOT NULL,
  nama_pengganti_snapshot TEXT NOT NULL,
  keterangan          TEXT,
  created_by          UUID NOT NULL REFERENCES profiles(id),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ronda_swap_tanggal ON ronda_swap(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_ronda_swap_asli ON ronda_swap(profile_asli_id);

-- =====================================================
-- STEP 3: Tabel JIMPITAN SESI (1 sesi per Sabtu)
-- =====================================================
CREATE TABLE IF NOT EXISTS jimpitan_sesi (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal             DATE NOT NULL UNIQUE,           -- 1 sesi per Sabtu
  waktu_mulai         TIMESTAMPTZ,                    -- saat warga pertama daftar jadi inputter
  waktu_submit        TIMESTAMPTZ,                    -- saat submit
  input_by            UUID NOT NULL REFERENCES profiles(id),
  nama_inputter_snapshot TEXT NOT NULL,
  blok_inputter_snapshot TEXT,
  jumlah_warga_bayar  INT NOT NULL DEFAULT 0,
  total_nominal       NUMERIC(12,2) NOT NULL DEFAULT 0,
  jumlah_penjaga_hadir INT NOT NULL DEFAULT 0,
  keadaan             TEXT NOT NULL DEFAULT 'AMAN',    -- AMAN | LAPORAN
  catatan             TEXT,
  status              TEXT NOT NULL DEFAULT 'AKTIF',  -- AKTIF | SUBMITTED | APPROVED | REJECTED
  approved_by         UUID REFERENCES profiles(id),
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jimpitan_sesi_tanggal ON jimpitan_sesi(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_jimpitan_sesi_status ON jimpitan_sesi(status);
CREATE INDEX IF NOT EXISTS idx_jimpitan_sesi_input_by ON jimpitan_sesi(input_by);

-- =====================================================
-- STEP 4: Tabel JIMPITAN DETAIL (per-warga dalam 1 sesi)
-- =====================================================
CREATE TABLE IF NOT EXISTS jimpitan_detail (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sesi_id             UUID NOT NULL REFERENCES jimpitan_sesi(id) ON DELETE CASCADE,
  profile_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nama_snapshot       TEXT NOT NULL,
  blok_snapshot       TEXT NOT NULL,
  nomor_rumah_snapshot TEXT NOT NULL,
  nominal             NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_bayar            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sesi_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_jimpitan_detail_sesi ON jimpitan_detail(sesi_id);
CREATE INDEX IF NOT EXISTS idx_jimpitan_detail_profile ON jimpitan_detail(profile_id);

-- =====================================================
-- STEP 5: Tabel RONDA ATTENDANCE (kehadiran penjaga)
-- =====================================================
CREATE TABLE IF NOT EXISTS ronda_attendance (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sesi_id             UUID NOT NULL REFERENCES jimpitan_sesi(id) ON DELETE CASCADE,
  profile_id          UUID NOT NULL REFERENCES profiles(id),
  nama_snapshot       TEXT NOT NULL,
  is_pengganti        BOOLEAN NOT NULL DEFAULT FALSE,
  pengganti_dari_id   UUID REFERENCES profiles(id),
  pengganti_dari_nama TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sesi_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_ronda_attendance_sesi ON ronda_attendance(sesi_id);
CREATE INDEX IF NOT EXISTS idx_ronda_attendance_profile ON ronda_attendance(profile_id);

-- =====================================================
-- STEP 6: HELPER FUNCTION - Cek apakah sekarang waktu jimpitan
-- Window: Sabtu 19:00 - 23:00 WIB
-- =====================================================
CREATE OR REPLACE FUNCTION is_jimpitan_window_open()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW() AT TIME ZONE 'Asia/Jakarta';
  v_day INT;
  v_hour INT;
BEGIN
  v_day := EXTRACT(DOW FROM v_now); -- 0=Sun, 6=Sat
  v_hour := EXTRACT(HOUR FROM v_now);
  RETURN (v_day = 6 AND v_hour >= 19 AND v_hour < 23);
END;
$$;

-- =====================================================
-- STEP 7: HELPER FUNCTION - Get sesi aktif untuk tanggal tertentu
-- =====================================================
CREATE OR REPLACE FUNCTION get_active_jimpitan_sesi(p_tanggal DATE)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM jimpitan_sesi
  WHERE tanggal = p_tanggal
    AND status IN ('AKTIF', 'SUBMITTED')
  LIMIT 1;
  RETURN v_id;
END;
$$;

-- =====================================================
-- STEP 8: HELPER VIEW - Penjaga efektif per tanggal (dengan swap)
-- =====================================================
CREATE OR REPLACE VIEW v_penjaga_efektif AS
SELECT
  j.id AS jadwal_id,
  j.tanggal,
  j.minggu_ke,
  j.bulan,
  j.tahun,
  j.penjaga_profile_id AS profile_asli_id,
  j.nama_penjaga_snapshot AS nama_asli,
  COALESCE(s.profile_pengganti_id, j.penjaga_profile_id) AS profile_efektif_id,
  COALESCE(s.nama_pengganti_snapshot, j.nama_penjaga_snapshot) AS nama_efektif,
  COALESCE(s.id, NULL::UUID) AS swap_id,
  (s.id IS NOT NULL) AS is_swapped
FROM jadwal_ronda j
LEFT JOIN ronda_swap s
  ON s.jadwal_ronda_id = j.id
  AND s.is_active = TRUE
WHERE j.is_active = TRUE;

-- =====================================================
-- STEP 9: RLS POLICIES
-- =====================================================
ALTER TABLE jadwal_ronda ENABLE ROW LEVEL SECURITY;
ALTER TABLE ronda_swap ENABLE ROW LEVEL SECURITY;
ALTER TABLE jimpitan_sesi ENABLE ROW LEVEL SECURITY;
ALTER TABLE jimpitan_detail ENABLE ROW LEVEL SECURITY;
ALTER TABLE ronda_attendance ENABLE ROW LEVEL SECURITY;

-- Hapus policy lama kalau ada
DROP POLICY IF EXISTS "jadwal_ronda_read_all" ON jadwal_ronda;
DROP POLICY IF EXISTS "jadwal_ronda_write_pengurus" ON jadwal_ronda;
DROP POLICY IF EXISTS "ronda_swap_read_all" ON ronda_swap;
DROP POLICY IF EXISTS "ronda_swap_write_pengurus_or_inputter" ON ronda_swap;
DROP POLICY IF EXISTS "jimpitan_sesi_read_all" ON jimpitan_sesi;
DROP POLICY IF EXISTS "jimpitan_sesi_insert_warga" ON jimpitan_sesi;
DROP POLICY IF EXISTS "jimpitan_sesi_update_inputter_or_pengurus" ON jimpitan_sesi;
DROP POLICY IF EXISTS "jimpitan_detail_read_all" ON jimpitan_detail;
DROP POLICY IF EXISTS "jimpitan_detail_write_inputter" ON jimpitan_detail;
DROP POLICY IF EXISTS "ronda_attendance_read_all" ON ronda_attendance;
DROP POLICY IF EXISTS "ronda_attendance_write_inputter" ON ronda_attendance;

-- Jadwal Ronda: read all, write pengurus
CREATE POLICY "jadwal_ronda_read_all" ON jadwal_ronda
  FOR SELECT USING (TRUE);
CREATE POLICY "jadwal_ronda_write_pengurus" ON jadwal_ronda
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
  );

-- Ronda Swap: read all, write pengurus + inputter
CREATE POLICY "ronda_swap_read_all" ON ronda_swap
  FOR SELECT USING (TRUE);
CREATE POLICY "ronda_swap_write_pengurus_or_inputter" ON ronda_swap
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
  );

-- Jimpitan Sesi: read all, insert warga (jika window open dan belum ada), update by inputter/pengurus
CREATE POLICY "jimpitan_sesi_read_all" ON jimpitan_sesi
  FOR SELECT USING (TRUE);
CREATE POLICY "jimpitan_sesi_insert_warga" ON jimpitan_sesi
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = TRUE)
  );
CREATE POLICY "jimpitan_sesi_update_inputter_or_pengurus" ON jimpitan_sesi
  FOR UPDATE USING (
    input_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
  );

-- Jimpitan Detail: read all, write inputter (sesi AKTIF/SUBMITTED) atau pengurus
CREATE POLICY "jimpitan_detail_read_all" ON jimpitan_detail
  FOR SELECT USING (TRUE);
CREATE POLICY "jimpitan_detail_write_inputter" ON jimpitan_detail
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM jimpitan_sesi s
      WHERE s.id = jimpitan_detail.sesi_id
        AND (s.input_by = auth.uid() OR EXISTS (
          SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA'
        ))
    )
  );

-- Ronda Attendance: read all, write inputter/pengurus
CREATE POLICY "ronda_attendance_read_all" ON ronda_attendance
  FOR SELECT USING (TRUE);
CREATE POLICY "ronda_attendance_write_inputter" ON ronda_attendance
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM jimpitan_sesi s
      WHERE s.id = ronda_attendance.sesi_id
        AND (s.input_by = auth.uid() OR EXISTS (
          SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA'
        ))
    )
  );

-- =====================================================
-- STEP 10: TRIGGER - Auto-sync total saat detail/attendance berubah
-- =====================================================
CREATE OR REPLACE FUNCTION sync_jimpitan_sesi_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sesi_id UUID;
  v_total NUMERIC(12,2);
  v_jumlah_bayar INT;
  v_jumlah_hadir INT;
BEGIN
  v_sesi_id := COALESCE(NEW.sesi_id, OLD.sesi_id);

  SELECT
    COALESCE(SUM(CASE WHEN is_bayar THEN nominal ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE is_bayar)
  INTO v_total, v_jumlah_bayar
  FROM jimpitan_detail
  WHERE sesi_id = v_sesi_id;

  SELECT COUNT(*) INTO v_jumlah_hadir
  FROM ronda_attendance
  WHERE sesi_id = v_sesi_id;

  UPDATE jimpitan_sesi
  SET total_nominal = v_total,
      jumlah_warga_bayar = v_jumlah_bayar,
      jumlah_penjaga_hadir = v_jumlah_hadir,
      updated_at = NOW()
  WHERE id = v_sesi_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_jimpitan_detail ON jimpitan_detail;
CREATE TRIGGER trg_sync_jimpitan_detail
AFTER INSERT OR UPDATE OR DELETE ON jimpitan_detail
FOR EACH ROW
EXECUTE FUNCTION sync_jimpitan_sesi_totals();

DROP TRIGGER IF EXISTS trg_sync_ronda_attendance ON ronda_attendance;
CREATE TRIGGER trg_sync_ronda_attendance
AFTER INSERT OR UPDATE OR DELETE ON ronda_attendance
FOR EACH ROW
EXECUTE FUNCTION sync_jimpitan_sesi_totals();

-- =====================================================
-- STEP 11: TRIGGER - Saat jimpitan_sesi APPROVED, generate iuran_pembayaran
-- =====================================================
CREATE OR REPLACE FUNCTION on_jimpitan_sesi_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_periode DATE;
  v_detail RECORD;
  v_tagihan_id UUID;
  v_sesi_id_label TEXT;
BEGIN
  -- Hanya proses jika status berubah ke APPROVED
  IF NEW.status = 'APPROVED' AND (OLD.status IS NULL OR OLD.status <> 'APPROVED') THEN
    v_periode := DATE_TRUNC('month', NEW.tanggal)::DATE;
    v_sesi_id_label := 'JMP-' || TO_CHAR(NEW.tanggal, 'YYYYMMDD');

    -- Insert iuran_pembayaran untuk setiap detail yang is_bayar = TRUE
    FOR v_detail IN
      SELECT profile_id, nominal
      FROM jimpitan_detail
      WHERE sesi_id = NEW.id AND is_bayar = TRUE AND nominal > 0
    LOOP
      -- Cari tagihan bulan ini untuk profile
      SELECT id INTO v_tagihan_id
      FROM iuran_tagihan
      WHERE profile_id = v_detail.profile_id
        AND periode_bulan = v_periode;

      -- Kalau tidak ada tagihan, skip (jangan error)
      IF v_tagihan_id IS NOT NULL THEN
        -- Idempotent: hapus pembayaran lama dengan bukti_ref yang sama untuk profile ini di bulan ini
        DELETE FROM iuran_pembayaran
        WHERE profile_id = v_detail.profile_id
          AND bukti_ref = v_sesi_id_label;

        INSERT INTO iuran_pembayaran (
          tagihan_id, profile_id, nominal, metode, sumber, bukti_ref, catatan, created_by, confirmed
        ) VALUES (
          v_tagihan_id, v_detail.profile_id, v_detail.nominal,
          'JIMPITAN', 'JIMPITAN', v_sesi_id_label,
          'Jimpitan ' || TO_CHAR(NEW.tanggal, 'DD Month YYYY'),
          NEW.approved_by, TRUE
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jimpitan_approved_create_pembayaran ON jimpitan_sesi;
CREATE TRIGGER trg_jimpitan_approved_create_pembayaran
AFTER UPDATE ON jimpitan_sesi
FOR EACH ROW
EXECUTE FUNCTION on_jimpitan_sesi_approved();

-- =====================================================
-- STEP 12: SEED Jadwal Ronda (contoh 4 Sabtu Juni 2026)
-- User bisa edit/tambah via dashboard nanti
-- Penjaga dipilih dari profiles yang ada (A-1, A-2, B-1, C-2)
-- =====================================================
DO $$
DECLARE
  v_a1 UUID;
  v_a2 UUID;
  v_b1 UUID;
  v_c2 UUID;
BEGIN
  SELECT id INTO v_a1 FROM profiles WHERE login_id = 'A-1';
  SELECT id INTO v_a2 FROM profiles WHERE login_id = 'A-2';
  SELECT id INTO v_b1 FROM profiles WHERE login_id = 'B-1';
  SELECT id INTO v_c2 FROM profiles WHERE login_id = 'C-2';

  IF v_a1 IS NOT NULL THEN
    INSERT INTO jadwal_ronda (tanggal, minggu_ke, bulan, tahun, penjaga_profile_id, nama_penjaga_snapshot, blok_snapshot, nomor_rumah_snapshot)
    VALUES ('2026-06-06', 1, 6, 2026, v_a1, 'Bpk. Kurniawan', 'A', '1')
    ON CONFLICT (tanggal, penjaga_profile_id) DO NOTHING;
  END IF;

  IF v_a2 IS NOT NULL THEN
    INSERT INTO jadwal_ronda (tanggal, minggu_ke, bulan, tahun, penjaga_profile_id, nama_penjaga_snapshot, blok_snapshot, nomor_rumah_snapshot)
    VALUES ('2026-06-13', 2, 6, 2026, v_a2, 'Bpk. Amar Marruf', 'A', '2')
    ON CONFLICT (tanggal, penjaga_profile_id) DO NOTHING;
  END IF;

  IF v_b1 IS NOT NULL THEN
    INSERT INTO jadwal_ronda (tanggal, minggu_ke, bulan, tahun, penjaga_profile_id, nama_penjaga_snapshot, blok_snapshot, nomor_rumah_snapshot)
    VALUES ('2026-06-20', 3, 6, 2026, v_b1, 'Bpk. Budi S.', 'B', '1')
    ON CONFLICT (tanggal, penjaga_profile_id) DO NOTHING;
  END IF;

  IF v_c2 IS NOT NULL THEN
    INSERT INTO jadwal_ronda (tanggal, minggu_ke, bulan, tahun, penjaga_profile_id, nama_penjaga_snapshot, blok_snapshot, nomor_rumah_snapshot)
    VALUES ('2026-06-27', 4, 6, 2026, v_c2, 'Bpk. Setyobudi', 'C', '2')
    ON CONFLICT (tanggal, penjaga_profile_id) DO NOTHING;
  END IF;
END $$;

-- =====================================================
-- VERIFIKASI
-- =====================================================
SELECT 'JADWAL_RONDA' AS info, COUNT(*) AS total
FROM jadwal_ronda
WHERE tahun = 2026;

SELECT 'SESI_HARI_INI' AS info, COUNT(*) AS total
FROM jimpitan_sesi
WHERE tanggal = CURRENT_DATE;

SELECT 'JIMPITAN_WINDOW' AS info, is_jimpitan_window_open() AS window_terbuka;
