-- =====================================================
-- 61: Fix trigger jimpitan_sesi_totals supaya sync total_pendapatan
--
-- Issue:
--   Dashboard pages query `total_pendapatan`, tapi:
--     - Trigger sync_jimpitan_sesi_totals() (SQL 20) cuma update `total_nominal`
--     - `total_pendapatan` tidak pernah di-update setelah insert
--   Hasilnya dashboard "Iuran Bulan Ini" tampil 0 padahal total_nominal=81000.
--
-- Fix (idempotent):
--   1. Replace trigger function: tambah SET total_pendapatan = v_total
--   2. Backfill sekali: UPDATE total_pendapatan dari total_nominal untuk semua row
--   3. Refresh PostgREST schema cache
--   4. Verifikasi dashboard-relevant rows
-- =====================================================

-- SECTION A: Diagnosa kondisi sebelum fix
SELECT '=== A. Kondisi saat ini (cek selisih total_nominal vs total_pendapatan) ===' AS section;
SELECT
  tanggal,
  status,
  total_nominal,
  total_pendapatan,
  jumlah_warga_bayar,
  (total_nominal - total_pendapatan) AS selisih
FROM jimpitan_sesi
WHERE total_nominal <> total_pendapatan
ORDER BY tanggal DESC
LIMIT 10;

-- SECTION B: Replace trigger function agar update kedua kolom
SELECT '=== B. Replace sync_jimpitan_sesi_totals() ===' AS section;
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

  -- FIX: tulis ke KEDUA kolom supaya dashboard (baca total_pendapatan) & kas
  -- (baca total_nominal) konsisten. Trigger lama cuma tulis total_nominal.
  UPDATE jimpitan_sesi
  SET total_nominal = v_total,
      total_pendapatan = v_total,
      jumlah_warga_bayar = v_jumlah_bayar,
      jumlah_penjaga_hadir = v_jumlah_hadir,
      updated_at = NOW()
  WHERE id = v_sesi_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger sudah ada dari SQL 20 (trg_sync_jimpitan_detail, trg_sync_ronda_attendance)
-- Function di-replace dengan signature sama → trigger otomatis pakai versi baru.

-- SECTION C: Backfill satu kali untuk data historis
SELECT '=== C. Backfill total_pendapatan dari total_nominal ===' AS section;
UPDATE jimpitan_sesi
SET total_pendapatan = COALESCE(total_nominal, 0)
WHERE total_pendapatan IS DISTINCT FROM total_nominal;

-- SECTION D: Refresh PostgREST schema cache
SELECT '=== D. Refresh PostgREST cache ===' AS section;
NOTIFY pgrst, 'reload schema';

-- SECTION E: Verifikasi
SELECT '=== E.1 Sesi Juni 2026 (dashboard range) ===' AS section;
SELECT
  tanggal,
  status,
  total_pendapatan,
  total_nominal,
  jumlah_warga_bayar,
  CASE WHEN total_pendapatan = total_nominal THEN '✅' ELSE '❌' END AS konsisten
FROM jimpitan_sesi
WHERE tanggal >= '2026-06-01' AND tanggal < '2026-07-01'
ORDER BY tanggal;

SELECT '=== E.2 Cek sesi 20 Juni (yang baru di-ACC) ===' AS section;
SELECT
  tanggal,
  status,
  total_pendapatan,
  total_nominal,
  approved_at
FROM jimpitan_sesi
WHERE tanggal = '2026-06-20';

SELECT '=== E.3 Summary ===' AS section;
SELECT
  (SELECT COUNT(*) FROM jimpitan_sesi WHERE total_pendapatan <> COALESCE(total_nominal, 0)) AS row_tidak_konsisten_should_be_0,
  (SELECT COUNT(*) FROM jimpitan_sesi WHERE total_pendapatan > 0) AS row_total_pendapatan_lebih_dari_0,
  (SELECT SUM(total_pendapatan) FROM jimpitan_sesi WHERE status = 'APPROVED' AND tanggal >= '2026-06-01' AND tanggal < '2026-07-01') AS total_approved_juni_2026,
  CASE
    WHEN (SELECT COUNT(*) FROM jimpitan_sesi WHERE total_pendapatan <> COALESCE(total_nominal, 0)) = 0
     AND (SELECT COUNT(*) FROM jimpitan_sesi WHERE total_pendapatan > 0) > 0
    THEN '✅ FIX BERHASIL - total_pendapatan sudah sync dengan trigger'
    ELSE '❌ Cek section di atas'
  END AS status;
