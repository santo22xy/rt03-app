-- =====================================================
-- 27: DIAG & FIX status enum + cek A-1
-- =====================================================

-- =====================================================
-- A. Cek A-1 punya jimpitan_tagihan atau tidak
-- =====================================================
SELECT '=== A. CEK A-1: apakah ada tagihan? ===' AS section;
SELECT
  jt.id,
  jt.login_id,
  jt.periode_bulan,
  jt.nominal_tagihan,
  jt.total_terbayar,
  jt.status,
  jt.profile_id,
  p.id AS profile_uuid,
  p.login_id AS profile_login_id_match
FROM jimpitan_tagihan jt
LEFT JOIN profiles p ON p.id = jt.profile_id
WHERE jt.login_id = 'A-1' OR p.login_id = 'A-1';

-- =====================================================
-- B. Cek B-5 status
-- =====================================================
SELECT '=== B. CEK B-5 ===' AS section;
SELECT
  jt.login_id,
  jt.periode_bulan,
  jt.nominal_tagihan,
  jt.total_terbayar,
  jt.status
FROM jimpitan_tagihan jt
WHERE jt.login_id = 'B-5';

-- =====================================================
-- C. Cek constraint status yang dipakai
-- =====================================================
SELECT '=== C. CHECK CONSTRAINT jimpitan_tagihan.status ===' AS section;
SELECT pg_get_constraintdef(c.oid) AS constraint_def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname = 'jimpitan_tagihan'
  AND conname LIKE '%status%';

-- =====================================================
-- D. DISTINCT status yang ada di DB
-- =====================================================
SELECT '=== D. DISTINCT STATUS DI DB ===' AS section;
SELECT status, COUNT(*) AS jumlah
FROM jimpitan_tagihan
GROUP BY status
ORDER BY status;

-- =====================================================
-- E. NORMALISASI STATUS: SEBAGIAN -> CICIL, BELUM_BAYAR -> BELUM
-- Karena UI cek CICIL & BELUM (bukan SEBAGIAN & BELUM_BAYAR)
-- =====================================================
DO $$
DECLARE
  v_updated_cicil INT := 0;
  v_updated_belum INT := 0;
BEGIN
  UPDATE jimpitan_tagihan
  SET status = 'CICIL', updated_at = NOW()
  WHERE status = 'SEBAGIAN';
  GET DIAGNOSTICS v_updated_cicil = ROW_COUNT;
  RAISE NOTICE 'SEBAGIAN -> CICIL: % rows', v_updated_cicil;

  UPDATE jimpitan_tagihan
  SET status = 'BELUM', updated_at = NOW()
  WHERE status = 'BELUM_BAYAR';
  GET DIAGNOSTICS v_updated_belum = ROW_COUNT;
  RAISE NOTICE 'BELUM_BAYAR -> BELUM: % rows', v_updated_belum;
END $$;

-- =====================================================
-- F. Verifikasi A-1 dan B-5 setelah fix
-- =====================================================
SELECT '=== F. VERIFIKASI A-1 & B-5 ===' AS section;
SELECT login_id, periode_bulan, nominal_tagihan, total_terbayar, status
FROM jimpitan_tagihan
WHERE login_id IN ('A-1', 'B-5')
ORDER BY login_id;

-- =====================================================
-- G. Cek apakah profile_id jimpitan_tagihan match ke profile A-1
-- =====================================================
SELECT '=== G. COCOKKAN profile_id jimpitan_tagihan dengan profile A-1 ===' AS section;
SELECT
  jt.login_id,
  jt.profile_id AS tagihan_profile_id,
  p.id AS profile_id_sekarang,
  (jt.profile_id = p.id) AS is_match
FROM jimpitan_tagihan jt
JOIN profiles p ON p.login_id = jt.login_id
WHERE jt.login_id IN ('A-1', 'B-5');
