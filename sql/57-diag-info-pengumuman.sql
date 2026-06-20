-- ============================================================
-- SQL 57: DIAGNOSTIC info_pengumuman + storage setup
-- ============================================================
-- Tujuan: cek state tabel info_pengumuman saat ini sebelum
-- implement CRUD + image. SQL ini READ-ONLY untuk diagnostic.
-- Lalu ada ACTIONABLE steps kalau perlu ALTER / standardize.
-- ============================================================

-- ============================================================
-- STEP 1: Lihat kolom info_pengumuman
-- ============================================================
SELECT
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'info_pengumuman'
ORDER BY ordinal_position;

-- ============================================================
-- STEP 2: Lihat DISTINCT priority values yang ada di data
-- (untuk normalisasi ke DARURAT/PENTING/NORMAL)
-- ============================================================
SELECT priority, COUNT(*) AS jumlah
FROM public.info_pengumuman
GROUP BY priority
ORDER BY priority;

-- ============================================================
-- STEP 3: Lihat constraint (CHECK) pada priority kalau ada
-- ============================================================
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.info_pengumuman'::regclass
  AND contype = 'c';

-- ============================================================
-- STEP 4: Lihat RLS policies
-- ============================================================
SELECT polname, polcmd, polpermissive, pg_get_expr(polqual, polrelid) AS using_clause
FROM pg_policy
WHERE polrelid = 'public.info_pengumuman'::regclass;

-- ============================================================
-- STEP 5: Cek apakah bucket 'pengumuman-images' sudah ada
-- ============================================================
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'pengumuman-images';

-- ============================================================
-- STEP 6: Cek 5 sample row terakhir
-- ============================================================
SELECT id, judul, priority, is_published, published_at
FROM public.info_pengumuman
ORDER BY created_at DESC NULLS LAST
LIMIT 5;