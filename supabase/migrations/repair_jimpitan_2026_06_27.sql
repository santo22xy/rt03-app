-- =====================================================
-- SQL REPAIR: Sync jimpitan_sesi summary for 2026-06-27
-- Issue: summary columns in jimpitan_sesi are 0, but details exist.
-- =====================================================

-- 1. Check current state before repair
SELECT 
  id, 
  tanggal, 
  status, 
  total_nominal, 
  total_pendapatan, 
  jumlah_warga_bayar, 
  jumlah_penjaga_hadir 
FROM jimpitan_sesi 
WHERE tanggal = '2026-06-27';

-- 2. Perform the repair
-- We use a CTE to calculate the correct values from jimpitan_detail and ronda_attendance
WITH calculated_data AS (
  SELECT
    sd.sesi_id,
    SUM(sd.nominal) as new_total_nominal,
    COUNT(sd.profile_id) FILTER (WHERE sd.nominal > 0) as new_jumlah_warga_bayar,
    (
      SELECT COUNT(*) 
      FROM ronda_attendance ra 
      WHERE ra.sesi_id = sd.sesi_id
    ) as new_jumlah_penjaga_hadir
  FROM jimpitan_detail sd
  WHERE sd.sesi_id IN (SELECT id FROM jimpitan_sesi WHERE tanggal = '2026-06-27')
  GROUP BY sd.sesi_id
)
UPDATE jimpitan_sesi s
SET
  total_nominal = cd.new_total_nominal,
  total_pendapatan = cd.new_total_nominal,
  jumlah_warga_bayar = cd.new_jumlah_warga_bayar,
  jumlah_penjaga_hadir = cd.new_jumlah_penjaga_hadir,
  updated_at = NOW()
FROM calculated_data cd
WHERE s.id = cd.sesi_id 
  AND s.tanggal = '2026-06-27';

-- 3. Check state after repair
SELECT 
  id, 
  tanggal, 
  status, 
  total_nominal, 
  total_pendapatan, 
  jumlah_warga_bayar, 
  jumlah_penjaga_hadir 
FROM jimpitan_sesi 
WHERE tanggal = '2026-06-27';
