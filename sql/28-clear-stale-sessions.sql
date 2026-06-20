-- =====================================================
-- 28: DIAG & CLEAR stale warga_sessions
-- Setelah 22 re-insert profiles dengan UUID baru,
-- session lama masih reference profile UUID lama
-- =====================================================

-- A. Lihat struktur tabel warga_sessions
SELECT '=== A. STRUKTUR WARGA_SESSIONS ===' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'warga_sessions'
ORDER BY ordinal_position;

-- B. Lihat semua session + cek apakah profile_id masih valid
SELECT '=== B. ALL SESSIONS + MATCH CHECK ===' AS section;
SELECT
  ws.profile_id AS session_profile_id,
  p.id AS current_profile_id,
  p.login_id,
  (ws.profile_id = p.id) AS is_match,
  ws.created_at,
  ws.expires_at
FROM warga_sessions ws
LEFT JOIN profiles p ON p.id = ws.profile_id
ORDER BY ws.created_at DESC;

-- C. Hapus semua sesi yg stale (profile_id tidak match)
-- User harus login ulang untuk dapat session dgn UUID baru
DO $$
DECLARE
  v_deleted INT := 0;
BEGIN
  DELETE FROM warga_sessions ws
  WHERE NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = ws.profile_id
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted stale sessions: %', v_deleted;
END $$;

-- D. (Opsional) Hapus SEMUA session, force semua warga login ulang
SELECT '=== D. CLEAR ALL WARGA_SESSIONS ===' AS section;
DELETE FROM warga_sessions;

-- E. Verifikasi kosong
SELECT '=== E. VERIFIKASI KOSONG ===' AS section;
SELECT COUNT(*) AS sisa_session FROM warga_sessions;
