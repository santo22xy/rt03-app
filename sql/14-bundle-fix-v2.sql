-- =====================================================
-- Bundle v2: handle duplicate (blok, nomor_rumah)
-- Jalankan di Supabase SQL Editor
-- =====================================================

-- Insert 5 sample warga — pakai UPSERT (insert or update)
INSERT INTO profiles (id, login_id, nama_kk, blok, nomor_rumah, no_hp, kategori_tarif, role, is_active)
VALUES 
  (gen_random_uuid(), 'A-1', 'Budi Santoso', 'A', '1', '6281234567890', 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'A-2', 'Siti Aminah', 'A', '2', '6281234567891', 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'B-1', 'Joko Widodo', 'B', '1', NULL, 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'B-5', 'Sumiati', 'B', '5', '6281234567892', 'JANDA', 'WARGA', TRUE),
  (gen_random_uuid(), 'C-3', 'Agus Salim', 'C', '3', '6281234567893', 'NORMAL', 'WARGA', FALSE)
ON CONFLICT (login_id) DO UPDATE SET
  nama_kk = EXCLUDED.nama_kk,
  blok = EXCLUDED.blok,
  nomor_rumah = EXCLUDED.nomor_rumah,
  is_active = EXCLUDED.is_active,
  role = EXCLUDED.role
WHERE profiles.role = 'WARGA';  -- hanya update kalau existing juga WARGA

-- Set PIN 123456 untuk semua
SELECT set_warga_pin('A-1', '123456');
SELECT set_warga_pin('A-2', '123456');
SELECT set_warga_pin('B-1', '123456');
SELECT set_warga_pin('B-5', '123456');
SELECT set_warga_pin('C-3', '123456');

-- Verifikasi
SELECT login_id, nama_kk, blok, nomor_rumah, is_active,
       (pin_hash IS NOT NULL) as has_pin
FROM profiles 
WHERE role = 'WARGA' 
ORDER BY login_id;

-- Test verify RPC
SELECT verify_warga_pin('A-1', '123456') as test_A1_benar;
SELECT verify_warga_pin('A-1', '000000') as test_A1_salah;
