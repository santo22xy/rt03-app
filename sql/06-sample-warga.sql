-- =====================================================
-- Fix: insert sample warga tanpa auth user
-- Karena profiles.id reference ke auth.users, kita drop FK sementara
-- Untuk production, users harus dibuat via Dashboard (supaya bisa login)
-- =====================================================

-- Opsi A: Drop FK + insert sample (cepat untuk testing)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Insert sample warga
INSERT INTO profiles (id, login_id, nama_kk, blok, nomor_rumah, no_hp, kategori_tarif, role, is_active)
VALUES 
  (gen_random_uuid(), 'A-1', 'Budi Santoso', 'A', '1', '6281234567890', 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'A-2', 'Siti Aminah', 'A', '2', '6281234567891', 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'B-1', 'Joko Widodo', 'B', '1', NULL, 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'B-5', 'Sumiati', 'B', '5', '6281234567892', 'JANDA', 'WARGA', TRUE),
  (gen_random_uuid(), 'C-3', 'Agus Salim', 'C', '3', '6281234567893', 'NORMAL', 'WARGA', FALSE)
ON CONFLICT (login_id) DO NOTHING;

-- Set PIN 123456 untuk semua warga sample
SELECT set_warga_pin('A-1', '123456');
SELECT set_warga_pin('A-2', '123456');
SELECT set_warga_pin('B-1', '123456');
SELECT set_warga_pin('B-5', '123456');
SELECT set_warga_pin('C-3', '123456');

-- Verifikasi
SELECT login_id, nama_kk, blok, nomor_rumah, kategori_tarif, is_active,
       (pin_hash IS NOT NULL) as has_pin
FROM profiles
WHERE role = 'WARGA'
ORDER BY blok, nomor_rumah::int;

-- =====================================================
-- PENTING: Untuk login via email pengurus (supabase auth),
-- profile ketua harus dibuat via Dashboard Authentication
-- dengan email ketua@rt03.id, lalu di-update role-nya.
-- 
-- Warga sample di atas TIDAK punya auth user,
-- mereka hanya bisa login via Login ID + PIN (loginWarga).
-- Itu yang kita pakai di form login warga.
-- =====================================================