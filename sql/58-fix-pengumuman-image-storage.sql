-- ============================================================
-- SQL 58: FIX info_pengumuman + storage pengumuman-images
-- ============================================================
-- Tujuan:
--   1. Rename kolom 'isi' -> 'konten' (bug: semua halaman referensi
--      p.konten tapi kolomnya 'isi', jadi konten tidak pernah tampil)
--   2. Setup storage bucket 'pengumuman-images' (idempotent)
--   3. Setup RLS untuk bucket (pengurus boleh upload, public boleh baca)
--   4. Reload PostgREST schema cache
-- Tabel kosong saat ini, jadi tidak perlu migrasi data priority.
-- Enum priority distandarkan via aplikasi: DARURAT / PENTING / NORMAL
-- ============================================================

-- ============================================================
-- STEP 1: Rename kolom 'isi' -> 'konten' (idempotent)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'info_pengumuman'
      AND column_name = 'isi'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'info_pengumuman'
      AND column_name = 'konten'
  ) THEN
    ALTER TABLE public.info_pengumuman RENAME COLUMN isi TO konten;
    RAISE NOTICE 'Kolom isi berhasil di-rename ke konten';
  ELSE
    RAISE NOTICE 'Skip rename: kolom konten sudah ada atau isi tidak ditemukan';
  END IF;
END $$;

-- ============================================================
-- STEP 2: Verifikasi hasil rename
-- ============================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'info_pengumuman'
  AND column_name IN ('isi', 'konten')
ORDER BY column_name;

-- ============================================================
-- STEP 3: Setup storage bucket 'pengumuman-images' (idempotent)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pengumuman-images',
  'pengumuman-images',
  true,             -- public read (warga perlu akses via URL)
  5242880,          -- 5 MB limit per file
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- STEP 4: RLS policies untuk bucket 'pengumuman-images'
-- ============================================================

-- 4a. Public read (semua orang boleh lihat gambar pengumuman)
DROP POLICY IF EXISTS "pengumuman_images_public_read" ON storage.objects;
CREATE POLICY "pengumuman_images_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'pengumuman-images');

-- 4b. Pengurus-only upload (PENGURUS, KETUA_RT, BENDAHARA, SEKRETARIS, SUPERADMIN)
DROP POLICY IF EXISTS "pengumuman_images_pengurus_upload" ON storage.objects;
CREATE POLICY "pengumuman_images_pengurus_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pengumuman-images'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY(
        ARRAY['PENGURUS','KETUA_RT','BENDAHARA','SEKRETARIS','SUPERADMIN']::user_role[]
      )
  )
);

-- 4c. Pengurus-only update (rename file)
DROP POLICY IF EXISTS "pengumuman_images_pengurus_update" ON storage.objects;
CREATE POLICY "pengumuman_images_pengurus_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'pengumuman-images'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY(
        ARRAY['PENGURUS','KETUA_RT','BENDAHARA','SEKRETARIS','SUPERADMIN']::user_role[]
      )
  )
);

-- 4d. Pengurus-only delete
DROP POLICY IF EXISTS "pengumuman_images_pengurus_delete" ON storage.objects;
CREATE POLICY "pengumuman_images_pengurus_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'pengumuman-images'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY(
        ARRAY['PENGURUS','KETUA_RT','BENDAHARA','SEKRETARIS','SUPERADMIN']::user_role[]
      )
  )
);

-- ============================================================
-- STEP 5: Reload PostgREST schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- STEP 6: Verifikasi akhir
-- ============================================================
-- Cek bucket exists
SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id = 'pengumuman-images';

-- Cek kolom final info_pengumuman (yang relevan saja)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'info_pengumuman'
  AND column_name IN ('id', 'judul', 'konten', 'gambar_url', 'priority', 'is_published', 'published_at')
ORDER BY column_name;

-- Cek RLS policies di storage.objects untuk bucket ini
SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'storage.objects'::regclass
  AND polname LIKE 'pengumuman_images_%'
ORDER BY polname;