-- =====================================================
-- SQL 49: Create View v_penjaga_efektif
-- Issue: View v_penjaga_efektif 404 (tidak ada di DB).
--        Code di 7 tempat query view ini, semuanya return 0 rows.
--        Padahal jadwal_ronda ada 10 records.
-- =====================================================

-- SECTION A: Diagnosa - jadwal_ronda + ronda_swap
SELECT 'jadwal_ronda' AS tabel, COUNT(*) AS total FROM jadwal_ronda WHERE is_active = true
UNION ALL
SELECT 'ronda_swap', COUNT(*) FROM ronda_swap WHERE is_active = true;

-- SECTION B: Create view v_penjaga_efektif
-- "Efektif" = penjaga yang benar2 jaga (asli ATAU pengganti dari swap)
-- Untuk saat ini ronda_swap kosong, jadi efektif = asli
-- Tapi kita LEFT JOIN supaya kalau ada swap, otomatis replace
CREATE OR REPLACE VIEW v_penjaga_efektif AS
SELECT
  j.id AS jadwal_id,
  j.tanggal,
  j.minggu_ke,
  j.bulan,
  j.tahun,
  j.penjaga_profile_id AS profile_asli_id,
  j.nama_penjaga_snapshot AS nama_asli,
  j.blok_snapshot AS blok_asli,
  j.nomor_rumah_snapshot AS nomor_rumah_asli,
  -- Penjaga efektif: jika ada swap aktif, pakai pengganti; else pakai penjaga asli
  COALESCE(s.profile_pengganti_id, j.penjaga_profile_id) AS profile_efektif_id,
  COALESCE(s.nama_pengganti_snapshot, j.nama_penjaga_snapshot) AS nama_efektif,
  -- Snapshot tambahan dari profiles (jaga-jaga kalau dibutuhkan)
  NULL::TEXT AS blok_snapshot_efektif,
  NULL::TEXT AS nomor_rumah_snapshot_efektif,
  (s.id IS NOT NULL) AS is_swapped
FROM jadwal_ronda j
LEFT JOIN ronda_swap s
  ON s.jadwal_ronda_id = j.id
  AND s.is_active = true
  AND s.tanggal = j.tanggal
WHERE j.is_active = true
ORDER BY j.tanggal ASC;

-- SECTION C: Refresh PostgREST schema cache (force view exposure)
NOTIFY pgrst, 'reload schema';

-- SECTION D: Verifikasi view
SELECT
  tanggal,
  profile_asli_id,
  nama_asli,
  profile_efektif_id,
  nama_efektif,
  is_swapped
FROM v_penjaga_efektif
ORDER BY tanggal
LIMIT 10;

-- SECTION E: Cek view muncul di PostgREST
-- (Kalau query di section D sukses, view sudah aktif)
SELECT 'View v_penjaga_efektif created' AS status;

-- =====================================================
-- SECTION F: SIMULASI 6 QUERY DARI KODE
--   Tujuan: pastikan view benar2 bisa diakses dengan
--           pola query yang dipakai di kode produksi.
--   Kalau salah satu return 0 rows padahal jadwal_ronda
--   ada datanya, berarti view/query perlu diperbaiki.
-- =====================================================

-- F1. dashboard/page.tsx:83 - Next jadwal (hari ini ke atas, limit 1)
SELECT '=== F1. dashboard/page.tsx - Next jadwal ===' AS section;
SELECT tanggal, profile_efektif_id, nama_efektif, is_swapped, nama_asli, profile_asli_id
FROM v_penjaga_efektif
WHERE tanggal >= CURRENT_DATE
ORDER BY tanggal ASC
LIMIT 1;

-- F2. warga/page.tsx:66-73 - Jadwal SAYA (by profile_id)
SELECT '=== F2. warga/page.tsx - My next jadwal ===' AS section;
-- Pakai profile_id sample (KETUA K1 - Kurniawan). Kalau null, pakai sembarang profile yang ada di jadwal_ronda.
DO $$
DECLARE v_pid UUID;
BEGIN
  SELECT penjaga_profile_id INTO v_pid
  FROM jadwal_ronda WHERE is_active = TRUE AND tanggal >= CURRENT_DATE
  ORDER BY tanggal LIMIT 1;

  IF v_pid IS NULL THEN
    RAISE NOTICE 'Tidak ada jadwal_ronda aktif - skip F2';
  ELSE
    RAISE NOTICE 'Sample profile_id untuk F2: %', v_pid;
  END IF;
END $$;

SELECT tanggal, profile_efektif_id, nama_efektif, is_swapped, nama_asli
FROM v_penjaga_efektif
WHERE profile_efektif_id = (
  SELECT penjaga_profile_id FROM jadwal_ronda
  WHERE is_active = TRUE AND tanggal >= CURRENT_DATE
  ORDER BY tanggal LIMIT 1
)
AND tanggal >= CURRENT_DATE
ORDER BY tanggal ASC
LIMIT 1;

-- F3. warga/ronda/page.tsx:50-55 - Jadwal 4 minggu ke depan
SELECT '=== F3. warga/ronda/page.tsx - 4 weeks ahead ===' AS section;
SELECT tanggal, profile_efektif_id, nama_efektif, is_swapped, nama_asli
FROM v_penjaga_efektif
WHERE tanggal >= CURRENT_DATE
  AND tanggal <= CURRENT_DATE + INTERVAL '28 days'
ORDER BY tanggal ASC;

-- F4 + F5. dashboard/jimpitan/[id]/page.tsx:49-53 + warga/jimpitan/[id]/page.tsx:54-58
-- Penjaga jadwal untuk tanggal Sesi Jimpitan
SELECT '=== F4-F5. jimpitan/[id] - penjaga by tanggal sesi ===' AS section;
SELECT
  s.id AS sesi_id,
  s.tanggal,
  v.profile_efektif_id,
  v.nama_efektif,
  v.nama_asli,
  v.is_swapped,
  v.profile_asli_id
FROM jimpitan_sesi s
LEFT JOIN v_penjaga_efektif v ON v.tanggal = s.tanggal
ORDER BY s.tanggal DESC
LIMIT 5;

-- F6. dashboard/jimpitan-actions.ts:498-502 - Auto-mark attendance
SELECT '=== F6. jimpitan-actions - penjaga by tanggal (for attendance) ===' AS section;
SELECT
  s.id AS sesi_id,
  s.tanggal,
  s.status,
  v.profile_efektif_id,
  v.nama_efektif
FROM jimpitan_sesi s
LEFT JOIN v_penjaga_efektif v ON v.tanggal = s.tanggal
WHERE s.status IN ('AKTIF','SUBMITTED')
ORDER BY s.tanggal DESC
LIMIT 5;

-- =====================================================
-- SECTION G: VERIFIKASI POSTGREST EXPOSURE
--   PostgREST cache sudah di-reload via NOTIFY pgrst.
--   View harus muncul di /rest/v1/ setelah ~10-30 detik.
--   Kalau F1-F6 return rows tapi kode masih 404,
--   biasanya cache belum sync - tunggu atau reload schema.
-- =====================================================

SELECT '=== G. Verifikasi PostgREST exposure ===' AS section;
SELECT
  schemaname,
  viewname,
  viewowner
FROM pg_views
WHERE schemaname = 'public' AND viewname = 'v_penjaga_efektif';

SELECT '=== View definition (untuk sanity check) ===' AS section;
SELECT view_definition
FROM information_schema.views
WHERE table_schema = 'public' AND table_name = 'v_penjaga_efektif';

SELECT '=== Summary akhir ===' AS section;
SELECT
  (SELECT COUNT(*) FROM jadwal_ronda WHERE is_active = TRUE) AS jadwal_aktif,
  (SELECT COUNT(*) FROM v_penjaga_efektif) AS rows_di_view,
  (SELECT COUNT(*) FROM jimpitan_sesi) AS total_sesi,
  CASE
    WHEN (SELECT COUNT(*) FROM v_penjaga_efektif) > 0
    THEN '✅ FIX BERHASIL - view aktif dan return data'
    ELSE '❌ VIEW MASIH KOSONG - cek apakah jadwal_ronda ada datanya'
  END AS status;
