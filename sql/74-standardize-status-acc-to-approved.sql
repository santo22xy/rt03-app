-- =====================================================
-- SQL 74: Standardize status ACC → APPROVED + cleanup sesi APPROVED duplikat (total 0)
-- =====================================================

-- A. Lihat semua sesi Juni + status + total
SELECT 'a_before' AS s, tanggal::text, status, total_pendapatan, id
FROM jimpitan_sesi
WHERE tanggal BETWEEN '2026-06-01' AND '2026-06-30'
ORDER BY tanggal, status;

-- B. Update status ACC → APPROVED untuk semua sesi Juni
UPDATE jimpitan_sesi SET status = 'APPROVED'
WHERE status = 'ACC';

-- C. Hapus sesi duplikat yang total_pendapatan = 0 (hasil test INSERT yang gagal)
-- Hanya yang dibuat < 1 jam yang lalu (safety)
DELETE FROM jimpitan_sesi
WHERE tanggal BETWEEN '2026-06-01' AND '2026-06-30'
  AND total_pendapatan = 0
  AND created_at > NOW() - INTERVAL '1 hour';

-- D. Verifikasi akhir
SELECT 'd_after' AS s, tanggal::text, status, total_pendapatan
FROM jimpitan_sesi
WHERE tanggal BETWEEN '2026-06-01' AND '2026-06-30'
ORDER BY tanggal;

-- E. Summary dashboard-relevant
SELECT 'e_summary' AS s,
  (SELECT COUNT(*) FROM jimpitan_sesi WHERE status='APPROVED' AND tanggal BETWEEN '2026-06-01' AND '2026-06-30') AS sesi_approved,
  (SELECT COALESCE(SUM(total_pendapatan),0) FROM jimpitan_sesi WHERE status='APPROVED' AND tanggal BETWEEN '2026-06-01' AND '2026-06-30') AS total_pendapatan;

-- F. Tambah iuran_pembayaran untuk sesi 6 & 13 Juni (dari jimpitan_detail)
-- Pakai INSERT langsung, bukan trigger (karena trigger require UPDATE, tapi status sudah APPROVED sebelumnya)
DO $$
DECLARE
  v_periode DATE := '2026-06-01';
  v_sesi RECORD;
  v_detail RECORD;
  v_tagihan_id UUID;
  v_total_inserted INT := 0;
BEGIN
  FOR v_sesi IN
    SELECT id, tanggal FROM jimpitan_sesi
    WHERE status='APPROVED' AND tanggal BETWEEN '2026-06-01' AND '2026-06-30'
  LOOP
    FOR v_detail IN
      SELECT profile_id, nominal FROM jimpitan_detail
      WHERE sesi_id = v_sesi.id AND is_bayar = TRUE AND nominal > 0
    LOOP
      SELECT id INTO v_tagihan_id FROM iuran_tagihan
      WHERE profile_id = v_detail.profile_id AND periode_bulan = v_periode;

      IF v_tagihan_id IS NULL THEN
        INSERT INTO iuran_tagihan (profile_id, periode_bulan, login_id, nominal, status)
        SELECT v_detail.profile_id, v_periode, p.login_id, v_detail.nominal, 'BELUM'
        FROM profiles p WHERE p.id = v_detail.profile_id
        ON CONFLICT (profile_id, periode_bulan) DO NOTHING
        RETURNING id INTO v_tagihan_id;

        IF v_tagihan_id IS NULL THEN
          SELECT id INTO v_tagihan_id FROM iuran_tagihan
          WHERE profile_id = v_detail.profile_id AND periode_bulan = v_periode;
        END IF;
      END IF;

      IF v_tagihan_id IS NOT NULL THEN
        DELETE FROM iuran_pembayaran
        WHERE profile_id = v_detail.profile_id
          AND bukti_ref = 'JMP-' || TO_CHAR(v_sesi.tanggal, 'YYYYMMDD');

        INSERT INTO iuran_pembayaran (
          tagihan_id, profile_id, login_id, periode_bulan, nominal, metode, sumber, bukti_ref, catatan, confirmed
        )
        SELECT
          v_tagihan_id, v_detail.profile_id, p.login_id, v_periode, v_detail.nominal,
          'JIMPITAN', 'JIMPITAN', 'JMP-' || TO_CHAR(v_sesi.tanggal, 'YYYYMMDD'),
          'Jimpitan ' || TO_CHAR(v_sesi.tanggal, 'DD Month YYYY'),
          TRUE
        FROM profiles p WHERE p.id = v_detail.profile_id;
        v_total_inserted := v_total_inserted + 1;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'iuran_pembayaran inserted: %', v_total_inserted;
END;
$$;

SELECT 'f_after_backfill' AS s,
  COUNT(*) AS rows,
  COALESCE(SUM(nominal),0) AS total
FROM iuran_pembayaran WHERE periode_bulan='2026-06-01';

-- G. Insert kas_transaksi auto-generated untuk 6 & 13 Juni (backfill)
-- Idempotent via trx_id_external
DO $$
DECLARE
  v_sesi RECORD;
  v_inserted INT := 0;
BEGIN
  FOR v_sesi IN
    SELECT id, tanggal, total_pendapatan FROM jimpitan_sesi
    WHERE status='APPROVED' AND tanggal BETWEEN '2026-06-01' AND '2026-06-30'
      AND total_pendapatan > 0
  LOOP
    INSERT INTO kas_transaksi (
      trx_id_external, tanggal, tipe, kategori, uraian, nominal,
      metode_bayar, catatan, created_by
    )
    SELECT
      'JMP-' || TO_CHAR(v_sesi.tanggal, 'YYYYMMDD'),
      v_sesi.tanggal,
      'MASUK',
      'IURAN_BULANAN',
      'Iuran Jimpitan ' || TO_CHAR(v_sesi.tanggal, 'DD Month YYYY'),
      v_sesi.total_pendapatan,
      'TUNAI',
      'Backfill auto-generated dari ACC jimpitan sesi ' || TO_CHAR(v_sesi.tanggal, 'DD Month YYYY'),
      'System'
    WHERE NOT EXISTS (
      SELECT 1 FROM kas_transaksi WHERE trx_id_external = 'JMP-' || TO_CHAR(v_sesi.tanggal, 'YYYYMMDD')
    );
    IF FOUND THEN v_inserted := v_inserted + 1; END IF;
  END LOOP;
  RAISE NOTICE 'kas_transaksi auto-inserted: %', v_inserted;
END;
$$;

SELECT 'g_kas_after' AS s,
  tanggal::text, trx_id_external, nominal, uraian
FROM kas_transaksi
WHERE trx_id_external LIKE 'JMP-202606%'
ORDER BY tanggal;

NOTIFY pgrst, 'reload schema';