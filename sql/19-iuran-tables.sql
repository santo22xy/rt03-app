-- =====================================================
-- 19: Iuran Tables + Seed Data
-- Jalankan di Supabase SQL Editor
-- =====================================================

-- =====================================================
-- STEP 1: Create tables
-- =====================================================

-- Tambah kolom catatan ke profiles kalau belum ada
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS catatan TEXT;

-- Master tarif per kategori (berlaku dari tanggal tertentu)
CREATE TABLE IF NOT EXISTS iuran_tarif (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kategori_tarif TEXT NOT NULL,
  nominal       NUMERIC(12,2) NOT NULL,
  berlaku_dari  DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kategori_tarif, berlaku_dari)
);

-- Tagihan iuran per rumah per bulan
CREATE TABLE IF NOT EXISTS iuran_tagihan (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  periode_bulan   DATE NOT NULL,           -- selalu tgl 1 (YYYY-MM-01)
  nominal         NUMERIC(12,2) NOT NULL,  -- snapshot tarif saat tagihan dibuat
  total_terbayar  NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'BELUM',  -- BELUM | CICIL | LUNAS
  due_date        DATE,
  catatan         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, periode_bulan)
);

-- History pembayaran (titip / transfer / jimpitan / lainnya)
CREATE TABLE IF NOT EXISTS iuran_pembayaran (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tagihan_id  UUID NOT NULL REFERENCES iuran_tagihan(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nominal     NUMERIC(12,2) NOT NULL,
  metode      TEXT NOT NULL,        -- TITIP_PENGURUS | TRANSFER | JIMPITAN | LAINNYA
  sumber      TEXT NOT NULL,        -- TITIP | TRANSFER | JIMPITAN | LAINNYA
  bukti_ref   TEXT,                 -- no ref transfer / id setoran jimpitan
  catatan     TEXT,
  created_by  UUID REFERENCES profiles(id),
  confirmed   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_iuran_tagihan_profile   ON iuran_tagihan(profile_id);
CREATE INDEX IF NOT EXISTS idx_iuran_tagihan_periode   ON iuran_tagihan(periode_bulan DESC);
CREATE INDEX IF NOT EXISTS idx_iuran_pembayaran_tagihan ON iuran_pembayaran(tagihan_id);
CREATE INDEX IF NOT EXISTS idx_iuran_pembayaran_profile ON iuran_pembayaran(profile_id);
CREATE INDEX IF NOT EXISTS idx_iuran_pembayaran_created ON iuran_pembayaran(created_at DESC);

-- =====================================================
-- STEP 2: Seed master tarif
-- =====================================================
INSERT INTO iuran_tarif (kategori_tarif, nominal, berlaku_dari) VALUES
  ('NORMAL', 15000, '2026-01-01'),
  ('JANDA',  10000, '2026-01-01')
ON CONFLICT (kategori_tarif, berlaku_dari) DO NOTHING;

-- =====================================================
-- STEP 3: Upsert 29 profile sesuai data asli SENTRA JUNI 2026
-- Pakai ON CONFLICT (login_id) DO UPDATE untuk handle existing
-- =====================================================
INSERT INTO profiles (id, login_id, nama_kk, blok, nomor_rumah, no_hp, kategori_tarif, role, is_active, catatan)
VALUES
  -- Blok A (15 rumah, skip 3 & 7)
  (gen_random_uuid(), 'A-1',  'Bpk. Kurniawan',     'A', '1',  NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'A-2',  'Bpk. Amar Marruf',   'A', '2',  NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'A-4',  'Bpk. Andi H.',       'A', '4',  NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'A-5',  'Bpk. B. Widodo',     'A', '5',  NULL, 'NORMAL', 'WARGA', TRUE, 'Tidak masuk daftar ronda; cek kategori/iuran khusus.'),
  (gen_random_uuid(), 'A-6',  'Bpk. Edi Santosa',   'A', '6',  NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'A-8',  'Mas Rizky',          'A', '8',  NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'A-9',  'Bpk. Bagus',         'A', '9',  NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'A-10', 'Bpk. Raden',         'A', '10', NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'A-11', 'Bpk. Kelik',         'A', '11', NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'A-12', 'Bpk. Awey',          'A', '12', NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'A-13', 'Bpk. Endro',         'A', '13', NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'A-14', 'Bpk. Indarto',       'A', '14', NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'A-15', 'Bpk. Agung Saputra', 'A', '15', NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'A-16', 'Bpk. Bintar',        'A', '16', NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  -- Blok B (7 rumah, skip 6)
  (gen_random_uuid(), 'B-1',  'Bpk. Budi S.',       'B', '1',  NULL, 'NORMAL', 'WARGA', TRUE, 'Ketua RT. Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'B-2',  'Bpk. Rejo W.',       'B', '2',  NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'B-3',  'Ibu Anna M. T.',     'B', '3',  NULL, 'JANDA',  'WARGA', TRUE, 'Tidak masuk daftar ronda; kemungkinan kategori khusus.'),
  (gen_random_uuid(), 'B-4',  'Ibu Debora Erna',    'B', '4',  NULL, 'JANDA',  'WARGA', TRUE, 'Tidak masuk daftar ronda; kemungkinan kategori khusus.'),
  (gen_random_uuid(), 'B-5',  'Bpk. Iwan',          'B', '5',  NULL, 'NORMAL', 'WARGA', TRUE, 'Sekretaris. Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'B-7',  'Bpk. Dwiyanto',      'B', '7',  NULL, 'NORMAL', 'WARGA', TRUE, 'Tidak masuk daftar ronda; cek kategori/iuran khusus.'),
  (gen_random_uuid(), 'B-8',  'Bpk. Sakun A.',      'B', '8',  NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  -- Blok C (6 rumah, skip 1 & 3)
  (gen_random_uuid(), 'C-2',  'Bpk. Setyobudi',     'C', '2',  NULL, 'NORMAL', 'WARGA', TRUE, 'Bendahara. Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'C-4',  'Bpk. Fajar',         'C', '4',  NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'C-5',  'Bpk. Mulyanto',      'C', '5',  NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'C-6',  'Ibu Rita Hendri',    'C', '6',  NULL, 'JANDA',  'WARGA', TRUE, 'Tidak masuk daftar ronda; kemungkinan kategori khusus.'),
  (gen_random_uuid(), 'C-7',  'Bpk. Yustinus',      'C', '7',  NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'C-8',  'Bp. Iksan',          'C', '8',  NULL, 'NORMAL', 'WARGA', TRUE, 'Jimpitan adalah metode pembayaran/cicilan dari tagihan bulanan Rp15.000, bukan tagihan tambahan.'),
  -- Blok D (2 rumah, skip 1)
  (gen_random_uuid(), 'D-2',  'Bpk. Dona',          'D', '2',  NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.'),
  (gen_random_uuid(), 'D-3',  'Bpk. Hendrik',       'D', '3',  NULL, 'NORMAL', 'WARGA', TRUE, 'Single tagihan: Rp15.000 sudah termasuk iuran+jimpitan.')
ON CONFLICT (login_id) DO UPDATE SET
  nama_kk        = EXCLUDED.nama_kk,
  blok           = EXCLUDED.blok,
  nomor_rumah    = EXCLUDED.nomor_rumah,
  kategori_tarif = EXCLUDED.kategori_tarif,
  is_active      = EXCLUDED.is_active,
  catatan        = EXCLUDED.catatan,
  updated_at     = NOW();

-- =====================================================
-- STEP 4: Set PIN default 123456 untuk profile yang belum ada PIN
-- (skip C-3 yg inactive)
-- =====================================================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT login_id FROM profiles
    WHERE pin_hash IS NULL
      AND is_active = TRUE
  LOOP
    PERFORM set_warga_pin(r.login_id, '123456');
  END LOOP;
END $$;

-- =====================================================
-- STEP 5: Seed tagihan Juni 2026 untuk semua profile aktif
-- =====================================================
INSERT INTO iuran_tagihan (profile_id, periode_bulan, nominal, total_terbayar, status, due_date)
SELECT
  p.id,
  '2026-06-01'::date,
  CASE WHEN p.kategori_tarif = 'JANDA' THEN 10000 ELSE 15000 END,
  0,
  'BELUM',
  '2026-06-30'::date
FROM profiles p
WHERE p.is_active = TRUE
ON CONFLICT (profile_id, periode_bulan) DO NOTHING;

-- =====================================================
-- STEP 6: Trigger untuk auto-update total_terbayar & status
-- =====================================================
CREATE OR REPLACE FUNCTION update_iuran_tagihan_after_pembayaran()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC(12,2);
  v_nominal NUMERIC(12,2);
BEGIN
  -- Hitung total pembayaran untuk tagihan ini
  SELECT COALESCE(SUM(nominal), 0) INTO v_total
  FROM iuran_pembayaran
  WHERE tagihan_id = NEW.tagihan_id AND confirmed = TRUE;

  -- Ambil nominal tagihan
  SELECT nominal INTO v_nominal
  FROM iuran_tagihan
  WHERE id = NEW.tagihan_id;

  -- Update total_terbayar dan status
  UPDATE iuran_tagihan
  SET total_terbayar = v_total,
      status = CASE
        WHEN v_total <= 0 THEN 'BELUM'
        WHEN v_total >= v_nominal THEN 'LUNAS'
        ELSE 'CICIL'
      END,
      updated_at = NOW()
  WHERE id = NEW.tagihan_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_iuran_tagihan ON iuran_pembayaran;
CREATE TRIGGER trg_update_iuran_tagihan
AFTER INSERT OR UPDATE OR DELETE ON iuran_pembayaran
FOR EACH ROW
EXECUTE FUNCTION update_iuran_tagihan_after_pembayaran();

-- =====================================================
-- STEP 7: Sample pembayaran (supaya history tidak kosong)
-- A-1 titip 15000 (LUNAS), A-2 transfer 15000 (LUNAS),
-- B-3 jimpitan 5000 (CICIL)
-- =====================================================
DO $$
DECLARE
  v_tagihan_a1 UUID;
  v_tagihan_a2 UUID;
  v_tagihan_b3 UUID;
BEGIN
  SELECT id INTO v_tagihan_a1 FROM iuran_tagihan t
    JOIN profiles p ON p.id = t.profile_id WHERE p.login_id = 'A-1' AND t.periode_bulan = '2026-06-01';
  SELECT id INTO v_tagihan_a2 FROM iuran_tagihan t
    JOIN profiles p ON p.id = t.profile_id WHERE p.login_id = 'A-2' AND t.periode_bulan = '2026-06-01';
  SELECT id INTO v_tagihan_b3 FROM iuran_tagihan t
    JOIN profiles p ON p.id = t.profile_id WHERE p.login_id = 'B-3' AND t.periode_bulan = '2026-06-01';

  IF v_tagihan_a1 IS NOT NULL THEN
    INSERT INTO iuran_pembayaran (tagihan_id, profile_id, nominal, metode, sumber, catatan, created_at)
    SELECT v_tagihan_a1, p.id, 15000, 'TITIP_PENGURUS', 'TITIP', 'Titip ke Pak RT', NOW() - INTERVAL '5 days'
    FROM profiles p WHERE p.login_id = 'A-1';
  END IF;

  IF v_tagihan_a2 IS NOT NULL THEN
    INSERT INTO iuran_pembayaran (tagihan_id, profile_id, nominal, metode, sumber, bukti_ref, catatan, created_at)
    SELECT v_tagihan_a2, p.id, 15000, 'TRANSFER', 'TRANSFER', 'TRF-20260601-001', 'BCA a.n. Bendahara', NOW() - INTERVAL '3 days'
    FROM profiles p WHERE p.login_id = 'A-2';
  END IF;

  IF v_tagihan_b3 IS NOT NULL THEN
    INSERT INTO iuran_pembayaran (tagihan_id, profile_id, nominal, metode, sumber, bukti_ref, catatan, created_at)
    SELECT v_tagihan_b3, p.id, 5000, 'JIMPITAN', 'JIMPITAN', 'JMP-20260615-003', 'Jimpitan 15 Juni 2026', NOW() - INTERVAL '1 day'
    FROM profiles p WHERE p.login_id = 'B-3';
  END IF;
END $$;

-- =====================================================
-- VERIFIKASI
-- =====================================================
SELECT 'PROFILES' AS tabel,
  COUNT(*) FILTER (WHERE is_active) AS aktif,
  COUNT(*) FILTER (WHERE NOT is_active) AS nonaktif,
  COUNT(*) AS total
FROM profiles WHERE role = 'WARGA';

SELECT 'TAGIHAN JUNI 2026' AS info,
  COUNT(*) AS total_tagihan,
  SUM(nominal) AS total_nominal,
  SUM(total_terbayar) AS total_terbayar,
  COUNT(*) FILTER (WHERE status = 'LUNAS') AS lunas,
  COUNT(*) FILTER (WHERE status = 'CICIL') AS cicil,
  COUNT(*) FILTER (WHERE status = 'BELUM') AS belum
FROM iuran_tagihan
WHERE periode_bulan = '2026-06-01';

SELECT 'PEMBAYARAN' AS info, COUNT(*) AS total, SUM(nominal) AS total_nominal
FROM iuran_pembayaran;

-- Detail per rumah (29 data dari spreadsheet)
SELECT p.login_id, p.blok, p.nomor_rumah, p.nama_kk, p.kategori_tarif, p.catatan,
  t.nominal, t.total_terbayar, t.status,
  (SELECT COUNT(*) FROM iuran_pembayaran WHERE tagihan_id = t.id) AS jml_pembayaran
FROM iuran_tagihan t
JOIN profiles p ON p.id = t.profile_id
WHERE t.periode_bulan = '2026-06-01'
ORDER BY p.blok, p.nomor_rumah::int;

-- Ringkasan per kategori
SELECT p.kategori_tarif,
  COUNT(*) AS jumlah_warga,
  SUM(t.nominal) AS total_tagihan,
  SUM(t.total_terbayar) AS total_terbayar
FROM iuran_tagihan t
JOIN profiles p ON p.id = t.profile_id
WHERE t.periode_bulan = '2026-06-01'
GROUP BY p.kategori_tarif
ORDER BY p.kategori_tarif;

-- Daftar pengurus (B-1, C-2, B-5)
SELECT login_id, nama_kk, blok, nomor_rumah, catatan
FROM profiles
WHERE catatan ILIKE '%ketua%'
   OR catatan ILIKE '%bendahara%'
   OR catatan ILIKE '%sekretaris%'
ORDER BY blok, nomor_rumah::int;
