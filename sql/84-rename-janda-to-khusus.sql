-- =====================================================
-- SQL 84: Rename kategori_tarif JANDA → KHUSUS
-- Alasan: "Janda" dianggap kurang pantas. Ganti label
--         menjadi "Khusus" (kategori iuran dengan tarif
--         khusus/lebih rendah).
--
-- Pengaruh:
--   1. profiles.kategori_tarif (TEXT, default 'NORMAL')
--      UPDATE semua row dari 'JANDA' → 'KHUSUS'
--   2. CHECK constraint (kalau ada) juga di-update
--   3. iuran_tarif table (kalau ada row JANDA) → KHUSUS
--   4. NOTIFY PostgREST reload schema
--
-- AMAN di-run ulang (idempotent).
-- =====================================================

-- STEP 1: Cek berapa row yang akan di-migrate (preview)
DO $preview$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM profiles
  WHERE kategori_tarif = 'JANDA';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'PREVIEW MIGRASI JANDA → KHUSUS';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'profiles dengan kategori_tarif = JANDA : % row(s)', v_count;
END $preview$;

-- STEP 2: Update profiles.kategori_tarif
UPDATE profiles
SET kategori_tarif = 'KHUSUS'
WHERE kategori_tarif = 'JANDA';

-- STEP 3: Update iuran_tarif (kalau ada row JANDA)
DO $tarif$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'iuran_tarif') THEN
    UPDATE iuran_tarif
    SET kategori_tarif = 'KHUSUS'
    WHERE kategori_tarif = 'JANDA';
    RAISE NOTICE 'iuran_tarif table updated';
  ELSE
    RAISE NOTICE 'iuran_tarif table not found, skip';
  END IF;
END $tarif$;

-- STEP 4: Update CHECK constraint (jika ada yg eksplisit menyebut JANDA)
DO $constr$
DECLARE
  v_rec RECORD;
  v_updated INT := 0;
BEGIN
  FOR v_rec IN
    SELECT conname, conrelid::regclass::text AS tbl
    FROM pg_constraint
    WHERE contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%JANDA%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I',
      v_rec.tbl, v_rec.conname
    );
    RAISE NOTICE 'Dropped CHECK constraint % on %', v_rec.conname, v_rec.tbl;
    v_updated := v_updated + 1;
  END LOOP;
  RAISE NOTICE 'Total CHECK constraints dropped: %', v_updated;
END $constr$;

-- STEP 5: Verifikasi post-migration
DO $verify$
DECLARE
  v_janda INT;
  v_khusus INT;
  v_normal INT;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE kategori_tarif = 'JANDA'),
    COUNT(*) FILTER (WHERE kategori_tarif = 'KHUSUS'),
    COUNT(*) FILTER (WHERE kategori_tarif = 'NORMAL')
  INTO v_janda, v_khusus, v_normal
  FROM profiles;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'POST-MIGRATION VERIFICATION';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'profiles.JANDA : % (expected 0)', v_janda;
  RAISE NOTICE 'profiles.KHUSUS: %', v_khusus;
  RAISE NOTICE 'profiles.NORMAL: %', v_normal;
END $verify$;

-- STEP 6: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- VERIFICATION QUERIES (jalankan terpisah untuk cek)
-- =====================================================
-- SELECT kategori_tarif, COUNT(*)
-- FROM profiles
-- WHERE is_active = true
-- GROUP BY kategori_tarif
-- ORDER BY kategori_tarif;
--
-- SELECT id, login_id, nama_kk, kategori_tarif
-- FROM profiles
-- WHERE kategori_tarif = 'KHUSUS'
-- ORDER BY blok, nomor_rumah
-- LIMIT 10;
