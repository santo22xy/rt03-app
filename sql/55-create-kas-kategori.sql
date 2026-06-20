-- =====================================================
-- 55: KAS KATEGORI (master kategori dinamis)
-- Tujuan: kategori Pemasukan/Pengeluaran dikelola via UI,
--         tidak hardcoded lagi di frontend.
-- Setelah script ini jalan, aplikasi akan load kategori dari tabel ini.
-- =====================================================

-- =====================================================
-- STEP 1: Tabel kas_kategori
-- =====================================================
CREATE TABLE IF NOT EXISTS kas_kategori (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipe        TEXT NOT NULL,                    -- MASUK | KELUAR
  kode        TEXT NOT NULL,                    -- kode internal (uppercase, snake_case). Mis. IURAN_BULANAN
  label       TEXT NOT NULL,                    -- label tampil. Mis. "Iuran Bulanan"
  urutan      INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tipe, kode)
);

CREATE INDEX IF NOT EXISTS idx_kas_kategori_tipe ON kas_kategori(tipe, urutan);

-- =====================================================
-- STEP 1B: Defensive ALTER — tambahkan kolom yg mungkin hilang
-- kalau tabel sudah ada dari eksekusi sebelumnya (dengan schema lama).
-- Idempotent: ADD COLUMN IF NOT EXISTS aman dijalankan berulang.
-- =====================================================
ALTER TABLE kas_kategori ADD COLUMN IF NOT EXISTS urutan      INT NOT NULL DEFAULT 0;
ALTER TABLE kas_kategori ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE kas_kategori ADD COLUMN IF NOT EXISTS label       TEXT;
ALTER TABLE kas_kategori ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill label & urutan kalau baris lama punya NULL
UPDATE kas_kategori SET label = kode WHERE label IS NULL;
UPDATE kas_kategori SET urutan = 100 WHERE urutan IS NULL OR urutan = 0;
ALTER TABLE kas_kategori ALTER COLUMN label SET NOT NULL;
ALTER TABLE kas_kategori ALTER COLUMN urutan SET DEFAULT 100;

-- Pastikan index ada (kalau tabel lama tanpa index)
CREATE INDEX IF NOT EXISTS idx_kas_kategori_tipe ON kas_kategori(tipe, urutan);

-- =====================================================
-- STEP 2: Seed kategori yang sebelumnya hardcoded
-- Sesuai dengan KATEGORI_MASUK dan KATEGORI_KELUAR di tambah-transaksi-kas.tsx
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
  ('KELUAR', 'PENGELUARAN_ATK', 'Pengeluaran ATK',      15)
ON CONFLICT (tipe, kode) DO NOTHING;

-- =====================================================
-- STEP 3: RLS
-- Read: semua user terautentikasi (read-only).
-- Write: hanya pengurus (BUKAN WARGA).
-- =====================================================
ALTER TABLE kas_kategori ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kas_kategori_read_all" ON kas_kategori;
DROP POLICY IF EXISTS "kas_kategori_write_pengurus" ON kas_kategori;

CREATE POLICY "kas_kategori_read_all" ON kas_kategori
  FOR SELECT USING (TRUE);

CREATE POLICY "kas_kategori_write_pengurus" ON kas_kategori
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
  );

-- =====================================================
-- STEP 4: Trigger updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION trg_kas_kategori_touch_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kas_kategori_touch_updated ON kas_kategori;
CREATE TRIGGER kas_kategori_touch_updated
BEFORE UPDATE ON kas_kategori
FOR EACH ROW EXECUTE FUNCTION trg_kas_kategori_touch_updated();

-- =====================================================
-- STEP 5: Verifikasi schema dan data
-- =====================================================
-- Cek kolom tabel (penting kalau script ini dijalankan ulang di tabel
-- yang sudah ada dari eksekusi sebelumnya dengan schema lama)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'kas_kategori'
ORDER BY ordinal_position;

-- Cek data per tipe
SELECT tipe, COUNT(*) AS jumlah
FROM kas_kategori
WHERE is_active = TRUE
GROUP BY tipe
ORDER BY tipe;

-- Cek daftar lengkap
SELECT tipe, kode, label, urutan, is_active
FROM kas_kategori
ORDER BY tipe, urutan, kode;
