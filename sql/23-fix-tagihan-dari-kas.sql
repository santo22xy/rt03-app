-- =====================================================
-- 23: FIX Tagihan & Ronda dari Sheet Real
-- Run ulang STEP 8 (update tagihan) + tambah data Ronda lengkap
-- =====================================================

-- =====================================================
-- STEP A: Update jimpitan_tagihan dari kas_transaksi
-- Total terbayar = SUM nominal di kas_transaksi
-- Status = LUNAS | SEBAGIAN | BELUM_BAYAR
-- =====================================================
DO $$
DECLARE
  v_login TEXT;
  v_nominal NUMERIC;
  v_tagihan_id UUID;
  v_nominal_tagihan NUMERIC;
BEGIN
  FOR v_login, v_nominal IN
    SELECT
      kt.login_id,
      SUM(kt.nominal)::NUMERIC AS total
    FROM kas_transaksi kt
    WHERE kt.tipe = 'MASUK'
      AND kt.kategori = 'IURAN_BULANAN'
      AND kt.login_id IS NOT NULL
      AND kt.login_id <> ''
    GROUP BY kt.login_id
  LOOP
    -- Cari tagihan untuk login_id ini di Juni 2026
    SELECT t.id, t.nominal_tagihan INTO v_tagihan_id, v_nominal_tagihan
    FROM jimpitan_tagihan t
    WHERE t.login_id = v_login
      AND t.periode_bulan = '2026-06-01';

    IF v_tagihan_id IS NOT NULL THEN
      UPDATE jimpitan_tagihan
      SET total_terbayar = v_nominal,
          status = CASE
            WHEN v_nominal >= v_nominal_tagihan THEN 'LUNAS'
            WHEN v_nominal > 0 THEN 'SEBAGIAN'
            ELSE 'BELUM_BAYAR'
          END,
          updated_at = NOW()
      WHERE id = v_tagihan_id;

      RAISE NOTICE 'Updated % : tagihan=%, dibayar=%, status=%',
        v_login, v_nominal_tagihan, v_nominal,
        CASE
          WHEN v_nominal >= v_nominal_tagihan THEN 'LUNAS'
          WHEN v_nominal > 0 THEN 'SEBAGIAN'
          ELSE 'BELUM_BAYAR'
        END;
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- STEP B: Insert ke iuran_pembayaran (HANYA kalau iuran_tagihan ada)
-- Karena iuran_pembayaran.tagihan_id adalah FK ke iuran_tagihan (bukan jimpitan_tagihan)
-- Untuk data jimpitan, skip insert iuran_pembayaran
-- =====================================================
DO $$
DECLARE
  v_profile_id UUID;
  v_tagihan_id UUID;
  v_login TEXT;
  v_nominal NUMERIC;
  v_tanggal DATE;
  v_inserted INT := 0;
  v_skipped INT := 0;
BEGIN
  FOR v_login, v_nominal IN
    SELECT
      kt.login_id,
      SUM(kt.nominal)::NUMERIC AS total
    FROM kas_transaksi kt
    WHERE kt.tipe = 'MASUK'
      AND kt.kategori = 'IURAN_BULANAN'
      AND kt.login_id IS NOT NULL
      AND kt.login_id <> ''
    GROUP BY kt.login_id
  LOOP
    -- Profile_id
    SELECT id INTO v_profile_id FROM profiles WHERE login_id = v_login;

    -- Tanggal pembayaran terakhir
    SELECT MAX(tanggal) INTO v_tanggal FROM kas_transaksi
    WHERE login_id = v_login AND tipe = 'MASUK' AND kategori = 'IURAN_BULANAN';

    -- Cari tagihan_id di iuran_tagihan (BUKAN jimpitan_tagihan)
    -- Kalau gak ada, skip — data ini milik sistem jimpitan
    SELECT id INTO v_tagihan_id FROM iuran_tagihan
    WHERE profile_id = v_profile_id AND periode_bulan = '2026-06-01';

    IF v_profile_id IS NOT NULL AND v_tagihan_id IS NOT NULL THEN
      INSERT INTO iuran_pembayaran (
        profile_id, tagihan_id, nominal, metode, login_id, periode_bulan,
        created_at, created_by, confirmed, sumber, bukti_ref, catatan
      )
      VALUES (
        v_profile_id, v_tagihan_id, v_nominal, 'TUNAI', v_login, '2026-06-01',
        v_tanggal::TIMESTAMPTZ, NULL, TRUE, 'KAS_TRANSAKSI',
        'KAS-' || v_login || '-' || TO_CHAR(v_tanggal, 'YYYYMMDD'),
        'Otomatis dari Kas_Transaksi'
      )
      ON CONFLICT DO NOTHING;
      v_inserted := v_inserted + 1;
      RAISE NOTICE 'Inserted iuran_pembayaran for %: nominal=%', v_login, v_nominal;
    ELSE
      v_skipped := v_skipped + 1;
      RAISE NOTICE 'SKIP % (no iuran_tagihan 2026-06, ini data jimpitan)', v_login;
    END IF;
  END LOOP;

  RAISE NOTICE '=== SUMMARY: inserted=%, skipped=%', v_inserted, v_skipped;
END $$;

-- =====================================================
-- STEP C: Verifikasi
-- =====================================================
SELECT '=== A. SUMMARY TAGIHAN PER STATUS ===' AS section;
SELECT status, COUNT(*) AS jumlah, SUM(nominal_tagihan) AS total_tagihan, SUM(total_terbayar) AS total_bayar
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01'
GROUP BY status
ORDER BY status;

SELECT '=== B. A-1 SPECIFIC ===' AS section;
SELECT login_id, nominal_tagihan, total_terbayar, status, kategori
FROM jimpitan_tagihan
WHERE login_id = 'A-1' AND periode_bulan = '2026-06-01';

SELECT '=== C. SEMUA WARGA YANG LUNAS ===' AS section;
SELECT login_id, nama_kk_snapshot, nominal_tagihan, total_terbayar, status
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01' AND status = 'LUNAS'
ORDER BY login_id;

SELECT '=== D. WARGA YANG SEBAGIAN ===' AS section;
SELECT login_id, nama_kk_snapshot, nominal_tagihan, total_terbayar, status
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01' AND status = 'SEBAGIAN'
ORDER BY login_id;

SELECT '=== E. WARGA YANG BELUM BAYAR ===' AS section;
SELECT login_id, nama_kk_snapshot, nominal_tagihan, total_terbayar, status
FROM jimpitan_tagihan
WHERE periode_bulan = '2026-06-01' AND status = 'BELUM_BAYAR'
ORDER BY login_id;

SELECT '=== F. JADWAL RONDA LENGKAP ===' AS section;
SELECT
  jr.tanggal,
  jr.minggu_ke,
  jr.nama_penjaga_snapshot AS ketua,
  COUNT(rk.profile_id) AS jumlah_anggota
FROM jadwal_ronda jr
LEFT JOIN ronda_kelompok rk
  ON rk.kelompok_id = 'K' || jr.minggu_ke
  AND rk.is_active = TRUE
WHERE jr.tahun = 2026
GROUP BY jr.tanggal, jr.minggu_ke, jr.nama_penjaga_snapshot
ORDER BY jr.tanggal;

SELECT '=== G. RONDA KELOMPOK ROSTER ===' AS section;
SELECT kelompok_id, login_id, nama_kk_snapshot, role_kelompok, urutan
FROM ronda_kelompok
WHERE is_active = TRUE
ORDER BY kelompok_id, urutan;
