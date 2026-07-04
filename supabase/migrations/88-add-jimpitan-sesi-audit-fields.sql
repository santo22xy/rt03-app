-- Tambahkan field audit dan status untuk jimpitan_sesi
ALTER TABLE jimpitan_sesi
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS created_by_role TEXT,
  ADD COLUMN IF NOT EXISTS created_from TEXT,
  ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS submitted_by_name TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS approved_by_name TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS kas_transaction_id UUID REFERENCES kas_transaksi(id),
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Pastikan status diisi dengan default status
ALTER TABLE jimpitan_sesi ALTER COLUMN status SET DEFAULT 'draft';
