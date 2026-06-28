-- =====================================================
-- SQL 66: Re-create trigger ACC jimpitan (HILANG) + backfill
--
-- PENYEBAB: SQL 20 line 321-376 sepertinya tidak ter-commit atau
-- function pernah di-drop. ACC 20 Juni hanya update status tanpa
-- insert iuran_pembayaran karena trigger tidak ada.
-- =====================================================

-- A. Re-create function on_jimpitan_sesi_approved()
--    FIX: auto-create iuran_tagihan kalau belum ada
--    FIX: handle INSERT langsung dengan status APPROVED (TG_OP='INSERT')
-- =====================================================
-- FIX PRE: pastikan kolom sisa & total_terbayar & catatan punya DEFAULT (DB state drift)
DO $$
BEGIN
  BEGIN
    ALTER TABLE iuran_tagihan ALTER COLUMN sisa SET DEFAULT 0;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'sisa column: %', SQLERRM;
  END;
  BEGIN
    ALTER TABLE iuran_tagihan ALTER COLUMN total_terbayar SET DEFAULT 0;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'total_terbayar column: %', SQLERRM;
  END;
  BEGIN
    ALTER TABLE iuran_tagihan ALTER COLUMN catatan SET DEFAULT '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'catatan column: %', SQLERRM;
  END;

  -- Sama untuk iuran_pembayaran
  BEGIN
    ALTER TABLE iuran_pembayaran ALTER COLUMN login_id SET DEFAULT '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'iuran_pembayaran.login_id: %', SQLERRM;
  END;
  BEGIN
    ALTER TABLE iuran_pembayaran ALTER COLUMN periode_bulan SET DEFAULT DATE_TRUNC('month', NOW())::DATE;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'iuran_pembayaran.periode_bulan: %', SQLERRM;
  END;
  BEGIN
    ALTER TABLE iuran_pembayaran ALTER COLUMN catatan SET DEFAULT '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'iuran_pembayaran.catatan: %', SQLERRM;
  END;
END;
$$;

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
BEGIN
  -- Hanya proses jika status = APPROVED.
  -- Handle 2 kasus:
  --   1. UPDATE AKTIF/SUBMITTED → APPROVED (OLD.status IS DISTINCT FROM 'APPROVED')
  --   2. INSERT langsung dgn status APPROVED (TG_OP='INSERT', OLD NULL)
  IF NEW.status = 'APPROVED' AND (
    TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'APPROVED'
  ) THEN
    v_periode := DATE_TRUNC('month', NEW.tanggal)::DATE;
    v_sesi_id_label := 'JMP-' || TO_CHAR(NEW.tanggal, 'YYYYMMDD');

    FOR v_detail IN
      SELECT profile_id, nominal
      FROM jimpitan_detail
      WHERE sesi_id = NEW.id AND is_bayar = TRUE AND nominal > 0
    LOOP
      -- Cari tagihan bulan ini untuk profile
      SELECT id INTO v_tagihan_id
      FROM iuran_tagihan
      WHERE profile_id = v_detail.profile_id
        AND periode_bulan = v_periode;

      -- FIX: kalau belum ada tagihan, INSERT dulu (idempotent via UNIQUE constraint)
      -- Pakai INSERT ... SELECT agar login_id otomatis ke-isi dari profiles
      IF v_tagihan_id IS NULL THEN
        INSERT INTO iuran_tagihan (profile_id, periode_bulan, login_id, nominal, status)
        SELECT v_detail.profile_id, v_periode, p.login_id, v_detail.nominal, 'BELUM'
        FROM profiles p WHERE p.id = v_detail.profile_id
        ON CONFLICT (profile_id, periode_bulan) DO NOTHING
        RETURNING id INTO v_tagihan_id;

        -- Kalau conflict, lookup lagi
        IF v_tagihan_id IS NULL THEN
          SELECT id INTO v_tagihan_id
          FROM iuran_tagihan
          WHERE profile_id = v_detail.profile_id
            AND periode_bulan = v_periode;
        END IF;
      END IF;

      IF v_tagihan_id IS NOT NULL THEN
        -- Idempotent: hapus pembayaran lama dengan bukti_ref yang sama
        DELETE FROM iuran_pembayaran
        WHERE profile_id = v_detail.profile_id
          AND bukti_ref = v_sesi_id_label;

        -- FIX: pakai INSERT...SELECT agar login_id & periode_bulan ke-isi otomatis
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
  END IF;

  RETURN NEW;
END;
$$;

-- B. Re-create trigger
--    FIX: AFTER INSERT OR UPDATE (bukan cuma UPDATE) supaya fire saat
--    pengurus bikin sesi manual langsung APPROVED
DROP TRIGGER IF EXISTS trg_jimpitan_approved_create_pembayaran ON jimpitan_sesi;
CREATE TRIGGER trg_jimpitan_approved_create_pembayaran
AFTER INSERT OR UPDATE ON jimpitan_sesi
FOR EACH ROW
EXECUTE FUNCTION on_jimpitan_sesi_approved();

-- C. BACKFILL: insert iuran_pembayaran untuk sesi APPROVED yang belum punya
--    (kasus: 20 Juni sudah ACC sebelum trigger di-recreate)
DO $$
DECLARE
  v_sesi RECORD;
  v_periode DATE;
  v_sesi_label TEXT;
  v_detail RECORD;
  v_tagihan_id UUID;
  v_inserted INT := 0;
BEGIN
  FOR v_sesi IN
    SELECT id, tanggal, approved_by
    FROM jimpitan_sesi
    WHERE status = 'APPROVED'
      AND NOT EXISTS (
        SELECT 1 FROM iuran_pembayaran
        WHERE bukti_ref = 'JMP-' || TO_CHAR(jimpitan_sesi.tanggal, 'YYYYMMDD')
      )
  LOOP
    v_periode := DATE_TRUNC('month', v_sesi.tanggal)::DATE;
    v_sesi_label := 'JMP-' || TO_CHAR(v_sesi.tanggal, 'YYYYMMDD');

    FOR v_detail IN
      SELECT profile_id, nominal
      FROM jimpitan_detail
      WHERE sesi_id = v_sesi.id AND is_bayar = TRUE AND nominal > 0
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
          AND bukti_ref = v_sesi_label;

        INSERT INTO iuran_pembayaran (
          tagihan_id, profile_id, login_id, periode_bulan, nominal, metode, sumber, bukti_ref, catatan, created_by, confirmed
        )
        SELECT
          v_tagihan_id, v_detail.profile_id, p.login_id, v_periode, v_detail.nominal,
          'JIMPITAN', 'JIMPITAN', v_sesi_label,
          'Jimpitan ' || TO_CHAR(v_sesi.tanggal, 'DD Month YYYY'),
          v_sesi.approved_by, TRUE
        FROM profiles p WHERE p.id = v_detail.profile_id;
        v_inserted := v_inserted + 1;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Backfill selesai: % baris iuran_pembayaran di-insert', v_inserted;
END;
$$;

-- D. Verifikasi
SELECT '=== D. Verifikasi setelah re-create ===' AS section;
SELECT
  (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.proname='on_jimpitan_sesi_approved' AND n.nspname='public')
    AS function_exists,
  (SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE c.relname='jimpitan_sesi' AND t.tgname='trg_jimpitan_approved_create_pembayaran')
    AS trigger_exists,
  (SELECT COUNT(*) FROM iuran_pembayaran WHERE bukti_ref = 'JMP-20260620')
    AS iuran_pembayaran_20juni,
  (SELECT COALESCE(SUM(nominal),0) FROM iuran_pembayaran WHERE bukti_ref = 'JMP-20260620')
    AS total_iuran_20juni;

-- E. Daftar iuran_pembayaran 20 Juni setelah backfill
SELECT '=== E. iuran_pembayaran 20 Juni ===' AS section;
SELECT
  p.login_id,
  ip.nominal,
  ip.metode,
  ip.sumber,
  ip.bukti_ref
FROM iuran_pembayaran ip
JOIN profiles p ON p.id = ip.profile_id
WHERE ip.bukti_ref = 'JMP-20260620'
ORDER BY p.login_id;

-- F. Tabel iuran_tagihan Juni (cek auto-create)
SELECT '=== F. iuran_tagihan Juni (auto-created?) ===' AS section;
SELECT
  it.profile_id,
  p.login_id,
  it.periode_bulan,
  it.nominal,
  it.status,
  it.total_terbayar
FROM iuran_tagihan it
JOIN profiles p ON p.id = it.profile_id
WHERE it.periode_bulan = '2026-06-01'
ORDER BY p.login_id;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';