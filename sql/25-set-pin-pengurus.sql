-- =====================================================
-- 25: Set PIN untuk PENGURUS (B-1, B-5, C-2)
-- Pakai RPC set_warga_pin (sama dengan warga)
-- Supaya pengurus bisa login via WARGA flow + switch ke dashboard
-- =====================================================

-- Cek dulu RPC exists
DO $$
BEGIN
  -- B-1: PIN 111111 (Ketua RT)
  PERFORM set_warga_pin('B-1', '111111');
  RAISE NOTICE 'Set PIN B-1 = 111111';

  -- B-5: PIN 555555 (Sekretaris)
  PERFORM set_warga_pin('B-5', '555555');
  RAISE NOTICE 'Set PIN B-5 = 555555';

  -- C-2: PIN 222222 (Bendahara)
  PERFORM set_warga_pin('C-2', '222222');
  RAISE NOTICE 'Set PIN C-2 = 222222';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error: %', SQLERRM;
END $$;

-- Verifikasi
SELECT '=== PIN SUDAH DISET ===' AS section;
SELECT login_id, nama_kk, role,
  CASE WHEN pin_hash IS NOT NULL THEN '✓ SET' ELSE '✗ KOSONG' END AS pin_status
FROM profiles
WHERE login_id IN ('B-1','B-5','C-2')
ORDER BY login_id;
