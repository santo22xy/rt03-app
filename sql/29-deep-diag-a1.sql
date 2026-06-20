-- =====================================================
-- 29: DEEP DIAG A-1 (FIXED)
-- =====================================================

-- A0. Struktur jimpitan_tagihan
SELECT '=== A0. STRUKTUR jimpitan_tagihan ===' AS section;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'jimpitan_tagihan'
ORDER BY ordinal_position;

-- A. profile_id A-1 saat ini
SELECT '=== A. PROFILE ID A-1 ===' AS section;
SELECT id, login_id, nama_kk, role, is_active, kategori_tarif
FROM profiles
WHERE login_id = 'A-1';

-- B. jimpitan_tagihan untuk A-1 (by login_id)
SELECT '=== B. JT BY login_id A-1 ===' AS section;
SELECT id, login_id, profile_id, periode_bulan, nominal_tagihan, total_terbayar, status, kategori
FROM jimpitan_tagihan
WHERE login_id = 'A-1';

-- B2. JT BY profile_id A-1 (FK join yang dipakai UI)
SELECT '=== B2. JT BY profile_id A-1 ===' AS section;
SELECT id, login_id, profile_id, periode_bulan, nominal_tagihan, total_terbayar, status
FROM jimpitan_tagihan
WHERE profile_id = (SELECT id FROM profiles WHERE login_id = 'A-1');

-- C. Kas transaksi untuk A-1
SELECT '=== C. KAS_TRANSAKSI A-1 ===' AS section;
SELECT id, tanggal, tipe, kategori, nominal, login_id, catatan
FROM kas_transaksi
WHERE login_id = 'A-1' AND tipe = 'MASUK'
ORDER BY tanggal;

-- D. jimpitan_detail untuk A-1
SELECT '=== D. JIMPITAN_DETAIL A-1 ===' AS section;
SELECT jd.id, jd.profile_id, jd.nominal, jd.status_bayar, jd.catatan,
       js.tanggal AS sesi_tanggal
FROM jimpitan_detail jd
LEFT JOIN jimpitan_sesi js ON js.id = jd.sesi_id
WHERE jd.profile_id = (SELECT id FROM profiles WHERE login_id = 'A-1');

-- F. SIMULASI QUERY UI (tanpa kolom 'sisa' yg tidak ada)
SELECT '=== F. SIMULASI QUERY UI A-1 ===' AS section;
SELECT jt.id, jt.periode_bulan, jt.nominal_tagihan, jt.total_terbayar, jt.status, jt.kategori
FROM jimpitan_tagihan jt
WHERE jt.profile_id = (SELECT id FROM profiles WHERE login_id = 'A-1')
ORDER BY jt.periode_bulan DESC
LIMIT 1;
