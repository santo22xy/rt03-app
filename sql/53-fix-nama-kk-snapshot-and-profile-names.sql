-- =====================================================
-- 53: Fix ronda_attendance.nama_kk_snapshot NOT NULL
--      + update nama profile B-1, B-5, C-2 ke nama asli
--
-- Issue:
--   1. SQL 21 bikin ronda_attendance.nama_kk_snapshot NOT NULL.
--      Saat toggleKehadiran() upsert tanpa kolom ini → NULL
--      violates constraint → "null value in column nama_kk_snapshot
--      violates not-null constraint"
--   2. Profile B-5 (Bpk. Budi Setiawan) salah nama_kk = "Sekretaris RT 03"
--      karena login_id sekretaris dipakai juga oleh Budi Setiawan.
--      Jabatan "Sekretaris" ke-overwrite ke Budi Setiawan.
--      Hal sama kemungkinan terjadi di B-1 dan C-2.
-- =====================================================

-- SECTION A: Diagnosa profile B-1, B-5, C-2
SELECT '=== A. Diagnosa nama profile yg salah ===' AS section;
SELECT id, login_id, nama_kk, role, blok, nomor_rumah
FROM profiles
WHERE login_id IN ('B-1', 'B-5', 'C-2')
ORDER BY login_id;

-- SECTION B: Drop NOT NULL di nama_kk_snapshot
SELECT '=== B. Drop NOT NULL constraint di nama_kk_snapshot ===' AS section;
ALTER TABLE ronda_attendance ALTER COLUMN nama_kk_snapshot DROP NOT NULL;

-- SECTION C: Update nama profile ke nama asli
SELECT '=== C. Update nama profile ke nama asli ===' AS section;
UPDATE profiles SET nama_kk = 'Bpk. Budi Sulaiman'  WHERE login_id = 'B-1' AND nama_kk <> 'Bpk. Budi Sulaiman';
UPDATE profiles SET nama_kk = 'Bpk. Budi Setiawan' WHERE login_id = 'B-5' AND nama_kk <> 'Bpk. Budi Setiawan';
UPDATE profiles SET nama_kk = 'Bpk. Setyo Budi'    WHERE login_id = 'C-2' AND nama_kk <> 'Bpk. Setyo Budi';

-- SECTION D: Sync ke ronda_kelompok.nama_kk_snapshot
SELECT '=== D. Sync nama_kk_snapshot di ronda_kelompok ===' AS section;
UPDATE ronda_kelompok rk
SET nama_kk_snapshot = p.nama_kk
FROM profiles p
WHERE rk.profile_id = p.id
  AND p.login_id IN ('B-1', 'B-5', 'C-2')
  AND rk.nama_kk_snapshot <> p.nama_kk;

-- SECTION E: Sync ke ronda_attendance.nama_kk_snapshot (kalau ada row existing)
SELECT '=== E. Sync nama_kk_snapshot di ronda_attendance ===' AS section;
UPDATE ronda_attendance ra
SET nama_kk_snapshot = p.nama_kk,
    nama_snapshot = p.nama_kk
FROM profiles p
WHERE ra.profile_id = p.id
  AND p.login_id IN ('B-1', 'B-5', 'C-2')
  AND (ra.nama_kk_snapshot <> p.nama_kk OR ra.nama_snapshot <> p.nama_kk);

-- SECTION F: Refresh PostgREST schema cache
SELECT '=== F. Refresh PostgREST schema cache ===' AS section;
NOTIFY pgrst, 'reload schema';

-- SECTION G: Verifikasi
SELECT '=== G.1 Cek nama_kk_snapshot sudah nullable ===' AS section;
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ronda_attendance'
  AND column_name = 'nama_kk_snapshot';

SELECT '=== G.2 Cek nama profile setelah update ===' AS section;
SELECT login_id, nama_kk, role, blok, nomor_rumah
FROM profiles
WHERE login_id IN ('B-1', 'B-5', 'C-2')
ORDER BY login_id;

SELECT '=== G.3 Cek anggota K3 (Budi Setiawan B-5 harus muncul) ===' AS section;
SELECT
  rk.kelompok_id,
  rk.login_id,
  rk.role_kelompok,
  rk.urutan,
  rk.nama_kk_snapshot,
  rk.is_active
FROM ronda_kelompok rk
WHERE rk.kelompok_id = 'K3' AND rk.is_active = TRUE
ORDER BY rk.urutan;

SELECT '=== G.4 Summary ===' AS section;
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'ronda_attendance' AND column_name = 'nama_kk_snapshot') AS nama_kk_nullable,
  (SELECT COUNT(*) FROM profiles WHERE login_id = 'B-5' AND nama_kk = 'Bpk. Budi Setiawan') AS budi_setiawan_ok,
  (SELECT COUNT(*) FROM profiles WHERE login_id = 'B-1' AND nama_kk = 'Bpk. Budi Sulaiman') AS budi_sulaiman_ok,
  (SELECT COUNT(*) FROM profiles WHERE login_id = 'C-2' AND nama_kk = 'Bpk. Setyo Budi') AS setyo_budi_ok,
  CASE
    WHEN (SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'ronda_attendance' AND column_name = 'nama_kk_snapshot') = 'YES'
     AND (SELECT COUNT(*) FROM profiles WHERE login_id = 'B-5' AND nama_kk = 'Bpk. Budi Setiawan') = 1
     AND (SELECT COUNT(*) FROM profiles WHERE login_id = 'B-1' AND nama_kk = 'Bpk. Budi Sulaiman') = 1
     AND (SELECT COUNT(*) FROM profiles WHERE login_id = 'C-2' AND nama_kk = 'Bpk. Setyo Budi') = 1
    THEN '✅ FIX BERHASIL'
    ELSE '⚠️ Sebagian berhasil, cek status di atas'
  END AS status;
