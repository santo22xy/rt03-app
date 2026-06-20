-- =====================================================
-- 22: Fix Data Palsu & Update dengan Data ASLI
-- Sumber: spreadsheet Kepala_Keluarga + Data_Warga
-- Per tanggal 13 Juni 2026
-- =====================================================

-- =====================================================
-- STEP 0: Tambah kolom catatan jika belum ada (idempotent)
-- =====================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS catatan TEXT;

-- =====================================================
-- STEP 0.5: INSERT 29 profil REAL (idempotent)
-- PENTING: kalau profil sudah ada, di-skip (ON CONFLICT)
-- Kalau hilang/hapus, di-INSERT ulang dengan data real
-- =====================================================
INSERT INTO profiles (id, login_id, nama_kk, blok, nomor_rumah, role, is_active, kategori_tarif)
VALUES
  (gen_random_uuid(), 'A-1',  'Bpk. Kurniawan',     'A', 1,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'A-2',  'Bpk. Amar Marruf',   'A', 2,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'A-4',  'Bpk. Andi H.',       'A', 4,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'A-5',  'Bpk. B. Widodo',     'A', 5,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'A-6',  'Bpk. Edi Santosa',   'A', 6,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'A-8',  'Mas Rizky',          'A', 8,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'A-9',  'Bpk. Bagus',         'A', 9,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'A-10', 'Bpk. Raden',         'A', 10, 'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'A-11', 'Bpk. Kelik',         'A', 11, 'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'A-12', 'Bpk. Awey',          'A', 12, 'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'A-13', 'Bpk. Endro',         'A', 13, 'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'A-14', 'Bpk. Indarto',       'A', 14, 'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'A-15', 'Bpk. Agung Saputra', 'A', 15, 'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'A-16', 'Bpk. Bintar',        'A', 16, 'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'B-1',  'Bpk. Budi S.',       'B', 1,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'B-2',  'Bpk. Rejo W.',       'B', 2,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'B-3',  'Ibu Anna M. T.',     'B', 3,  'WARGA', TRUE, 'JANDA'),
  (gen_random_uuid(), 'B-4',  'Ibu Debora Erna',    'B', 4,  'WARGA', TRUE, 'JANDA'),
  (gen_random_uuid(), 'B-5',  'Budi Setiawan',      'B', 5,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'B-7',  'Bpk. Dwiyanto',      'B', 7,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'B-8',  'Bpk. Sakun A.',      'B', 8,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'C-2',  'Bpk. Setyobudi',     'C', 2,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'C-4',  'Bpk. Fajar',         'C', 4,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'C-5',  'Bpk. Mulyanto',      'C', 5,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'C-6',  'Ibu Rita Hendri',    'C', 6,  'WARGA', TRUE, 'JANDA'),
  (gen_random_uuid(), 'C-7',  'Bpk. Yustinus',      'C', 7,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'C-8',  'Bp. Iksan',          'C', 8,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'D-2',  'Bpk. Dona',          'D', 2,  'WARGA', TRUE, 'NORMAL'),
  (gen_random_uuid(), 'D-3',  'Bpk. Hendrik',       'D', 3,  'WARGA', TRUE, 'NORMAL')
ON CONFLICT (login_id) DO NOTHING;

-- Verifikasi: harusnya 29 profil aktif
SELECT '=== STEP 0.5 VERIFIKASI ===' AS section;
SELECT COUNT(*) AS total_profil FROM profiles WHERE is_active = TRUE;

-- =====================================================
-- STEP 1: Hapus profil yang TIDAK ADA di spreadsheet asli
-- Login ID asli: A-1, A-2, A-4, A-5, A-6, A-8, A-9, A-10, A-11,
--               A-12, A-13, A-14, A-15, A-16,
--               B-1, B-2, B-3, B-4, B-5, B-7, B-8,
--               C-2, C-4, C-5, C-6, C-7, C-8,
--               D-2, D-3
-- (29 KK real, tidak ada C-1, C-3, D-1, dll)
-- =====================================================
-- Hapus profil yang login_id-nya bukan dari daftar real
DELETE FROM profiles
WHERE login_id NOT IN (
  'A-1','A-2','A-4','A-5','A-6','A-8','A-9','A-10','A-11',
  'A-12','A-13','A-14','A-15','A-16',
  'B-1','B-2','B-3','B-4','B-5','B-7','B-8',
  'C-2','C-4','C-5','C-6','C-7','C-8',
  'D-2','D-3'
)
AND role = 'WARGA';

-- =====================================================
-- STEP 2: UPDATE nama_kk & data lain berdasarkan spreadsheet ASLI
-- Format: ('LOGIN_ID', 'nama_kk_asli', blok, nomor_rumah, no_hp, kategori_tarif)
-- =====================================================
UPDATE profiles SET
  nama_kk = v_data.nama,
  blok = v_data.blok,
  nomor_rumah = v_data.nomor,
  no_hp = NULLIF(v_data.no_hp, ''),
  kategori_tarif = v_data.kategori
FROM (VALUES
  ('A-1',  'Bpk. Kurniawan',     'A', 1,  '',          'NORMAL'),
  ('A-2',  'Bpk. Amar Marruf',   'A', 2,  '',          'NORMAL'),
  ('A-4',  'Bpk. Andi H.',       'A', 4,  '',          'NORMAL'),
  ('A-5',  'Bpk. B. Widodo',     'A', 5,  '',          'NORMAL'),
  ('A-6',  'Bpk. Edi Santosa',   'A', 6,  '',          'NORMAL'),
  ('A-8',  'Mas Rizky',          'A', 8,  '',          'NORMAL'),
  ('A-9',  'Bpk. Bagus',         'A', 9,  '',          'NORMAL'),
  ('A-10', 'Bpk. Raden',         'A', 10, '',          'NORMAL'),
  ('A-11', 'Bpk. Kelik',         'A', 11, '',          'NORMAL'),
  ('A-12', 'Bpk. Awey',          'A', 12, '',          'NORMAL'),
  ('A-13', 'Bpk. Endro',         'A', 13, '',          'NORMAL'),
  ('A-14', 'Bpk. Indarto',       'A', 14, '',          'NORMAL'),
  ('A-15', 'Bpk. Agung Saputra', 'A', 15, '',          'NORMAL'),
  ('A-16', 'Bpk. Bintar',        'A', 16, '',          'NORMAL'),
  ('B-1',  'Bpk. Budi S.',       'B', 1,  '',          'NORMAL'),
  ('B-2',  'Bpk. Rejo W.',       'B', 2,  '',          'NORMAL'),
  ('B-3',  'Ibu Anna M. T.',     'B', 3,  '',          'JANDA'),
  ('B-4',  'Ibu Debora Erna',    'B', 4,  '',          'JANDA'),
  ('B-5',  'Budi Setiawan',      'B', 5,  '6289682820207', 'NORMAL'),
  ('B-7',  'Bpk. Dwiyanto',      'B', 7,  '',          'NORMAL'),
  ('B-8',  'Bpk. Sakun A.',      'B', 8,  '',          'NORMAL'),
  ('C-2',  'Bpk. Setyobudi',     'C', 2,  '',          'NORMAL'),
  ('C-4',  'Bpk. Fajar',         'C', 4,  '',          'NORMAL'),
  ('C-5',  'Bpk. Mulyanto',      'C', 5,  '',          'NORMAL'),
  ('C-6',  'Ibu Rita Hendri',    'C', 6,  '',          'JANDA'),
  ('C-7',  'Bpk. Yustinus',      'C', 7,  '',          'NORMAL'),
  ('C-8',  'Bp. Iksan',          'C', 8,  '',          'NORMAL'),
  ('D-2',  'Bpk. Dona',          'D', 2,  '',          'NORMAL'),
  ('D-3',  'Bpk. Hendrik',       'D', 3,  '',          'NORMAL')
) AS v_data(login_id, nama, blok, nomor, no_hp, kategori)
WHERE profiles.login_id = v_data.login_id;

-- =====================================================
-- STEP 3: Set role pengurus (Ketua, Bendahara, Sekretaris)
-- =====================================================
UPDATE profiles SET role = 'KETUA_RT'   WHERE login_id = 'B-1';
UPDATE profiles SET role = 'BENDAHARA'  WHERE login_id = 'C-2';
UPDATE profiles SET role = 'SEKRETARIS' WHERE login_id = 'B-5';

-- =====================================================
-- STEP 4: Verifikasi
-- =====================================================
SELECT 'KK_TOTAL' AS info, COUNT(*) AS total
FROM profiles WHERE is_active = TRUE;

SELECT 'PROFIL_REAL' AS info, login_id, nama_kk, blok, nomor_rumah, role, kategori_tarif
FROM profiles
WHERE is_active = TRUE
ORDER BY blok, nomor_rumah, login_id;

SELECT 'PROFIL_FAKE_CHECK' AS info, login_id, nama_kk
FROM profiles
WHERE login_id NOT IN (
  'A-1','A-2','A-4','A-5','A-6','A-8','A-9','A-10','A-11',
  'A-12','A-13','A-14','A-15','A-16',
  'B-1','B-2','B-3','B-4','B-5','B-7','B-8',
  'C-2','C-4','C-5','C-6','C-7','C-8',
  'D-2','D-3'
);

-- =====================================================
-- STEP 5: Hapus profil PENGURUS-* (fake pengurus)
-- Re-map dulu semua referensi FK ke profile real
-- =====================================================

-- 5.1: Cek profil fake pengurus (PENGURUS-*) yang akan dihapus
SELECT 'FAKE_PENGURUS' AS info, login_id, nama_kk, role
FROM profiles
WHERE login_id LIKE 'PENGURUS-%';

-- 5.2: Cek referensi FK ke PENGURUS-* di semua tabel
SELECT '--- REFERENSI KE PENGURUS-* (harus 0 sebelum hapus) ---' AS notice;
SELECT 'iuran_tagihan'     AS tabel, COUNT(*) AS refs FROM iuran_tagihan    WHERE profile_id IN (SELECT id FROM profiles WHERE login_id LIKE 'PENGURUS-%')
UNION ALL
SELECT 'iuran_pembayaran',  COUNT(*) FROM iuran_pembayaran  WHERE profile_id IN (SELECT id FROM profiles WHERE login_id LIKE 'PENGURUS-%')
UNION ALL
SELECT 'jimpitan_tarif',    COUNT(*) FROM jimpitan_tarif    WHERE profile_id IN (SELECT id FROM profiles WHERE login_id LIKE 'PENGURUS-%')
UNION ALL
SELECT 'jimpitan_tagihan',  COUNT(*) FROM jimpitan_tagihan  WHERE profile_id IN (SELECT id FROM profiles WHERE login_id LIKE 'PENGURUS-%')
UNION ALL
SELECT 'jadwal_ronda',      COUNT(*) FROM jadwal_ronda      WHERE penjaga_profile_id IN (SELECT id FROM profiles WHERE login_id LIKE 'PENGURUS-%')
UNION ALL
SELECT 'ronda_swap_asli',   COUNT(*) FROM ronda_swap        WHERE profile_asli_id IN (SELECT id FROM profiles WHERE login_id LIKE 'PENGURUS-%')
UNION ALL
SELECT 'ronda_swap_pengganti', COUNT(*) FROM ronda_swap     WHERE profile_pengganti_id IN (SELECT id FROM profiles WHERE login_id LIKE 'PENGURUS-%')
UNION ALL
SELECT 'ronda_attendance',  COUNT(*) FROM ronda_attendance  WHERE profile_id IN (SELECT id FROM profiles WHERE login_id LIKE 'PENGURUS-%')
UNION ALL
SELECT 'jimpitan_sesi_petugas', COUNT(*) FROM jimpitan_sesi WHERE profile_id_petugas IN (SELECT id FROM profiles WHERE login_id LIKE 'PENGURUS-%')
UNION ALL
SELECT 'jimpitan_sesi_acd', COUNT(*) FROM jimpitan_sesi     WHERE acd_by_profile_id IN (SELECT id FROM profiles WHERE login_id LIKE 'PENGURUS-%')
UNION ALL
SELECT 'jimpitan_detail',   COUNT(*) FROM jimpitan_detail   WHERE profile_id IN (SELECT id FROM profiles WHERE login_id LIKE 'PENGURUS-%')
ORDER BY tabel;

-- 5.3: Re-map referensi ke profile real
-- Mapping:
--   PENGURUS-B1   -> B-1   (Bpk. Budi S., KETUA_RT)
--   PENGURUS-BEND -> C-2   (Bpk. Setyobudi, BENDAHARA)
--   PENGURUS-SEKR -> B-5   (Budi Setiawan, SEKRETARIS)
--   PENGURUS-SA   -> B-1   (Super Admin fallback ke Ketua RT)
DO $$
DECLARE
  v_id_pengurus_b1   UUID;
  v_id_pengurus_bend UUID;
  v_id_pengurus_sekr UUID;
  v_id_pengurus_sa   UUID;
  v_id_b1 UUID;
  v_id_c2 UUID;
  v_id_b5 UUID;
BEGIN
  -- Ambil ID masing-masing
  SELECT id INTO v_id_pengurus_b1   FROM profiles WHERE login_id = 'PENGURUS-B1';
  SELECT id INTO v_id_pengurus_bend FROM profiles WHERE login_id = 'PENGURUS-BEND';
  SELECT id INTO v_id_pengurus_sekr FROM profiles WHERE login_id = 'PENGURUS-SEKR';
  SELECT id INTO v_id_pengurus_sa   FROM profiles WHERE login_id = 'PENGURUS-SA';
  SELECT id INTO v_id_b1 FROM profiles WHERE login_id = 'B-1';
  SELECT id INTO v_id_c2 FROM profiles WHERE login_id = 'C-2';
  SELECT id INTO v_id_b5 FROM profiles WHERE login_id = 'B-5';

  -- Re-map iuran_tagihan.profile_id
  IF v_id_pengurus_b1   IS NOT NULL AND v_id_b1 IS NOT NULL THEN
    UPDATE iuran_tagihan    SET profile_id = v_id_b1 WHERE profile_id = v_id_pengurus_b1;
    UPDATE iuran_pembayaran SET profile_id = v_id_b1 WHERE profile_id = v_id_pengurus_b1;
    UPDATE jimpitan_tarif   SET profile_id = v_id_b1 WHERE profile_id = v_id_pengurus_b1;
    UPDATE jimpitan_tagihan SET profile_id = v_id_b1 WHERE profile_id = v_id_pengurus_b1;
    UPDATE jadwal_ronda     SET penjaga_profile_id = v_id_b1 WHERE penjaga_profile_id = v_id_pengurus_b1;
    UPDATE ronda_swap       SET profile_asli_id = v_id_b1 WHERE profile_asli_id = v_id_pengurus_b1;
    UPDATE ronda_swap       SET profile_pengganti_id = v_id_b1 WHERE profile_pengganti_id = v_id_pengurus_b1;
    UPDATE ronda_attendance SET profile_id = v_id_b1 WHERE profile_id = v_id_pengurus_b1;
    UPDATE jimpitan_sesi    SET profile_id_petugas = v_id_b1 WHERE profile_id_petugas = v_id_pengurus_b1;
    UPDATE jimpitan_sesi    SET acd_by_profile_id  = v_id_b1 WHERE acd_by_profile_id  = v_id_pengurus_b1;
    UPDATE jimpitan_detail  SET profile_id = v_id_b1 WHERE profile_id = v_id_pengurus_b1;
  END IF;

  IF v_id_pengurus_bend IS NOT NULL AND v_id_c2 IS NOT NULL THEN
    UPDATE iuran_tagihan    SET profile_id = v_id_c2 WHERE profile_id = v_id_pengurus_bend;
    UPDATE iuran_pembayaran SET profile_id = v_id_c2 WHERE profile_id = v_id_pengurus_bend;
    UPDATE jimpitan_tarif   SET profile_id = v_id_c2 WHERE profile_id = v_id_pengurus_bend;
    UPDATE jimpitan_tagihan SET profile_id = v_id_c2 WHERE profile_id = v_id_pengurus_bend;
    UPDATE jadwal_ronda     SET penjaga_profile_id = v_id_c2 WHERE penjaga_profile_id = v_id_pengurus_bend;
    UPDATE ronda_swap       SET profile_asli_id = v_id_c2 WHERE profile_asli_id = v_id_pengurus_bend;
    UPDATE ronda_swap       SET profile_pengganti_id = v_id_c2 WHERE profile_pengganti_id = v_id_pengurus_bend;
    UPDATE ronda_attendance SET profile_id = v_id_c2 WHERE profile_id = v_id_pengurus_bend;
    UPDATE jimpitan_sesi    SET profile_id_petugas = v_id_c2 WHERE profile_id_petugas = v_id_pengurus_bend;
    UPDATE jimpitan_sesi    SET acd_by_profile_id  = v_id_c2 WHERE acd_by_profile_id  = v_id_pengurus_bend;
    UPDATE jimpitan_detail  SET profile_id = v_id_c2 WHERE profile_id = v_id_pengurus_bend;
  END IF;

  IF v_id_pengurus_sekr IS NOT NULL AND v_id_b5 IS NOT NULL THEN
    UPDATE iuran_tagihan    SET profile_id = v_id_b5 WHERE profile_id = v_id_pengurus_sekr;
    UPDATE iuran_pembayaran SET profile_id = v_id_b5 WHERE profile_id = v_id_pengurus_sekr;
    UPDATE jimpitan_tarif   SET profile_id = v_id_b5 WHERE profile_id = v_id_pengurus_sekr;
    UPDATE jimpitan_tagihan SET profile_id = v_id_b5 WHERE profile_id = v_id_pengurus_sekr;
    UPDATE jadwal_ronda     SET penjaga_profile_id = v_id_b5 WHERE penjaga_profile_id = v_id_pengurus_sekr;
    UPDATE ronda_swap       SET profile_asli_id = v_id_b5 WHERE profile_asli_id = v_id_pengurus_sekr;
    UPDATE ronda_swap       SET profile_pengganti_id = v_id_b5 WHERE profile_pengganti_id = v_id_pengurus_sekr;
    UPDATE ronda_attendance SET profile_id = v_id_b5 WHERE profile_id = v_id_pengurus_sekr;
    UPDATE jimpitan_sesi    SET profile_id_petugas = v_id_b5 WHERE profile_id_petugas = v_id_pengurus_sekr;
    UPDATE jimpitan_sesi    SET acd_by_profile_id  = v_id_b5 WHERE acd_by_profile_id  = v_id_pengurus_sekr;
    UPDATE jimpitan_detail  SET profile_id = v_id_b5 WHERE profile_id = v_id_pengurus_sekr;
  END IF;

  IF v_id_pengurus_sa IS NOT NULL AND v_id_b1 IS NOT NULL THEN
    -- SA fallback ke B-1
    UPDATE iuran_tagihan    SET profile_id = v_id_b1 WHERE profile_id = v_id_pengurus_sa;
    UPDATE iuran_pembayaran SET profile_id = v_id_b1 WHERE profile_id = v_id_pengurus_sa;
    UPDATE jimpitan_tarif   SET profile_id = v_id_b1 WHERE profile_id = v_id_pengurus_sa;
    UPDATE jimpitan_tagihan SET profile_id = v_id_b1 WHERE profile_id = v_id_pengurus_sa;
    UPDATE jadwal_ronda     SET penjaga_profile_id = v_id_b1 WHERE penjaga_profile_id = v_id_pengurus_sa;
    UPDATE ronda_swap       SET profile_asli_id = v_id_b1 WHERE profile_asli_id = v_id_pengurus_sa;
    UPDATE ronda_swap       SET profile_pengganti_id = v_id_b1 WHERE profile_pengganti_id = v_id_pengurus_sa;
    UPDATE ronda_attendance SET profile_id = v_id_b1 WHERE profile_id = v_id_pengurus_sa;
    UPDATE jimpitan_sesi    SET profile_id_petugas = v_id_b1 WHERE profile_id_petugas = v_id_pengurus_sa;
    UPDATE jimpitan_sesi    SET acd_by_profile_id  = v_id_b1 WHERE acd_by_profile_id  = v_id_pengurus_sa;
    UPDATE jimpitan_detail  SET profile_id = v_id_b1 WHERE profile_id = v_id_pengurus_sa;
  END IF;
END $$;

-- 5.4: Hapus profil PENGURUS-*
DELETE FROM profiles WHERE login_id LIKE 'PENGURUS-%';

-- 5.5: Verifikasi akhir
SELECT 'PROFIL_FINAL' AS info, login_id, nama_kk, role
FROM profiles
WHERE is_active = TRUE
  AND (login_id LIKE 'PENGURUS-%' OR role IN ('KETUA_RT','BENDAHARA','SEKRETARIS'))
ORDER BY login_id;

-- 5.6: Re-assert role pengurus (idempotent, kalau STEP 3 ke-skip)
-- DIAGNOSTIC DULU: cek keberadaan B-1, C-2 dan constraint role
SELECT 'DIAG_BEFORE' AS info, login_id, nama_kk, role, is_active
FROM profiles
WHERE login_id IN ('B-1','B-5','C-2')
ORDER BY login_id;

-- Cek CHECK constraint di kolom role (kalau ada, mungkin reject value baru)
SELECT 'DIAG_ROLE_CONSTRAINT' AS info,
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'profiles'::regclass
  AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%role%';

-- Coba UPDATE dan laporkan berapa row ke-affect
DO $$
DECLARE
  v_updated_b1 INT;
  v_updated_c2 INT;
  v_updated_b5 INT;
  v_exists_b1 BOOLEAN;
  v_exists_c2 BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM profiles WHERE login_id = 'B-1') INTO v_exists_b1;
  SELECT EXISTS(SELECT 1 FROM profiles WHERE login_id = 'C-2') INTO v_exists_c2;

  IF NOT v_exists_b1 THEN
    RAISE NOTICE 'B-1 TIDAK ADA di tabel profiles! Perlu INSERT dulu.';
  END IF;
  IF NOT v_exists_c2 THEN
    RAISE NOTICE 'C-2 TIDAK ADA di tabel profiles! Perlu INSERT dulu.';
  END IF;

  UPDATE profiles SET role = 'KETUA_RT'   WHERE login_id = 'B-1';
  GET DIAGNOSTICS v_updated_b1 = ROW_COUNT;
  RAISE NOTICE 'UPDATE B-1 -> KETUA_RT: % rows affected', v_updated_b1;

  UPDATE profiles SET role = 'BENDAHARA'  WHERE login_id = 'C-2';
  GET DIAGNOSTICS v_updated_c2 = ROW_COUNT;
  RAISE NOTICE 'UPDATE C-2 -> BENDAHARA: % rows affected', v_updated_c2;

  UPDATE profiles SET role = 'SEKRETARIS' WHERE login_id = 'B-5';
  GET DIAGNOSTICS v_updated_b5 = ROW_COUNT;
  RAISE NOTICE 'UPDATE B-5 -> SEKRETARIS: % rows affected', v_updated_b5;
END $$;

-- 5.7: Verifikasi FINAL setelah re-assert (semua pengurus harus nongol)
SELECT 'DIAG_AFTER' AS info, login_id, nama_kk, role, is_active
FROM profiles
WHERE login_id IN ('B-1','B-5','C-2')
ORDER BY login_id;

-- 5.8: TOTAL profil
SELECT 'TOTAL_PROFIL' AS info, COUNT(*) AS total FROM profiles WHERE is_active = TRUE;
SELECT 'TOTAL_WARGA'  AS info, COUNT(*) AS total FROM profiles WHERE is_active = TRUE AND role = 'WARGA';
SELECT 'TOTAL_PENGURUS' AS info, COUNT(*) AS total FROM profiles WHERE is_active = TRUE AND role IN ('KETUA_RT','BENDAHARA','SEKRETARIS');

-- 5.9: Summary lengkap
SELECT '=== SUMMARY FINAL ===' AS section;
SELECT
  (SELECT COUNT(*) FROM profiles WHERE is_active=TRUE)                                                AS aktif_total,
  (SELECT COUNT(*) FROM profiles WHERE is_active=TRUE AND role='WARGA')                                AS warga,
  (SELECT COUNT(*) FROM profiles WHERE is_active=TRUE AND role='KETUA_RT')                            AS ketua_rt,
  (SELECT COUNT(*) FROM profiles WHERE is_active=TRUE AND role='BENDAHARA')                           AS bendahara,
  (SELECT COUNT(*) FROM profiles WHERE is_active=TRUE AND role='SEKRETARIS')                          AS sekretaris,
  (SELECT COUNT(*) FROM profiles WHERE login_id LIKE 'PENGURUS-%')                                    AS fake_pengurus_sisa;