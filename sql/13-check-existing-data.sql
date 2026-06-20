-- =====================================================
-- Diagnostik: lihat data existing & constraint
-- =====================================================

-- 1) Semua profile yang ada saat ini
SELECT login_id, nama_kk, blok, nomor_rumah, is_active,
       (pin_hash IS NOT NULL) as has_pin
FROM profiles 
ORDER BY blok, nomor_rumah::int NULLS LAST, login_id;

-- 2) Cek constraint unik
SELECT conname, pg_get_constraintdef(c.oid) as definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public' 
  AND conrelid = 'public.profiles'::regclass
  AND contype IN ('u', 'p')  -- unique or primary key
ORDER BY conname;

-- 3) Hitung jumlah warga
SELECT role, count(*) as jumlah
FROM profiles
GROUP BY role
ORDER BY role;
