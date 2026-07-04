-- 87: Tambahkan kolom kelebihan dan kelebihan_tujuan ke jimpitan_tagihan
-- Jalankan di Supabase SQL Editor

ALTER TABLE jimpitan_tagihan ADD COLUMN IF NOT EXISTS kelebihan NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE jimpitan_tagihan ADD COLUMN IF NOT EXISTS kelebihan_tujuan TEXT; -- NULL | BULAN_DEPAN | HIBAH
ALTER TABLE jimpitan_tagihan ADD COLUMN IF NOT EXISTS kelebihan_catatan TEXT;

-- Backfill kelebihan untuk tagihan yang sudah memiliki total_terbayar > nominal_tagihan
UPDATE jimpitan_tagihan
SET kelebihan = CASE WHEN total_terbayar > nominal_tagihan THEN total_terbayar - nominal_tagihan ELSE 0 END
WHERE kelebihan = 0;

CREATE INDEX IF NOT EXISTS idx_jimpitan_tagihan_kelebihan ON jimpitan_tagihan(kelebihan) WHERE kelebihan > 0;
