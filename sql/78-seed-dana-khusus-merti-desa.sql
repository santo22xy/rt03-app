-- =====================================================
-- SQL 78: Seed dana_khusus contoh (Merti Desa 2026)
-- supaya pengurus & warga bisa langsung test fitur
-- =====================================================

-- Tambah 1 dana khusus contoh: Merti Desa
DO $$
DECLARE
  v_ketua UUID;
  v_id UUID;
  v_tagihan_count INT := 0;
BEGIN
  -- Cari profile ketua (yang login untuk input)
  SELECT id INTO v_ketua FROM profiles
  WHERE role IN ('KETUA_RT', 'BENDAHARA', 'SUPERADMIN')
  ORDER BY CASE role WHEN 'KETUA_RT' THEN 1 WHEN 'BENDAHARA' THEN 2 ELSE 3 END
  LIMIT 1;

  -- Hanya insert kalau belum ada Merti Desa 2026
  IF NOT EXISTS (SELECT 1 FROM dana_khusus WHERE judul = 'Merti Desa 2026' AND kategori = 'MERTI_DESA') THEN
    INSERT INTO dana_khusus (
      judul, deskripsi, kategori, target_per_kk,
      tanggal_mulai, tanggal_selesai, is_active, is_wajib, created_by
    ) VALUES (
      'Merti Desa 2026',
      'Iuran untuk acara Merti Desa RT 03 - Sumbangan sukarela (bisa dicicil)',
      'MERTI_DESA', 50000,
      '2026-06-01', '2026-08-31',
      TRUE, FALSE,
      v_ketua
    )
    RETURNING id INTO v_id;

    SELECT COUNT(*) INTO v_tagihan_count FROM dana_khusus_tagihan WHERE dana_khusus_id = v_id;
    RAISE NOTICE 'Created Merti Desa 2026 with % tagihan rows', v_tagihan_count;
  ELSE
    SELECT id INTO v_id FROM dana_khusus WHERE judul = 'Merti Desa 2026' AND kategori = 'MERTI_DESA';
    RAISE NOTICE 'Merti Desa 2026 already exists with id: %', v_id;
  END IF;
END $$;

-- Sample pembayaran cicilan: 3 warga bayar sebagian
DO $$
DECLARE
  v_dana UUID;
  v_tagihan_a2 UUID;
  v_tagihan_b3 UUID;
  v_tagihan_c1 UUID;
BEGIN
  SELECT id INTO v_dana FROM dana_khusus WHERE judul = 'Merti Desa 2026';

  IF v_dana IS NOT NULL THEN
    -- A-2 bayar 25rb (cicil)
    SELECT id INTO v_tagihan_a2 FROM dana_khusus_tagihan
    WHERE dana_khusus_id = v_dana AND login_id = 'A-2';

    IF v_tagihan_a2 IS NOT NULL THEN
      INSERT INTO dana_khusus_pembayaran (
        dana_khusus_id, tagihan_id, profile_id, login_id,
        nominal, metode, tanggal_bayar, bukti_ref, catatan
      )
      SELECT v_dana, v_tagihan_a2, p.id, p.login_id,
        25000, 'TUNAI', '2026-06-15', 'DKH-CICIL-A2-1', 'Cicilan pertama merti desa'
      FROM profiles p WHERE p.login_id = 'A-2';
    END IF;

    -- B-3 bayar lunas 50rb
    SELECT id INTO v_tagihan_b3 FROM dana_khusus_tagihan
    WHERE dana_khusus_id = v_dana AND login_id = 'B-3';

    IF v_tagihan_b3 IS NOT NULL THEN
      INSERT INTO dana_khusus_pembayaran (
        dana_khusus_id, tagihan_id, profile_id, login_id,
        nominal, metode, tanggal_bayar, bukti_ref, catatan
      )
      SELECT v_dana, v_tagihan_b3, p.id, p.login_id,
        50000, 'TRANSFER', '2026-06-16', 'DKH-LUNAS-B3', 'Pelunasan merti desa via transfer'
      FROM profiles p WHERE p.login_id = 'B-3';
    END IF;

    -- C-1 bayar 20rb (cicil, jauh dari lunas)
    SELECT id INTO v_tagihan_c1 FROM dana_khusus_tagihan
    WHERE dana_khusus_id = v_dana AND login_id = 'C-1';

    IF v_tagihan_c1 IS NOT NULL THEN
      INSERT INTO dana_khusus_pembayaran (
        dana_khusus_id, tagihan_id, profile_id, login_id,
        nominal, metode, tanggal_bayar, bukti_ref, catatan
      )
      SELECT v_dana, v_tagihan_c1, p.id, p.login_id,
        20000, 'TUNAI', '2026-06-18', 'DKH-CICIL-C1-1', 'Cicilan awal merti desa'
      FROM profiles p WHERE p.login_id = 'C-1';
    END IF;
  END IF;
END $$;

-- Verifikasi progress
SELECT 'a_progress' AS s,
  d.judul, d.kategori, d.target_per_kk,
  COUNT(*) AS total_kk,
  COUNT(*) FILTER (WHERE t.status = 'LUNAS') AS lunas,
  COUNT(*) FILTER (WHERE t.status = 'CICIL') AS cicil,
  COUNT(*) FILTER (WHERE t.status = 'BELUM') AS belum,
  COALESCE(SUM(t.total_terbayar), 0) AS total_terkumpul,
  COALESCE(SUM(t.nominal_tagihan), 0) AS total_target,
  ROUND(100.0 * COALESCE(SUM(t.total_terbayar), 0) / NULLIF(SUM(t.nominal_tagihan), 0), 1) AS pct
FROM dana_khusus d
LEFT JOIN dana_khusus_tagihan t ON t.dana_khusus_id = d.id
GROUP BY d.id, d.judul, d.kategori, d.target_per_kk;

SELECT 'b_sample_lunas' AS s,
  t.login_id, t.nama_kk_snapshot, t.nominal_tagihan, t.total_terbayar, t.status
FROM dana_khusus_tagihan t
JOIN dana_khusus d ON d.id = t.dana_khusus_id
WHERE d.judul = 'Merti Desa 2026'
  AND t.status IN ('LUNAS', 'CICIL')
ORDER BY t.status, t.login_id;

SELECT 'c_kas_transaksi' AS s,
  tanggal::text, kategori, uraian, nominal, login_id
FROM kas_transaksi
WHERE kategori = 'DANA_KHUSUS'
ORDER BY tanggal DESC
LIMIT 10;

NOTIFY pgrst, 'reload schema';
