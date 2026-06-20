-- =====================================================
-- Bersihkan & insert ulang sample warga
-- =====================================================

-- Lihat data warga yang ada
SELECT login_id, nama_kk, blok, nomor_rumah, is_active, 
       (pin_hash IS NOT NULL) as has_pin
FROM profiles 
WHERE role = 'WARGA'
ORDER BY blok, nomor_rumah::int;

-- Hapus sample warga yang sudah ada (login_id yang akan kita insert)
DELETE FROM profiles 
WHERE login_id IN ('A-1', 'A-2', 'B-1', 'B-5', 'C-3', 'PENGURUS-B1');

-- (Opsional) Hapus juga KK anggota lama yang reference ke profile_id di atas
-- DELETE FROM kk_anggota 
-- WHERE profile_id IN (SELECT id FROM profiles WHERE login_id IN ('A-1', 'A-2', 'B-1', 'B-5', 'C-3'));

-- Drop FK profiles ke auth.users supaya bisa insert tanpa auth user
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Insert sample warga
INSERT INTO profiles (id, login_id, nama_kk, blok, nomor_rumah, no_hp, kategori_tarif, role, is_active)
VALUES 
  (gen_random_uuid(), 'A-1', 'Budi Santoso', 'A', '1', '6281234567890', 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'A-2', 'Siti Aminah', 'A', '2', '6281234567891', 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'B-1', 'Joko Widodo', 'B', '1', '6281234567891', 'NORMAL', 'WARGA', TRUE),
  (gen_random_uuid(), 'B-5', 'Sumiati', 'B', '5', '6281234567892', 'JANDA', 'WARGA', TRUE),
  (gen_random_uuid(), 'C-3', 'Agus Salim', 'C', '3', '6281234567893', 'NORMAL', 'WARGA', FALSE)
ON CONFLICT (login_id) DO NOTHING;

-- Set PIN 123456
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
-- Catatan: Setelah test selesai, kalau mau FK ketat lagi
-- ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey 
--   FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
-- (Hanya jalan kalau semua profile.id ada di auth.users)
-- =====================================================