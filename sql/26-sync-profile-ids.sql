-- =====================================================
-- 26: SYNC profile_id di semua tabel jimpitan dengan UUID baru
-- Setelah 22-fix-profiles-real-data.sql, profile ID berubah
-- jimpitan_tagihan, jimpitan_detail, jimpitan_sesi dll masih pakai UUID lama
-- =====================================================

-- Helper: function untuk update profile_id by login_id
DO $$
DECLARE
  v_updated_tagihan INT := 0;
  v_updated_detail INT := 0;
  v_updated_sesi INT := 0;
  v_unmatched INT := 0;
BEGIN
  -- =====================================================
  -- A. jimpitan_tagihan: update profile_id by login_id
  -- =====================================================
  UPDATE jimpitan_tagihan jt
  SET profile_id = p_new.id
  FROM profiles p_old, profiles p_new
  WHERE jt.profile_id = p_old.id
    AND p_old.login_id = p_new.login_id
    AND jt.profile_id != p_new.id;
  GET DIAGNOSTICS v_updated_tagihan = ROW_COUNT;
  RAISE NOTICE 'Updated jimpitan_tagihan: % rows', v_updated_tagihan;

  -- =====================================================
  -- B. jimpitan_detail: update profile_id by login_id
  -- =====================================================
  UPDATE jimpitan_detail jd
  SET profile_id = p_new.id
  FROM profiles p_old, profiles p_new
  WHERE jd.profile_id = p_old.id
    AND p_old.login_id = p_new.login_id
    AND jd.profile_id != p_new.id;
  GET DIAGNOSTICS v_updated_detail = ROW_COUNT;
  RAISE NOTICE 'Updated jimpitan_detail: % rows', v_updated_detail;

  -- =====================================================
  -- C. jimpitan_sesi.profile_id_petugas + acd_by_profile_id
  -- =====================================================
  UPDATE jimpitan_sesi js
  SET profile_id_petugas = p_new.id
  FROM profiles p_old, profiles p_new
  WHERE js.profile_id_petugas = p_old.id
    AND p_old.login_id = p_new.login_id
    AND js.profile_id_petugas != p_new.id;
  GET DIAGNOSTICS v_updated_sesi = ROW_COUNT;
  RAISE NOTICE 'Updated jimpitan_sesi.profile_id_petugas: % rows', v_updated_sesi;

  UPDATE jimpitan_sesi js
  SET acd_by_profile_id = p_new.id
  FROM profiles p_old, profiles p_new
  WHERE js.acd_by_profile_id = p_old.id
    AND p_old.login_id = p_new.login_id
    AND js.acd_by_profile_id != p_new.id;
  GET DIAGNOSTICS v_unmatched = ROW_COUNT;
  RAISE NOTICE 'Updated jimpitan_sesi.acd_by_profile_id: % rows', v_unmatched;

  -- =====================================================
  -- D. ronda_kelompok.profile_id
  -- =====================================================
  UPDATE ronda_kelompok rk
  SET profile_id = p_new.id
  FROM profiles p_old, profiles p_new
  WHERE rk.profile_id = p_old.id
    AND p_old.login_id = p_new.login_id
    AND rk.profile_id != p_new.id;
  GET DIAGNOSTICS v_unmatched = ROW_COUNT;
  RAISE NOTICE 'Updated ronda_kelompok: % rows', v_unmatched;

  -- =====================================================
  -- E. jadwal_ronda.penjaga_profile_id
  -- =====================================================
  UPDATE jadwal_ronda jr
  SET penjaga_profile_id = p_new.id
  FROM profiles p_old, profiles p_new
  WHERE jr.penjaga_profile_id = p_old.id
    AND p_old.login_id = p_new.login_id
    AND jr.penjaga_profile_id != p_new.id;
  GET DIAGNOSTICS v_unmatched = ROW_COUNT;
  RAISE NOTICE 'Updated jadwal_ronda: % rows', v_unmatched;

  -- =====================================================
  -- F. ronda_attendance.profile_id
  -- =====================================================
  UPDATE ronda_attendance ra
  SET profile_id = p_new.id
  FROM profiles p_old, profiles p_new
  WHERE ra.profile_id = p_old.id
    AND p_old.login_id = p_new.login_id
    AND ra.profile_id != p_new.id;
  GET DIAGNOSTICS v_unmatched = ROW_COUNT;
  RAISE NOTICE 'Updated ronda_attendance: % rows', v_unmatched;

  RAISE NOTICE '=== SYNC COMPLETE ===';
END $$;

-- =====================================================
-- VERIFIKASI: A-1 sekarang punya jimpitan_tagihan dgn profile_id yg match
-- =====================================================
SELECT '=== A. CEK A-1 ===' AS section;
SELECT
  jt.id,
  jt.login_id,
  jt.periode_bulan,
  jt.nominal_tagihan,
  jt.total_terbayar,
  jt.status,
  p.login_id AS profile_login_id
FROM jimpitan_tagihan jt
LEFT JOIN profiles p ON p.id = jt.profile_id
WHERE jt.login_id = 'A-1';

-- =====================================================
-- VERIFIKASI: B-5
-- =====================================================
SELECT '=== B. CEK B-5 ===' AS section;
SELECT
  jt.id,
  jt.login_id,
  jt.periode_bulan,
  jt.nominal_tagihan,
  jt.total_terbayar,
  jt.status,
  p.login_id AS profile_login_id
FROM jimpitan_tagihan jt
LEFT JOIN profiles p ON p.id = jt.profile_id
WHERE jt.login_id = 'B-5';

-- =====================================================
-- VERIFIKASI: ada tagihan orphan (login_id gak match profile_id)
-- =====================================================
SELECT '=== C. ORPHAN CHECK ===' AS section;
SELECT COUNT(*) AS orphan_tagihan
FROM jimpitan_tagihan jt
LEFT JOIN profiles p ON p.id = jt.profile_id
WHERE p.id IS NULL;
