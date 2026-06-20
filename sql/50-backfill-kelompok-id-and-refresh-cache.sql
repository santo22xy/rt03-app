-- =====================================================
-- 50: Backfill kelompok_id untuk sesi yg belum di-set
--      + NOTIFY PostgREST refresh schema cache
--
-- Issue:
--   1. Sesi yg dibuat manual oleh pengurus (openSesi action)
--      tidak set kolom kelompok_id → NULL.
--      Akibatnya card "PENJAGA JADWAL" hanya menampilkan ketua
--      saja, bukan seluruh anggota kelompok.
--   2. Error "Could not find the 'nama_snapshot' column of
--      'ronda_attendance' in the schema cache" → PostgREST
--      cache lama (sebelum kolom nama_snapshot di-reload).
-- =====================================================

-- =====================================================
-- SECTION A: Diagnosa
-- =====================================================
SELECT '=== A. Diagnosa kelompok_id NULL ===' AS section;
SELECT
  COUNT(*) FILTER (WHERE kelompok_id IS NULL) AS sesi_kelompok_null,
  COUNT(*) FILTER (WHERE kelompok_id IS NOT NULL) AS sesi_kelompok_set,
  COUNT(*) AS total_sesi
FROM jimpitan_sesi;

SELECT '=== A2. Detail sesi yg kelompok_id NULL ===' AS section;
SELECT id, tanggal, status, kelompok_id, input_by, waktu_mulai
FROM jimpitan_sesi
WHERE kelompok_id IS NULL
ORDER BY tanggal DESC;

-- =====================================================
-- SECTION B: Backfill kelompok_id
--   Rumus: Sabtu ke-N dari bulan itu
--     tgl 1-7   → K1 (minggu 1)
--     tgl 8-14  → K2 (minggu 2)
--     tgl 15-21 → K3 (minggu 3)
--     tgl 22-28 → K4 (minggu 4)
--     tgl 29-31 → NULL (di luar range, sesi tdk valid utk kelompok)
-- =====================================================
SELECT '=== B. Backfill kelompok_id ===' AS section;
UPDATE jimpitan_sesi
SET kelompok_id = 'K' || ((EXTRACT(DAY FROM tanggal)::INT - 1) / 7 + 1)::TEXT
WHERE kelompok_id IS NULL
  AND EXTRACT(DAY FROM tanggal)::INT BETWEEN 1 AND 28;

-- =====================================================
-- SECTION C: Verifikasi hasil backfill
-- =====================================================
SELECT '=== C. Verifikasi setelah backfill ===' AS section;
SELECT
  COUNT(*) FILTER (WHERE kelompok_id IS NULL) AS sesi_kelompok_null,
  COUNT(*) FILTER (WHERE kelompok_id IS NOT NULL) AS sesi_kelompok_set,
  COUNT(*) AS total_sesi
FROM jimpitan_sesi;

SELECT '=== C2. Sesi Juni 2026 (should all have kelompok_id) ===' AS section;
SELECT id, tanggal, kelompok_id, status
FROM jimpitan_sesi
WHERE tanggal BETWEEN '2026-06-01' AND '2026-06-30'
ORDER BY tanggal;

-- =====================================================
-- SECTION D: NOTIFY PostgREST refresh schema cache
--   Untuk fix error "Could not find the 'nama_snapshot'
--   column of 'ronda_attendance' in the schema cache"
-- =====================================================
SELECT '=== D. Refresh PostgREST schema cache ===' AS section;
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- SECTION E: Test simulasi query (sama dengan kode)
--   Cek anggota kelompok K3 (untuk sesi JUN 20)
-- =====================================================
SELECT '=== E1. Anggota K3 (untuk verifikasi PENJAGA JADWAL sesi JUN 20) ===' AS section;
SELECT
  kelompok_id,
  profile_id,
  login_id,
  nama_kk_snapshot,
  role_kelompok,
  urutan
FROM ronda_kelompok
WHERE is_active = TRUE
  AND kelompok_id = 'K3'
ORDER BY urutan;

SELECT '=== E2. Cek field name_snapshot di ronda_attendance schema ===' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ronda_attendance'
ORDER BY ordinal_position;

SELECT '=== E3. Summary ===' AS section;
SELECT
  (SELECT COUNT(*) FROM jimpitan_sesi WHERE kelompok_id IS NULL) AS sesi_kelompok_null,
  (SELECT COUNT(*) FROM ronda_kelompok WHERE kelompok_id = 'K3' AND is_active = TRUE) AS anggota_k3_aktif,
  CASE
    WHEN (SELECT COUNT(*) FROM jimpitan_sesi WHERE kelompok_id IS NULL) = 0
     AND (SELECT COUNT(*) FROM ronda_kelompok WHERE kelompok_id = 'K3' AND is_active = TRUE) > 0
    THEN '✅ FIX BERHASIL - backfill selesai + PostgREST refreshed'
    WHEN (SELECT COUNT(*) FROM jimpitan_sesi WHERE kelompok_id IS NULL) = 0
    THEN '⚠️ Backfill selesai tapi tidak ada anggota K3 - cek data ronda_kelompok'
    ELSE '❌ Masih ada sesi dengan kelompok_id NULL'
  END AS status;
