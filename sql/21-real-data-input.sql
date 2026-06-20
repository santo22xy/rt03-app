-- =====================================================
-- 21: Data Real dari Spreadsheet SENTRA JUNI 2026
-- Per tanggal 13 Juni 2026
-- Saldo Kas: Rp 148.500
-- =====================================================

-- =====================================================
-- STEP 0A: Pastikan kolom catatan ada di profiles
-- =====================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS catatan TEXT;

-- =====================================================
-- STEP 0B: Tabel-tabel dependency (idempotent - hanya buat jika belum ada)
-- SQL ini SELF-CONTAINED: tidak perlu jalankan sql/19 atau sql/20 dulu
-- =====================================================

-- Tabel IURAN TARIF (dari sql/19)
CREATE TABLE IF NOT EXISTS iuran_tarif (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kategori_tarif  TEXT NOT NULL,
  nominal         NUMERIC(12,2) NOT NULL,
  berlaku_dari    DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kategori_tarif, berlaku_dari)
);

-- Tabel IURAN TAGIHAN (dari sql/19)
CREATE TABLE IF NOT EXISTS iuran_tagihan (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  periode_bulan   DATE NOT NULL,
  nominal         NUMERIC(12,2) NOT NULL,
  total_terbayar  NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'BELUM',
  due_date        DATE,
  catatan         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, periode_bulan)
);

-- Tabel IURAN PEMBAYARAN (dari sql/19)
CREATE TABLE IF NOT EXISTS iuran_pembayaran (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tagihan_id  UUID NOT NULL REFERENCES iuran_tagihan(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nominal     NUMERIC(12,2) NOT NULL,
  metode      TEXT NOT NULL,
  sumber      TEXT NOT NULL,
  bukti_ref   TEXT,
  catatan     TEXT,
  created_by  UUID REFERENCES profiles(id),
  confirmed   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patch untuk tabel yang sudah ada dari sql/19 (kolom created_by mungkin belum ada)
ALTER TABLE iuran_pembayaran ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);
ALTER TABLE iuran_pembayaran ADD COLUMN IF NOT EXISTS confirmed  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE iuran_pembayaran ADD COLUMN IF NOT EXISTS sumber     TEXT;
ALTER TABLE iuran_pembayaran ADD COLUMN IF NOT EXISTS bukti_ref  TEXT;
ALTER TABLE iuran_pembayaran ADD COLUMN IF NOT EXISTS catatan    TEXT;

CREATE INDEX IF NOT EXISTS idx_iuran_tagihan_profile    ON iuran_tagihan(profile_id);
CREATE INDEX IF NOT EXISTS idx_iuran_tagihan_periode    ON iuran_tagihan(periode_bulan DESC);
CREATE INDEX IF NOT EXISTS idx_iuran_pembayaran_tagihan ON iuran_pembayaran(tagihan_id);
CREATE INDEX IF NOT EXISTS idx_iuran_pembayaran_profile ON iuran_pembayaran(profile_id);
CREATE INDEX IF NOT EXISTS idx_iuran_pembayaran_created ON iuran_pembayaran(created_at DESC);

-- Enable RLS iuran tables
ALTER TABLE iuran_tarif ENABLE ROW LEVEL SECURITY;
ALTER TABLE iuran_tagihan ENABLE ROW LEVEL SECURITY;
ALTER TABLE iuran_pembayaran ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "iuran_tarif_read_all" ON iuran_tarif;
DROP POLICY IF EXISTS "iuran_tarif_write_pengurus" ON iuran_tarif;
CREATE POLICY "iuran_tarif_read_all" ON iuran_tarif FOR SELECT USING (TRUE);
CREATE POLICY "iuran_tarif_write_pengurus" ON iuran_tarif FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

DROP POLICY IF EXISTS "iuran_tagihan_read_all" ON iuran_tagihan;
DROP POLICY IF EXISTS "iuran_tagihan_write_pengurus" ON iuran_tagihan;
CREATE POLICY "iuran_tagihan_read_all" ON iuran_tagihan FOR SELECT USING (TRUE);
CREATE POLICY "iuran_tagihan_write_pengurus" ON iuran_tagihan FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

DROP POLICY IF EXISTS "iuran_pembayaran_read_all" ON iuran_pembayaran;
DROP POLICY IF EXISTS "iuran_pembayaran_write_pengurus" ON iuran_pembayaran;
CREATE POLICY "iuran_pembayaran_read_all" ON iuran_pembayaran FOR SELECT USING (TRUE);
CREATE POLICY "iuran_pembayaran_write_pengurus" ON iuran_pembayaran FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

-- Tabel JADWAL RONDA (dari sql/20)
CREATE TABLE IF NOT EXISTS jadwal_ronda (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal               DATE NOT NULL,
  minggu_ke             INT NOT NULL,
  bulan                 INT NOT NULL,
  tahun                 INT NOT NULL,
  penjaga_profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nama_penjaga_snapshot TEXT NOT NULL,
  blok_snapshot         TEXT NOT NULL,
  nomor_rumah_snapshot  TEXT NOT NULL,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tanggal, penjaga_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_jadwal_ronda_tanggal ON jadwal_ronda(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_jadwal_ronda_penjaga ON jadwal_ronda(penjaga_profile_id);

-- Tabel RONDA SWAP (dari sql/20)
CREATE TABLE IF NOT EXISTS ronda_swap (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jadwal_ronda_id         UUID NOT NULL REFERENCES jadwal_ronda(id) ON DELETE CASCADE,
  tanggal                 DATE NOT NULL,
  profile_asli_id         UUID NOT NULL REFERENCES profiles(id),
  profile_pengganti_id    UUID NOT NULL REFERENCES profiles(id),
  nama_asli_snapshot      TEXT NOT NULL,
  nama_pengganti_snapshot TEXT NOT NULL,
  keterangan              TEXT,
  created_by              UUID NOT NULL REFERENCES profiles(id),
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ronda_swap_tanggal ON ronda_swap(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_ronda_swap_asli ON ronda_swap(profile_asli_id);

-- Tabel JIMPITAN SESI (dari sql/20)
CREATE TABLE IF NOT EXISTS jimpitan_sesi (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal               DATE NOT NULL,
  kelompok_id           TEXT,
  profile_id_petugas    UUID REFERENCES profiles(id),
  nama_petugas_snapshot TEXT,
  status                TEXT NOT NULL DEFAULT 'DRAFT',  -- DRAFT | ACC | REJECTED
  total_pendapatan      INT NOT NULL DEFAULT 0,
  catatan               TEXT,
  acd_by_profile_id     UUID REFERENCES profiles(id),
  acc_at                TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tanggal, kelompok_id)
);

CREATE INDEX IF NOT EXISTS idx_jimpitan_sesi_tanggal ON jimpitan_sesi(tanggal DESC);

-- Tabel JIMPITAN DETAIL (per KK dalam satu sesi)
CREATE TABLE IF NOT EXISTS jimpitan_detail (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sesi_id         UUID NOT NULL REFERENCES jimpitan_sesi(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES profiles(id),
  login_id        TEXT NOT NULL,
  nama_kk_snapshot TEXT NOT NULL,
  nominal         INT NOT NULL DEFAULT 0,
  status_bayar    TEXT NOT NULL DEFAULT 'BELUM',  -- BELUM | BAYAR | GRATIS | TIDAK_RUMAH
  catatan         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sesi_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_jimpitan_detail_sesi ON jimpitan_detail(sesi_id);

-- Tabel RONDA ATTENDANCE
CREATE TABLE IF NOT EXISTS ronda_attendance (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jadwal_ronda_id     UUID NOT NULL REFERENCES jadwal_ronda(id) ON DELETE CASCADE,
  profile_id          UUID NOT NULL REFERENCES profiles(id),
  login_id            TEXT NOT NULL,
  nama_kk_snapshot    TEXT NOT NULL,
  hadir               BOOLEAN NOT NULL DEFAULT TRUE,
  is_pengganti        BOOLEAN NOT NULL DEFAULT FALSE,
  catatan             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (jadwal_ronda_id, profile_id)
);

-- Enable RLS untuk tabel-tabel ini
ALTER TABLE jadwal_ronda ENABLE ROW LEVEL SECURITY;
ALTER TABLE ronda_swap ENABLE ROW LEVEL SECURITY;
ALTER TABLE jimpitan_sesi ENABLE ROW LEVEL SECURITY;
ALTER TABLE jimpitan_detail ENABLE ROW LEVEL SECURITY;
ALTER TABLE ronda_attendance ENABLE ROW LEVEL SECURITY;

-- Policies (semua pengurus boleh akses, warga hanya baca untuk yg relevan)
DROP POLICY IF EXISTS "jadwal_ronda_read_all" ON jadwal_ronda;
DROP POLICY IF EXISTS "jadwal_ronda_write_pengurus" ON jadwal_ronda;
CREATE POLICY "jadwal_ronda_read_all" ON jadwal_ronda FOR SELECT USING (TRUE);
CREATE POLICY "jadwal_ronda_write_pengurus" ON jadwal_ronda FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

DROP POLICY IF EXISTS "ronda_swap_read_all" ON ronda_swap;
DROP POLICY IF EXISTS "ronda_swap_write_pengurus" ON ronda_swap;
CREATE POLICY "ronda_swap_read_all" ON ronda_swap FOR SELECT USING (TRUE);
CREATE POLICY "ronda_swap_write_pengurus" ON ronda_swap FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

DROP POLICY IF EXISTS "jimpitan_sesi_read_all" ON jimpitan_sesi;
DROP POLICY IF EXISTS "jimpitan_sesi_write_pengurus" ON jimpitan_sesi;
CREATE POLICY "jimpitan_sesi_read_all" ON jimpitan_sesi FOR SELECT USING (TRUE);
CREATE POLICY "jimpitan_sesi_write_pengurus" ON jimpitan_sesi FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

DROP POLICY IF EXISTS "jimpitan_detail_read_all" ON jimpitan_detail;
DROP POLICY IF EXISTS "jimpitan_detail_write_pengurus" ON jimpitan_detail;
CREATE POLICY "jimpitan_detail_read_all" ON jimpitan_detail FOR SELECT USING (TRUE);
CREATE POLICY "jimpitan_detail_write_pengurus" ON jimpitan_detail FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

DROP POLICY IF EXISTS "ronda_attendance_read_all" ON ronda_attendance;
DROP POLICY IF EXISTS "ronda_attendance_write_pengurus" ON ronda_attendance;
CREATE POLICY "ronda_attendance_read_all" ON ronda_attendance FOR SELECT USING (TRUE);
CREATE POLICY "ronda_attendance_write_pengurus" ON ronda_attendance FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

-- =====================================================
-- STEP 0D: Fix nama B-5 (idempotent)
-- =====================================================
UPDATE profiles
SET nama_kk = 'Budi Setiawan'
WHERE login_id = 'B-5';

-- =====================================================
-- STEP 0E: Tabel APP SETTINGS (untuk WA numbers & config)
-- =====================================================
DROP TABLE IF EXISTS app_settings CASCADE;
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (key, value, description) VALUES
  ('APP_NAME', 'SENTRA RT 03', 'Nama aplikasi'),
  ('WA_SEKRETARIS', '6285328815155', 'Nomor WA Sekretaris'),
  ('WA_BENDAHARA', '6285640981006', 'Nomor WA Bendahara'),
  ('WA_KETUA_RT', '6285103242482', 'Nomor WA Ketua RT'),
  ('IURAN_BULANAN_NORMAL', '25000', 'Nominal iuran rumah normal'),
  ('IURAN_BULANAN_KOSONG', '10000', 'Nominal iuran rumah kosong'),
  ('JIMPITAN_DEFAULT', '15000', 'Nominal default jimpitan per rumah per bulan'),
  ('JIMPITAN_JANDA', '10000', 'Nominal jimpitan untuk kategori janda/khusus'),
  ('JIMPITAN_JAM_KUMPUL', '21:00', 'Jam kumpul default ronda/jimpitan'),
  ('JIMPITAN_WINDOW_MULAI', '19:00', 'Window jimpitan buka (jam)'),
  ('JIMPITAN_WINDOW_SELESAI', '23:00', 'Window jimpitan tutup (jam)')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Hapus SALDO_KAS_RT lama (hardcoded), pakai kalkulasi dari kas_transaksi
DELETE FROM app_settings WHERE key = 'SALDO_KAS_RT';

-- =====================================================
-- STEP 3: Tabel RONDA KELOMPOK
-- 4 kelompok, 6 KK each (24 dari 29 KK)
-- 5 KK tidak ikut ronda: A-5, B-3, B-4, B-7, C-6
-- Drop & recreate agar schema konsisten
-- =====================================================
DROP TABLE IF EXISTS ronda_kelompok CASCADE;

CREATE TABLE ronda_kelompok (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kelompok_id     TEXT NOT NULL,                     -- K1, K2, K3, K4
  nama_kelompok   TEXT NOT NULL,                     -- Kelompok 1, dst
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  login_id        TEXT NOT NULL,
  nama_kk_snapshot TEXT NOT NULL,
  blok_snapshot   TEXT NOT NULL,
  nomor_rumah_snapshot TEXT NOT NULL,
  role_kelompok   TEXT NOT NULL DEFAULT 'ANGGOTA',   -- KETUA | ANGGOTA
  urutan          INT NOT NULL DEFAULT 1,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kelompok_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_ronda_kelompok_kelompok ON ronda_kelompok(kelompok_id);
CREATE INDEX IF NOT EXISTS idx_ronda_kelompok_profile ON ronda_kelompok(profile_id);

ALTER TABLE ronda_kelompok ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ronda_kelompok_read_all" ON ronda_kelompok;
DROP POLICY IF EXISTS "ronda_kelompok_write_pengurus" ON ronda_kelompok;
CREATE POLICY "ronda_kelompok_read_all" ON ronda_kelompok FOR SELECT USING (TRUE);
CREATE POLICY "ronda_kelompok_write_pengurus" ON ronda_kelompok FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

-- Insert 24 anggota kelompok
DO $$
DECLARE
  v_id UUID;
  v_nama TEXT;
  v_blok TEXT;
  v_nomor TEXT;
  v_login_id TEXT;
  v_role TEXT;
  v_urutan INT;
BEGIN
  -- KELOMPOK 1 (K1) - Ketua: A-1 (Bpk. Kurniawan)
  FOR v_login_id, v_role, v_urutan IN
    VALUES ('A-1', 'KETUA', 1), ('B-1', 'ANGGOTA', 2), ('C-4', 'ANGGOTA', 3),
           ('D-2', 'ANGGOTA', 4), ('A-13', 'ANGGOTA', 5), ('A-14', 'ANGGOTA', 6)
  LOOP
    SELECT id, nama_kk, blok, nomor_rumah INTO v_id, v_nama, v_blok, v_nomor
    FROM profiles WHERE login_id = v_login_id;
    IF v_id IS NOT NULL THEN
      INSERT INTO ronda_kelompok (kelompok_id, nama_kelompok, profile_id, login_id, nama_kk_snapshot, blok_snapshot, nomor_rumah_snapshot, role_kelompok, urutan)
      VALUES ('K1', 'Kelompok 1', v_id, v_login_id, v_nama, v_blok, v_nomor, v_role, v_urutan)
      ON CONFLICT (kelompok_id, profile_id) DO NOTHING;
    END IF;
  END LOOP;

  -- KELOMPOK 2 (K2) - Ketua: A-2 (Bpk. Amar Marruf)
  FOR v_login_id, v_role, v_urutan IN
    VALUES ('A-2', 'KETUA', 1), ('B-2', 'ANGGOTA', 2), ('C-2', 'ANGGOTA', 3),
           ('D-3', 'ANGGOTA', 4), ('A-15', 'ANGGOTA', 5), ('A-16', 'ANGGOTA', 6)
  LOOP
    SELECT id, nama_kk, blok, nomor_rumah INTO v_id, v_nama, v_blok, v_nomor
    FROM profiles WHERE login_id = v_login_id;
    IF v_id IS NOT NULL THEN
      INSERT INTO ronda_kelompok (kelompok_id, nama_kelompok, profile_id, login_id, nama_kk_snapshot, blok_snapshot, nomor_rumah_snapshot, role_kelompok, urutan)
      VALUES ('K2', 'Kelompok 2', v_id, v_login_id, v_nama, v_blok, v_nomor, v_role, v_urutan)
      ON CONFLICT (kelompok_id, profile_id) DO NOTHING;
    END IF;
  END LOOP;

  -- KELOMPOK 3 (K3) - Ketua: A-4 (Bpk. Andi H.)
  FOR v_login_id, v_role, v_urutan IN
    VALUES ('A-4', 'KETUA', 1), ('B-5', 'ANGGOTA', 2), ('C-5', 'ANGGOTA', 3),
           ('C-7', 'ANGGOTA', 4), ('A-8', 'ANGGOTA', 5), ('A-9', 'ANGGOTA', 6)
  LOOP
    SELECT id, nama_kk, blok, nomor_rumah INTO v_id, v_nama, v_blok, v_nomor
    FROM profiles WHERE login_id = v_login_id;
    IF v_id IS NOT NULL THEN
      INSERT INTO ronda_kelompok (kelompok_id, nama_kelompok, profile_id, login_id, nama_kk_snapshot, blok_snapshot, nomor_rumah_snapshot, role_kelompok, urutan)
      VALUES ('K3', 'Kelompok 3', v_id, v_login_id, v_nama, v_blok, v_nomor, v_role, v_urutan)
      ON CONFLICT (kelompok_id, profile_id) DO NOTHING;
    END IF;
  END LOOP;

  -- KELOMPOK 4 (K4) - Ketua: A-6 (Bpk. Edi Santosa)
  FOR v_login_id, v_role, v_urutan IN
    VALUES ('A-6', 'KETUA', 1), ('B-8', 'ANGGOTA', 2), ('C-8', 'ANGGOTA', 3),
           ('A-10', 'ANGGOTA', 4), ('A-11', 'ANGGOTA', 5), ('A-12', 'ANGGOTA', 6)
  LOOP
    SELECT id, nama_kk, blok, nomor_rumah INTO v_id, v_nama, v_blok, v_nomor
    FROM profiles WHERE login_id = v_login_id;
    IF v_id IS NOT NULL THEN
      INSERT INTO ronda_kelompok (kelompok_id, nama_kelompok, profile_id, login_id, nama_kk_snapshot, blok_snapshot, nomor_rumah_snapshot, role_kelompok, urutan)
      VALUES ('K4', 'Kelompok 4', v_id, v_login_id, v_nama, v_blok, v_nomor, v_role, v_urutan)
      ON CONFLICT (kelompok_id, profile_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- STEP 4: UPDATE JADWAL RONDA existing dengan kelompok_id
-- 4 Sabtu Juni 2026: 06, 13, 20, 27
-- =====================================================
-- Hapus jadwal lama (yang pakai nama A-1, A-2, B-1, C-2) dan ganti dengan data real
-- Skip kalau tabel belum ada (aman untuk run parsial)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jadwal_ronda') THEN
    DELETE FROM jadwal_ronda WHERE tanggal IN ('2026-06-06', '2026-06-13', '2026-06-20', '2026-06-27');
  END IF;
END $$;

DO $$
DECLARE
  v_petugas_id UUID;
  v_petugas_nama TEXT;
  v_petugas_blok TEXT;
  v_petugas_nomor TEXT;
  v_kelompok_id TEXT;
  v_tanggal DATE;
  v_minggu INT;
BEGIN
  -- Sabtu 1: 2026-06-06, K1, Petugas: A-1
  v_tanggal := '2026-06-06'::DATE;
  v_minggu := 1;
  v_kelompok_id := 'K1';
  SELECT id, nama_kk, blok, nomor_rumah INTO v_petugas_id, v_petugas_nama, v_petugas_blok, v_petugas_nomor
  FROM profiles WHERE login_id = 'A-1';
  IF v_petugas_id IS NOT NULL THEN
    INSERT INTO jadwal_ronda (tanggal, minggu_ke, bulan, tahun, penjaga_profile_id, nama_penjaga_snapshot, blok_snapshot, nomor_rumah_snapshot)
    VALUES (v_tanggal, v_minggu, 6, 2026, v_petugas_id, v_petugas_nama, v_petugas_blok, v_petugas_nomor);
  END IF;

  -- Sabtu 2: 2026-06-13, K2, Petugas: A-2
  v_tanggal := '2026-06-13'::DATE;
  v_minggu := 2;
  v_kelompok_id := 'K2';
  SELECT id, nama_kk, blok, nomor_rumah INTO v_petugas_id, v_petugas_nama, v_petugas_blok, v_petugas_nomor
  FROM profiles WHERE login_id = 'A-2';
  IF v_petugas_id IS NOT NULL THEN
    INSERT INTO jadwal_ronda (tanggal, minggu_ke, bulan, tahun, penjaga_profile_id, nama_penjaga_snapshot, blok_snapshot, nomor_rumah_snapshot)
    VALUES (v_tanggal, v_minggu, 6, 2026, v_petugas_id, v_petugas_nama, v_petugas_blok, v_petugas_nomor);
  END IF;

  -- Sabtu 3: 2026-06-20, K3, Petugas: A-4
  v_tanggal := '2026-06-20'::DATE;
  v_minggu := 3;
  v_kelompok_id := 'K3';
  SELECT id, nama_kk, blok, nomor_rumah INTO v_petugas_id, v_petugas_nama, v_petugas_blok, v_petugas_nomor
  FROM profiles WHERE login_id = 'A-4';
  IF v_petugas_id IS NOT NULL THEN
    INSERT INTO jadwal_ronda (tanggal, minggu_ke, bulan, tahun, penjaga_profile_id, nama_penjaga_snapshot, blok_snapshot, nomor_rumah_snapshot)
    VALUES (v_tanggal, v_minggu, 6, 2026, v_petugas_id, v_petugas_nama, v_petugas_blok, v_petugas_nomor);
  END IF;

  -- Sabtu 4: 2026-06-27, K4, Petugas: A-6
  v_tanggal := '2026-06-27'::DATE;
  v_minggu := 4;
  v_kelompok_id := 'K4';
  SELECT id, nama_kk, blok, nomor_rumah INTO v_petugas_id, v_petugas_nama, v_petugas_blok, v_petugas_nomor
  FROM profiles WHERE login_id = 'A-6';
  IF v_petugas_id IS NOT NULL THEN
    INSERT INTO jadwal_ronda (tanggal, minggu_ke, bulan, tahun, penjaga_profile_id, nama_penjaga_snapshot, blok_snapshot, nomor_rumah_snapshot)
    VALUES (v_tanggal, v_minggu, 6, 2026, v_petugas_id, v_petugas_nama, v_petugas_blok, v_petugas_nomor);
  END IF;
END $$;

-- =====================================================
-- STEP 5: Tabel JIMPITAN TARIF (per-KK)
-- NORMAL: 15000, JANDA/PERLU_KONFIRMASI: 10000
-- =====================================================
DROP TABLE IF EXISTS jimpitan_tagihan CASCADE;
DROP TABLE IF EXISTS jimpitan_tarif CASCADE;

CREATE TABLE jimpitan_tarif (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  login_id        TEXT NOT NULL,
  nama_kk         TEXT NOT NULL,
  nominal_default NUMERIC(12,2) NOT NULL DEFAULT 15000,
  nominal_khusus  NUMERIC(12,2),
  nominal_aktif   NUMERIC(12,2) NOT NULL,
  kategori        TEXT NOT NULL DEFAULT 'NORMAL',  -- NORMAL | PERLU_KONFIRMASI | KOSONG
  catatan         TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jimpitan_tarif_profile ON jimpitan_tarif(profile_id);
CREATE INDEX IF NOT EXISTS idx_jimpitan_tarif_login ON jimpitan_tarif(login_id);

ALTER TABLE jimpitan_tarif ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jimpitan_tarif_read_all" ON jimpitan_tarif;
DROP POLICY IF EXISTS "jimpitan_tarif_write_pengurus" ON jimpitan_tarif;
CREATE POLICY "jimpitan_tarif_read_all" ON jimpitan_tarif FOR SELECT USING (TRUE);
CREATE POLICY "jimpitan_tarif_write_pengurus" ON jimpitan_tarif FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

-- Insert tarif per KK
DO $$
DECLARE
  v_id UUID;
  v_nama TEXT;
  v_login TEXT;
  v_kategori TEXT;
  v_nominal NUMERIC;
  v_catatan TEXT;
BEGIN
  FOR v_login, v_kategori, v_nominal, v_catatan IN
    VALUES
      ('A-1', 'NORMAL', 15000, ''),
      ('A-2', 'NORMAL', 15000, ''),
      ('A-4', 'NORMAL', 15000, ''),
      ('A-5', 'PERLU_KONFIRMASI', 15000, 'Tidak masuk daftar ronda; cek kategori/iuran khusus.'),
      ('A-6', 'NORMAL', 15000, ''),
      ('A-8', 'NORMAL', 15000, ''),
      ('A-9', 'NORMAL', 15000, ''),
      ('A-10', 'NORMAL', 15000, ''),
      ('A-11', 'NORMAL', 15000, ''),
      ('A-12', 'NORMAL', 15000, ''),
      ('A-13', 'NORMAL', 15000, ''),
      ('A-14', 'NORMAL', 15000, ''),
      ('A-15', 'NORMAL', 15000, ''),
      ('A-16', 'NORMAL', 15000, ''),
      ('B-1', 'NORMAL', 15000, 'Ketua RT.'),
      ('B-2', 'NORMAL', 15000, ''),
      ('B-3', 'PERLU_KONFIRMASI', 10000, 'Tidak masuk daftar ronda; kemungkinan kategori khusus.'),
      ('B-4', 'PERLU_KONFIRMASI', 10000, 'Tidak masuk daftar ronda; kemungkinan kategori khusus.'),
      ('B-5', 'NORMAL', 15000, 'Sekretaris.'),
      ('B-7', 'PERLU_KONFIRMASI', 15000, 'Tidak masuk daftar ronda; cek kategori/iuran khusus.'),
      ('B-8', 'NORMAL', 15000, ''),
      ('C-2', 'NORMAL', 15000, 'Bendahara.'),
      ('C-4', 'NORMAL', 15000, ''),
      ('C-5', 'NORMAL', 15000, ''),
      ('C-6', 'PERLU_KONFIRMASI', 10000, 'Tidak masuk daftar ronda; kemungkinan kategori khusus.'),
      ('C-7', 'NORMAL', 15000, ''),
      ('C-8', 'NORMAL', 15000, ''),
      ('D-2', 'NORMAL', 15000, ''),
      ('D-3', 'NORMAL', 15000, '')
  LOOP
    SELECT id, nama_kk INTO v_id, v_nama
    FROM profiles WHERE login_id = v_login;
    IF v_id IS NOT NULL THEN
      INSERT INTO jimpitan_tarif (profile_id, login_id, nama_kk, nominal_default, nominal_khusus, nominal_aktif, kategori, catatan)
      VALUES (v_id, v_login, v_nama, 15000, v_nominal, v_nominal, v_kategori, v_catatan)
      ON CONFLICT (profile_id) DO UPDATE SET
        nominal_aktif = EXCLUDED.nominal_aktif,
        kategori = EXCLUDED.kategori,
        catatan = EXCLUDED.catatan,
        updated_at = NOW();
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- STEP 6: Tabel JIMPITAN TAGIHAN (per-KK per-bulan)
-- 29 tagihan untuk Juni 2026
-- =====================================================
DROP TABLE IF EXISTS jimpitan_tagihan CASCADE;

CREATE TABLE jimpitan_tagihan (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  login_id            TEXT NOT NULL,
  nama_kk_snapshot    TEXT NOT NULL,
  periode_bulan       DATE NOT NULL,                -- 2026-06-01
  nominal_tagihan     NUMERIC(12,2) NOT NULL,
  total_terbayar      NUMERIC(12,2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'BELUM_BAYAR',  -- BELUM_BAYAR | LUNAS | SEBAGIAN
  kategori            TEXT NOT NULL DEFAULT 'NORMAL',
  catatan             TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, periode_bulan)
);

CREATE INDEX IF NOT EXISTS idx_jimpitan_tagihan_profile ON jimpitan_tagihan(profile_id);
CREATE INDEX IF NOT EXISTS idx_jimpitan_tagihan_periode ON jimpitan_tagihan(periode_bulan);
CREATE INDEX IF NOT EXISTS idx_jimpitan_tagihan_status ON jimpitan_tagihan(status);

ALTER TABLE jimpitan_tagihan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jimpitan_tagihan_read_all" ON jimpitan_tagihan;
DROP POLICY IF EXISTS "jimpitan_tagihan_write_pengurus" ON jimpitan_tagihan;
CREATE POLICY "jimpitan_tagihan_read_all" ON jimpitan_tagihan FOR SELECT USING (TRUE);
CREATE POLICY "jimpitan_tagihan_write_pengurus" ON jimpitan_tagihan FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

-- Generate tagihan Juni 2026 untuk semua KK (skip A-1, A-2 yang sudah lunas, B-3 yang sudah bayar via spreadsheet)
DO $$
DECLARE
  v_tarif RECORD;
BEGIN
  FOR v_tarif IN
    SELECT t.profile_id, t.login_id, t.nama_kk, t.nominal_aktif, t.kategori, t.catatan
    FROM jimpitan_tarif t
    WHERE t.is_active = TRUE
  LOOP
    INSERT INTO jimpitan_tagihan (profile_id, login_id, nama_kk_snapshot, periode_bulan, nominal_tagihan, total_terbayar, status, kategori, catatan)
    VALUES (v_tarif.profile_id, v_tarif.login_id, v_tarif.nama_kk, '2026-06-01', v_tarif.nominal_aktif, 0, 'BELUM_BAYAR', v_tarif.kategori, v_tarif.catatan)
    ON CONFLICT (profile_id, periode_bulan) DO NOTHING;
  END LOOP;
END $$;

-- =====================================================
-- STEP 7: Tabel KAS TRANSAKSI
-- Buku besar kas SENTRA
-- Saldo akhir: 148.500
-- =====================================================
DROP TABLE IF EXISTS kas_transaksi CASCADE;

CREATE TABLE kas_transaksi (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trx_id_external TEXT UNIQUE,                     -- KAS-xxx dari spreadsheet
  tanggal         DATE NOT NULL,
  tipe            TEXT NOT NULL,                    -- MASUK | KELUAR
  kategori        TEXT NOT NULL,                    -- SALDO_AWAL | IURAN_BULANAN | PENGELUARAN_ATK | dll
  uraian          TEXT NOT NULL,
  nominal         NUMERIC(12,2) NOT NULL,
  login_id        TEXT,                             -- untuk transaksi iuran
  metode_bayar    TEXT,                             -- TUNAI | TRANSFER
  sumber_dana     TEXT,                             -- KAS_RT | DITALANGI
  ditalangi_oleh  TEXT,
  status_talangan TEXT,                             -- BELUM_DIGANTI | SUDAH_DIGANTI
  catatan         TEXT,
  created_by      TEXT,                             -- nama user yang input
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kas_transaksi_tanggal ON kas_transaksi(tanggal);
CREATE INDEX IF NOT EXISTS idx_kas_transaksi_tipe ON kas_transaksi(tipe);
CREATE INDEX IF NOT EXISTS idx_kas_transaksi_login ON kas_transaksi(login_id);

ALTER TABLE kas_transaksi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kas_transaksi_read_all" ON kas_transaksi;
DROP POLICY IF EXISTS "kas_transaksi_write_pengurus" ON kas_transaksi;
CREATE POLICY "kas_transaksi_read_all" ON kas_transaksi FOR SELECT USING (TRUE);
CREATE POLICY "kas_transaksi_write_pengurus" ON kas_transaksi FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

-- Insert 39 transaksi (saldo awal + 2 saldo_awal items + 35 iuran)
INSERT INTO kas_transaksi (trx_id_external, tanggal, tipe, kategori, uraian, nominal, login_id, metode_bayar, catatan, created_by) VALUES
  ('KAS-20260605150351-27306', '2026-05-29', 'MASUK', 'SALDO_AWAL', 'SALDO_AWAL', 43000, '', 'TUNAI', '', 'Sekretaris RT 03'),
  ('KAS-20260605150703-96774', '2026-05-30', 'MASUK', 'IURAN_BULANAN', 'Iuran C-8 bulan 2026-06, 2026-07', 30000, 'C-8', 'TRANSFER', 'Bayar 2 bulan Juni dan Juli', 'Sekretaris RT 03'),
  ('KAS-20260605152257-39100', '2026-05-30', 'KELUAR', 'PENGELUARAN_ATK', 'uang meja rapat Rw', 10000, '', 'TUNAI', 'Input massal kas', 'Sekretaris RT 03'),
  ('KAS-20260605152303-21786', '2026-06-01', 'KELUAR', 'PENGELUARAN_ATK', 'belanja ATK', 107500, '', 'TUNAI', 'Ditalangi Pak RT, Input massal kas', 'Sekretaris RT 03'),
  ('KAS-20260605152309-92929', '2026-06-01', 'KELUAR', 'PENGELUARAN_ATK', 'Untuk lampu', 106000, '', 'TUNAI', 'Ditalangi Pak Sakund, Input massal kas', 'Sekretaris RT 03'),
  -- Ronda 06 Juni 2026
  ('KAS-20260616075511-49280', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-1 bulan 2026-06', 15000, 'A-1', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075523-77466', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran D-2 bulan 2026-06', 20000, 'D-2', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075536-84939', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran B-7 bulan 2026-06', 15000, 'B-7', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075551-51238', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran D-3 bulan 2026-06', 15000, 'D-3', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075604-71675', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-4 bulan 2026-06', 15000, 'A-4', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075619-91818', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-12 bulan 2026-06', 15000, 'A-12', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075633-48433', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-11 bulan 2026-06', 5000, 'A-11', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075645-43659', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-10 bulan 2026-06', 5000, 'A-10', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075659-26437', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-8 bulan 2026-06', 4000, 'A-8', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075711-87569', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-9 bulan 2026-06', 3000, 'A-9', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075724-70727', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-13 bulan 2026-06', 15000, 'A-13', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075737-30435', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-14 bulan 2026-06', 5000, 'A-14', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075748-37607', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-15 bulan 2026-06', 15000, 'A-15', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075801-71969', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran B-5 bulan 2026-06', 5000, 'B-5', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075813-48756', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran B-8 bulan 2026-06', 5000, 'B-8', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075823-12394', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran B-1 bulan 2026-06', 5000, 'B-1', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075836-38562', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-2 bulan 2026-06', 15000, 'A-2', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616075849-62992', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-16 bulan 2026-06', 15000, 'A-16', 'TUNAI', 'Input Manual dari data ronda 06 Juni 2026', 'Sekretaris RT 03'),
  -- Ronda 13 Juni 2026
  ('KAS-20260616080735-52056', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-6 bulan 2026-06', 15000, 'A-6', 'TUNAI', 'Input Manual dari data ronda 13 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616080749-87418', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran C-7 bulan 2026-06', 5000, 'C-7', 'TUNAI', 'Input Manual dari data ronda 13 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616080809-94511', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran C-4 bulan 2026-06', 15000, 'C-4', 'TUNAI', 'Input Manual dari data ronda 13 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616080825-30750', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran B-2 bulan 2026-06', 15000, 'B-2', 'TUNAI', 'Input Manual dari data ronda 13 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616080843-33327', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-8 bulan 2026-06', 4000, 'A-8', 'TUNAI', 'Input Manual dari data ronda 13 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616080906-55506', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-9 bulan 2026-06', 5000, 'A-9', 'TUNAI', 'Input Manual dari data ronda 13 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616080923-67911', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-10 bulan 2026-06', 5000, 'A-10', 'TUNAI', 'Input Manual dari data ronda 13 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616080943-19229', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-11 bulan 2026-06', 3000, 'A-11', 'TUNAI', 'Input Manual dari data ronda 13 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616081002-45678', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran A-12 bulan 2026-06', 5000, 'A-12', 'TUNAI', 'Input Manual dari data ronda 13 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616081015-22778', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran C-2 bulan 2026-06', 10000, 'C-2', 'TUNAI', 'Input Manual dari data ronda 13 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616081035-88131', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran B-1 bulan 2026-06', 5000, 'B-1', 'TUNAI', 'Input Manual dari data ronda 13 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616081054-41079', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran B-3 bulan 2026-06', 5000, 'B-3', 'TUNAI', 'Input Manual dari data ronda 13 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616081114-14760', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran B-7 bulan 2026-06', 4000, 'B-7', 'TUNAI', 'Input Manual dari data ronda 13 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616081134-56937', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran B-8 bulan 2026-06', 6000, 'B-8', 'TUNAI', 'Input Manual dari data ronda 13 Juni 2026', 'Sekretaris RT 03'),
  ('KAS-20260616081148-40180', '2026-06-16', 'MASUK', 'IURAN_BULANAN', 'Iuran C-5 bulan 2026-06', 5000, 'C-5', 'TUNAI', 'Input Manual dari data ronda 13 Juni 2026', 'Sekretaris RT 03')
ON CONFLICT (trx_id_external) DO NOTHING;

-- =====================================================
-- STEP 8: Update iuran_pembayaran dari Kas_Transaksi (yang sudah LUNAS)
-- Dari spreadsheet: A-1, A-2, A-4, A-6, A-8, A-9, A-10, A-11, A-12, A-13, A-14, A-15, A-16,
--                  B-1, B-2, B-3, B-5, B-7, B-8, C-2, C-4, C-5, C-7, D-2, D-3 sudah bayar Juni
-- Total: 25 KK (semua yang bayar di spreadsheet)
-- =====================================================
DO $$
DECLARE
  v_profile_id UUID;
  v_nominal NUMERIC;
  v_kategori TEXT;
  v_tanggal DATE;
  v_login TEXT;
BEGIN
  FOR v_login, v_nominal IN
    SELECT login_id, SUM(nominal)::NUMERIC
    FROM kas_transaksi
    WHERE tipe = 'MASUK'
      AND kategori = 'IURAN_BULANAN'
      AND login_id IS NOT NULL
      AND login_id <> ''
    GROUP BY login_id
  LOOP
    SELECT t.profile_id, t.kategori INTO v_profile_id, v_kategori
    FROM jimpitan_tarif t WHERE t.login_id = v_login;

    IF v_profile_id IS NOT NULL AND v_nominal > 0 THEN
      -- Ambil tanggal pembayaran terakhir
      SELECT MAX(tanggal) INTO v_tanggal
      FROM kas_transaksi
      WHERE login_id = v_login AND tipe = 'MASUK' AND kategori = 'IURAN_BULANAN';

      -- Insert ke iuran_pembayaran HANYA kalau iuran_tagihan punya record untuk periode ini.
      -- iuran_pembayaran.tagihan_id adalah FK ke iuran_tagihan.id (bukan jimpitan_tagihan.id).
      IF EXISTS (
        SELECT 1 FROM iuran_tagihan
        WHERE profile_id = v_profile_id AND periode_bulan = '2026-06-01'
      ) THEN
        INSERT INTO iuran_pembayaran (profile_id, tagihan_id, nominal, metode, login_id, periode_bulan, created_at, created_by, confirmed, sumber, bukti_ref, catatan)
        SELECT
          v_profile_id,
          t.id,
          v_nominal,
          'TUNAI',
          t.login_id,
          t.periode_bulan,
          v_tanggal::TIMESTAMPTZ,
          NULL,
          TRUE,
          'KAS_TRANSAKSI',
          'KAS-' || v_login || '-' || TO_CHAR(v_tanggal, 'YYYYMMDD'),
          'Otomatis dari Kas_Transaksi'
        FROM iuran_tagihan t  -- FIXED: pakai iuran_tagihan, bukan jimpitan_tagihan
        WHERE t.profile_id = v_profile_id AND t.periode_bulan = '2026-06-01'
        ON CONFLICT DO NOTHING;
      ELSE
        -- Data ini milik sistem jimpitan, cukup update jimpitan_tagihan di bawah
        RAISE NOTICE 'Skip iuran_pembayaran untuk % (tidak ada di iuran_tagihan 2026-06)', v_login;
      END IF;

      -- Update total_terbayar dan status di jimpitan_tagihan
      UPDATE jimpitan_tagihan
      SET total_terbayar = v_nominal,
          status = CASE
            WHEN v_nominal >= nominal_tagihan THEN 'LUNAS'
            WHEN v_nominal > 0 THEN 'SEBAGIAN'
            ELSE 'BELUM_BAYAR'
          END,
          updated_at = NOW()
      WHERE profile_id = v_profile_id AND periode_bulan = '2026-06-01';
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- VERIFIKASI
-- =====================================================
SELECT 'KK_TOTAL' AS info, COUNT(*) AS total FROM profiles WHERE is_active = TRUE;
SELECT 'B5_NAMA_FIXED' AS info, nama_kk FROM profiles WHERE login_id = 'B-5';
SELECT 'KELOMPOK_TOTAL' AS info, COUNT(*) AS total FROM ronda_kelompok WHERE is_active = TRUE;
SELECT 'JADWAL_TOTAL' AS info, COUNT(*) AS total FROM jadwal_ronda WHERE tahun = 2026;
SELECT 'JIMPITAN_TARIF' AS info, COUNT(*) AS total FROM jimpitan_tarif WHERE is_active = TRUE;
SELECT 'JIMPITAN_TAGIHAN' AS info, status, COUNT(*) FROM jimpitan_tagihan WHERE periode_bulan = '2026-06-01' GROUP BY status;
SELECT 'KAS_TRANSAKSI' AS info,
  COUNT(*) AS total,
  SUM(CASE WHEN tipe='MASUK' THEN nominal ELSE 0 END) AS total_masuk,
  SUM(CASE WHEN tipe='KELUAR' THEN nominal ELSE 0 END) AS total_keluar,
  SUM(CASE WHEN tipe='MASUK' THEN nominal ELSE -nominal END) AS saldo
FROM kas_transaksi;

-- Saldo real-time dihitung dari kas_transaksi (replace hardcoded SALDO_KAS_RT)
SELECT 'SALDO_KAS_REAL' AS info,
  COALESCE(SUM(CASE WHEN tipe='MASUK' THEN nominal ELSE -nominal END), 0)::TEXT AS value
FROM kas_transaksi;

-- VIEW: Saldo kas real-time (untuk query dari app frontend)
DROP VIEW IF EXISTS v_saldo_kas;
CREATE VIEW v_saldo_kas AS
SELECT
  COALESCE(SUM(CASE WHEN tipe='MASUK' THEN nominal ELSE 0 END), 0)  AS total_masuk,
  COALESCE(SUM(CASE WHEN tipe='KELUAR' THEN nominal ELSE 0 END), 0) AS total_keluar,
  COALESCE(SUM(CASE WHEN tipe='MASUK' THEN nominal ELSE -nominal END), 0) AS saldo_akhir,
  COUNT(*) AS jumlah_transaksi,
  MAX(tanggal) AS transaksi_terakhir
FROM kas_transaksi;

SELECT 'V_SALDO_KAS' AS info, * FROM v_saldo_kas;

-- SUMMARY KESELURUHAN DATA
SELECT '=== SUMMARY KESELURUHAN ===' AS section;
SELECT
  (SELECT COUNT(*) FROM profiles WHERE is_active=TRUE) AS total_profil,
  (SELECT COUNT(*) FROM ronda_kelompok WHERE is_active=TRUE) AS total_anggota_kelompok,
  (SELECT COUNT(*) FROM jadwal_ronda WHERE tahun=2026) AS jadwal_ronda_2026,
  (SELECT COUNT(*) FROM jimpitan_tarif WHERE is_active=TRUE) AS tarif_aktif,
  (SELECT COUNT(*) FROM jimpitan_tagihan WHERE periode_bulan='2026-06-01') AS tagihan_juni_2026,
  (SELECT COUNT(*) FROM kas_transaksi) AS total_transaksi_kas,
  (SELECT saldo_akhir FROM v_saldo_kas) AS saldo_kas_real,
  (SELECT COUNT(*) FROM app_settings) AS setting_config;
