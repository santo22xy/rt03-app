// Skrip ini hanya MENCETAK SQL migrasi 89 ke terminal.
// Salin seluruh output (dari baris "-- ====" pertama sampai "NOTIFY pgrst")
// ke Supabase Dashboard > SQL Editor > Run.

const SQL = `-- ============================================================
-- MIGRASI 89: Attachments support (nota_url, bukti_url, storage)
-- ============================================================

-- 1. nota_url di kas_transaksi
ALTER TABLE public.kas_transaksi ADD COLUMN IF NOT EXISTS nota_url TEXT;

-- 2. bukti_url di dana_khusus_pembayaran
ALTER TABLE public.dana_khusus_pembayaran ADD COLUMN IF NOT EXISTS bukti_url TEXT;

-- 3. bukti_url di jimpitan_detail
ALTER TABLE public.jimpitan_detail ADD COLUMN IF NOT EXISTS bukti_url TEXT;

-- 4. Storage bucket "attachments" (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments', 'attachments', true, 5242880,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 5a. Public read
DROP POLICY IF EXISTS "attachments_public_read" ON storage.objects;
CREATE POLICY "attachments_public_read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'attachments');

-- 5b. Pengurus upload
DROP POLICY IF EXISTS "attachments_pengurus_upload" ON storage.objects;
CREATE POLICY "attachments_pengurus_upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'attachments' AND EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.id = auth.uid()
    AND profiles.role = ANY(ARRAY['PENGURUS','KETUA_RT','BENDAHARA','SEKRETARIS','SUPERADMIN']::user_role[])
));

-- 5c. Pengurus update
DROP POLICY IF EXISTS "attachments_pengurus_update" ON storage.objects;
CREATE POLICY "attachments_pengurus_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'attachments' AND EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.id = auth.uid()
    AND profiles.role = ANY(ARRAY['PENGURUS','KETUA_RT','BENDAHARA','SEKRETARIS','SUPERADMIN']::user_role[])
));

-- 5d. Pengurus delete
DROP POLICY IF EXISTS "attachments_pengurus_delete" ON storage.objects;
CREATE POLICY "attachments_pengurus_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'attachments' AND EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.id = auth.uid()
    AND profiles.role = ANY(ARRAY['PENGURUS','KETUA_RT','BENDAHARA','SEKRETARIS','SUPERADMIN']::user_role[])
));

-- 6. Reload schema cache
NOTIFY pgrst, 'reload schema';
`

console.log(SQL)
