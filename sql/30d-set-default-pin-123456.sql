-- =====================================================
-- 30d: SET DEFAULT PIN 123456 UNTUK SEMUA WARGA
-- Jalankan kalau ada warga yang pin_hash-nya NULL
-- (Supaya semua warga bisa login dengan default 123456)
-- =====================================================
--
-- CATATAN: Hash PIN pakai bcrypt via function set_warga_pin.
-- Jadi untuk set PIN 123456, kita panggil function tsb
-- per warga (loop), bukan UPDATE langsung ke kolom.
-- =====================================================

DO $$
DECLARE
  r RECORD;
  v_count INT := 0;
BEGIN
  -- Loop semua warga aktif yang belum punya PIN
  FOR r IN
    SELECT id, login_id, nama_kk
    FROM profiles
    WHERE role = 'WARGA'
      AND is_active = TRUE
      AND (pin_hash IS NULL OR pin_hash = '')
  LOOP
    -- Set PIN via RPC (pakai service_role bypass RLS)
    PERFORM set_warga_pin(p_login_id := r.login_id, p_pin := '123456');
    v_count := v_count + 1;
    RAISE NOTICE 'PIN set untuk % (%)', r.login_id, r.nama_kk;
  END LOOP;

  RAISE NOTICE '=== SELESAI: % warga di-set PIN default 123456 ===', v_count;
END $$;

-- Verifikasi
SELECT
  login_id,
  nama_kk,
  CASE
    WHEN pin_hash IS NULL THEN '❌ NULL'
    WHEN pin_hash = '' THEN '❌ KOSONG'
    ELSE '✓ OK'
  END AS status_pin
FROM profiles
WHERE role = 'WARGA' AND is_active = TRUE
ORDER BY login_id;
