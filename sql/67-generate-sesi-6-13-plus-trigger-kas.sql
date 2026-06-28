-- =====================================================
-- SQL 67: Generate sesi 6 & 13 Juni dari kas_transaksi
--         + tambah trigger ACC → kas_transaksi (auto buku kas)
--
-- Konteks:
--   User input iuran ronda 6 & 13 Juni via /dashboard/kas pada tanggal 16.
--   Itu nongol di buku kas, tapi TIDAK buat jimpitan_sesi, jadi TIDAK
--   nongol di dashboard "Iuran Bulan Ini" (yg sumbernya jimpitan_sesi).
--
-- Plan:
--   A. Cek data kas_transaksi untuk ronda 6 & 13 Juni (by catatan)
--   B. Insert jimpitan_sesi untuk tgl 6 & 13 (idempotent)
--   C. Insert jimpitan_detail dari kas_transaksi (idempotent via unique index)
--   D. Sync total + set APPROVED (pengurus → langsung ACC)
--   E. Extend trigger on_jimpitan_sesi_approved → INSERT ke kas_transaksi juga
--   F. Backfill kas_transaksi untuk sesi 20 Juni (sudah APPROVED sebelumnya)
--   G. Verifikasi
-- =====================================================

-- =====================================================
-- A. Data kas_transaksi untuk ronda 6 & 13 Juni
-- =====================================================
SELECT '=== A.1 Ronda 6 Juni (input tgl 16, by catatan) ===' AS section;
SELECT
  tanggal, login_id, nominal, uraian, catatan
FROM kas_transaksi
WHERE tipe = 'MASUK'
  AND kategori = 'IURAN_BULANAN'
  AND catatan LIKE '%06 Juni 2026%'
ORDER BY login_id;

SELECT '=== A.2 Ronda 13 Juni (input tgl 16, by catatan) ===' AS section;
SELECT
  tanggal, login_id, nominal, uraian, catatan
FROM kas_transaksi
WHERE tipe = 'MASUK'
  AND kategori = 'IURAN_BULANAN'
  AND catatan LIKE '%13 Juni 2026%'
ORDER BY login_id;

SELECT '=== A.3 Summary per tanggal sesi ===' AS section;
SELECT
  CASE
    WHEN catatan LIKE '%06 Juni 2026%' THEN '2026-06-06'
    WHEN catatan LIKE '%13 Juni 2026%' THEN '2026-06-13'
    ELSE 'Lainnya'
  END AS tanggal_sesi,
  COUNT(*) AS jumlah_kk,
  SUM(nominal) AS total_nominal
FROM kas_transaksi
WHERE tipe = 'MASUK' AND kategori = 'IURAN_BULANAN'
  AND (catatan LIKE '%06 Juni 2026%' OR catatan LIKE '%13 Juni 2026%')
GROUP BY 1
ORDER BY 1;

-- =====================================================
-- B. Insert jimpitan_sesi untuk 6 & 13 Juni (idempotent)
-- Pakai pengurus ID = profile user (placeholder; user perlu ganti kalau beda)
-- =====================================================
DO $$
DECLARE
  v_pengurus_id UUID;
  v_pengurus_nama TEXT;
  v_pengurus_blok TEXT;
BEGIN
  -- Cari ID bendahara aktif (ambil yg pertama kalau ada beberapa)
  SELECT id, nama_kk, blok INTO v_pengurus_id, v_pengurus_nama, v_pengurus_blok
  FROM profiles
  WHERE role = 'BENDAHARA' AND is_active = TRUE
  ORDER BY nama_kk
  LIMIT 1;

  IF v_pengurus_id IS NULL THEN
    -- Fallback: ambil pengurus mana saja
    SELECT id, nama_kk, blok INTO v_pengurus_id, v_pengurus_nama, v_pengurus_blok
    FROM profiles
    WHERE role IN ('KETUA_RT', 'BENDAHARA', 'SEKRETARIS') AND is_active = TRUE
    ORDER BY CASE role WHEN 'BENDAHARA' THEN 1 WHEN 'KETUA_RT' THEN 2 ELSE 3 END
    LIMIT 1;
  END IF;

  RAISE NOTICE 'Pengurus pembuat sesi: % (%)', v_pengurus_nama, v_pengurus_id;

  -- Sesi 6 Juni
  IF NOT EXISTS (SELECT 1 FROM jimpitan_sesi WHERE tanggal = '2026-06-06') THEN
    INSERT INTO jimpitan_sesi (
      tanggal, kelompok_id, waktu_mulai, waktu_selesai,
      input_by, nama_inputter_snapshot, blok_inputter_snapshot,
      status, approved_by, approved_at,
      catatan
    )
    VALUES (
      '2026-06-06', 'K1', NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days',
      v_pengurus_id,
      v_pengurus_nama || ' (Pengurus)', v_pengurus_blok,
      'APPROVED', v_pengurus_id, NOW() - INTERVAL '14 days',
      'Rekonstruksi dari kas_transaksi 16 Juni (input manual backdate)'
    );
  END IF;

  -- Sesi 13 Juni
  IF NOT EXISTS (SELECT 1 FROM jimpitan_sesi WHERE tanggal = '2026-06-13') THEN
    INSERT INTO jimpitan_sesi (
      tanggal, kelompok_id, waktu_mulai, waktu_selesai,
      input_by, nama_inputter_snapshot, blok_inputter_snapshot,
      status, approved_by, approved_at,
      catatan
    )
    VALUES (
      '2026-06-13', 'K2', NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days',
      v_pengurus_id,
      v_pengurus_nama || ' (Pengurus)', v_pengurus_blok,
      'APPROVED', v_pengurus_id, NOW() - INTERVAL '7 days',
      'Rekonstruksi dari kas_transaksi 16 Juni (input manual backdate)'
    );
  END IF;
END;
$$;

-- =====================================================
-- C. Insert jimpitan_detail dari kas_transaksi untuk 6 & 13 Juni
-- Idempotent: cek existing dulu per (sesi_id, profile_id)
-- =====================================================
DO $$
DECLARE
  v_sesi_6 UUID;
  v_sesi_13 UUID;
  v_pengurus_id UUID;
  v_inserted_6 INT := 0;
  v_inserted_13 INT := 0;
BEGIN
  SELECT id INTO v_sesi_6 FROM jimpitan_sesi WHERE tanggal = '2026-06-06' LIMIT 1;
  SELECT id INTO v_sesi_13 FROM jimpitan_sesi WHERE tanggal = '2026-06-13' LIMIT 1;
  SELECT id INTO v_pengurus_id FROM profiles WHERE role='BENDAHARA' AND is_active=TRUE LIMIT 1;

  -- Detail 6 Juni
  IF v_sesi_6 IS NOT NULL THEN
    INSERT INTO jimpitan_detail (
      sesi_id, profile_id, login_id, nama_kk_snapshot, nominal, status_bayar, is_bayar, created_at
    )
    SELECT
      v_sesi_6,
      p.id,
      p.login_id,
      p.nama_kk,
      kt.nominal::INT,
      'LUNAS',
      TRUE,
      kt.created_at
    FROM kas_transaksi kt
    JOIN profiles p ON p.login_id = kt.login_id
    WHERE kt.tipe = 'MASUK'
      AND kt.kategori = 'IURAN_BULANAN'
      AND kt.catatan LIKE '%06 Juni 2026%'
      AND NOT EXISTS (
        SELECT 1 FROM jimpitan_detail jd
        WHERE jd.sesi_id = v_sesi_6 AND jd.profile_id = p.id
      );
    GET DIAGNOSTICS v_inserted_6 = ROW_COUNT;
  END IF;

  -- Detail 13 Juni
  IF v_sesi_13 IS NOT NULL THEN
    INSERT INTO jimpitan_detail (
      sesi_id, profile_id, login_id, nama_kk_snapshot, nominal, status_bayar, is_bayar, created_at
    )
    SELECT
      v_sesi_13,
      p.id,
      p.login_id,
      p.nama_kk,
      kt.nominal::INT,
      'LUNAS',
      TRUE,
      kt.created_at
    FROM kas_transaksi kt
    JOIN profiles p ON p.login_id = kt.login_id
    WHERE kt.tipe = 'MASUK'
      AND kt.kategori = 'IURAN_BULANAN'
      AND kt.catatan LIKE '%13 Juni 2026%'
      AND NOT EXISTS (
        SELECT 1 FROM jimpitan_detail jd
        WHERE jd.sesi_id = v_sesi_13 AND jd.profile_id = p.id
      );
    GET DIAGNOSTICS v_inserted_13 = ROW_COUNT;
  END IF;

  RAISE NOTICE 'Detail inserted: 6 Juni=%, 13 Juni=%', v_inserted_6, v_inserted_13;
END;
$$;

-- =====================================================
-- D. Force recalc total_pendapatan untuk sesi 6 & 13
-- Manual update agar tidak bergantung pada trigger sync_jimpitan_sesi_totals
-- (DB state mungkin tidak punya trigger atau schema drift)
-- =====================================================
UPDATE jimpitan_sesi js SET
  total_pendapatan = COALESCE((
    SELECT SUM(nominal)::INT
    FROM jimpitan_detail jd
    WHERE jd.sesi_id = js.id AND jd.is_bayar = TRUE
  ), 0)
WHERE js.tanggal IN ('2026-06-06', '2026-06-13', '2026-06-20');

-- =====================================================
-- E. Extend trigger on_jimpitan_sesi_approved → INSERT ke kas_transaksi
-- Pakai CREATE OR REPLACE FUNCTION, tambahkan blok INSERT kas_transaksi
-- =====================================================
CREATE OR REPLACE FUNCTION on_jimpitan_sesi_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_periode DATE;
  v_detail RECORD;
  v_tagihan_id UUID;
  v_sesi_id_label TEXT;
  v_kas_external_id TEXT;
  v_kas_exists BOOLEAN;
BEGIN
  -- Hanya proses jika status = APPROVED
  IF NEW.status = 'APPROVED' AND (
    TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'APPROVED'
  ) THEN
    v_periode := DATE_TRUNC('month', NEW.tanggal)::DATE;
    v_sesi_id_label := 'JMP-' || TO_CHAR(NEW.tanggal, 'YYYYMMDD');
    v_kas_external_id := v_sesi_id_label;

    -- 1) Generate iuran_pembayaran (existing logic)
    FOR v_detail IN
      SELECT profile_id, nominal
      FROM jimpitan_detail
      WHERE sesi_id = NEW.id AND is_bayar = TRUE AND nominal > 0
    LOOP
      SELECT id INTO v_tagihan_id
      FROM iuran_tagihan
      WHERE profile_id = v_detail.profile_id
        AND periode_bulan = v_periode;

      IF v_tagihan_id IS NULL THEN
        INSERT INTO iuran_tagihan (profile_id, periode_bulan, login_id, nominal, status)
        SELECT v_detail.profile_id, v_periode, p.login_id, v_detail.nominal, 'BELUM'
        FROM profiles p WHERE p.id = v_detail.profile_id
        ON CONFLICT (profile_id, periode_bulan) DO NOTHING
        RETURNING id INTO v_tagihan_id;

        IF v_tagihan_id IS NULL THEN
          SELECT id INTO v_tagihan_id
          FROM iuran_tagihan
          WHERE profile_id = v_detail.profile_id
            AND periode_bulan = v_periode;
        END IF;
      END IF;

      IF v_tagihan_id IS NOT NULL THEN
        DELETE FROM iuran_pembayaran
        WHERE profile_id = v_detail.profile_id
          AND bukti_ref = v_sesi_id_label;

        INSERT INTO iuran_pembayaran (
          tagihan_id, profile_id, login_id, periode_bulan, nominal, metode, sumber, bukti_ref, catatan, created_by, confirmed
        )
        SELECT
          v_tagihan_id, v_detail.profile_id, p.login_id, v_periode, v_detail.nominal,
          'JIMPITAN', 'JIMPITAN', v_sesi_id_label,
          'Jimpitan ' || TO_CHAR(NEW.tanggal, 'DD Month YYYY'),
          NEW.approved_by, TRUE
        FROM profiles p WHERE p.id = v_detail.profile_id;
      END IF;
    END LOOP;

    -- 2) FIX BARU: INSERT agregat ke kas_transaksi (buku kas)
    -- Tanggal pakai tanggal sesi (bukan tanggal ACC)
    -- Idempotent via trx_id_external
    SELECT EXISTS (
      SELECT 1 FROM kas_transaksi WHERE trx_id_external = v_kas_external_id
    ) INTO v_kas_exists;

    IF NOT v_kas_exists AND NEW.total_pendapatan > 0 THEN
      INSERT INTO kas_transaksi (
        trx_id_external, tanggal, tipe, kategori, uraian, nominal,
        metode_bayar, catatan, created_by
      ) VALUES (
        v_kas_external_id, NEW.tanggal, 'MASUK', 'IURAN_BULANAN',
        'Iuran Jimpitan ' || TO_CHAR(NEW.tanggal, 'DD Month YYYY'),
        NEW.total_pendapatan,
        'TUNAI',
        'Auto-generated dari ACC jimpitan sesi ' || v_sesi_id_label,
        NEW.approved_by::TEXT
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger sudah ada, jadi tidak perlu DROP/CREATE ulang

-- =====================================================
-- F. Backfill kas_transaksi untuk sesi 20 Juni (sudah APPROVED)
-- (Panggil trigger logic manual via UPDATE approved_at = approved_at supaya trigger fire)
-- =====================================================
DO $$
DECLARE
  v_sesi_20 RECORD;
BEGIN
  FOR v_sesi_20 IN
    SELECT id FROM jimpitan_sesi
    WHERE tanggal = '2026-06-20' AND status = 'APPROVED'
  LOOP
    -- Re-trigger ACC: ubah status ke APPROVED lagi (sama)
    -- Tapi karena OLD.status = NEW.status = APPROVED, trigger skip.
    -- Jadi kita panggil langsung INSERT kas_transaksi dengan idempotent.
    INSERT INTO kas_transaksi (
      trx_id_external, tanggal, tipe, kategori, uraian, nominal,
      metode_bayar, catatan, created_by
    )
    SELECT
      'JMP-20260620',
      '2026-06-20'::DATE,
      'MASUK',
      'IURAN_BULANAN',
      'Iuran Jimpitan 20 June 2026',
      js.total_pendapatan,
      'TUNAI',
      'Backfill auto-generated dari ACC jimpitan sesi 20 Juni',
      p.nama_kk
    FROM jimpitan_sesi js
    JOIN profiles p ON p.id = js.approved_by
    WHERE js.id = v_sesi_20.id
      AND js.total_pendapatan > 0
      AND NOT EXISTS (
        SELECT 1 FROM kas_transaksi WHERE trx_id_external = 'JMP-20260620'
      );
  END LOOP;
END;
$$;

-- =====================================================
-- G. Verifikasi
-- =====================================================
SELECT '=== G.1 Sesi Juni 2026 ===' AS section;
SELECT
  tanggal, status, total_pendapatan, jumlah_warga_bayar,
  approved_by IS NOT NULL AS has_approver
FROM jimpitan_sesi
WHERE tanggal >= '2026-06-01' AND tanggal < '2026-07-01'
ORDER BY tanggal;

SELECT '=== G.2 iuran_pembayaran Juni ===' AS section;
SELECT
  bukti_ref, COUNT(*) AS rows, SUM(nominal) AS total
FROM iuran_pembayaran
WHERE bukti_ref LIKE 'JMP-202606%'
GROUP BY bukti_ref
ORDER BY bukti_ref;

SELECT '=== G.3 kas_transaksi IURAN_BULANAN Juni (auto-generated) ===' AS section;
SELECT
  tanggal, trx_id_external, nominal, uraian, catatan
FROM kas_transaksi
WHERE tipe = 'MASUK' AND kategori = 'IURAN_BULANAN'
  AND (catatan LIKE '%Auto-generated%' OR catatan LIKE '%Backfill auto-generated%')
  AND tanggal >= '2026-06-01' AND tanggal < '2026-07-01'
ORDER BY tanggal;

SELECT '=== G.4 Dashboard-relevant summary ===' AS section;
SELECT
  (SELECT COUNT(*) FROM jimpitan_sesi WHERE status='APPROVED' AND tanggal BETWEEN '2026-06-01' AND '2026-06-30')
    AS sesi_approved_juni,
  (SELECT COALESCE(SUM(total_pendapatan),0) FROM jimpitan_sesi WHERE status='APPROVED' AND tanggal BETWEEN '2026-06-01' AND '2026-06-30')
    AS dashboard_iuran_bulan_ini,
  (SELECT COUNT(*) FROM iuran_pembayaran WHERE periode_bulan='2026-06-01')
    AS iuran_pembayaran_rows,
  (SELECT COALESCE(SUM(nominal),0) FROM iuran_pembayaran WHERE periode_bulan='2026-06-01')
    AS total_iuran_pembayaran,
  (SELECT COUNT(*) FROM kas_transaksi WHERE tipe='MASUK' AND kategori='IURAN_BULANAN' AND trx_id_external LIKE 'JMP-202606%')
    AS auto_kas_jimpitan_juni,
  (SELECT COALESCE(SUM(nominal),0) FROM kas_transaksi WHERE tipe='MASUK' AND kategori='IURAN_BULANAN' AND trx_id_external LIKE 'JMP-202606%')
    AS total_auto_kas_jimpitan_juni;

-- Reload PostgREST
NOTIFY pgrst, 'reload schema';