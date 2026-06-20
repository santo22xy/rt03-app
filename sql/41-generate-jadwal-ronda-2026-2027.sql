-- =====================================================
-- 41-GENERATE-JADWAL-RONDA-2026-2027
-- Generate jadwal ronda untuk periode yang lebih panjang.
-- Pola: 4 kelompok berotasi setiap Sabtu, KETUA kelompok jadi penjaga.
-- =====================================================

DO $$
DECLARE
  v_ketua RECORD;
  v_kelompok_ketua CURSOR FOR
    SELECT kelompok_id, profile_id, nama_kk_snapshot, blok_snapshot, nomor_rumah_snapshot
    FROM ronda_kelompok
    WHERE role_kelompok = 'KETUA' AND is_active = TRUE
    ORDER BY kelompok_id;

  v_ketuamap JSONB := '{}'::jsonb;
  v_daftar TEXT[] := ARRAY['K1','K2','K3','K4'];

  -- Mulai dari Sabtu setelah tanggal jadwal terakhir yang ada di DB
  v_start DATE;
  v_end DATE := '2027-06-30';
  v_iterasi INT := 0;
  v_tanggal DATE;
  v_kelompok_idx INT;
  v_kelompok_id TEXT;
  v_penjaga_id UUID;
  v_penjaga_nama TEXT;
  v_penjaga_blok TEXT;
  v_penjaga_no TEXT;
  v_existing INT;
BEGIN
  -- Bangun map kelompok -> ketua
  FOR v_ketua IN
    SELECT kelompok_id, profile_id, nama_kk_snapshot, blok_snapshot, nomor_rumah_snapshot
    FROM ronda_kelompok
    WHERE role_kelompok = 'KETUA' AND is_active = TRUE
    ORDER BY kelompok_id
  LOOP
    v_ketuamap := v_ketuamap || jsonb_build_object(
      v_ketua.kelompok_id,
      jsonb_build_object(
        'id', v_ketua.profile_id,
        'nama', v_ketua.nama_kk_snapshot,
        'blok', v_ketua.blok_snapshot,
        'no', v_ketua.nomor_rumah_snapshot
      )
    );
  END LOOP;

  RAISE NOTICE 'Ketua map: %', v_ketuamap;

  -- Cari tanggal mulai = Sabtu setelah MAX(tanggal) yang sudah ada, atau Sabtu pertama setelah hari ini
  SELECT COALESCE(MAX(tanggal), CURRENT_DATE - INTERVAL '7 days')::date + INTERVAL '7 days'
    INTO v_start
    FROM jadwal_ronda;

  -- Pastikan v_start adalah Sabtu
  WHILE EXTRACT(DOW FROM v_start) <> 6 LOOP
    v_start := v_start + INTERVAL '1 day';
  END LOOP;

  RAISE NOTICE 'Generate jadwal dari % sampai %', v_start, v_end;

  v_tanggal := v_start;
  v_kelompok_idx := 0;
  WHILE v_tanggal <= v_end LOOP
    v_kelompok_id := v_daftar[1 + (v_kelompok_idx % 4)];

    v_penjaga_id := (v_ketuamap -> v_kelompok_id ->> 'id')::uuid;
    v_penjaga_nama := v_ketuamap -> v_kelompok_id ->> 'nama';
    v_penjaga_blok := v_ketuamap -> v_kelompok_id ->> 'blok';
    v_penjaga_no := v_ketuamap -> v_kelompok_id ->> 'no';

    -- Cek duplikat (aman-aman saja)
    SELECT COUNT(*) INTO v_existing FROM jadwal_ronda WHERE tanggal = v_tanggal;

    IF v_existing = 0 AND v_penjaga_id IS NOT NULL THEN
      INSERT INTO jadwal_ronda (tanggal, minggu_ke, bulan, tahun,
                                 penjaga_profile_id, nama_penjaga_snapshot,
                                 blok_snapshot, nomor_rumah_snapshot)
      VALUES (
        v_tanggal,
        CEIL(EXTRACT(DAY FROM v_tanggal)::numeric / 7)::int,
        EXTRACT(MONTH FROM v_tanggal)::int,
        EXTRACT(YEAR FROM v_tanggal)::int,
        v_penjaga_id,
        v_penjaga_nama,
        v_penjaga_blok,
        v_penjaga_no
      );
      v_iterasi := v_iterasi + 1;
      RAISE NOTICE 'Inserted: % | Kelompok % | %', v_tanggal, v_kelompok_id, v_penjaga_nama;
    ELSE
      RAISE NOTICE 'Skip (existing=%): %', v_existing, v_tanggal;
    END IF;

    v_tanggal := v_tanggal + INTERVAL '7 days';
    v_kelompok_idx := v_kelompok_idx + 1;
  END LOOP;

  RAISE NOTICE 'Selesai generate. Total inserted: %', v_iterasi;
END $$;

-- Verifikasi
SELECT '=== JADWAL RONDA HASIL GENERATE ===' AS section;
SELECT
  tanggal,
  minggu_ke,
  nama_penjaga_snapshot AS penjaga,
  blok_snapshot || '-' || nomor_rumah_snapshot AS rumah
FROM jadwal_ronda
WHERE tahun = 2026 OR tahun = 2027
ORDER BY tanggal;

-- Statistik per kelompok
SELECT '=== DISTRIBUSI PER KELOMPOK (via blok snapshot) ===' AS section;
SELECT
  nama_penjaga_snapshot,
  blok_snapshot,
  COUNT(*) AS jumlah_jadwal
FROM jadwal_ronda
GROUP BY nama_penjaga_snapshot, blok_snapshot
ORDER BY blok_snapshot;