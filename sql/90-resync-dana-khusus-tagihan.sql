-- =====================================================
-- SQL 90: RPC resync_dana_khusus_tagihan
-- FIX: perubahan nominal iuran dana khusus harus diterapkan
-- ke SELURUH warga (termasuk yang sudah cicil) secara konsisten,
-- lalu status dihitung ulang dari total_terbayar vs nominal baru.
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
  -- 1. Update nominal_tagihan tiap tagihan berdasarkan kategori_tarif profile-nya.
  --    NORMAL  -> p_target_normal
  --    KHUSUS  -> p_target_khusus
  --    (default fallback ke normal kalau kategori_tarif NULL/kosong)
  UPDATE dana_khusus_tagihan t
  SET nominal_tagihan = CASE
        WHEN p.kategori_tarif = 'KHUSUS' THEN p_target_khusus
        ELSE p_target_normal
      END,
      updated_at = NOW()
  FROM profiles p
  WHERE t.dana_khusus_id = p_dana_khusus_id
    AND t.profile_id = p.id;

  -- 2. Hitung ulang status dari total_terbayar vs nominal_tagihan baru.
  --    Sesuai trigger sync_dana_khusus_tagihan:
  --      total > nominal -> LEBIH
  --      total = nominal (dan > 0) -> LUNAS
  --      total > 0 -> CICIL
  --      else -> BELUM
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

-- Beri akses eksekusi ke peran terautentikasi (RLS tetap mengatur akses baris)
-- Fungsi adalah SECURITY DEFINER sehingga berjalan sebagai pemilik (bypass RLS write).
GRANT EXECUTE ON FUNCTION resync_dana_khusus_tagihan(UUID, INT, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
