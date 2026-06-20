-- =====================================================
-- SQL 48: Fix Jimpitan Sesi - tambah kolom yang kurang
-- Issue: total_nominal, jumlah_warga_bayar, jumlah_penjaga_hadir
--        TIDAK ADA di tabel. Query di page.tsx gagal → 404.
-- =====================================================

-- SECTION A: Diagnosa - cek kolom yang ada
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'jimpitan_sesi'
ORDER BY ordinal_position;

-- SECTION B: Tambah kolom yang hilang (idempotent)
DO $$
BEGIN
  -- total_nominal: alias untuk total_pendapatan
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jimpitan_sesi' AND column_name = 'total_nominal'
  ) THEN
    ALTER TABLE jimpitan_sesi ADD COLUMN total_nominal NUMERIC DEFAULT 0;
    -- Backfill dari total_pendapatan
    UPDATE jimpitan_sesi SET total_nominal = COALESCE(total_pendapatan, 0);
    RAISE NOTICE '✓ Added column total_nominal';
  END IF;

  -- jumlah_warga_bayar
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jimpitan_sesi' AND column_name = 'jumlah_warga_bayar'
  ) THEN
    ALTER TABLE jimpitan_sesi ADD COLUMN jumlah_warga_bayar INTEGER DEFAULT 0;
    -- Backfill: hitung dari jimpitan_detail (kolom status_bayar='BAYAR', BUKAN is_bayar)
    UPDATE jimpitan_sesi s SET jumlah_warga_bayar = (
      SELECT COUNT(*) FROM jimpitan_detail d
      WHERE d.sesi_id = s.id AND d.status_bayar = 'BAYAR'
    );
    RAISE NOTICE '✓ Added column jumlah_warga_bayar';
  END IF;

  -- jumlah_penjaga_hadir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jimpitan_sesi' AND column_name = 'jumlah_penjaga_hadir'
  ) THEN
    ALTER TABLE jimpitan_sesi ADD COLUMN jumlah_penjaga_hadir INTEGER DEFAULT 0;
    -- Backfill: hitung penjaga terjadwal dari jadwal_ronda (ronda_attendance belum ada sesi_id)
    UPDATE jimpitan_sesi s SET jumlah_penjaga_hadir = (
      SELECT COUNT(*) FROM jadwal_ronda j
      WHERE j.tanggal = s.tanggal AND j.is_active = true
    );
    RAISE NOTICE '✓ Added column jumlah_penjaga_hadir (backfilled from jadwal_ronda)';
  END IF;
END $$;

-- =====================================================
-- SECTION B2: Fix jimpitan_detail - tambah kolom is_bayar
-- Tabel hanya punya status_bayar (TEXT), tapi code pakai is_bayar (BOOLEAN).
-- Tambah is_bayar BOOLEAN (non-breaking, kolom lama tetap ada).
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jimpitan_detail' AND column_name = 'is_bayar'
  ) THEN
    ALTER TABLE jimpitan_detail ADD COLUMN is_bayar BOOLEAN DEFAULT false;
    -- Backfill: status_bayar='BAYAR' → is_bayar=true
    UPDATE jimpitan_detail SET is_bayar = (status_bayar = 'BAYAR');
    RAISE NOTICE '✓ Added column jimpitan_detail.is_bayar';
  END IF;
END $$;

-- SECTION C: Refresh PostgREST schema cache
ALTER TABLE jimpitan_sesi ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE jimpitan_detail ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- SECTION C2: Force PostgREST schema reload (explicit)
NOTIFY pgrst, 'reload schema';

-- SECTION D: Verifikasi
SELECT 'jimpitan_sesi' AS tabel, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'jimpitan_sesi'
  AND column_name IN ('total_nominal', 'jumlah_warga_bayar', 'jumlah_penjaga_hadir', 'total_pendapatan')
UNION ALL
SELECT 'jimpitan_detail' AS tabel, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'jimpitan_detail'
  AND column_name IN ('is_bayar', 'status_bayar')
ORDER BY tabel, column_name;

-- SECTION E: Cek data sudah ter-backfill
SELECT
  id,
  tanggal,
  status,
  total_nominal,
  total_pendapatan,
  jumlah_warga_bayar,
  jumlah_penjaga_hadir
FROM jimpitan_sesi
ORDER BY tanggal DESC
LIMIT 10;

-- SECTION F: Cek backfill jimpitan_detail.is_bayar
SELECT
  status_bayar,
  is_bayar,
  COUNT(*) AS total
FROM jimpitan_detail
GROUP BY status_bayar, is_bayar
ORDER BY status_bayar;
