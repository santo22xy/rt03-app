// Cetak SQL migrasi 90 ke terminal. Salin dari "-- ====" pertama sampai "NOTIFY pgrst".

const SQL = `-- =====================================================
-- SQL 90: RPC resync_dana_khusus_tagihan
-- FIX: perubahan nominal iuran dana khusus diterapkan ke
-- SELURUH warga (termasuk yang sudah cicil), lalu status
-- dihitung ulang dari total_terbayar vs nominal baru.
-- =====================================================

CREATE OR REPLACE FUNCTION resync_dana_khusus_tagihan(
  p_dana_khusus_id UUID,
  p_target_normal INT,
  p_target_khusus INT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE dana_khusus_tagihan t
  SET nominal_tagihan = CASE
        WHEN p.kategori_tarif = 'KHUSUS' THEN p_target_khusus
        ELSE p_target_normal
      END,
      updated_at = NOW()
  FROM profiles p
  WHERE t.dana_khusus_id = p_dana_khusus_id
    AND t.profile_id = p.id;

  UPDATE dana_khusus_tagihan
  SET status = CASE
        WHEN total_terbayar > nominal_tagihan THEN 'LEBIH'
        WHEN total_terbayar = nominal_tagihan AND total_terbayar > 0 THEN 'LUNAS'
        WHEN total_terbayar > 0 THEN 'CICIL'
        ELSE 'BELUM'
      END,
      updated_at = NOW()
  WHERE dana_khusus_id = p_dana_khusus_id;
END;
$$;

GRANT EXECUTE ON FUNCTION resync_dana_khusus_tagihan(UUID, INT, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
`

console.log(SQL)
