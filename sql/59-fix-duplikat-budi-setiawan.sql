-- =====================================================
-- 59: Fix duplikat anggota kelompok ronda (B-1, B-5, C-2)
--
-- Issue:
--   Tiga profile punya nama yg ke-overwrite saat SQL 42 backfill pengurus:
--     - B-1: "Bpk. Budi Sulaiman" (nama asli) ke-overwrite jadi "Budi Sulaiman"
--     - B-5: "Bpk. Budi Setiawan" ke-overwrite jadi "Budi Setiawan" (sebelum SQL 53)
--     - C-2: "Bpk. Setyo Budi" ke-overwrite jadi "Bpk. Setyobudi"
--
--   Setelah SQL 42 auto-create profile baru (B-1, B-5, C-2 sebagai pengurus/warga),
--   dan SQL 53 update nama profile, ternyata ada 2 profile_id berbeda dgn login_id
--   yg sama di ronda_kelompok:
--     - Row stale (created 2026-06-18, profile_id lama, snapshot nama "lama")
--     - Row active (created 2026-06-20, profile_id baru, snapshot nama "baru")
--
--   Akibatnya anggota KELOMPOK terlihat DOUBLE di UI (Daftar Petugas Ronda).
--   Bug ini ditemukan saat screenshot 2026-06-20: B-5 muncul 2x di K3.
--
-- Fix (idempotent, sudah dijalankan via script 2026-06-20):
--   1. Migrasi jimpitan_detail.profile_id stale → aktif (preserve history)
--   2. Soft-delete row stale di ronda_kelompok (is_active=false)
--   3. Sync profile.nama_kk ke nama yg benar (B-1, B-5, C-2)
--   4. Tambah UNIQUE INDEX untuk mencegah duplikat di masa depan
-- =====================================================

-- SECTION A: Diagnosa kondisi sebelum fix
SELECT '=== A. Diagnosa duplikat saat ini ===' AS section;
SELECT
  rk.id,
  rk.kelompok_id,
  rk.profile_id,
  rk.login_id,
  rk.nama_kk_snapshot,
  rk.is_active,
  rk.created_at
FROM ronda_kelompok rk
WHERE rk.kelompok_id IN ('K1','K2','K3') AND rk.login_id IN ('B-1','B-5','C-2')
ORDER BY rk.kelompok_id, rk.login_id, rk.is_active DESC, rk.created_at;

-- SECTION B: Migrasi jimpitan_detail dari profile_id stale ke aktif
-- (supaya history kehadiran tetap ada & konsisten dengan profile baru)
SELECT '=== B. Migrasi jimpitan_detail ===' AS section;
DO $$
DECLARE
  v_mappings JSONB := '[
    {"old": "1bd82229-94ae-4677-bb9e-e48b9554502b", "new": "dcac929d-6bb6-4ad9-ae22-dc5124212002", "label": "B-5"},
    {"old": "c347dd23-1852-4e19-bec4-969f111de8ca", "new": "d421051f-3e5c-4c6a-8138-a279e8d6fc6e", "label": "B-1"},
    {"old": "3ca53514-e621-49d3-8921-9f6ef2805e3a", "new": "68f86664-4702-40a9-81c4-8a2bdaf0f684", "label": "C-2"}
  ]'::JSONB;
  v_old UUID;
  v_new UUID;
  v_label TEXT;
  v_count INT;
BEGIN
  FOR i IN 0..(jsonb_array_length(v_mappings) - 1) LOOP
    v_old  := (v_mappings->i->>'old')::UUID;
    v_new  := (v_mappings->i->>'new')::UUID;
    v_label := v_mappings->i->>'label';
    -- Hanya migrate kalau profile baru aktif
    IF EXISTS (SELECT 1 FROM profiles WHERE id = v_new AND is_active = TRUE) THEN
      UPDATE jimpitan_detail d
      SET profile_id = v_new
      WHERE d.profile_id = v_old
        AND NOT EXISTS (
          SELECT 1 FROM jimpitan_detail d2
          WHERE d2.sesi_id = d.sesi_id
            AND d2.profile_id = v_new
            AND d2.is_bayar = d.is_bayar
        );
      GET DIAGNOSTICS v_count = ROW_COUNT;
      RAISE NOTICE '✓ %: migrasi % row jimpitan_detail', v_label, v_count;
    ELSE
      RAISE NOTICE '⚠️ %: profile baru tidak aktif, skip migrasi', v_label;
    END IF;
  END LOOP;
END $$;

-- SECTION C: Soft-delete row stale di ronda_kelompok
SELECT '=== C. Soft-delete row stale ===' AS section;
UPDATE ronda_kelompok
SET is_active = FALSE
WHERE id IN (
  '743e16cc-99d4-4a76-8157-15266698722f',  -- B-5 stale
  '09183792-1cce-4ae3-be93-818ab127463b',  -- B-1 stale
  '5865499f-14d1-4628-8bfd-9fc57af76bcc'   -- C-2 stale
)
AND is_active = TRUE;

-- SECTION D: Sync profile.nama_kk supaya konsisten
SELECT '=== D. Sync profile.nama_kk ===' AS section;
UPDATE profiles SET nama_kk = 'Bpk. Budi Sulaiman'  WHERE login_id = 'B-1' AND nama_kk <> 'Bpk. Budi Sulaiman';
UPDATE profiles SET nama_kk = 'Bpk. Budi Setiawan' WHERE login_id = 'B-5' AND nama_kk <> 'Bpk. Budi Setiawan';
UPDATE profiles SET nama_kk = 'Bpk. Setyo Budi'    WHERE login_id = 'C-2' AND nama_kk <> 'Bpk. Setyo Budi';

-- SECTION E: Tambah UNIQUE INDEX untuk mencegah duplikat di masa depan
SELECT '=== E. Tambah UNIQUE INDEX ===' AS section;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_ronda_kelompok_kelompok_profile_active'
  ) THEN
    CREATE UNIQUE INDEX uniq_ronda_kelompok_kelompok_profile_active
      ON ronda_kelompok (kelompok_id, profile_id)
      WHERE is_active = TRUE;
    RAISE NOTICE '✓ Created UNIQUE INDEX (kelompok_id, profile_id) WHERE is_active';
  ELSE
    RAISE NOTICE '→ UNIQUE INDEX sudah ada';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Gagal buat UNIQUE INDEX: %', SQLERRM;
  RAISE NOTICE '   Mungkin masih ada duplikat aktif. Cek section F.1.';
END $$;

-- SECTION F: Refresh PostgREST schema cache
SELECT '=== F. Refresh PostgREST cache ===' AS section;
NOTIFY pgrst, 'reload schema';

-- SECTION G: Verifikasi
SELECT '=== G.1 Cek duplikat aktif (harus 0) ===' AS section;
SELECT
  kelompok_id,
  login_id,
  COUNT(*) AS cnt
FROM ronda_kelompok
WHERE is_active = TRUE
GROUP BY kelompok_id, login_id
HAVING COUNT(*) > 1;

SELECT '=== G.2 Final state K1/K2/K3 (clean) ===' AS section;
SELECT
  rk.kelompok_id,
  rk.urutan,
  rk.login_id,
  rk.nama_kk_snapshot,
  rk.role_kelompok,
  rk.is_active
FROM ronda_kelompok rk
WHERE rk.kelompok_id IN ('K1','K2','K3')
ORDER BY rk.kelompok_id, rk.is_active DESC, rk.urutan;

SELECT '=== G.3 Profile B-1, B-5, C-2 setelah sync ===' AS section;
SELECT login_id, nama_kk, role, is_active
FROM profiles
WHERE login_id IN ('B-1','B-5','C-2')
ORDER BY login_id;

SELECT '=== G.4 Summary ===' AS section;
SELECT
  (SELECT COUNT(*) FROM ronda_kelompok WHERE kelompok_id IN ('K1','K2','K3') AND login_id IN ('B-1','B-5','C-2') AND is_active = TRUE) AS total_aktif_setelah_fix,
  (SELECT COUNT(*) FROM ronda_kelompok WHERE id IN ('743e16cc-99d4-4a76-8157-15266698722f','09183792-1cce-4ae3-be93-818ab127463b','5865499f-14d1-4628-8bfd-9fc57af76bcc') AND is_active = FALSE) AS row_stale_inactive,
  (SELECT COUNT(*) FROM profiles WHERE login_id IN ('B-1','B-5','C-2') AND nama_kk IN ('Bpk. Budi Sulaiman','Bpk. Budi Setiawan','Bpk. Setyo Budi')) AS profile_nama_ok,
  (SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_ronda_kelompok_kelompok_profile_active')) AS unique_index_exists,
  CASE
    WHEN (SELECT COUNT(*) FROM ronda_kelompok WHERE kelompok_id IN ('K1','K2','K3') AND login_id IN ('B-1','B-5','C-2') AND is_active = TRUE) = 3
     AND (SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_ronda_kelompok_kelompok_profile_active')) = TRUE
    THEN '✅ FIX BERHASIL - semua duplikat sudah dihapus, UNIQUE INDEX aktif'
    ELSE '❌ FIX BELUM LENGKAP - cek section di atas'
  END AS status;