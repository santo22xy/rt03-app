-- =====================================================
-- SQL 81: MASTER MIGRATION - Apply semua fix untuk 5 issue
--
-- Apply semua SQL di bawah ini di Supabase SQL Editor.
-- Aman dijalankan multiple kali (idempotent).
--
-- Daftar isi (apply urut):
--   - SQL 76: Trigger sync jimpitan_tagihan ← FIX Problem #4
--   - SQL 77: Tabel dana_khusus + triggers  ← FIX Problem #5
--   - SQL 79: Fix pengurus display (is_pengurus_aktif + view) ← FIX Problem #1
--   - SQL 80: Tambah kategori DANA_KHUSUS ke kas_kategori
--   - SQL 78: Seed Merti Desa contoh untuk testing
-- =====================================================

-- Set search_path default supaya DO block aman
SET search_path = public;

-- =====================================================
-- BAGIAN 1: FIX Problem #4 (Trigger sync tagihan)
-- Dari SQL 76
-- =====================================================

CREATE OR REPLACE FUNCTION sync_jimpitan_tagihan_from_pembayaran()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_periode DATE;
  v_total INT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_profile_id := OLD.profile_id;
    v_periode := OLD.periode_bulan;
  ELSE
    v_profile_id := NEW.profile_id;
    v_periode := NEW.periode_bulan;
  END IF;

  SELECT COALESCE(SUM(nominal), 0)::INT INTO v_total
  FROM iuran_pembayaran
  WHERE profile_id = v_profile_id
    AND periode_bulan = v_periode
    AND (confirmed IS NULL OR confirmed = TRUE);

  INSERT INTO jimpitan_tagihan (
    profile_id, login_id, nama_kk_snapshot, periode_bulan,
    nominal_tagihan, total_terbayar, status, updated_at
  )
  SELECT
    v_profile_id, p.login_id, p.nama_kk, v_periode,
    COALESCE(t.nominal_aktif, 0), v_total,
    CASE
      WHEN v_total > COALESCE(t.nominal_aktif, 0) AND COALESCE(t.nominal_aktif, 0) > 0 THEN 'LEBIH'
      WHEN v_total = COALESCE(t.nominal_aktif, 0) AND v_total > 0 THEN 'LUNAS'
      WHEN v_total > 0 THEN 'CICIL'
      ELSE 'BELUM'
    END,
    NOW()
  FROM profiles p
  LEFT JOIN jimpitan_tarif t
    ON t.profile_id = p.id AND t.is_active = TRUE
  WHERE p.id = v_profile_id
  ON CONFLICT (profile_id, periode_bulan) DO UPDATE SET
    total_terbayar = EXCLUDED.total_terbayar,
    status = EXCLUDED.status,
    updated_at = NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tagihan_from_pembayaran ON iuran_pembayaran;
CREATE TRIGGER trg_sync_tagihan_from_pembayaran
AFTER INSERT OR UPDATE OR DELETE ON iuran_pembayaran
FOR EACH ROW
EXECUTE FUNCTION sync_jimpitan_tagihan_from_pembayaran();

DO $$
DECLARE
  v_row RECORD;
  v_updated INT := 0;
BEGIN
  FOR v_row IN
    SELECT DISTINCT profile_id, periode_bulan
    FROM iuran_pembayaran
    WHERE confirmed IS NULL OR confirmed = TRUE
  LOOP
    UPDATE jimpitan_tagihan t
    SET total_terbayar = sub.total,
        status = CASE
          WHEN sub.total > t.nominal_tagihan AND t.nominal_tagihan > 0 THEN 'LEBIH'
          WHEN sub.total = t.nominal_tagihan AND sub.total > 0 THEN 'LUNAS'
          WHEN sub.total > 0 THEN 'CICIL'
          ELSE 'BELUM'
        END,
        updated_at = NOW()
    FROM (
      SELECT COALESCE(SUM(nominal), 0)::INT AS total
      FROM iuran_pembayaran
      WHERE profile_id = v_row.profile_id
        AND periode_bulan = v_row.periode_bulan
        AND (confirmed IS NULL OR confirmed = TRUE)
    ) sub
    WHERE t.profile_id = v_row.profile_id
      AND t.periode_bulan = v_row.periode_bulan;

    v_updated := v_updated + 1;
  END LOOP;

  RAISE NOTICE 'Synced % tagihan dari iuran_pembayaran', v_updated;
END $$;

-- =====================================================
-- BAGIAN 2: FIX Problem #5 (Tabel dana_khusus)
-- Dari SQL 77
-- =====================================================

CREATE TABLE IF NOT EXISTS dana_khusus (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  judul             TEXT NOT NULL,
  deskripsi         TEXT,
  kategori          TEXT NOT NULL DEFAULT 'LAINNYA',
  target_per_kk     INT NOT NULL,
  tanggal_mulai     DATE NOT NULL,
  tanggal_selesai   DATE NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  is_wajib          BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dana_khusus_active ON dana_khusus(is_active, tanggal_mulai DESC);

CREATE TABLE IF NOT EXISTS dana_khusus_tagihan (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dana_khusus_id    UUID NOT NULL REFERENCES dana_khusus(id) ON DELETE CASCADE,
  profile_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  login_id          TEXT NOT NULL,
  nama_kk_snapshot  TEXT NOT NULL,
  nominal_tagihan   INT NOT NULL,
  total_terbayar    INT NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'BELUM',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dana_khusus_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_dana_khusus_tagihan_dana ON dana_khusus_tagihan(dana_khusus_id);
CREATE INDEX IF NOT EXISTS idx_dana_khusus_tagihan_profile ON dana_khusus_tagihan(profile_id);

CREATE TABLE IF NOT EXISTS dana_khusus_pembayaran (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dana_khusus_id    UUID NOT NULL REFERENCES dana_khusus(id) ON DELETE CASCADE,
  tagihan_id        UUID NOT NULL REFERENCES dana_khusus_tagihan(id) ON DELETE CASCADE,
  profile_id        UUID NOT NULL REFERENCES profiles(id),
  login_id          TEXT NOT NULL,
  nominal           INT NOT NULL CHECK (nominal > 0),
  metode            TEXT NOT NULL DEFAULT 'TUNAI',
  tanggal_bayar     DATE NOT NULL DEFAULT CURRENT_DATE,
  bukti_ref         TEXT,
  catatan           TEXT,
  input_by          UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dana_khusus_pembayaran_dana ON dana_khusus_pembayaran(dana_khusus_id);
CREATE INDEX IF NOT EXISTS idx_dana_khusus_pembayaran_tagihan ON dana_khusus_pembayaran(tagihan_id);
CREATE INDEX IF NOT EXISTS idx_dana_khusus_pembayaran_profile ON dana_khusus_pembayaran(profile_id);

CREATE OR REPLACE FUNCTION sync_dana_khusus_tagihan()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tagihan_id UUID;
  v_total INT;
BEGIN
  v_tagihan_id := COALESCE(NEW.tagihan_id, OLD.tagihan_id);

  SELECT COALESCE(SUM(nominal), 0)::INT INTO v_total
  FROM dana_khusus_pembayaran
  WHERE tagihan_id = v_tagihan_id;

  UPDATE dana_khusus_tagihan
  SET total_terbayar = v_total,
      status = CASE
        WHEN v_total > nominal_tagihan THEN 'LEBIH'
        WHEN v_total = nominal_tagihan AND v_total > 0 THEN 'LUNAS'
        WHEN v_total > 0 THEN 'CICIL'
        ELSE 'BELUM'
      END,
      updated_at = NOW()
  WHERE id = v_tagihan_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_dana_khusus_tagihan ON dana_khusus_pembayaran;
CREATE TRIGGER trg_sync_dana_khusus_tagihan
AFTER INSERT OR UPDATE OR DELETE ON dana_khusus_pembayaran
FOR EACH ROW
EXECUTE FUNCTION sync_dana_khusus_tagihan();

CREATE OR REPLACE FUNCTION auto_create_dana_khusus_tagihan()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_p INTEGER := 0;
BEGIN
  INSERT INTO dana_khusus_tagihan (
    dana_khusus_id, profile_id, login_id, nama_kk_snapshot, nominal_tagihan
  )
  SELECT
    NEW.id, p.id, p.login_id, p.nama_kk, NEW.target_per_kk
  FROM profiles p
  WHERE p.is_active = TRUE
    AND p.login_id != 'X-0'
    AND p.blok IS NOT NULL
    AND p.nomor_rumah IS NOT NULL;

  GET DIAGNOSTICS v_p = ROW_COUNT;
  RAISE NOTICE 'Created % tagihan rows for dana_khusus: %', v_p, NEW.judul;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_dana_khusus_tagihan ON dana_khusus;
CREATE TRIGGER trg_auto_create_dana_khusus_tagihan
AFTER INSERT ON dana_khusus
FOR EACH ROW
WHEN (NEW.is_active = TRUE)
EXECUTE FUNCTION auto_create_dana_khusus_tagihan();

CREATE OR REPLACE FUNCTION on_dana_khusus_pembayaran_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $func$
DECLARE
  v_dana_khusus RECORD;
  v_nama_kk TEXT;
  v_bukti_ref TEXT;
BEGIN
  -- Lookup judul dana_khusus
  SELECT judul INTO v_dana_khusus FROM dana_khusus WHERE id = NEW.dana_khusus_id;
  IF v_dana_khusus IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lookup nama_kk via tagihan snapshot (dana_khusus_pembayaran TIDAK punya nama_kk_snapshot)
  SELECT nama_kk_snapshot INTO v_nama_kk
  FROM dana_khusus_tagihan
  WHERE id = NEW.tagihan_id;

  -- Fallback ke profiles kalau tagihan snapshot tidak ada
  IF v_nama_kk IS NULL OR v_nama_kk = '' THEN
    SELECT nama_kk INTO v_nama_kk FROM profiles WHERE id = NEW.profile_id;
  END IF;

  v_bukti_ref := COALESCE(NEW.bukti_ref, 'DKH-' || NEW.dana_khusus_id || '-' || substring(NEW.id::text, 1, 8));

  INSERT INTO kas_transaksi (
    trx_id_external, tanggal, tipe, kategori, uraian, nominal,
    metode_bayar, login_id, catatan, created_by
  )
  VALUES (
    v_bukti_ref, NEW.tanggal_bayar, 'MASUK', 'DANA_KHUSUS',
    COALESCE(v_dana_khusus.judul, 'Dana Khusus') || ' - ' || COALESCE(v_nama_kk, NEW.login_id),
    NEW.nominal, NEW.metode, NEW.login_id,
    COALESCE(NEW.catatan, ''), NEW.input_by
  )
  ON CONFLICT (trx_id_external) DO NOTHING;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_dana_khusus_to_kas ON dana_khusus_pembayaran;
CREATE TRIGGER trg_dana_khusus_to_kas
AFTER INSERT ON dana_khusus_pembayaran
FOR EACH ROW
EXECUTE FUNCTION on_dana_khusus_pembayaran_insert();

ALTER TABLE dana_khusus ENABLE ROW LEVEL SECURITY;
ALTER TABLE dana_khusus_tagihan ENABLE ROW LEVEL SECURITY;
ALTER TABLE dana_khusus_pembayaran ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dana_khusus_read_all" ON dana_khusus;
DROP POLICY IF EXISTS "dana_khusus_write_pengurus" ON dana_khusus;
DROP POLICY IF EXISTS "dana_khusus_tagihan_read_all" ON dana_khusus_tagihan;
DROP POLICY IF EXISTS "dana_khusus_tagihan_write_pengurus" ON dana_khusus_tagihan;
DROP POLICY IF EXISTS "dana_khusus_pembayaran_read_all" ON dana_khusus_pembayaran;
DROP POLICY IF EXISTS "dana_khusus_pembayaran_write_pengurus" ON dana_khusus_pembayaran;

CREATE POLICY "dana_khusus_read_all" ON dana_khusus FOR SELECT USING (TRUE);
CREATE POLICY "dana_khusus_write_pengurus" ON dana_khusus FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'SUPERADMIN'))
);

CREATE POLICY "dana_khusus_tagihan_read_all" ON dana_khusus_tagihan FOR SELECT USING (TRUE);
CREATE POLICY "dana_khusus_tagihan_write_pengurus" ON dana_khusus_tagihan FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'SUPERADMIN'))
);

CREATE POLICY "dana_khusus_pembayaran_read_all" ON dana_khusus_pembayaran FOR SELECT USING (TRUE);
CREATE POLICY "dana_khusus_pembayaran_write_pengurus" ON dana_khusus_pembayaran FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'SUPERADMIN'))
);

CREATE OR REPLACE FUNCTION get_dana_khusus_progress(p_dana_khusus_id UUID)
RETURNS TABLE (
  total_tagihan BIGINT,
  total_terbayar BIGINT,
  total_sisa BIGINT,
  jumlah_lunas INT,
  jumlah_cicil INT,
  jumlah_belum INT,
  pct_progres NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(SUM(nominal_tagihan), 0) AS total_tagihan,
    COALESCE(SUM(total_terbayar), 0) AS total_terbayar,
    COALESCE(SUM(nominal_tagihan - total_terbayar), 0) AS total_sisa,
    COUNT(*) FILTER (WHERE status = 'LUNAS')::INT AS jumlah_lunas,
    COUNT(*) FILTER (WHERE status = 'CICIL')::INT AS jumlah_cicil,
    COUNT(*) FILTER (WHERE status = 'BELUM')::INT AS jumlah_belum,
    CASE WHEN SUM(nominal_tagihan) > 0
      THEN ROUND(100.0 * SUM(total_terbayar) / SUM(nominal_tagihan), 1)
      ELSE 0
    END AS pct_progres
  FROM dana_khusus_tagihan
  WHERE dana_khusus_id = p_dana_khusus_id;
$$;

-- =====================================================
-- BAGIAN 3: FIX Problem #1 (Pak RT display)
-- Dari SQL 79
-- =====================================================

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_pengurus_aktif'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_pengurus_aktif BOOLEAN NOT NULL DEFAULT FALSE;

    UPDATE profiles
    SET is_pengurus_aktif = (role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'))
    WHERE is_active = TRUE;

    CREATE OR REPLACE FUNCTION sync_is_pengurus_aktif()
    RETURNS TRIGGER LANGUAGE plpgsql AS $func$
    BEGIN
      NEW.is_pengurus_aktif := (NEW.role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS', 'PENGURUS', 'SUPERADMIN'))
        AND NEW.is_active = TRUE;
      RETURN NEW;
    END;
    $func$;

    DROP TRIGGER IF EXISTS trg_sync_is_pengurus_aktif ON profiles;
    CREATE TRIGGER trg_sync_is_pengurus_aktif
    BEFORE INSERT OR UPDATE OF role, is_active ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION sync_is_pengurus_aktif();
  END IF;
END $do$;

CREATE OR REPLACE VIEW v_pengurus_aktif AS
SELECT
  p.id, p.login_id, p.nama_kk, p.role, p.blok, p.nomor_rumah,
  p.no_hp, p.is_active, p.is_pengurus_aktif, p.created_at,
  CASE p.role
    WHEN 'KETUA_RT' THEN 1
    WHEN 'BENDAHARA' THEN 2
    WHEN 'SEKRETARIS' THEN 3
    WHEN 'PENGURUS' THEN 4
    WHEN 'SUPERADMIN' THEN 5
    ELSE 99
  END AS role_order
FROM profiles p
WHERE p.is_pengurus_aktif = TRUE
ORDER BY role_order, p.blok, p.nomor_rumah, p.login_id;

GRANT SELECT ON v_pengurus_aktif TO anon, authenticated;

-- =====================================================
-- BAGIAN 4: Tambah kategori DANA_KHUSUS ke kas_kategori
-- =====================================================

INSERT INTO kas_kategori (tipe, kode, label, urutan)
VALUES
  ('MASUK', 'DANA_KHUSUS', 'Dana Khusus', 5)
ON CONFLICT (tipe, kode) DO UPDATE SET
  label = EXCLUDED.label,
  is_active = TRUE;

-- =====================================================
-- BAGIAN 5: Seed Merti Desa contoh untuk testing
-- =====================================================

DO $$
DECLARE
  v_ketua UUID;
  v_id UUID;
BEGIN
  SELECT id INTO v_ketua FROM profiles
  WHERE role IN ('KETUA_RT', 'BENDAHARA', 'SUPERADMIN')
  ORDER BY CASE role WHEN 'KETUA_RT' THEN 1 WHEN 'BENDAHARA' THEN 2 ELSE 3 END
  LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM dana_khusus WHERE judul = 'Merti Desa 2026' AND kategori = 'MERTI_DESA') THEN
    INSERT INTO dana_khusus (
      judul, deskripsi, kategori, target_per_kk,
      tanggal_mulai, tanggal_selesai, is_active, is_wajib, created_by
    ) VALUES (
      'Merti Desa 2026',
      'Iuran untuk acara Merti Desa RT 03 - Sumbangan sukarela (bisa dicicil)',
      'MERTI_DESA', 50000,
      '2026-06-01', '2026-08-31',
      TRUE, FALSE,
      v_ketua
    )
    RETURNING id INTO v_id;

    RAISE NOTICE 'Created Merti Desa 2026 (id: %)', v_id;
  END IF;
END $$;

-- Sample cicilan: 3 warga bayar sebagian supaya test trigger sync
DO $$
DECLARE
  v_dana UUID;
  v_a2 UUID; v_b3 UUID; v_c1 UUID;
BEGIN
  SELECT id INTO v_dana FROM dana_khusus WHERE judul = 'Merti Desa 2026';

  IF v_dana IS NOT NULL THEN
    SELECT id INTO v_a2 FROM dana_khusus_tagihan WHERE dana_khusus_id = v_dana AND login_id = 'A-2';
    SELECT id INTO v_b3 FROM dana_khusus_tagihan WHERE dana_khusus_id = v_dana AND login_id = 'B-3';
    SELECT id INTO v_c1 FROM dana_khusus_tagihan WHERE dana_khusus_id = v_dana AND login_id = 'C-1';

    IF v_a2 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dana_khusus_pembayaran WHERE tagihan_id = v_a2) THEN
      INSERT INTO dana_khusus_pembayaran (dana_khusus_id, tagihan_id, profile_id, login_id, nominal, metode, tanggal_bayar, bukti_ref, catatan)
      SELECT v_dana, v_a2, p.id, p.login_id, 25000, 'TUNAI', '2026-06-15', 'DKH-CICIL-A2', 'Cicilan pertama merti desa'
      FROM profiles p WHERE p.login_id = 'A-2';
    END IF;

    IF v_b3 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dana_khusus_pembayaran WHERE tagihan_id = v_b3) THEN
      INSERT INTO dana_khusus_pembayaran (dana_khusus_id, tagihan_id, profile_id, login_id, nominal, metode, tanggal_bayar, bukti_ref, catatan)
      SELECT v_dana, v_b3, p.id, p.login_id, 50000, 'TRANSFER', '2026-06-16', 'DKH-LUNAS-B3', 'Pelunasan merti desa via transfer'
      FROM profiles p WHERE p.login_id = 'B-3';
    END IF;

    IF v_c1 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dana_khusus_pembayaran WHERE tagihan_id = v_c1) THEN
      INSERT INTO dana_khusus_pembayaran (dana_khusus_id, tagihan_id, profile_id, login_id, nominal, metode, tanggal_bayar, bukti_ref, catatan)
      SELECT v_dana, v_c1, p.id, p.login_id, 20000, 'TUNAI', '2026-06-18', 'DKH-CICIL-C1', 'Cicilan awal merti desa'
      FROM profiles p WHERE p.login_id = 'C-1';
    END IF;
  END IF;
END $$;

-- =====================================================
-- VERIFIKASI FINAL
-- =====================================================
SELECT '=== HASIL ===' AS section;

SELECT 'a_jimpitan_juni' AS s,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'LUNAS') AS lunas,
  COUNT(*) FILTER (WHERE status = 'CICIL') AS cicil,
  COUNT(*) FILTER (WHERE status = 'BELUM') AS belum
FROM jimpitan_tagihan WHERE periode_bulan = '2026-06-01';

SELECT 'b_pengurus' AS s, COUNT(*) AS total_pengurus FROM v_pengurus_aktif;

SELECT 'c_pak_rt' AS s, login_id, nama_kk, role FROM profiles WHERE role = 'KETUA_RT' LIMIT 5;

SELECT 'd_dana_khusus' AS s,
  d.judul, COUNT(t.*) AS total_kk,
  COALESCE(SUM(t.total_terbayar), 0) AS terkumpul
FROM dana_khusus d
LEFT JOIN dana_khusus_tagihan t ON t.dana_khusus_id = d.id
GROUP BY d.id, d.judul;

SELECT 'e_kas_dana_khusus' AS s,
  tanggal::text, kategori, uraian, nominal
FROM kas_transaksi WHERE kategori = 'DANA_KHUSUS'
ORDER BY tanggal DESC LIMIT 5;

NOTIFY pgrst, 'reload schema';
