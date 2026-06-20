-- =====================================================
-- 52: Fix ronda_attendance.login_id NOT NULL + backfill ronda_kelompok
--
-- Issue:
--   1. SQL 21 bikin ronda_attendance.login_id NOT NULL, tapi aksi
--      toggleKehadiran / submitSesi / swapAnggota TIDAK pass login_id.
--      Hasilnya upsert/insert gagal → "null value in column login_id
--      violates not-null constraint".
--   2. Budi Setiawan (B-5) ada di jadwal_ronda tapi tidak muncul di
--      absen anggota. Kemungkinan SQL 21 tidak insert dia ke
--      ronda_kelompok karena lookup profile gagal (login_id beda?)
--      atau INSERT di-skip karena profile belum ada di waktu script
--      dijalankan.
--
-- Fix:
--   1. ALTER COLUMN login_id DROP NOT NULL (kolom redundant dgn profile_id)
--   2. Diagnose & backfill ronda_kelompok dari jadwal_ronda + profiles
-- =====================================================

-- SECTION A: Diagnosa login_id NOT NULL
SELECT '=== A. Diagnosa ronda_attendance.login_id ===' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ronda_attendance'
  AND column_name = 'login_id';

-- SECTION B: Drop NOT NULL constraint di login_id
SELECT '=== B. Drop NOT NULL constraint ===' AS section;
ALTER TABLE ronda_attendance ALTER COLUMN login_id DROP NOT NULL;

-- SECTION C: Diagnosa ronda_kelompok - siapa yg ada vs yg harusnya ada
SELECT '=== C.1 Total ronda_kelompok aktif per kelompok ===' AS section;
SELECT kelompok_id, COUNT(*) AS total
FROM ronda_kelompok
WHERE is_active = TRUE
GROUP BY kelompok_id
ORDER BY kelompok_id;

SELECT '=== C.2 Cek Bpk. Budi Setiawan (B-5) di ronda_kelompok ===' AS section;
SELECT rk.*, p.nama_kk, p.login_id
FROM ronda_kelompok rk
LEFT JOIN profiles p ON p.id = rk.profile_id
WHERE p.login_id = 'B-5' OR p.nama_kk ILIKE '%budi setiawan%';

SELECT '=== C.3 Cek profile Bpk. Budi Setiawan ===' AS section;
SELECT id, login_id, nama_kk, blok, nomor_rumah
FROM profiles
WHERE login_id = 'B-5' OR nama_kk ILIKE '%budi setiawan%';

SELECT '=== C.4 Cek Budi Setiawan di jadwal_ronda ===' AS section;
SELECT jr.tanggal, jr.minggu_ke, jr.penjaga_profile_id, p.nama_kk
FROM jadwal_ronda jr
LEFT JOIN profiles p ON p.id = jr.penjaga_profile_id
WHERE p.login_id = 'B-5' OR p.nama_kk ILIKE '%budi setiawan%';

-- SECTION D: Backfill - insert anggota yg ada di profiles tapi belum ada di ronda_kelompok
SELECT '=== D. Insert missing ronda_kelompok (semua KK yang punya rumah) ===' AS section;

-- Strategi: untuk setiap profile dengan blok & nomor_rumah (yaitu KK, bukan pengurus X),
-- kalau belum ada di ronda_kelompok sama sekali → masukkan ke kelompok berdasarkan minggu_ke
-- yang ditentukan dari mapping default (sesuai SQL 21).

-- Mapping default (sama dengan SQL 21):
-- K1: A-1 (KETUA), B-1, C-4, D-2, A-13, A-14
-- K2: A-2 (KETUA), B-2, C-2, D-3, A-15, A-16
-- K3: A-4 (KETUA), B-5, C-5, C-7, A-8, A-9
-- K4: A-3 (KETUA), B-3 (skip, tdk ikut), B-4 (skip), B-7 (skip), C-6 (skip), dst.

DO $$
DECLARE
  v_id UUID;
  v_nama TEXT;
  v_blok TEXT;
  v_nomor TEXT;
  v_login TEXT;
  v_kelompok TEXT;
  v_role TEXT;
  v_urutan INT;
  v_inserted INT := 0;
  v_skipped INT := 0;
BEGIN
  -- K1
  FOR v_login, v_role, v_urutan IN
    VALUES ('A-1', 'KETUA', 1), ('B-1', 'ANGGOTA', 2), ('C-4', 'ANGGOTA', 3),
           ('D-2', 'ANGGOTA', 4), ('A-13', 'ANGGOTA', 5), ('A-14', 'ANGGOTA', 6)
  LOOP
    SELECT id, nama_kk, blok, nomor_rumah INTO v_id, v_nama, v_blok, v_nomor
    FROM profiles WHERE login_id = v_login;
    IF v_id IS NULL THEN
      v_skipped := v_skipped + 1;
      RAISE NOTICE 'Skip K1 % - profile not found', v_login;
    ELSE
      INSERT INTO ronda_kelompok (kelompok_id, nama_kelompok, profile_id, login_id, nama_kk_snapshot, blok_snapshot, nomor_rumah_snapshot, role_kelompok, urutan)
      VALUES ('K1', 'Kelompok 1', v_id, v_login, v_nama, v_blok, v_nomor, v_role, v_urutan)
      ON CONFLICT (kelompok_id, profile_id) DO NOTHING;
      IF FOUND THEN v_inserted := v_inserted + 1; END IF;
    END IF;
  END LOOP;

  -- K2
  FOR v_login, v_role, v_urutan IN
    VALUES ('A-2', 'KETUA', 1), ('B-2', 'ANGGOTA', 2), ('C-2', 'ANGGOTA', 3),
           ('D-3', 'ANGGOTA', 4), ('A-15', 'ANGGOTA', 5), ('A-16', 'ANGGOTA', 6)
  LOOP
    SELECT id, nama_kk, blok, nomor_rumah INTO v_id, v_nama, v_blok, v_nomor
    FROM profiles WHERE login_id = v_login;
    IF v_id IS NULL THEN
      v_skipped := v_skipped + 1;
      RAISE NOTICE 'Skip K2 % - profile not found', v_login;
    ELSE
      INSERT INTO ronda_kelompok (kelompok_id, nama_kelompok, profile_id, login_id, nama_kk_snapshot, blok_snapshot, nomor_rumah_snapshot, role_kelompok, urutan)
      VALUES ('K2', 'Kelompok 2', v_id, v_login, v_nama, v_blok, v_nomor, v_role, v_urutan)
      ON CONFLICT (kelompok_id, profile_id) DO NOTHING;
      IF FOUND THEN v_inserted := v_inserted + 1; END IF;
    END IF;
  END LOOP;

  -- K3 (Bpk. Andi H. - KETUA, Bpk. Budi Setiawan B-5 - ANGGOTA)
  FOR v_login, v_role, v_urutan IN
    VALUES ('A-4', 'KETUA', 1), ('B-5', 'ANGGOTA', 2), ('C-5', 'ANGGOTA', 3),
           ('C-7', 'ANGGOTA', 4), ('A-8', 'ANGGOTA', 5), ('A-9', 'ANGGOTA', 6)
  LOOP
    SELECT id, nama_kk, blok, nomor_rumah INTO v_id, v_nama, v_blok, v_nomor
    FROM profiles WHERE login_id = v_login;
    IF v_id IS NULL THEN
      v_skipped := v_skipped + 1;
      RAISE NOTICE 'Skip K3 % - profile not found', v_login;
    ELSE
      INSERT INTO ronda_kelompok (kelompok_id, nama_kelompok, profile_id, login_id, nama_kk_snapshot, blok_snapshot, nomor_rumah_snapshot, role_kelompok, urutan)
      VALUES ('K3', 'Kelompok 3', v_id, v_login, v_nama, v_blok, v_nomor, v_role, v_urutan)
      ON CONFLICT (kelompok_id, profile_id) DO NOTHING;
      IF FOUND THEN v_inserted := v_inserted + 1; END IF;
    END IF;
  END LOOP;

  -- K4 (A-3 KETUA; B-3, B-4, B-7, C-6 TIDAK ikut ronda per spec SQL 21)
  -- Tapi kalau ada di profiles, kita coba masukkan. User bisa nonaktifkan via UI nanti.
  FOR v_login, v_role, v_urutan IN
    VALUES ('A-3', 'KETUA', 1)
  LOOP
    SELECT id, nama_kk, blok, nomor_rumah INTO v_id, v_nama, v_blok, v_nomor
    FROM profiles WHERE login_id = v_login;
    IF v_id IS NULL THEN
      v_skipped := v_skipped + 1;
      RAISE NOTICE 'Skip K4 % - profile not found', v_login;
    ELSE
      INSERT INTO ronda_kelompok (kelompok_id, nama_kelompok, profile_id, login_id, nama_kk_snapshot, blok_snapshot, nomor_rumah_snapshot, role_kelompok, urutan)
      VALUES ('K4', 'Kelompok 4', v_id, v_login, v_nama, v_blok, v_nomor, v_role, v_urutan)
      ON CONFLICT (kelompok_id, profile_id) DO NOTHING;
      IF FOUND THEN v_inserted := v_inserted + 1; END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill selesai: inserted=% skipped (not found)=%', v_inserted, v_skipped;
END $$;

-- SECTION E: Refresh PostgREST schema cache
SELECT '=== E. Refresh PostgREST schema cache ===' AS section;
NOTIFY pgrst, 'reload schema';

-- SECTION F: Verifikasi
SELECT '=== F.1 Cek login_id sekarang nullable ===' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ronda_attendance'
  AND column_name = 'login_id';

SELECT '=== F.2 Cek Budi Setiawan (B-5) ada di K3 ===' AS section;
SELECT
  rk.kelompok_id,
  rk.profile_id,
  rk.login_id,
  rk.role_kelompok,
  rk.urutan,
  p.nama_kk,
  p.blok,
  p.nomor_rumah,
  rk.is_active
FROM ronda_kelompok rk
LEFT JOIN profiles p ON p.id = rk.profile_id
WHERE rk.kelompok_id = 'K3' AND rk.is_active = TRUE
ORDER BY rk.urutan;

SELECT '=== F.3 Summary ===' AS section;
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'ronda_attendance' AND column_name = 'login_id') AS login_id_nullable,
  (SELECT COUNT(*) FROM ronda_kelompok WHERE kelompok_id = 'K3' AND is_active = TRUE) AS anggota_k3_aktif,
  CASE
    WHEN (SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'ronda_attendance' AND column_name = 'login_id') = 'YES'
     AND (SELECT COUNT(*) FROM ronda_kelompok WHERE kelompok_id = 'K3' AND is_active = TRUE) >= 5
    THEN '✅ FIX BERHASIL'
    WHEN (SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'ronda_attendance' AND column_name = 'login_id') = 'YES'
    THEN '⚠️ login_id sudah nullable, tapi anggota K3 < 5. Cek profil Budi/A-8/A-9.'
    ELSE '❌ login_id masih NOT NULL'
  END AS status;
