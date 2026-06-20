-- =====================================================
-- Bundle: insert sample warga + set PIN + verifikasi
-- Jalankan SEKALIGUS di Supabase SQL Editor
-- =====================================================

-- Drop FK ke auth.users supaya bisa insert tanpa auth user
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Insert 5 sample warga (A-1, A-2, B-1, B-5, C-3)
INSERT INTO profiles (id, login_id, nama_kk, blok, nomor_rumah, no_hp, kategori_tarif, role, is_active)
VALUES 
  (gen_random_uuid(), 'A-1', 'Budi Santoso', 'A', '1', '6281234567890', 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'A-2', 'Siti Aminah', 'A', '2', '6281234567891', 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'B-1', 'Joko Widodo', 'B', '1', NULL, 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'B-5', 'Sumiati', 'B', '5', '6281234567892', 'JANDA', 'WARGA', TRUE),
  (gen_random_uuid(), 'C-3', 'Agus Salim', 'C', '3', '6281234567893', 'NORMAL', 'WARGA', FALSE)
ON CONFLICT (login_id) DO NOTHING;

-- Set PIN 123456 untuk semua sample
SELECT set_warga_pin('A-1', '123456');
SELECT set_warga_pin('A-2', '123456');
SELECT set_warga_pin('B-1', '123456');
SELECT set_warga_pin('B-5', '123456');
SELECT set_warga_pin('C-3', '123456');

-- =====================================================
-- VERIFIKASI (3 baris di bawah ini akan menunjukkan status)
-- =====================================================

-- 1) Cek baris warga
SELECT login_id, nama_kk, blok, nomor_rumah, is_active,
       (pin_hash IS NOT NULL) as has_pin
FROM profiles 
WHERE role = 'WARGA' 
ORDER BY login_id;

-- 2) Test verify_warga_pin RPC langsung di DB
SELECT verify_warga_pin('A-1', '123456') as test_A1_pin_benar;
SELECT verify_warga_pin('A-1', '000000') as test_A1_pin_salah;
