-- =====================================================
-- 42-FIX-ALL-RLS-AND-JADWAL
-- FIX 2 HAL PENTING (WAJIB DIJALANKAN untuk fitur pengurus):
--
-- A. Fix RLS infinite recursion di profiles
--    - Tanpa fix ini, banyak query ke kas_transaksi, jadwal_ronda, dll
--      gagal dengan error: "infinite recursion detected in policy for profiles"
--    - Fix: pakai auth.jwt() (app_metadata.role) untuk cek role, jangan query profiles
--
-- B. Generate jadwal ronda 2026-2027
--    - Tanpa generate ini, jadwal_ronda kosong setelah 2026-06-27
--    - Fix: auto-rotate 4 KETUA kelompok (A-1, A-2, A-4, A-6) per Sabtu
-- =====================================================

-- =====================================================
-- A. FIX RLS RECURSION
-- =====================================================

SELECT '=== A1. Existing profiles policies ===' AS section;
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

DO $$
DECLARE v_p TEXT;
BEGIN
  FOR v_p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', v_p);
    RAISE NOTICE 'Dropped policy %', v_p;
  END LOOP;
END $$;

-- Policy baru yang AMAN (no recursion)
CREATE POLICY "profiles_read_all" ON profiles
  FOR SELECT USING (TRUE);

CREATE POLICY "profiles_insert_self" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own_or_pengurus" ON profiles
  FOR UPDATE USING (
    auth.uid() = id
    OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN
       ('KETUA_RT','BENDAHARA','SEKRETARIS','PENGURUS','SUPERADMIN')
  );

CREATE POLICY "profiles_delete_superadmin" ON profiles
  FOR DELETE USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'SUPERADMIN'
  );

-- Sync app_metadata.role untuk semua user
DO $$
DECLARE v_user RECORD;
BEGIN
  FOR v_user IN
    SELECT au.id, p.role, p.nama_kk
    FROM auth.users au
    JOIN profiles p ON p.id = au.id
    WHERE p.role IS NOT NULL
  LOOP
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                            || jsonb_build_object('role', v_user.role)
    WHERE id = v_user.id;
    RAISE NOTICE 'Set role=% untuk % (%)', v_user.role, v_user.nama_kk, v_user.id;
  END LOOP;
END $$;

-- =====================================================
-- B. GENERATE JADWAL RONDA 2026-2027
--    Aturan baru:
--    - Sabtu ke-1..4 di bulan → K1..K4 (rotasi PER BULAN, reset tiap bulan)
--    - Sabtu ke-5 di bulan → KOSONG (tidak dibuat jadwal)
--    - Migration: jadwal existing di bulan yang sama akan disesuaikan
-- =====================================================

DO $$
DECLARE
  v_ketua RECORD;
  v_ketuamap JSONB := '{}'::jsonb;
  v_daftar TEXT[] := ARRAY['K1','K2','K3','K4'];
  v_start DATE;
  v_end DATE := '2027-06-30';
  v_iterasi INT := 0;
  v_skipped INT := 0;
  v_tanggal DATE;
  v_penjaga_id UUID;
  v_penjaga_nama TEXT;
  v_penjaga_blok TEXT;
  v_penjaga_no TEXT;
  v_existing INT;
  v_minggu_ke INT;
  v_kelompok_id TEXT;
  v_kelompok_to_penjaga JSONB := '{}'::jsonb;
BEGIN
  -- Bangun map ketua kelompok (K1..K4)
  FOR v_ketua IN
    SELECT kelompok_id, profile_id, nama_kk_snapshot, blok_snapshot, nomor_rumah_snapshot
    FROM ronda_kelompok
    WHERE role_kelompok = 'KETUA' AND is_active = TRUE
    ORDER BY kelompok_id
  LOOP
    v_ketuamap := v_ketuamap || jsonb_build_object(
      v_ketua.kelompok_id,
      jsonb_build_object(
        'id', v_ketua.profile_id,
        'nama', v_ketua.nama_kk_snapshot,
        'blok', v_ketua.blok_snapshot,
        'no', v_ketua.nomor_rumah_snapshot
      )
    );
  END LOOP;

  SELECT COALESCE(MAX(tanggal), CURRENT_DATE - INTERVAL '7 days')::date + INTERVAL '7 days'
    INTO v_start
  FROM jadwal_ronda;

  -- Maju ke Sabtu berikutnya
  WHILE EXTRACT(DOW FROM v_start) <> 6 LOOP
    v_start := v_start + INTERVAL '1 day';
  END LOOP;

  v_tanggal := v_start;

  WHILE v_tanggal <= v_end LOOP
    -- Hitung minggu_ke: Sabtu ke-1..5 di bulan tersebut
    -- Rumus: CEIL((day_of_month) / 7)
    v_minggu_ke := CEIL(EXTRACT(DAY FROM v_tanggal)::numeric / 7)::int;

    IF v_minggu_ke BETWEEN 1 AND 4 THEN
      -- Rotasi PER BULAN: minggu 1 → K1, minggu 2 → K2, dst
      v_kelompok_id := 'K' || v_minggu_ke;

      v_penjaga_id := (v_ketuamap -> v_kelompok_id ->> 'id')::uuid;
      v_penjaga_nama := v_ketuamap -> v_kelompok_id ->> 'nama';
      v_penjaga_blok := v_ketuamap -> v_kelompok_id ->> 'blok';
      v_penjaga_no := v_ketuamap -> v_kelompok_id ->> 'no';

      SELECT COUNT(*) INTO v_existing FROM jadwal_ronda WHERE tanggal = v_tanggal;

      IF v_existing = 0 AND v_penjaga_id IS NOT NULL THEN
        INSERT INTO jadwal_ronda (tanggal, minggu_ke, bulan, tahun,
                                   penjaga_profile_id, nama_penjaga_snapshot,
                                   blok_snapshot, nomor_rumah_snapshot)
        VALUES (
          v_tanggal,
          v_minggu_ke,
          EXTRACT(MONTH FROM v_tanggal)::int,
          EXTRACT(YEAR FROM v_tanggal)::int,
          v_penjaga_id,
          v_penjaga_nama,
          v_penjaga_blok,
          v_penjaga_no
        );
        v_iterasi := v_iterasi + 1;
      ELSIF v_existing > 0 THEN
        -- Update existing jadwal untuk konsistensi rotasi per bulan
        UPDATE jadwal_ronda
          SET minggu_ke = v_minggu_ke,
              bulan    = EXTRACT(MONTH FROM v_tanggal)::int,
              tahun    = EXTRACT(YEAR FROM v_tanggal)::int,
              penjaga_profile_id    = v_penjaga_id,
              nama_penjaga_snapshot = COALESCE(NULLIF(v_penjaga_nama, ''), nama_penjaga_snapshot),
              blok_snapshot         = COALESCE(NULLIF(v_penjaga_blok, ''), blok_snapshot),
              nomor_rumah_snapshot  = COALESCE(NULLIF(v_penjaga_no, ''),   nomor_rumah_snapshot),
              is_active             = TRUE
          WHERE tanggal = v_tanggal;
      END IF;
    ELSE
      -- Minggu ke-5 → KOSONG (hapus kalau ada jadwal existing)
      v_skipped := v_skipped + 1;
      DELETE FROM jadwal_ronda WHERE tanggal = v_tanggal;
    END IF;

    v_tanggal := v_tanggal + INTERVAL '7 days';
  END LOOP;

  RAISE NOTICE 'Generated % jadwal ronda records (minggu 1-4) from % to %. Skipped % Sabtu minggu ke-5 (kosong).',
    v_iterasi, v_start, v_end, v_skipped;
END $$;

-- =====================================================
-- D. SYNC PROFILES PENGURUS (B-1, B-5, C-2, X-0)
--    + app_metadata.role
-- Fix: "Profile pengurus tidak ditemukan untuk akun ini"
--      terjadi saat login signIn sukses tapi profiles.id <> auth.users.id
-- Idempotent: aman di-run berulang
-- =====================================================

SELECT '=== D1. DIAGNOSA: STATE PROFILE PENGURUS ===' AS section;
SELECT
  u.email,
  p.login_id,
  p.role,
  p.nama_kk,
  p.id   AS profiles_id,
  u.id   AS auth_users_id,
  CASE
    WHEN p.id IS NULL      THEN '✗ HILANG'
    WHEN p.id = u.id       THEN '✓ COCOK'
    ELSE                        '✗ ID BEDA'
  END AS status
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.email IN ('ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id')
ORDER BY u.email;

DO $$
DECLARE
  v_user       RECORD;
  v_login      TEXT;
  v_role       TEXT;
  v_nama       TEXT;
  v_blok       TEXT;
  v_no         INT;
  v_existing   RECORD;
  v_fk_record  RECORD;
  v_sql        TEXT;
  v_fk_count   INT := 0;
  v_inserted   INT := 0;
  v_migrated   INT := 0;
  v_skipped    INT := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SECTION D: SYNC PROFILES PENGURUS ===';

  FOR v_user IN
    SELECT au.id, au.email, p.id AS profile_id
    FROM auth.users au
    LEFT JOIN profiles p ON p.id = au.id
    WHERE au.email IN ('ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id')
  LOOP
    -- Map email → login_id, role, nama, blok, no
    v_login := CASE v_user.email
      WHEN 'ketua@rt03.id'      THEN 'B-1'
      WHEN 'sekretaris@rt03.id' THEN 'B-5'
      WHEN 'bendahara@rt03.id'  THEN 'C-2'
      WHEN 'admin@rt03.id'      THEN 'X-0' END;
    v_role := CASE v_user.email
      WHEN 'ketua@rt03.id'      THEN 'KETUA_RT'
      WHEN 'sekretaris@rt03.id' THEN 'SEKRETARIS'
      WHEN 'bendahara@rt03.id'  THEN 'BENDAHARA'
      WHEN 'admin@rt03.id'      THEN 'SUPERADMIN' END;
    v_nama := CASE v_user.email
      WHEN 'ketua@rt03.id'      THEN 'Ketua RT 03'
      WHEN 'sekretaris@rt03.id' THEN 'Sekretaris RT 03'
      WHEN 'bendahara@rt03.id'  THEN 'Bendahara RT 03'
      WHEN 'admin@rt03.id'      THEN 'Admin RT 03' END;
    v_blok := CASE v_user.email
      WHEN 'ketua@rt03.id'      THEN 'B'
      WHEN 'sekretaris@rt03.id' THEN 'B'
      WHEN 'bendahara@rt03.id'  THEN 'C'
      WHEN 'admin@rt03.id'      THEN 'X' END;
    v_no := CASE v_user.email
      WHEN 'ketua@rt03.id'      THEN 1
      WHEN 'sekretaris@rt03.id' THEN 5
      WHEN 'bendahara@rt03.id'  THEN 2
      WHEN 'admin@rt03.id'      THEN 0 END;

    -- KASUS A: profile ada dan id cocok → SKIP
    IF v_user.profile_id IS NOT NULL AND v_user.profile_id = v_user.id THEN
      v_skipped := v_skipped + 1;
      RAISE NOTICE '✓ SKIP [%] % - sudah cocok', v_login, v_user.email;

    -- KASUS B: profile hilang (no row dengan id = auth.users.id)
    ELSIF v_user.profile_id IS NULL THEN
      -- Cek apakah ada profile dengan login_id benar tapi id beda
      SELECT id, nama_kk, blok, nomor_rumah
        INTO v_existing
        FROM profiles
        WHERE login_id = v_login
        LIMIT 1;

      IF v_existing.id IS NOT NULL THEN
        -- MIGRATE: ada profile dgn login_id benar, tapi id beda
        RAISE NOTICE '→ MIGRATE [%] % : id=% → id=%', v_login, v_user.email, v_existing.id, v_user.id;

        -- Drop FK constraints sementara
        FOR v_fk_record IN
          SELECT c.conname AS constraint_name,
                 t.relname AS table_name,
                 n.nspname AS schema_name
          FROM pg_constraint c
          JOIN pg_class t   ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.contype = 'f' AND c.confrelid = 'public.profiles'::regclass
        LOOP
          EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
                         v_fk_record.schema_name,
                         v_fk_record.table_name,
                         v_fk_record.constraint_name);
          v_fk_count := v_fk_count + 1;
        END LOOP;
        RAISE NOTICE '  Dropped % FK constraints', v_fk_count;

        -- Hapus profile konflik (id = auth.users.id tapi login_id beda)
        DELETE FROM profiles
          WHERE id = v_user.id AND (login_id IS NULL OR login_id <> v_login);

        -- UPDATE profiles.id (preserve nama/blok/no yg sudah ada)
        UPDATE profiles
          SET id          = v_user.id,
              nama_kk     = COALESCE(NULLIF(v_existing.nama_kk, ''), v_nama),
              blok        = COALESCE(NULLIF(v_existing.blok, ''),    v_blok),
              nomor_rumah = COALESCE(NULLIF(v_existing.nomor_rumah, 0), v_no)
          WHERE id = v_existing.id;
        v_migrated := v_migrated + 1;
      ELSE
        -- INSERT: profile benar-benar hilang
        RAISE NOTICE '→ INSERT [%] % - buat profile baru', v_login, v_user.email;
        INSERT INTO profiles (id, login_id, nama_kk, role, is_active, kategori_tarif, blok, nomor_rumah, catatan)
        VALUES (v_user.id, v_login, v_nama, v_role::user_role, TRUE, 'NORMAL', v_blok, v_no,
                'Auto-created by SQL 42 section D');
        v_inserted := v_inserted + 1;
      END IF;
    END IF;

    -- Sync app_metadata.role (supaya RLS policy di section A kenal role ini)
    UPDATE auth.users
      SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                              || jsonb_build_object('role', v_role)
      WHERE id = v_user.id;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '=== HASIL SECTION D: inserted=%, migrated=%, skipped=% ===',
    v_inserted, v_migrated, v_skipped;
END $$;

-- Re-add FK constraints yang di-drop saat MIGRATE (idempotent)
DO $$
DECLARE
  v_fk_record RECORD;
  v_sql       TEXT;
  v_count     INT := 0;
  v_on_delete TEXT;
BEGIN
  RAISE NOTICE '=== Re-add FK constraints (kalau ada yg hilang) ===';
  FOR v_fk_record IN
    SELECT DISTINCT t.relname AS table_name, a.attname AS column_name, n.nspname AS schema_name
    FROM pg_constraint c
    JOIN pg_class   t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute  a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = 'public.profiles'::regclass
  LOOP
    -- Skip kalau FK dengan nama itu sudah ada
    PERFORM 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE c.conname = v_fk_record.table_name || '_' || v_fk_record.column_name || '_fkey';
    IF NOT FOUND THEN
      v_on_delete := CASE
        WHEN v_fk_record.column_name IN ('created_by','kyc_verified_by','acd_by_profile_id',
                                          'profile_id_petugas','actor_id','validated_by',
                                          'publish_by','input_by','petugas_id','pengganti_id')
          THEN 'SET NULL' ELSE 'CASCADE' END;
      v_sql := format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES profiles(id) ON DELETE %s',
        v_fk_record.schema_name,
        v_fk_record.table_name,
        v_fk_record.table_name || '_' || v_fk_record.column_name || '_fkey',
        v_fk_record.column_name,
        v_on_delete);
      EXECUTE v_sql;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Re-added % FK constraints', v_count;
END $$;

SELECT '=== D2. VERIFIKASI FINAL PROFILE PENGURUS ===' AS section;
SELECT
  u.email,
  p.login_id,
  p.role,
  CASE WHEN p.id = u.id THEN '✓ BISA LOGIN' ELSE '✗ MASIH BEDA' END AS login_status
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.email IN ('ketua@rt03.id','sekretaris@rt03.id','bendahara@rt03.id','admin@rt03.id')
ORDER BY u.email;

-- =====================================================
-- E. ACTIVATE FUTURE JADWAL RONDA
--    Fix: "Ronda 20 Juni tidak muncul di dashboard"
--    - Pastikan semua jadwal masa depan aktif (is_active = TRUE)
--    - view v_penjaga_efektif filter WHERE j.is_active = TRUE,
--      jadi kalau is_active = FALSE jadwal tidak muncul di dashboard/warga
--    - Idempotent: aman di-run berulang
-- =====================================================

SELECT '=== E1. STATE JADWAL RONDA MASA DEPAN ===' AS section;
SELECT
  tanggal,
  nama_penjaga_snapshot AS penjaga,
  is_active,
  CASE WHEN is_active THEN '✓ AKTIF' ELSE '✗ NON-AKTIF' END AS status
FROM jadwal_ronda
WHERE tanggal >= CURRENT_DATE
ORDER BY tanggal
LIMIT 15;

DO $$
DECLARE
  v_activated INT := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SECTION E: ACTIVATE FUTURE JADWAL RONDA ===';

  UPDATE jadwal_ronda
    SET is_active = TRUE
    WHERE tanggal >= CURRENT_DATE
      AND is_active = FALSE;
  GET DIAGNOSTICS v_activated = ROW_COUNT;

  RAISE NOTICE 'Activated % jadwal_ronda records (is_active FALSE → TRUE)', v_activated;
END $$;

-- =====================================================
-- VERIFIKASI
-- =====================================================
SELECT '=== VERIFIKASI PROFILES POLICIES ===' AS section;
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

SELECT '=== VERIFIKASI JADWAL RONDA (12 ke depan) ===' AS section;
SELECT
  tanggal,
  nama_penjaga_snapshot AS penjaga,
  blok_snapshot || '-' || nomor_rumah_snapshot AS rumah
FROM jadwal_ronda
WHERE tanggal >= CURRENT_DATE
ORDER BY tanggal
LIMIT 12;

SELECT '=== VERIFIKASI DISTRIBUSI ROTASI PER BULAN ===' AS section;
SELECT
  tahun || '-' || LPAD(bulan::text, 2, '0') AS periode,
  minggu_ke,
  COUNT(*) AS jumlah,
  STRING_AGG(nama_penjaga_snapshot, ', ' ORDER BY tanggal) AS penjaga
FROM jadwal_ronda
WHERE tanggal >= CURRENT_DATE
GROUP BY tahun, bulan, minggu_ke
ORDER BY tahun, bulan, minggu_ke
LIMIT 20;

SELECT '=== VERIFIKASI SABTU MINGGU KE-5 (HARUS KOSONG) ===' AS section;
-- Cari Sabtu minggu ke-5 (day 29-31) di jadwal_ronda
SELECT tanggal, EXTRACT(DAY FROM tanggal) AS hari
FROM jadwal_ronda
WHERE EXTRACT(DAY FROM tanggal) >= 29
  AND tanggal >= CURRENT_DATE
ORDER BY tanggal;
-- Expected: 0 rows (artinya Sabtu ke-5 sudah di-skip)

SELECT '=== TOTAL JADWAL RONDA ===' AS section;
SELECT tahun, COUNT(*) AS total
FROM jadwal_ronda
GROUP BY tahun
ORDER BY tahun;

SELECT '=== DISTRIBUSI PER PENJAGA ===' AS section;
SELECT nama_penjaga_snapshot, COUNT(*) AS jumlah
FROM jadwal_ronda
WHERE tanggal >= CURRENT_DATE
GROUP BY nama_penjaga_snapshot
ORDER BY nama_penjaga_snapshot;

SELECT '=== TEST RLS RECURSION (sebelumnya error) ===' AS section;
SELECT COUNT(*) AS profile_count FROM profiles;