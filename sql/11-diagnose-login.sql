-- =====================================================
-- Diagnostik: cek format login_id dan pin_hash
-- =====================================================

-- 1) Lihat semua warga & format login_id-nya
SELECT login_id, nama_kk, blok, nomor_rumah, 
       (pin_hash IS NOT NULL) as has_pin,
       length(pin_hash) as hash_len
FROM profiles 
WHERE role = 'WARGA' 
ORDER BY login_id;

-- 2) Cek apakah ada login_id 'A-1' (dengan strip)
SELECT count(*) as jumlah_a_strip FROM profiles WHERE login_id = 'A-1';

-- 3) Cek apakah ada login_id 'A1' (tanpa strip)
SELECT count(*) as jumlah_a_nostrip FROM profiles WHERE login_id = 'A1';

-- 4) Cek signature function set_warga_pin
SELECT p.proname, 
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as returns
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace 
  AND p.proname IN ('set_warga_pin', 'verify_warga_pin', 'get_warga_from_session', 'create_warga_session')
ORDER BY p.proname;

-- 5) Test verify_warga_pin langsung
SELECT verify_warga_pin('A-1', '123456') as test_verify_a1_strip;
SELECT verify_warga_pin('A1', '123456') as test_verify_a1_nostrip;
