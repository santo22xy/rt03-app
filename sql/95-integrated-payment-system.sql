-- =====================================================
-- SQL 95: Sistem Pembayaran Iuran Bulanan Terintegrasi
--
-- Konsep: Jimpitan = cicilan Iuran Bulanan
-- Pembayaran: Jimpitan (via sesi) atau Langsung (via form)
-- Alokasi: per-bulan, multi-bulan, kredit, hibah
-- Kas: masuk saat uang diterima, bukan saat alokasi
-- =====================================================

-- =====================================================
-- STEP 1: Tabel monthly_payments
-- Menyimpan setiap penerimaan uang (1 baris = 1x terima uang)
-- =====================================================
CREATE TABLE IF NOT EXISTS monthly_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id),
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount    INT NOT NULL CHECK (total_amount > 0),
  payment_channel TEXT NOT NULL CHECK (payment_channel IN ('jimpitan', 'direct')),
  payment_method  TEXT NOT NULL DEFAULT 'TUNAI' CHECK (payment_method IN ('TUNAI', 'TRANSFER', 'LAINNYA')),
  source_type     TEXT,               -- 'jimpitan_session', 'direct_payment'
  source_id       UUID,               -- jimpitan_sesi.id atau monthly_payments.id
  status          TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING', 'APPROVED', 'CANCELLED')),
  notes           TEXT,
  created_by      UUID REFERENCES profiles(id),
  created_by_name TEXT,
  approved_by     UUID REFERENCES profiles(id),
  approved_at     TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_payments_profile ON monthly_payments(profile_id);
CREATE INDEX IF NOT EXISTS idx_monthly_payments_date ON monthly_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_monthly_payments_source ON monthly_payments(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_monthly_payments_status ON monthly_payments(status);

ALTER TABLE monthly_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monthly_payments_read_all" ON monthly_payments FOR SELECT USING (TRUE);
CREATE POLICY "monthly_payments_write_pengurus" ON monthly_payments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

-- =====================================================
-- STEP 2: Tabel monthly_payment_allocations
-- Menyimpan alokasi per-bulan dari setiap pembayaran
-- 1 payment → N allocations
-- =====================================================
CREATE TABLE IF NOT EXISTS monthly_payment_allocations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      UUID NOT NULL REFERENCES monthly_payments(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES profiles(id),
  period_month    INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year     INT NOT NULL CHECK (period_year BETWEEN 2020 AND 2099),
  allocated_amount INT NOT NULL CHECK (allocated_amount >= 0),
  allocation_type TEXT NOT NULL CHECK (allocation_type IN (
    'arrears',          -- tunggakan bulan lalu
    'current_month',    -- bulan berjalan
    'advance',          -- bayar di muka
    'credit',           -- simpan sebagai saldo kredit
    'donation',         -- hibah
    'unallocated'       -- belum dialokasikan
  )),
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_allocations_payment ON monthly_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_allocations_profile_period ON monthly_payment_allocations(profile_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_allocations_status ON monthly_payment_allocations(status);

ALTER TABLE monthly_payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allocations_read_all" ON monthly_payment_allocations FOR SELECT USING (TRUE);
CREATE POLICY "allocations_write_pengurus" ON monthly_payment_allocations FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

-- =====================================================
-- STEP 3: Tabel resident_credit_balance
-- Saldo kredit per warga (view materialized, dihitung dari allocations)
-- =====================================================
CREATE TABLE IF NOT EXISTS resident_credit_balance (
  profile_id      UUID PRIMARY KEY REFERENCES profiles(id),
  credit_balance  INT NOT NULL DEFAULT 0,
  total_donated   INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE resident_credit_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_balance_read_all" ON resident_credit_balance FOR SELECT USING (TRUE);
CREATE POLICY "credit_balance_write_pengurus" ON resident_credit_balance FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'WARGA')
);

-- =====================================================
-- STEP 4: RPC get_warga_payment_summary(p_profile_id, p_periode)
-- Ringkasan pembayaran warga untuk satu periode
-- =====================================================
CREATE OR REPLACE FUNCTION get_warga_payment_summary(
  p_profile_id UUID,
  p_periode DATE
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month INT := EXTRACT(MONTH FROM p_periode);
  v_year INT := EXTRACT(YEAR FROM p_periode);
  v_nominal_tagihan INT;
  v_jimpitan_total INT;
  v_direct_total INT;
  v_credit_used INT;
  v_total_paid INT;
  v_credit_balance INT;
  v_status TEXT;
  v_arrears JSON;
  v_profile RECORD;
BEGIN
  -- Ambil profil
  SELECT * INTO v_profile FROM profiles WHERE id = p_profile_id;
  IF v_profile.id IS NULL THEN
    RETURN json_build_object('error', 'Warga tidak ditemukan');
  END IF;

  -- Ambil nominal tagihan dari jimpitan_tagihan
  SELECT COALESCE(nominal_tagihan, 0)::INT INTO v_nominal_tagihan
  FROM jimpitan_tagihan
  WHERE profile_id = p_profile_id AND periode_bulan = p_periode;

  -- Jika tagihan belum ada, ambil dari tarif
  IF v_nominal_tagihan IS NULL OR v_nominal_tagihan = 0 THEN
    SELECT COALESCE(nominal_aktif, 0)::INT INTO v_nominal_tagihan
    FROM jimpitan_tarif
    WHERE profile_id = p_profile_id AND is_active = TRUE;
    IF v_nominal_tagihan IS NULL THEN
      v_nominal_tagihan := CASE WHEN UPPER(COALESCE(v_profile.kategori_tarif, 'NORMAL')) = 'KHUSUS' THEN 10000 ELSE 15000 END;
    END IF;
  END IF;

  -- Total dari jimpitan (approved sessions)
  SELECT COALESCE(SUM(jd.nominal), 0)::INT INTO v_jimpitan_total
  FROM jimpitan_detail jd
  JOIN jimpitan_sesi js ON js.id = jd.sesi_id
  WHERE jd.profile_id = p_profile_id
    AND js.status = 'APPROVED'
    AND jd.is_bayar = TRUE
    AND EXTRACT(MONTH FROM js.tanggal) = v_month
    AND EXTRACT(YEAR FROM js.tanggal) = v_year;

  -- Total dari pembayaran langsung
  SELECT COALESCE(SUM(mpa.allocated_amount), 0)::INT INTO v_direct_total
  FROM monthly_payment_allocations mpa
  JOIN monthly_payments mp ON mp.id = mpa.payment_id
  WHERE mpa.profile_id = p_profile_id
    AND mpa.period_month = v_month
    AND mpa.period_year = v_year
    AND mpa.allocation_type IN ('current_month', 'arrears', 'advance')
    AND mpa.status = 'ACTIVE'
    AND mp.status = 'APPROVED'
    AND mp.payment_channel = 'direct';

  -- Kredit yang digunakan untuk periode ini
  SELECT COALESCE(SUM(mpa.allocated_amount), 0)::INT INTO v_credit_used
  FROM monthly_payment_allocations mpa
  JOIN monthly_payments mp ON mp.id = mpa.payment_id
  WHERE mpa.profile_id = p_profile_id
    AND mpa.period_month = v_month
    AND mpa.period_year = v_year
    AND mpa.allocation_type = 'credit'
    AND mpa.status = 'ACTIVE'
    AND mp.status = 'APPROVED';

  v_total_paid := v_jimpitan_total + v_direct_total + v_credit_used;

  -- Saldo kredit warga
  SELECT COALESCE(credit_balance, 0)::INT INTO v_credit_balance
  FROM resident_credit_balance
  WHERE profile_id = p_profile_id;

  -- Hitung status
  IF v_total_paid > v_nominal_tagihan AND v_nominal_tagihan > 0 THEN
    v_status := 'LEBIH';
  ELSIF v_total_paid = v_nominal_tagihan AND v_total_paid > 0 THEN
    v_status := 'LUNAS';
  ELSIF v_total_paid > 0 THEN
    v_status := 'CICIL';
  ELSE
    v_status := 'BELUM';
  END IF;

  -- Tunggakan (bulan sebelumnya yang belum lunas)
  SELECT COALESCE(json_agg(json_build_object(
    'month', jt.periode_bulan,
    'target', jt.nominal_tagihan,
    'paid', jt.total_terbayar,
    'shortage', GREATEST(jt.nominal_tagihan - jt.total_terbayar, 0)
  ) ORDER BY jt.periode_bulan), '[]'::JSON) INTO v_arrears
  FROM jimpitan_tagihan jt
  WHERE jt.profile_id = p_profile_id
    AND jt.periode_bulan < p_periode
    AND jt.total_terbayar < jt.nominal_tagihan;

  RETURN json_build_object(
    'profile_id', p_profile_id,
    'nama_kk', v_profile.nama_kk,
    'blok', v_profile.blok,
    'nomor_rumah', v_profile.nomor_rumah,
    'kategori_tarif', v_profile.kategori_tarif,
    'period_month', v_month,
    'period_year', v_year,
    'nominal_tagihan', v_nominal_tagihan,
    'jimpitan_total', v_jimpitan_total,
    'direct_total', v_direct_total,
    'credit_used', v_credit_used,
    'total_paid', v_total_paid,
    'shortage', GREATEST(v_nominal_tagihan - v_total_paid, 0),
    'excess', GREATEST(v_total_paid - v_nominal_tagihan, 0),
    'credit_balance', v_credit_balance,
    'status', v_status,
    'arrears', v_arrears
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_warga_payment_summary(UUID, DATE) TO authenticated;

-- =====================================================
-- STEP 5: RPC input_direct_payment
-- Pembayaran langsung dari warga ke Bendahara
-- Auto-allocate: tunggakan → bulan berjalan → kredit
-- =====================================================
CREATE OR REPLACE FUNCTION input_direct_payment(
  p_profile_id UUID,
  p_payment_date DATE,
  p_total_amount INT,
  p_payment_method TEXT,
  p_created_by UUID,
  p_created_by_name TEXT,
  p_notes TEXT DEFAULT NULL,
  p_auto_allocate BOOLEAN DEFAULT TRUE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id UUID;
  v_profile RECORD;
  v_remaining INT;
  v_current_month INT := EXTRACT(MONTH FROM p_payment_date);
  v_current_year INT := EXTRACT(YEAR FROM p_payment_date);
  v_current_periode DATE := DATE_TRUNC('month', p_payment_date)::DATE;
  v_tagihan RECORD;
  v_alloc_amount INT;
  v_target_month INT;
  v_target_year INT;
  v_kas_trx_id UUID;
  v_allocated_total INT := 0;
BEGIN
  -- Validasi
  IF p_total_amount <= 0 THEN
    RETURN json_build_object('error', 'Nominal harus lebih dari 0');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_profile_id;
  IF v_profile.id IS NULL THEN
    RETURN json_build_object('error', 'Warga tidak ditemukan');
  END IF;

  -- 1. Simpan pembayaran
  INSERT INTO monthly_payments (
    profile_id, payment_date, total_amount, payment_channel, payment_method,
    source_type, status, notes, created_by, created_by_name, approved_by, approved_at
  ) VALUES (
    p_profile_id, p_payment_date, p_total_amount, 'direct', p_payment_method,
    'direct_payment', 'APPROVED', p_notes, p_created_by, p_created_by_name,
    p_created_by, NOW()
  )
  RETURNING id INTO v_payment_id;

  -- 2. Alokasi otomatis
  IF p_auto_allocate THEN
    v_remaining := p_total_amount;

    -- 2a. Tunggakan (bulan sebelumnya yang belum lunas, paling lama dulu)
    FOR v_tagihan IN
      SELECT periode_bulan, nominal_tagihan, total_terbayar
      FROM jimpitan_tagihan
      WHERE profile_id = p_profile_id
        AND periode_bulan < v_current_periode
        AND total_terbayar < nominal_tagihan
      ORDER BY periode_bulan ASC
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_alloc_amount := LEAST(v_remaining, v_tagihan.nominal_tagihan - v_tagihan.total_terbayar);
      v_target_month := EXTRACT(MONTH FROM v_tagihan.periode_bulan);
      v_target_year := EXTRACT(YEAR FROM v_tagihan.periode_bulan);

      INSERT INTO monthly_payment_allocations (
        payment_id, profile_id, period_month, period_year, allocated_amount, allocation_type
      ) VALUES (
        v_payment_id, p_profile_id, v_target_month, v_target_year, v_alloc_amount, 'arrears'
      );

      v_remaining := v_remaining - v_alloc_amount;
      v_allocated_total := v_allocated_total + v_alloc_amount;
    END LOOP;

    -- 2b. Bulan berjalan
    IF v_remaining > 0 THEN
      SELECT * INTO v_tagihan FROM jimpitan_tagihan
      WHERE profile_id = p_profile_id AND periode_bulan = v_current_periode;

      IF v_tagihan.id IS NOT NULL THEN
        v_alloc_amount := LEAST(v_remaining, GREATEST(v_tagihan.nominal_tagihan - v_tagihan.total_terbayar, 0));
      ELSE
        v_alloc_amount := v_remaining;
      END IF;

      IF v_alloc_amount > 0 THEN
        INSERT INTO monthly_payment_allocations (
          payment_id, profile_id, period_month, period_year, allocated_amount, allocation_type
        ) VALUES (
          v_payment_id, p_profile_id, v_current_month, v_current_year, v_alloc_amount, 'current_month'
        );
        v_remaining := v_remaining - v_alloc_amount;
        v_allocated_total := v_allocated_total + v_alloc_amount;
      END IF;
    END IF;

    -- 2c. Sisa menjadi kredit
    IF v_remaining > 0 THEN
      INSERT INTO monthly_payment_allocations (
        payment_id, profile_id, period_month, period_year, allocated_amount, allocation_type
      ) VALUES (
        v_payment_id, p_profile_id, v_current_month, v_current_year, v_remaining, 'credit'
      );
      v_allocated_total := v_allocated_total + v_remaining;
    END IF;
  ELSE
    -- Tidak auto-allocate → simpan sebagai unallocated
    INSERT INTO monthly_payment_allocations (
      payment_id, profile_id, period_month, period_year, allocated_amount, allocation_type
    ) VALUES (
      v_payment_id, p_profile_id, v_current_month, v_current_year, p_total_amount, 'unallocated'
    );
  END IF;

  -- 3. Buat transaksi kas masuk
  INSERT INTO kas_transaksi (
    trx_id_external, tanggal, tipe, kategori, uraian, nominal,
    login_id, metode_bayar, sumber_dana, catatan, created_by,
    source_type, source_id
  ) VALUES (
    'DPT-' || v_profile.login_id || '-' || EXTRACT(EPOCH FROM NOW())::INT,
    p_payment_date,
    'MASUK',
    'IURAN_BULANAN',
    'Pembayaran langsung iuran ' || v_profile.nama_kk,
    p_total_amount,
    v_profile.login_id,
    p_payment_method,
    'KAS_RT',
    COALESCE(p_notes, 'Pembayaran langsung oleh ' || p_created_by_name),
    p_created_by_name,
    'direct_payment',
    v_payment_id
  )
  RETURNING id INTO v_kas_trx_id;

  -- 4. Update saldo kredit warga
  INSERT INTO resident_credit_balance (profile_id, credit_balance, updated_at)
  VALUES (p_profile_id, GREATEST(v_remaining, 0), NOW())
  ON CONFLICT (profile_id) DO UPDATE SET
    credit_balance = resident_credit_balance.credit_balance + GREATEST(EXCLUDED.credit_balance, 0),
    updated_at = NOW();

  -- 5. Sinkronisasi jimpitan_tagihan dari alokasi
  PERFORM sync_tagihan_from_allocations(p_profile_id);

  RETURN json_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'kas_transaction_id', v_kas_trx_id,
    'total_amount', p_total_amount,
    'allocated', v_allocated_total,
    'message', 'Pembayaran berhasil dicatat dan dialokasikan'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION input_direct_payment(UUID, DATE, INT, TEXT, UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

-- =====================================================
-- STEP 6: RPC sync_tagihan_from_allocations
-- Update jimpitan_tagihan berdasarkan alokasi pembayaran
-- =====================================================
CREATE OR REPLACE FUNCTION sync_tagihan_from_allocations(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc RECORD;
  v_jimpitan INT;
  v_direct INT;
  v_credit INT;
  v_total INT;
  v_nominal INT;
  v_status TEXT;
BEGIN
  FOR v_alloc IN
    SELECT DISTINCT period_month, period_year
    FROM monthly_payment_allocations
    WHERE profile_id = p_profile_id AND status = 'ACTIVE'
  LOOP
    -- Hitung total dari jimpitan
    SELECT COALESCE(SUM(jd.nominal), 0)::INT INTO v_jimpitan
    FROM jimpitan_detail jd
    JOIN jimpitan_sesi js ON js.id = jd.sesi_id
    WHERE jd.profile_id = p_profile_id
      AND js.status = 'APPROVED'
      AND jd.is_bayar = TRUE
      AND EXTRACT(MONTH FROM js.tanggal) = v_alloc.period_month
      AND EXTRACT(YEAR FROM js.tanggal) = v_alloc.period_year;

    -- Hitung total dari pembayaran langsung
    SELECT COALESCE(SUM(mpa.allocated_amount), 0)::INT INTO v_direct
    FROM monthly_payment_allocations mpa
    JOIN monthly_payments mp ON mp.id = mpa.payment_id
    WHERE mpa.profile_id = p_profile_id
      AND mpa.period_month = v_alloc.period_month
      AND mpa.period_year = v_alloc.period_year
      AND mpa.allocation_type IN ('current_month', 'arrears', 'advance')
      AND mpa.status = 'ACTIVE'
      AND mp.status = 'APPROVED'
      AND mp.payment_channel = 'direct';

    -- Hitung kredit yang digunakan
    SELECT COALESCE(SUM(mpa.allocated_amount), 0)::INT INTO v_credit
    FROM monthly_payment_allocations mpa
    JOIN monthly_payments mp ON mp.id = mpa.payment_id
    WHERE mpa.profile_id = p_profile_id
      AND mpa.period_month = v_alloc.period_month
      AND mpa.period_year = v_alloc.period_year
      AND mpa.allocation_type = 'credit'
      AND mpa.status = 'ACTIVE'
      AND mp.status = 'APPROVED';

    v_total := v_jimpitan + v_direct + v_credit;

    -- Ambil nominal tagihan
    SELECT COALESCE(nominal_tagihan, 0)::INT INTO v_nominal
    FROM jimpitan_tagihan
    WHERE profile_id = p_profile_id
      AND periode_bulan = MAKE_DATE(v_alloc.period_year, v_alloc.period_month, 1);

    IF v_nominal IS NULL OR v_nominal = 0 THEN
      CONTINUE;
    END IF;

    -- Hitung status
    IF v_total > v_nominal AND v_nominal > 0 THEN
      v_status := 'LEBIH';
    ELSIF v_total = v_nominal AND v_total > 0 THEN
      v_status := 'LUNAS';
    ELSIF v_total > 0 THEN
      v_status := 'CICIL';
    ELSE
      v_status := 'BELUM';
    END IF;

    -- Update tagihan
    UPDATE jimpitan_tagihan SET
      total_terbayar = v_total,
      status = v_status,
      kelebihan = GREATEST(v_total - v_nominal, 0),
      updated_at = NOW()
    WHERE profile_id = p_profile_id
      AND periode_bulan = MAKE_DATE(v_alloc.period_year, v_alloc.period_month, 1);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION sync_tagihan_from_allocations(UUID) TO authenticated;

-- =====================================================
-- STEP 7: RPC get_all_warga_payment_status(p_periode)
-- Ringkasan semua warga untuk satu periode (termasuk kredit)
-- =====================================================
CREATE OR REPLACE FUNCTION get_all_warga_payment_status(p_periode DATE)
RETURNS TABLE (
  profile_id UUID,
  nama_kk TEXT,
  blok TEXT,
  nomor_rumah TEXT,
  kategori_tarif TEXT,
  nominal_tagihan INT,
  jimpitan_total INT,
  direct_total INT,
  credit_used INT,
  total_paid INT,
  shortage INT,
  excess INT,
  credit_balance INT,
  status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month INT := EXTRACT(MONTH FROM p_periode);
  v_year INT := EXTRACT(YEAR FROM p_periode);
BEGIN
  RETURN QUERY
  WITH active_profiles AS (
    SELECT p.id, p.nama_kk, p.blok, p.nomor_rumah, p.kategori_tarif
    FROM profiles p
    WHERE p.is_active = TRUE AND p.blok IS NOT NULL AND p.blok <> 'X'
  ),
  jimpitan_totals AS (
    SELECT jd.profile_id, COALESCE(SUM(jd.nominal), 0)::INT AS total
    FROM jimpitan_detail jd
    JOIN jimpitan_sesi js ON js.id = jd.sesi_id
    WHERE js.status = 'APPROVED' AND jd.is_bayar = TRUE
      AND EXTRACT(MONTH FROM js.tanggal) = v_month
      AND EXTRACT(YEAR FROM js.tanggal) = v_year
    GROUP BY jd.profile_id
  ),
  direct_totals AS (
    SELECT mpa.profile_id, COALESCE(SUM(mpa.allocated_amount), 0)::INT AS total
    FROM monthly_payment_allocations mpa
    JOIN monthly_payments mp ON mp.id = mpa.payment_id
    WHERE mpa.period_month = v_month AND mpa.period_year = v_year
      AND mpa.allocation_type IN ('current_month', 'arrears', 'advance')
      AND mpa.status = 'ACTIVE' AND mp.status = 'APPROVED'
      AND mp.payment_channel = 'direct'
    GROUP BY mpa.profile_id
  ),
  credit_totals AS (
    SELECT mpa.profile_id, COALESCE(SUM(mpa.allocated_amount), 0)::INT AS total
    FROM monthly_payment_allocations mpa
    JOIN monthly_payments mp ON mp.id = mpa.payment_id
    WHERE mpa.period_month = v_month AND mpa.period_year = v_year
      AND mpa.allocation_type = 'credit'
      AND mpa.status = 'ACTIVE' AND mp.status = 'APPROVED'
    GROUP BY mpa.profile_id
  )
  SELECT
    ap.id,
    ap.nama_kk,
    ap.blok,
    ap.nomor_rumah,
    ap.kategori_tarif,
    COALESCE(jt.nominal_tagihan, 0)::INT,
    COALESCE(jimp.total, 0)::INT,
    COALESCE(dir.total, 0)::INT,
    COALESCE(crd.total, 0)::INT,
    (COALESCE(jimp.total, 0) + COALESCE(dir.total, 0) + COALESCE(crd.total, 0))::INT,
    GREATEST(COALESCE(jt.nominal_tagihan, 0) - COALESCE(jimp.total, 0) - COALESCE(dir.total, 0) - COALESCE(crd.total, 0), 0)::INT,
    GREATEST(COALESCE(jimp.total, 0) + COALESCE(dir.total, 0) + COALESCE(crd.total, 0) - COALESCE(jt.nominal_tagihan, 0), 0)::INT,
    COALESCE(rcb.credit_balance, 0)::INT,
    CASE
      WHEN COALESCE(jimp.total, 0) + COALESCE(dir.total, 0) + COALESCE(crd.total, 0) > COALESCE(jt.nominal_tagihan, 0) AND COALESCE(jt.nominal_tagihan, 0) > 0 THEN 'LEBIH'
      WHEN COALESCE(jimp.total, 0) + COALESCE(dir.total, 0) + COALESCE(crd.total, 0) = COALESCE(jt.nominal_tagihan, 0) AND COALESCE(jt.nominal_tagihan, 0) > 0 THEN 'LUNAS'
      WHEN COALESCE(jimp.total, 0) + COALESCE(dir.total, 0) + COALESCE(crd.total, 0) > 0 THEN 'CICIL'
      ELSE 'BELUM'
    END::TEXT
  FROM active_profiles ap
  LEFT JOIN jimpitan_tagihan jt ON jt.profile_id = ap.id AND jt.periode_bulan = p_periode
  LEFT JOIN jimpitan_totals jimp ON jimp.profile_id = ap.id
  LEFT JOIN direct_totals dir ON dir.profile_id = ap.id
  LEFT JOIN credit_totals crd ON crd.profile_id = ap.id
  LEFT JOIN resident_credit_balance rcb ON rcb.profile_id = ap.id
  ORDER BY ap.blok, ap.nomor_rumah;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_warga_payment_status(DATE) TO authenticated;

-- =====================================================
-- STEP 8: Backfill dari data lama
-- Jimpitan yang sudah approved → buat monthly_payments
-- =====================================================
INSERT INTO monthly_payments (
  profile_id, payment_date, total_amount, payment_channel, payment_method,
  source_type, source_id, status, notes, created_by_name, approved_at
)
SELECT
  jd.profile_id,
  js.tanggal,
  jd.nominal,
  'jimpitan',
  'TUNAI',
  'jimpitan_session',
  js.id,
  'APPROVED',
  'Migrasi dari sesi jimpitan ' || js.id,
  js.approved_by_name,
  js.approved_at
FROM jimpitan_detail jd
JOIN jimpitan_sesi js ON js.id = jd.sesi_id
WHERE js.status = 'APPROVED'
  AND jd.is_bayar = TRUE
  AND jd.nominal > 0
  AND NOT EXISTS (
    SELECT 1 FROM monthly_payments mp
    WHERE mp.source_type = 'jimpitan_session'
      AND mp.source_id = js.id
      AND mp.profile_id = jd.profile_id
  );

-- =====================================================
-- STEP 9: Verifikasi
-- =====================================================
SELECT 'a_monthly_payments_count' AS s, COUNT(*) AS total,
  COUNT(*) FILTER (WHERE payment_channel = 'jimpitan') AS jimpitan,
  COUNT(*) FILTER (WHERE payment_channel = 'direct') AS direct
FROM monthly_payments;

SELECT 'b_allocations_count' AS s, COUNT(*) AS total FROM monthly_payment_allocations;

SELECT 'c_credit_balance_count' AS s, COUNT(*) AS total FROM resident_credit_balance;

SELECT 'd_rpc_functions' AS s, routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_warga_payment_summary', 'input_direct_payment', 'sync_tagihan_from_allocations', 'get_all_warga_payment_status')
ORDER BY routine_name;

NOTIFY pgrst, 'reload schema';
