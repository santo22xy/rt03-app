-- =====================================================
-- SQL 77: Tabel dana_khusus + dana_khusus_pembayaran
--
-- FIX Problem #5: Fitur pengumpulan dana sementara (merti desa, dll)
-- dengan dukungan cicilan per warga
--
-- Alur:
--   1. Pengurus buat "dana_khusus" baru (mis. Merti Desa 2026)
--      → set target_nominal per KK, tanggal_mulai & tanggal_selesai
--   2. Warga bayar cicilan → tercatat di dana_khusus_pembayaran
--   3. Trigger auto-update total_terbayar + status (BELUM/CICIL/LUNAS)
--   4. Trigger auto-generate kas_transaksi (kategori = DANA_KHUSUS_<id>)
-- =====================================================

-- =====================================================
-- STEP 1: Tabel DANA_KHUSUS (definisi pengumpulan)
-- =====================================================
CREATE TABLE IF NOT EXISTS dana_khusus (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  judul             TEXT NOT NULL,
  deskripsi         TEXT,
  kategori          TEXT NOT NULL DEFAULT 'LAINNYA',  -- MERTI_DESA | 17_AGUSTUS | NATAL | LAINNYA
  target_per_kk     INT NOT NULL,                       -- nominal yg harus dibayar tiap KK
  tanggal_mulai     DATE NOT NULL,
  tanggal_selesai   DATE NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  is_wajib          BOOLEAN NOT NULL DEFAULT TRUE,     -- wajib vs sukarela
  created_by        UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dana_khusus_active ON dana_khusus(is_active, tanggal_mulai DESC);

-- =====================================================
-- STEP 2: Tabel DANA_KHUSUS_TAGIHAN (snapshot per KK)
-- =====================================================
CREATE TABLE IF NOT EXISTS dana_khusus_tagihan (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dana_khusus_id    UUID NOT NULL REFERENCES dana_khusus(id) ON DELETE CASCADE,
  profile_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  login_id          TEXT NOT NULL,
  nama_kk_snapshot  TEXT NOT NULL,
  nominal_tagihan   INT NOT NULL,                       -- copy dari dana_khusus.target_per_kk saat insert
  total_terbayar    INT NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'BELUM',     -- BELUM | CICIL | LUNAS
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dana_khusus_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_dana_khusus_tagihan_dana ON dana_khusus_tagihan(dana_khusus_id);
CREATE INDEX IF NOT EXISTS idx_dana_khusus_tagihan_profile ON dana_khusus_tagihan(profile_id);

-- =====================================================
-- STEP 3: Tabel DANA_KHUSUS_PEMBAYARAN (riwayat cicilan)
-- =====================================================
CREATE TABLE IF NOT EXISTS dana_khusus_pembayaran (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dana_khusus_id    UUID NOT NULL REFERENCES dana_khusus(id) ON DELETE CASCADE,
  tagihan_id        UUID NOT NULL REFERENCES dana_khusus_tagihan(id) ON DELETE CASCADE,
  profile_id        UUID NOT NULL REFERENCES profiles(id),
  login_id          TEXT NOT NULL,
  nominal           INT NOT NULL CHECK (nominal > 0),
  metode            TEXT NOT NULL DEFAULT 'TUNAI',     -- TUNAI | TRANSFER | QRIS
  tanggal_bayar     DATE NOT NULL DEFAULT CURRENT_DATE,
  bukti_ref         TEXT,                                -- ref external (mis. JMP-YYYYMMDD atau nomor transfer)
  catatan           TEXT,
  input_by          UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dana_khusus_pembayaran_dana ON dana_khusus_pembayaran(dana_khusus_id);
CREATE INDEX IF NOT EXISTS idx_dana_khusus_pembayaran_tagihan ON dana_khusus_pembayaran(tagihan_id);
CREATE INDEX IF NOT EXISTS idx_dana_khusus_pembayaran_profile ON dana_khusus_pembayaran(profile_id);

-- =====================================================
-- STEP 4: Trigger sync dana_khusus_tagihan dari pembayaran
-- =====================================================
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

-- =====================================================
-- STEP 5: Trigger auto-generate tagihan per KK saat dana_khusus dibuat
-- Pakai AFTER INSERT di dana_khusus → loop ke semua KK aktif
-- =====================================================
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
    AND p.login_id != 'X-0'   -- skip superadmin placeholder
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

-- =====================================================
-- STEP 6: Trigger auto-create kas_transaksi + link ke iuran_pembayaran
-- saat dana_khusus_pembayaran INSERT
-- =====================================================
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
  -- Ambil judul untuk uraian kas
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

  -- Kategori kas khusus (prefix khusus supaya mudah difilter)
  v_bukti_ref := COALESCE(NEW.bukti_ref, 'DKH-' || NEW.dana_khusus_id || '-' || substring(NEW.id::text, 1, 8));

  -- Idempotent insert ke kas_transaksi
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

-- =====================================================
-- STEP 7: RLS Policies
-- =====================================================
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

-- =====================================================
-- STEP 8: Helper functions
-- =====================================================
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
-- STEP 9: Verifikasi
-- =====================================================
SELECT 'a_tables' AS s,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'dana_khusus%') AS tables_created;

SELECT 'b_triggers' AS s,
  trigger_name
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND trigger_name LIKE '%dana_khusus%'
ORDER BY trigger_name;

NOTIFY pgrst, 'reload schema';
