-- =====================================================
-- SQL 91: Rekap Jimpitan Bulanan & Saldo Awal Kas
-- =====================================================

-- A. Tabel alokasi kelebihan pembayaran jimpitan
CREATE TABLE IF NOT EXISTS jimpitan_excess_allocations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tagihan_id        UUID NOT NULL REFERENCES jimpitan_tagihan(id) ON DELETE CASCADE,
  source_month      DATE NOT NULL,           -- periode_bulan sumber (2026-07-01)
  excess_amount     NUMERIC(12,2) NOT NULL,  -- nominal kelebihan
  allocation_type   TEXT NOT NULL CHECK (allocation_type IN ('carry_forward', 'donation')),
  dest_month        DATE,                    -- tujuan carry_forward (2026-08-01), NULL untuk donation
  notes             TEXT,
  created_by        UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at      TIMESTAMPTZ,
  UNIQUE (tagihan_id, allocation_type)       -- satu tagihan hanya bisa 1x alokasi
);

CREATE INDEX IF NOT EXISTS idx_excess_alloc_profile ON jimpitan_excess_allocations(profile_id);
CREATE INDEX IF NOT EXISTS idx_excess_alloc_source ON jimpitan_excess_allocations(source_month);
CREATE INDEX IF NOT EXISTS idx_excess_alloc_dest ON jimpitan_excess_allocations(dest_month);

ALTER TABLE jimpitan_excess_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "excess_alloc_read_all" ON jimpitan_excess_allocations;
CREATE POLICY "excess_alloc_read_all" ON jimpitan_excess_allocations FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "excess_alloc_write_pengurus" ON jimpitan_excess_allocations;
CREATE POLICY "excess_alloc_write_pengurus" ON jimpitan_excess_allocations FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

-- B. Tabel saldo awal pembukuan kas
CREATE TABLE IF NOT EXISTS cash_opening_balances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_date  DATE NOT NULL UNIQUE,      -- tanggal mulai pembukuan
  amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cash_opening_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cash_ob_read_all" ON cash_opening_balances;
CREATE POLICY "cash_ob_read_all" ON cash_opening_balances FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "cash_ob_write_pengurus" ON cash_opening_balances;
CREATE POLICY "cash_ob_write_pengurus" ON cash_opening_balances FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

-- C. RPC: Hitung saldo akhir per bulan (dipakai untuk saldo awal bulan berikutnya)
CREATE OR REPLACE FUNCTION get_monthly_balance(p_year INT, p_month INT)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
  v_opening NUMERIC := 0;
  v_masuk NUMERIC := 0;
  v_keluar NUMERIC := 0;
BEGIN
  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + INTERVAL '1 month - 1 day')::DATE;

  -- Ambil saldo awal pembukuan jika ada yang berlaku sebelum periode ini
  SELECT COALESCE(amount, 0) INTO v_opening
  FROM cash_opening_balances
  WHERE effective_date <= v_start
  ORDER BY effective_date DESC
  LIMIT 1;

  -- Hitung pemasukan & pengeluaran dari awal hingga akhir bulan ini
  SELECT
    COALESCE(SUM(CASE WHEN tipe = 'MASUK' THEN nominal ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tipe = 'KELUAR' THEN nominal ELSE 0 END), 0)
  INTO v_masuk, v_keluar
  FROM kas_transaksi
  WHERE tanggal >= (SELECT COALESCE(MIN(effective_date), v_start) FROM cash_opening_balances)
    AND tanggal <= v_end;

  RETURN v_opening + v_masuk - v_keluar;
END;
$$;

GRANT EXECUTE ON FUNCTION get_monthly_balance(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_balance(INT, INT) TO anon;

-- D. RPC: Hitung saldo akhir per tanggal (untuk running balance harian)
CREATE OR REPLACE FUNCTION get_balance_before_date(p_date DATE)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening NUMERIC := 0;
  v_masuk NUMERIC := 0;
  v_keluar NUMERIC := 0;
BEGIN
  SELECT COALESCE(amount, 0) INTO v_opening
  FROM cash_opening_balances
  WHERE effective_date <= p_date
  ORDER BY effective_date DESC
  LIMIT 1;

  SELECT
    COALESCE(SUM(CASE WHEN tipe = 'MASUK' THEN nominal ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tipe = 'KELUAR' THEN nominal ELSE 0 END), 0)
  INTO v_masuk, v_keluar
  FROM kas_transaksi
  WHERE tanggal >= (SELECT COALESCE(MIN(effective_date), p_date) FROM cash_opening_balances)
    AND tanggal < p_date;

  RETURN v_opening + v_masuk - v_keluar;
END;
$$;

GRANT EXECUTE ON FUNCTION get_balance_before_date(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_balance_before_date(DATE) TO anon;

-- E. RPC: Rekap jimpitan per bulan (gabung semua warga + tagihan + kredit)
CREATE OR REPLACE FUNCTION get_jimpitan_recap(p_periode DATE)
RETURNS TABLE (
  profile_id UUID,
  nama_kk TEXT,
  blok TEXT,
  nomor_rumah TEXT,
  target_bulanan NUMERIC,
  kredit_dari_lalu NUMERIC,
  kewajiban_efektif NUMERIC,
  total_bayar NUMERIC,
  selisih NUMERIC,
  status TEXT,
  kelebihan_tujuan TEXT,
  kelebihan_catatan TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH warga AS (
    SELECT p.id, p.nama_kk, p.blok, p.nomor_rumah
    FROM profiles p
    WHERE p.is_active = TRUE
      AND p.blok IS NOT NULL
      AND p.nomor_rumah IS NOT NULL
      AND p.blok <> 'X'
  ),
  tagihan AS (
    SELECT t.profile_id, t.nominal_tagihan, t.total_terbayar, t.status,
           t.kelebihan, t.kelebihan_tujuan, t.kelebihan_catatan
    FROM jimpitan_tagihan t
    WHERE t.periode_bulan = p_periode
  ),
  kredit_lalu AS (
    SELECT ea.profile_id, COALESCE(SUM(ea.excess_amount), 0) AS kredit
    FROM jimpitan_excess_allocations ea
    WHERE ea.dest_month = p_periode
      AND ea.allocation_type = 'carry_forward'
      AND ea.cancelled_at IS NULL
    GROUP BY ea.profile_id
  )
  SELECT
    w.id,
    w.nama_kk,
    w.blok,
    w.nomor_rumah,
    COALESCE(t.nominal_tagihan, 0) AS target_bulanan,
    COALESCE(kl.kredit, 0) AS kredit_dari_lalu,
    GREATEST(COALESCE(t.nominal_tagihan, 0) - COALESCE(kl.kredit, 0), 0) AS kewajiban_efektif,
    COALESCE(t.total_terbayar, 0) AS total_bayar,
    COALESCE(t.total_terbayar, 0) - GREATEST(COALESCE(t.nominal_tagihan, 0) - COALESCE(kl.kredit, 0), 0) AS selisih,
    COALESCE(t.status, 'BELUM') AS status,
    t.kelebihan_tujuan,
    t.kelebihan_catatan
  FROM warga w
  LEFT JOIN tagihan t ON t.profile_id = w.id
  LEFT JOIN kredit_lalu kl ON kl.profile_id = w.id
  ORDER BY w.blok, w.nomor_rumah;
END;
$$;

GRANT EXECUTE ON FUNCTION get_jimpitan_recap(DATE) TO authenticated;

-- F. RPC: Alokasi kelebihan → carry forward ke bulan depan
CREATE OR REPLACE FUNCTION allocate_excess_carry_forward(
  p_tagihan_id UUID,
  p_profile_id UUID,
  p_source_month DATE,
  p_excess_amount NUMERIC,
  p_dest_month DATE,
  p_created_by UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing UUID;
  v_dest_tagihan_id UUID;
BEGIN
  -- Cek apakah sudah ada alokasi untuk tagihan ini
  SELECT id INTO v_existing
  FROM jimpitan_excess_allocations
  WHERE tagihan_id = p_tagihan_id
    AND allocation_type = 'carry_forward'
    AND cancelled_at IS NULL;

  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('error', 'Kelebihan sudah dialokasikan sebelumnya');
  END IF;

  -- Simpan alokasi
  INSERT INTO jimpitan_excess_allocations
    (profile_id, tagihan_id, source_month, excess_amount, allocation_type, dest_month, notes, created_by)
  VALUES
    (p_profile_id, p_tagihan_id, p_source_month, p_excess_amount, 'carry_forward', p_dest_month, p_notes, p_created_by);

  -- Update tagihan sumber
  UPDATE jimpitan_tagihan
  SET kelebihan_tujuan = 'BULAN_DEPAN',
      kelebihan_catatan = COALESCE(p_notes, 'Kelebihan dibawa ke ' || TO_CHAR(p_dest_month, 'Mon YYYY')),
      updated_at = NOW()
  WHERE id = p_tagihan_id;

  -- Update kredit di tagihan tujuan (jika sudah ada)
  SELECT id INTO v_dest_tagihan_id
  FROM jimpitan_tagihan
  WHERE profile_id = p_profile_id AND periode_bulan = p_dest_month;

  IF v_dest_tagihan_id IS NOT NULL THEN
    UPDATE jimpitan_tagihan
    SET catatan = COALESCE(catatan || E'\n', '') || 'Kredit dari ' || TO_CHAR(p_source_month, 'Mon YYYY') || ': ' || p_excess_amount::TEXT,
        updated_at = NOW()
    WHERE id = v_dest_tagihan_id;
  END IF;

  RETURN json_build_object('success', true, 'message', 'Kelebihan dialokasikan ke ' || TO_CHAR(p_dest_month, 'Mon YYYY'));
END;
$$;

GRANT EXECUTE ON FUNCTION allocate_excess_carry_forward(UUID, UUID, DATE, NUMERIC, DATE, UUID, TEXT) TO authenticated;

-- G. RPC: Alokasi kelebihan → hibah
CREATE OR REPLACE FUNCTION allocate_excess_donation(
  p_tagihan_id UUID,
  p_profile_id UUID,
  p_source_month DATE,
  p_excess_amount NUMERIC,
  p_created_by UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing UUID;
BEGIN
  SELECT id INTO v_existing
  FROM jimpitan_excess_allocations
  WHERE tagihan_id = p_tagihan_id
    AND allocation_type = 'donation'
    AND cancelled_at IS NULL;

  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('error', 'Kelebihan sudah dijadikan hibah sebelumnya');
  END IF;

  INSERT INTO jimpitan_excess_allocations
    (profile_id, tagihan_id, source_month, excess_amount, allocation_type, notes, created_by)
  VALUES
    (p_profile_id, p_tagihan_id, p_source_month, p_excess_amount, 'donation',
     COALESCE(p_notes, 'Kelebihan pembayaran jimpitan ' || TO_CHAR(p_source_month, 'Mon YYYY') || ' sebesar Rp' || p_excess_amount::TEXT || ' dijadikan hibah'),
     p_created_by);

  UPDATE jimpitan_tagihan
  SET kelebihan_tujuan = 'HIBAH',
      kelebihan_catatan = COALESCE(p_notes, 'Kelebihan dijadikan hibah'),
      updated_at = NOW()
  WHERE id = p_tagihan_id;

  RETURN json_build_object('success', true, 'message', 'Kelebihan dijadikan hibah');
END;
$$;

GRANT EXECUTE ON FUNCTION allocate_excess_donation(UUID, UUID, DATE, NUMERIC, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
