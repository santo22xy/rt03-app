-- =====================================================
-- Bundle v5: pgcrypto + drop FK + handle duplicate
-- Jalankan di Supabase SQL Editor
-- =====================================================

-- STEP 1: Enable pgcrypto (WAJIB untuk crypt() & gen_salt())
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- STEP 2: Drop foreign key ke auth.users
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- STEP 3: Insert 5 sample warga (skip otomatis kalau ada konflik)
INSERT INTO profiles (id, login_id, nama_kk, blok, nomor_rumah, no_hp, kategori_tarif, role, is_active)
VALUES 
  (gen_random_uuid(), 'A-1', 'Budi Santoso', 'A', '1', '6281234567890', 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'A-2', 'Siti Aminah', 'A', '2', '6281234567891', 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'B-1', 'Joko Widodo', 'B', '1', NULL, 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'B-5', 'Sumiati', 'B', '5', '6281234567892', 'JANDA', 'WARGA', TRUE),
  (gen_random_uuid(), 'C-3', 'Agus Salim', 'C', '3', '6281234567893', 'NORMAL', 'WARGA', FALSE)
ON CONFLICT DO NOTHING;

-- STEP 4: Set PIN 123456 untuk 4 sample (skip B-1 supaya KETUA_RT tidak tertimpa)
SELECT set_warga_pin('A-1', '123456');
SELECT set_warga_pin('A-2', '123456');
SELECT set_warga_pin('B-5', '123456');
SELECT set_warga_pin('C-3', '123456');

-- =====================================================
-- VERIFIKASI
-- =====================================================

-- 1) Lihat semua profile
SELECT login_id, nama_kk, blok, nomor_rumah, role, is_active,
       (pin_hash IS NOT NULL) as has_pin
FROM profiles 
ORDER BY role DESC, blok, nomor_rumah::int NULLS LAST, login_id;

-- 2) Test verify RPC
SELECT verify_warga_pin('A-1', '123456') as test_A1_benar;
SELECT verify_warga_pin('A-2', '123456') as test_A2_benar;
SELECT verify_warga_pin('A-1', '000000') as test_A1_salah;
SELECT verify_warga_pin('B-5', '123456') as test_B5_benar;
