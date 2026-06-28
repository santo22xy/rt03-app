-- =====================================================
-- SQL 64: Diagnosa kenapa iuran_pembayaran kosong saat ACC
-- =====================================================

-- A. Daftar sesi Juni (cek ada sesi 6, 13, 20 atau cuma 20)
SELECT '=== A. Sesi Juni 2026 ===' AS section;
SELECT
  id,
  tanggal,
  status,
  total_pendapatan,
  jumlah_warga_bayar,
  approved_by,
  approved_at::date AS approved_date,
  input_by
FROM jimpitan_sesi
WHERE tanggal >= '2026-06-01' AND tanggal < '2026-07-01'
ORDER BY tanggal;

-- B. Detail pembayaran 20 Juni (siapa saja yang bayar)
SELECT '=== B. Detail 20 Juni yang is_bayar=TRUE ===' AS section;
SELECT
  jd.profile_id,
  p.login_id,
  p.nama_kk,
  jd.nominal,
  jd.is_bayar
FROM jimpitan_detail jd
LEFT JOIN profiles p ON p.id = jd.profile_id
JOIN jimpitan_sesi js ON js.id = jd.sesi_id
WHERE js.tanggal = '2026-06-20' AND jd.is_bayar = TRUE
ORDER BY p.login_id;

-- C. Tagihan iuran Juni (apakah ada record untuk setiap profile yang bayar)
SELECT '=== C. iuran_tagihan Juni 2026 ===' AS section;
SELECT
  it.profile_id,
  p.login_id,
  p.nama_kk,
  it.periode_bulan,
  it.nominal AS tagihan_nominal,
  it.status
FROM iuran_tagihan it
LEFT JOIN profiles p ON p.id = it.profile_id
WHERE it.periode_bulan = '2026-06-01'
ORDER BY p.login_id;

-- D. iuran_pembayaran Juni (harusnya 14 baris dari 20 Juni)
SELECT '=== D. iuran_pembayaran Juni 2026 ===' AS section;
SELECT
  ip.created_at::date AS tgl_catat,
  ip.profile_id,
  p.login_id,
  ip.nominal,
  ip.sumber,
  ip.bukti_ref
FROM iuran_pembayaran ip
LEFT JOIN profiles p ON p.id = ip.profile_id
WHERE ip.periode_bulan = '2026-06-01'
ORDER BY ip.created_at, p.login_id;

-- E. Hitungan: berapa profile bayar 20 Juni yang PUNYA iuran_tagihan Juni
SELECT '=== E. Cross-check ===' AS section;
SELECT
  COUNT(*) FILTER (WHERE it.id IS NOT NULL) AS detail_20juni_dengan_tagihan,
  COUNT(*) FILTER (WHERE it.id IS NULL) AS detail_20juni_TANPA_tagihan,
  COUNT(*) AS total_detail_20juni_bayar
FROM jimpitan_detail jd
JOIN jimpitan_sesi js ON js.id = jd.sesi_id
LEFT JOIN iuran_tagihan it
  ON it.profile_id = jd.profile_id
  AND it.periode_bulan = DATE_TRUNC('month', js.tanggal)::date
WHERE js.tanggal = '2026-06-20' AND jd.is_bayar = TRUE;

-- F. Definisi fungsi on_jimpitan_sesi_approved
SELECT '=== F. Definisi on_jimpitan_sesi_approved ===' AS section;
SELECT pg_get_functiondef(p.oid) AS function_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'on_jimpitan_sesi_approved'
  AND n.nspname = 'public';