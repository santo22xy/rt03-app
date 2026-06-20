-- =====================================================
-- 30a: PREPARE - Tambah SUPERADMIN ke enum user_role
-- Jalankan TERLEBIH DAHULU sebagai query TERPISAH
-- =====================================================
--
-- PENTING: Di PostgreSQL, ALTER TYPE ... ADD VALUE tidak bisa
-- dipakai di transaksi yang sama dengan query lain yang
-- menggunakan value baru. Jadi file ini HARUS dijalankan
-- sendiri terlebih dahulu.
--
-- Setelah file ini berhasil, baru jalankan 30b-kyc-tables.sql
--
-- Jika kolom profiles.role ternyata TEXT (bukan enum),
-- maka query ini akan print NOTICE "TEXT" dan lewati.
-- Anda tetap bisa langsung jalankan 30b tanpa masalah.
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    -- Enum ada → coba tambah SUPERADMIN
    -- Pakai ALTER TYPE di LUAR transaksi ini dengan EXECUTE
    -- Sayang, EXECUTE di PL/pgSQL tetap dalam transaksi yang sama,
    -- jadi kita pakai approach berbeda: cek dulu apakah sudah ada
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'user_role' AND e.enumlabel = 'SUPERADMIN'
    ) THEN
      -- Tambah dengan try/catch
      BEGIN
        ALTER TYPE user_role ADD VALUE 'SUPERADMIN';
        RAISE NOTICE 'SUCCESS: SUPERADMIN ditambahkan ke enum user_role';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'GAGAL: %. Silakan jalankan manual: ALTER TYPE user_role ADD VALUE ''SUPERADMIN'';', SQLERRM;
      END;
    ELSE
      RAISE NOTICE 'OK: SUPERADMIN sudah ada di enum user_role';
    END IF;
  ELSE
    RAISE NOTICE 'INFO: profiles.role adalah TEXT (bukan enum), skip ALTER TYPE';
  END IF;
END $$;
