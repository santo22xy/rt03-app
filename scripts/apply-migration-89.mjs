
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables')
  process.exit(1)
}

// Create a client that can access the SQL Editor (or use the REST API for ALTER TABLE)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

console.log('Applying migration 89 - adding columns...')

// Step 1: Add nota_url to kas_transaksi
console.log('Adding nota_url to kas_transaksi...')
try {
  // Use the Supabase Admin API to run the ALTER TABLE
  // Since the JS client doesn't have a direct runSQL method, let's use fetch to call the PostgREST endpoint
  // Wait, alternatively, let's just inform the user to apply the SQL via the Supabase Dashboard SQL Editor!
  console.log('\nPlease apply the following SQL manually via the Supabase Dashboard SQL Editor:')
  console.log('---------------------------------------------------------')
  console.log(`
-- ============================================================
-- SQL 89: Add attachments support for kas transactions, dana khusus payments, and jimpitan
-- ============================================================

-- ============================================================
-- Step 1: Add nota_url column to kas_transaksi
-- ============================================================
ALTER TABLE public.kas_transaksi ADD COLUMN IF NOT EXISTS nota_url TEXT;

-- ============================================================
-- Step 2: Add bukti_url column to dana_khusus_pembayaran
-- ============================================================
ALTER TABLE public.dana_khusus_pembayaran ADD COLUMN IF NOT EXISTS bukti_url TEXT;

-- ============================================================
-- Step 3: Add bukti_url column to jimpitan_detail
-- ============================================================
ALTER TABLE public.jimpitan_detail ADD COLUMN IF NOT EXISTS bukti_url TEXT;

-- ============================================================
-- Step 4: Setup storage bucket 'attachments'
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  true,
  5242880, -- 5 MB limit per file
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- Step 5: RLS policies for 'attachments' bucket
-- ============================================================

-- 5a. Public read (everyone can view attachments)
DROP POLICY IF EXISTS "attachments_public_read" ON storage.objects;
CREATE POLICY "attachments_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'attachments');

-- 5b. Pengurus-only upload
DROP POLICY IF EXISTS "attachments_pengurus_upload" ON storage.objects;
CREATE POLICY "attachments_pengurus_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attachments'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY(
        ARRAY['PENGURUS','KETUA_RT','BENDAHARA','SEKRETARIS','SUPERADMIN']::user_role[]
      )
  )
);

-- 5c. Pengurus-only update
DROP POLICY IF EXISTS "attachments_pengurus_update" ON storage.objects;
CREATE POLICY "attachments_pengurus_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'attachments'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY(
        ARRAY['PENGURUS','KETUA_RT','BENDAHARA','SEKRETARIS','SUPERADMIN']::user_role[]
      )
  )
);

-- 5d. Pengurus-only delete
DROP POLICY IF EXISTS "attachments_pengurus_delete" ON storage.objects;
CREATE POLICY "attachments_pengurus_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'attachments'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY(
        ARRAY['PENGURUS','KETUA_RT','BENDAHARA','SEKRETARIS','SUPERADMIN']::user_role[]
      )
  )
);

-- ============================================================
-- Step 6: Reload PostgREST schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';
`)
  console.log('---------------------------------------------------------')
} catch (error) {
  console.error('Error:', error)
}
