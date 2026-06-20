-- =====================================================
-- 56: REBUILD KAS KATEGORI (drop total, buat ulang bersih)
-- Tujuan: kalau script 55 gagal karena tabel lama punya schema
--         yg konflik (mis. kolom urutan tidak ada), file ini
--         DROP tabel dan rebuild dari awal.
-- AMAN karena kas_kategori adalah tabel BARU yang belum dipakai
-- untuk transaksi produksi — seed akan re-populate 14 kategori default.
-- =====================================================

-- =====================================================
-- STEP 0: Diagnostik — lihat schema & data tabel saat ini
-- =====================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'kas_kategori'
ORDER BY ordinal_position;

SELECT COUNT(*) AS jumlah_baris FROM kas_kategori;

-- =====================================================
-- STEP 1: Drop tabel & semua object terkait (RLS, trigger, policy)
-- CASCADE supaya bersih dari trigger/policy/index
-- =====================================================
DROP TABLE IF EXISTS kas_kategori CASCADE;

-- =====================================================
-- STEP 2: Buat ulang dari awal dengan schema lengkap
-- =====================================================
CREATE TABLE kas_kategori (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipe        TEXT NOT NULL,                    -- MASUK | KELUAR
  kode        TEXT NOT NULL,                    -- kode internal (uppercase, snake_case)
  label       TEXT NOT NULL,                    -- label tampil untuk UI
  urutan      INT NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tipe, kode)
);

CREATE INDEX idx_kas_kategori_tipe ON kas_kategori(tipe, urutan);

-- =====================================================
-- STEP 3: Seed kategori default
-- =====================================================
INSERT INTO kas_kategori (tipe, kode, label, urutan) VALUES
  -- PEMASUKAN
  ('MASUK', 'IURAN_BULANAN', 'Iuran Bulanan',           10),
  ('MASUK', 'SUMBANGAN',     'Sumbangan',               20),
  ('MASUK', 'IURAN_LAIN',    'Iuran Lain',              30),
  ('MASUK', 'LAINNYA',       'Pemasukan Lainnya',       90),
  -- PENGELUARAN
  ('KELUAR', 'OPERASIONAL_RT',     'Operasional RT',          10),
  ('KELUAR', 'ATK',                'ATK (Alat Tulis)',        20),
  ('KELUAR', 'KONSUMSI',           'Konsumsi / Snack',        30),
  ('KELUAR', 'ACARA',              'Acara RT',                40),
  ('KELUAR', 'DONASI',             'Donasi',                  50),
  ('KELUAR', 'PERLENGKAPAN_RONDA', 'Perlengkapan Ronda',      60),
  ('KELUAR', 'LAINNYA',            'Pengeluaran Lainnya',     90),
  -- LEGACY / SEED data lama
  ('MASUK',  'SALDO_AWAL',      'Saldo Awal',          5),
  ('KELUAR', 'PENGELUARAN_ATK', 'Pengeluaran ATK',      15);

-- =====================================================
-- STEP 4: RLS (read all, write pengurus)
-- =====================================================
ALTER TABLE kas_kategori ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kas_kategori_read_all" ON kas_kategori
  FOR SELECT USING (TRUE);

CREATE POLICY "kas_kategori_write_pengurus" ON kas_kategori
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
  );

-- =====================================================
-- STEP 5: Trigger updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION trg_kas_kategori_touch_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER kas_kategori_touch_updated
BEFORE UPDATE ON kas_kategori
FOR EACH ROW EXECUTE FUNCTION trg_kas_kategori_touch_updated();

-- =====================================================
-- STEP 6: Refresh PostgREST schema cache
-- =====================================================
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- STEP 7: Verifikasi schema & data
-- =====================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'kas_kategori'
ORDER BY ordinal_position;

SELECT tipe, COUNT(*) AS jumlah
FROM kas_kategori
WHERE is_active = TRUE
GROUP BY tipe
ORDER BY tipe;

SELECT tipe, kode, label, urutan, is_active
FROM kas_kategori
ORDER BY tipe, urutan, kode;
