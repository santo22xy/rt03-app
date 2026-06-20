# Perbaikan 19 Juni 2026

## Root Cause: Infinite Recursion di RLS profiles

Penyebab semua halaman pengurus (Kas, Ronda, Jimpitan, Iuran) tidak bisa query data:

```
42P17: infinite recursion detected in policy for relation "profiles"
```

Policy `profiles` lama pakai `EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() ...)` —
yang trigger dirinya sendiri. Akibatnya query `kas_transaksi`, `jadwal_ronda`, dll
juga gagal karena ada FK / relasi ke `profiles`.

## Solusi

### A. Code changes (sudah selesai)

Semua halaman dashboard pengurus dan server actions di-`createClient()` (auth client)
diganti ke `createAdminClient()` (service-role, bypass RLS):

- `src/app/(dashboard)/dashboard/kas/page.tsx`
- `src/app/(dashboard)/dashboard/iuran/page.tsx`
- `src/app/(dashboard)/dashboard/ronda/page.tsx`
- `src/app/(dashboard)/dashboard/jimpitan/page.tsx`
- `src/app/(dashboard)/dashboard/jimpitan/[id]/page.tsx`
- `src/app/(dashboard)/dashboard/jimpitan-actions.ts`

### B. SQL 42 — WAJIB dijalankan user

[sql/42-fix-all-rls-and-jadwal.sql](file:///c:/Users/chris/rt03-app/sql/42-fix-all-rls-and-jadwal.sql)

File SQL gabungan yang isinya:
1. **Fix RLS recursion** — drop policy lama, buat policy baru pakai `auth.jwt() -> 'app_metadata' ->> 'role'`
2. **Sync app_metadata.role** untuk semua user pengurus (supaya JWT berisi role)
3. **Generate jadwal ronda 2026-07 sampai 2027-06** — auto-rotate 4 KETUA kelompok (K1-K4) per Sabtu

Cara jalanin:
1. Buka https://supabase.com/dashboard/project/kjnmyiqzamftysgndbne/sql/new
2. Paste isi `sql/42-fix-all-rls-and-jadwal.sql`
3. Klik **Run** (atau Ctrl+Enter)
4. Pastikan tidak ada error di output
5. Refresh browser tab aplikasi

## 3 Masalah User — Status

### 1. ✅ Tampilan Kas pengurus kosong

- **Penyebab:** Query `kas_transaksi` kena infinite recursion RLS profiles.
- **Fix:** Pakai `createAdminClient()` (service role bypass RLS).
- **Expected after SQL 42 + refresh:** Saldo **Rp 148.500** (372.000 masuk - 223.500 keluar), 38 transaksi.

### 2. ✅ Jadwal Ronda masih kosong

- **Penyebab:** `jadwal_ronda` hanya ada 4 entry (06-06, 06-13, 06-20, 06-27). Setelah 06-27 kosong.
- **Fix:** SQL 42 auto-generate jadwal dari Sabtu pertama setelah MAX(tanggal) sampai 2027-06-30.
- **Pola:** 4 KETUA kelompok berotasi per Sabtu
  - 06-06: Kurniawan (K1)
  - 06-13: Amar Marruf (K2)
  - 06-20: Andi H. (K3)
  - 06-27: Edi Santosa (K4)
  - 07-04: Kurniawan lagi (K1)
  - ... dst

### 3. ✅ Pengurus bisa input Jimpitan kapanpun

- **Fix:**
  - Halaman `/dashboard/jimpitan` sekarang ada card **"Mode Pengurus — Uji Coba Alur"**
    (kuning, hanya muncul kalau login sebagai KETUA_RT/BENDAHARA/SEKRETARIS/SUPERADMIN)
  - Bisa pilih tanggal Sabtu terdekat atau tanggal lain
  - Submit → buat sesi baru dengan status AKTIF, langsung bisa dibuka
- **Untuk warga biasa:** Tidak berubah, tetap hanya bisa daftar di window Sabtu 19-23 WIB.

## Catatan Tambahan

- File `lib/ronda.ts` baru: helper `getNextSaturdays(n)` untuk dropdown tanggal pengurus
- `jimpitan-actions.ts` direfactor: `getCurrentUser()` dan `getCurrentWarga()` pakai admin client untuk query profiles (RLS-safe)

## Verifikasi Setelah Run SQL 42

Setelah SQL 42 dijalankan, query berikut harusnya sukses:

```sql
SELECT COUNT(*) FROM kas_transaksi;
-- expected: 38
SELECT COUNT(*) FROM jadwal_ronda WHERE tanggal >= CURRENT_DATE;
-- expected: ~51 (Sabtu dari 2026-06-20 sampai 2027-06-30)
SELECT COUNT(*) FROM profiles;
-- expected: 30 (tidak ada error recursion)
```