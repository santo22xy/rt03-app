-- =====================================================
-- 62: Diagnostik + force recalc total_nominal/total_pendapatan
--
-- Issue dari SQL 61:
--   Status: ✅ FIX BERHASIL
--   Tapi total_approved_juni_2026 = 0
--   Padahal 20 Juni jelas sudah APPROVED dengan total=81000 di UI
--
-- Kemungkinan:
--   A. Trigger trg_sync_jimpitan_detail pernah di-disable atau
--      detail row 20 Juni di-insert SEBELUM trigger dibuat
--   B. Detail row exist tapi nominal 0 / is_bayar = false
--   C. Ada data inconsistency
--
-- Fix: investigasi → manual recalc dari jimpitan_detail aktual
-- =====================================================

-- SECTION A: Cek trigger jimpitan_detail aktif
SELECT '=== A. Trigger status ===' AS section;
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'jimpitan_detail'
ORDER BY trigger_name;

SELECT '=== A.2 Trigger status ronda_attendance ===' AS section;
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'ronda_attendance'
ORDER BY trigger_name;

-- SECTION B: Cek detail row untuk sesi 20 Juni
SELECT '=== B. Detail rows untuk sesi 20 Juni 2026 ===' AS section;
SELECT
  jd.id,
  jd.profile_id,
  jd.login_id,
  jd.nama_kk_snapshot,
  jd.nominal,
  jd.is_bayar,
  jd.status_bayar,
  jd.created_at
FROM jimpitan_detail jd
JOIN jimpitan_sesi js ON js.id = jd.sesi_id
WHERE js.tanggal = '2026-06-20'
ORDER BY jd.login_id;

-- SECTION C: Summary aggregate dari jimpitan_detail aktual
SELECT '=== C. Recalc dari jimpitan_detail aktual ===' AS section;
SELECT
  js.id AS sesi_id,
  js.tanggal,
  js.status,
  js.total_nominal AS stored_total_nominal,
  js.total_pendapatan AS stored_total_pendapatan,
  COALESCE(SUM(CASE WHEN jd.is_bayar THEN jd.nominal ELSE 0 END), 0) AS actual_sum_from_detail,
  COUNT(*) FILTER (WHERE jd.is_bayar) AS actual_count_bayar,
  COUNT(*) AS total_detail_rows
FROM jimpitan_sesi js
LEFT JOIN jimpitan_detail jd ON jd.sesi_id = js.id
WHERE js.tanggal >= '2026-06-01' AND js.tanggal < '2026-07-01'
GROUP BY js.id, js.tanggal, js.status, js.total_nominal, js.total_pendapatan
ORDER BY js.tanggal;

-- SECTION D: Force recalc untuk SEMUA sesi (panggil trigger logic manual)
SELECT '=== D. Force recalc total_nominal + total_pendapatan dari jimpitan_detail ===' AS section;
DO $$
DECLARE
  v_sesi RECORD;
  v_total NUMERIC(12,2);
  v_jumlah_bayar INT;
  v_jumlah_hadir INT;
  v_count INT := 0;
BEGIN
  FOR v_sesi IN
    SELECT id FROM jimpitan_sesi
  LOOP
    SELECT
      COALESCE(SUM(CASE WHEN is_bayar THEN nominal ELSE 0 END), 0),
      COUNT(*) FILTER (WHERE is_bayar)
    INTO v_total, v_jumlah_bayar
    FROM jimpitan_detail
    WHERE sesi_id = v_sesi.id;

    SELECT COUNT(*) INTO v_jumlah_hadir
    FROM ronda_attendance
    WHERE sesi_id = v_sesi.id;

    UPDATE jimpitan_sesi
    SET total_nominal = v_total,
        total_pendapatan = v_total,
        jumlah_warga_bayar = v_jumlah_bayar,
        jumlah_penjaga_hadir = v_jumlah_hadir,
        updated_at = NOW()
    WHERE id = v_sesi.id;

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE '✓ Recalculated % sesi', v_count;
END $$;

-- SECTION E: Refresh PostgREST schema cache
SELECT '=== E. Refresh PostgREST cache ===' AS section;
NOTIFY pgrst, 'reload schema';

-- SECTION F: Verifikasi akhir
SELECT '=== F.1 Sesi Juni 2026 setelah recalc ===' AS section;
SELECT
  tanggal,
  status,
  total_pendapatan,
  total_nominal,
  jumlah_warga_bayar,
  approved_at IS NOT NULL AS approved
FROM jimpitan_sesi
WHERE tanggal >= '2026-06-01' AND tanggal < '2026-07-01'
ORDER BY tanggal;

SELECT '=== F.2 Sesi 20 Juni detail ===' AS section;
SELECT
  tanggal,
  status,
  total_pendapatan,
  total_nominal,
  jumlah_warga_bayar,
  jumlah_penjaga_hadir,
  approved_by,
  approved_at
FROM jimpitan_sesi
WHERE tanggal = '2026-06-20';

SELECT '=== F.3 Summary dashboard-relevant ===' AS section;
SELECT
  (SELECT SUM(total_pendapatan) FROM jimpitan_sesi WHERE status = 'APPROVED' AND tanggal >= '2026-06-01' AND tanggal < '2026-07-01') AS total_approved_juni_2026_should_be_81000,
  (SELECT COUNT(*) FROM jimpitan_sesi WHERE total_pendapatan > 0) AS sesi_dengan_total_gt_0,
  (SELECT COUNT(*) FROM jimpitan_detail WHERE is_bayar = true) AS detail_row_bayar,
  CASE
    WHEN (SELECT SUM(total_pendapatan) FROM jimpitan_sesi WHERE status = 'APPROVED' AND tanggal >= '2026-06-01' AND tanggal < '2026-07-01') >= 80000
    THEN '✅ RECALC BERHASIL - dashboard Iuran Bulan Ini akan nongol nominal benar'
    ELSE '❌ Masih ada masalah - cek section B/C'
  END AS status;
