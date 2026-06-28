-- =====================================================
-- SQL 72: Cek sesi + test INSERT langsung
-- =====================================================

-- A. Cek sesi Juni yang ada
SELECT 'a_sesi' AS s, tanggal::text, status, total_pendapatan
FROM jimpitan_sesi
WHERE tanggal BETWEEN '2026-06-01' AND '2026-06-30'
ORDER BY tanggal;

-- B. Test INSERT sesi 6 Juni langsung (tanpa DO block)
INSERT INTO jimpitan_sesi (tanggal, status, total_pendapatan, created_at)
VALUES ('2026-06-06', 'APPROVED', 0, NOW())
RETURNING id, tanggal, status;