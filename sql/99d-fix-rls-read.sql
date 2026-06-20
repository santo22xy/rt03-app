-- =====================================================
-- 99d: Pastikan RLS policy read untuk semua tabel
-- Supaya anon key bisa baca data
-- =====================================================

-- Cek policy yg ada
SELECT '=== EXISTING POLICIES ===' AS section;
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles','jadwal_ronda','ronda_swap','ronda_attendance','ronda_kelompok','jimpitan_tarif','jimpitan_tagihan','jimpitan_sesi','jimpitan_detail','iuran_tarif','iuran_tagihan','iuran_pembayaran','kas_transaksi','app_settings')
ORDER BY tablename, policyname;

-- Policy read all untuk semua tabel (kalau belum ada)
DO $$
DECLARE
  v_table TEXT;
  v_policy_name TEXT;
  v_tables TEXT[] := ARRAY[
    'profiles','jadwal_ronda','ronda_swap','ronda_attendance','ronda_kelompok',
    'jimpitan_tarif','jimpitan_tagihan','jimpitan_sesi','jimpitan_detail',
    'iuran_tarif','iuran_tagihan','iuran_pembayaran',
    'kas_transaksi','app_settings'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    v_policy_name := v_table || '_read_all';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_table AND policyname = v_policy_name
    ) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (TRUE)', v_policy_name, v_table);
      RAISE NOTICE 'Created policy % on %', v_policy_name, v_table;
    ELSE
      RAISE NOTICE 'Policy % on % already exists', v_policy_name, v_table;
    END IF;
  END LOOP;
END $$;

-- Verifikasi ulang
SELECT '=== POLICIES AFTER FIX ===' AS section;
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd = 'SELECT'
ORDER BY tablename, policyname;
