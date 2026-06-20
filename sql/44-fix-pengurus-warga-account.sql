-- =====================================================
-- SQL 44: FIX AKUN PENGURUS (B-1, B-5, C-2) - LOGIN WARGA
-- =====================================================
-- Masalah:
-- 1. Profile sekretaris (B-5) tidak bisa login karena PIN belum diatur
-- 2. Profile ketua (B-1) dan bendahara (C-2) juga sama
-- 3. Pengurus's warga page filter role='WARGA' jadi pengurus tidak muncul
-- 4. Reset PIN dari pengurus tidak bisa dilakukan
--
-- Fix:
-- 1. Set default PIN '123456' untuk semua pengurus
-- 2. Pastikan blok, nomor_rumah, kategori_tarif konsisten
-- 3. Pastikan login_id ada (kalau belum, generate)
-- =====================================================

-- =====================================================
-- A. DIAGNOSA STATE AWAL PENGURUS
-- =====================================================

SELECT '=== STATE PENGURUS SEBELUM FIX ===' AS section;
SELECT
  login_id,
  nama_kk,
  blok,
  nomor_rumah,
  role,
  kategori_tarif,
  is_active,
  CASE
    WHEN pin_hash IS NULL OR pin_hash = '' THEN '✗ PIN KOSONG'
    ELSE '✓ PIN SET'
  END AS pin_status
FROM profiles
WHERE login_id IN ('B-1', 'B-5', 'C-2')
ORDER BY login_id;

-- =====================================================
-- B. ENSURE REQUIRED COLUMNS (idempotent)
-- =====================================================

-- Pastikan profile bisa login sebagai warga:
-- blok dan nomor_rumah harus match dengan login_id

DO $$
DECLARE
  v_updated INT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SECTION B: ENSURE BLOK & NOMOR_RUMAH MATCH LOGIN_ID ===';

  -- B-1: KETUA_RT (Bpk. Budi S.)
  UPDATE profiles
    SET blok = 'B',
        nomor_rumah = 1,
        kategori_tarif = COALESCE(kategori_tarif, 'NORMAL'),
        is_active = TRUE
    WHERE login_id = 'B-1'
      AND (blok IS DISTINCT FROM 'B' OR nomor_rumah IS DISTINCT FROM 1);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN
    RAISE NOTICE 'B-1: blok/nomor_rumah diperbaiki', v_updated;
  END IF;

  -- B-5: SEKRETARIS (Budi Setiawan)
  UPDATE profiles
    SET blok = 'B',
        nomor_rumah = 5,
        kategori_tarif = COALESCE(kategori_tarif, 'NORMAL'),
        is_active = TRUE
    WHERE login_id = 'B-5'
      AND (blok IS DISTINCT FROM 'B' OR nomor_rumah IS DISTINCT FROM 5);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN
    RAISE NOTICE 'B-5: blok/nomor_rumah diperbaiki', v_updated;
  END IF;

  -- C-2: BENDAHARA (Bpk. Setyobudi)
  UPDATE profiles
    SET blok = 'C',
        nomor_rumah = 2,
        kategori_tarif = COALESCE(kategori_tarif, 'NORMAL'),
        is_active = TRUE
    WHERE login_id = 'C-2'
      AND (blok IS DISTINCT FROM 'C' OR nomor_rumah IS DISTINCT FROM 2);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN
    RAISE NOTICE 'C-2: blok/nomor_rumah diperbaiki', v_updated;
  END IF;
END $$;

-- =====================================================
-- C. SET DEFAULT PIN '123456' UNTUK PENGURUS YG BELUM ADA PIN
-- =====================================================

DO $$
DECLARE
  v_id_b1 UUID;
  v_id_b5 UUID;
  v_id_c2 UUID;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SECTION C: SET DEFAULT PIN UNTUK PENGURUS ===';

  -- Pakai helper set_warga_pin (sama function untuk warga)
  -- Ini akan hash PIN dan insert ke profiles.pin_hash

  -- B-1
  SELECT id INTO v_id_b1 FROM profiles WHERE login_id = 'B-1';
  IF v_id_b1 IS NOT NULL THEN
    BEGIN
      PERFORM set_warga_pin('B-1', '123456');
      RAISE NOTICE 'B-1: PIN default 123456 di-set';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'B-1: Gagal set PIN: %', SQLERRM;
    END;
  END IF;

  -- B-5
  SELECT id INTO v_id_b5 FROM profiles WHERE login_id = 'B-5';
  IF v_id_b5 IS NOT NULL THEN
    BEGIN
      PERFORM set_warga_pin('B-5', '123456');
      RAISE NOTICE 'B-5: PIN default 123456 di-set';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'B-5: Gagal set PIN: %', SQLERRM;
    END;
  END IF;

  -- C-2
  SELECT id INTO v_id_c2 FROM profiles WHERE login_id = 'C-2';
  IF v_id_c2 IS NOT NULL THEN
    BEGIN
      PERFORM set_warga_pin('C-2', '123456');
      RAISE NOTICE 'C-2: PIN default 123456 di-set';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'C-2: Gagal set PIN: %', SQLERRM;
    END;
  END IF;
END $$;

-- =====================================================
-- D. JIMPITAN TAGIHAN UNTUK PENGURUS
-- =====================================================
-- Pastikan pengurus (B-1, B-5, C-2) punya tagihan jimpitan bulan ini
-- karena mereka juga warga

DO $$
DECLARE
  v_periode DATE := date_trunc('month', CURRENT_DATE)::date;
  v_iterasi INT := 0;
  v_tarif_normal NUMERIC;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SECTION D: GENERATE TAGIHAN PENGURUS BULAN INI ===';

  -- Ambil tarif normal
  SELECT value::numeric INTO v_tarif_normal
  FROM app_settings
  WHERE key = 'JIMPITAN_DEFAULT';

  IF v_tarif_normal IS NULL THEN
    v_tarif_normal := 15000;
  END IF;

  -- Insert tagihan untuk pengurus jika belum ada
  INSERT INTO jimpitan_tagihan (
    profile_id, periode_bulan, kategori, nominal_tagihan, status, total_terbayar
  )
  SELECT
    p.id,
    v_periode,
    'NORMAL',
    v_tarif_normal,
    'BELUM',
    0
  FROM profiles p
  WHERE p.login_id IN ('B-1', 'B-5', 'C-2')
    AND p.is_active = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM jimpitan_tagihan t
      WHERE t.profile_id = p.id AND t.periode_bulan = v_periode
    );
  GET DIAGNOSTICS v_iterasi = ROW_COUNT;
  RAISE NOTICE 'Generated % tagihan untuk pengurus bulan %', v_iterasi, v_periode;
END $$;

-- =====================================================
-- E. VERIFIKASI
-- =====================================================

SELECT '=== STATE PENGURUS SETELAH FIX ===' AS section;
SELECT
  login_id,
  nama_kk,
  blok || '-' || nomor_rumah AS alamat,
  role,
  kategori_tarif,
  is_active,
  CASE
    WHEN pin_hash IS NULL OR pin_hash = '' THEN '✗ PIN KOSONG'
    ELSE '✓ PIN SET'
  END AS pin_status
FROM profiles
WHERE login_id IN ('B-1', 'B-5', 'C-2')
ORDER BY login_id;

-- Test verifikasi PIN
SELECT '=== TEST VERIFIKASI PIN ===' AS section;
SELECT
  login_id,
  verify_warga_pin AS valid
FROM profiles,
LATERAL verify_warga_pin(login_id, '123456') AS verify_warga_pin
WHERE login_id IN ('B-1', 'B-5', 'C-2')
ORDER BY login_id;

SELECT '=== LOGIN TEST (DRY RUN) ===' AS section;
-- Simulasi apa yang terjadi saat login B-5
SELECT
  login_id,
  nama_kk,
  blok,
  nomor_rumah,
  pin_hash IS NOT NULL AS has_pin,
  is_active
FROM profiles
WHERE login_id = 'B-5';