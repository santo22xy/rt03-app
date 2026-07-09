# Project Brain

## Ketentuan Utama

### Kategori Warga vs Status Pembayaran
- **Kategori warga** dan **status pembayaran** adalah dua field BERBEDA.
- Kategori: `NORMAL` | `KHUSUS` (di master `profiles.kategori_tarif`)
- Status pembayaran: `BELUM` | `CICIL` | `LUNAS` | `LEBIH` (di `jimpitan_tagihan.status`)
- **Status Cicil TIDAK BOLEH mengubah kategori menjadi Khusus.**
- Nilai kategori NULL TIDAK BOLEH otomatis dianggap Khusus.
- Kategori berasal dari master warga (`profiles.kategori_tarif`), bukan dari pembayaran.

### Relasi dan Identitas
- Relasi menggunakan `profile_id` / `resident_id`, BUKAN nama.
- `login_id` adalah ID warga yang terlihat (contoh: A-1, B-3).

### Aturan Keuangan
- Sinkronisasi kategori TIDAK BOLEH mengubah pembayaran, kas, atau riwayat cicilan.
- Pembuatan periode bulan berikutnya WAJIB menyalin kategori yang benar.
- Bulk Input TIDAK BOLEH mengubah kategori warga.
- Ringkasan kategori dihitung dari kategori, kartu Lunas/Cicil/Belum dihitung dari status pembayaran.

### Tarif Iuran
- NORMAL: Rp15.000
- KHUSUS: Rp10.000
- Tarif disimpan di `jimpitan_tagihan.nominal_tagihan` (snapshot saat dibuat).
- Tarif master di `jimpitan_tarif.nominal_aktif`.

---

## Struktur Data

### Tabel Utama

| Tabel | Fungsi |
|-------|--------|
| `profiles` | Master warga. `kategori_tarif`: NORMAL/KHUSUS |
| `jimpitan_tarif` | Tarif jimpitan per warga. `kategori`: NORMAL/PERLU_KONFIRMASI |
| `jimpitan_tagihan` | Tagihan bulanan per warga per periode. `kategori`: NORMAL/PERLU_KONFIRMASI |
| `jimpitan_sesi` | Sesi jimpitan (penjaga mengumpulkan) |
| `jimpitan_detail` | Detail per warga per sesi |
| `iuran_pembayaran` | Record pembayaran iuran |
| `kas_transaksi` | Semua transaksi kas (MASUK/KELUAR) |
| `dana_khusus` | Definisi dana khusus (Merti Desa, dll) |
| `dana_khusus_tagihan` | Tagihan per warga untuk dana khusus |
| `dana_khusus_pembayaran` | Pembayaran dana khusus (cicilan) |
| `ronda_attendance` | Absensi penjaga ronda |

### Mapping Kategori
- `profiles.kategori_tarif` = `NORMAL` → `jimpitan_tagihan.kategori` = `NORMAL`
- `profiles.kategori_tarif` = `KHUSUS` → `jimpitan_tagihan.kategori` = `PERLU_KONFIRMASI`

### Field Penting jimpitan_tagihan
- `profile_id` (UUID FK ke profiles)
- `periode_bulan` (DATE, format YYYY-MM-01)
- `nominal_tagihan` (INT, snapshot tarif)
- `total_terbayar` (INT, sum dari iuran_pembayaran)
- `status` (TEXT: BELUM/CICIL/LUNAS/LEBIH)
- `kategori` (TEXT: NORMAL/PERLU_KONFIRMASI)
- `kelebihan` (INT, kelebihan pembayaran)
- UNIQUE constraint: `(profile_id, periode_bulan)`

### Trigger Penting
| Trigger | Tabel | Fungsi |
|---------|-------|--------|
| `trg_sync_tagihan_from_pembayaran` | iuran_pembayaran | Sync jimpitan_tagihan saat pembayaran berubah (SQL 76, updated SQL 93) |
| `trg_auto_create_dana_khusus_tagihan` | dana_khusus | Auto-create tagihan per KK saat dana khusus dibuat (SQL 77) |
| `trg_auto_sync_new_resident` | profiles | Auto-sync warga baru ke dana khusus aktif (SQL 92) |
| `trg_sync_dana_khusus_tagihan` | dana_khusus_pembayaran | Update total_terbayar dana khusus (SQL 77) |
| `trg_dana_khusus_to_kas` | dana_khusus_pembayaran | Auto-insert kas_transaksi dari dana khusus (SQL 77) |

### RPC Functions
| Function | Parameter | Fungsi |
|----------|-----------|--------|
| `sync_kategori_warga(DATE)` | periode | Sinkron kategori dari master ke tagihan satu periode |
| `sync_all_kategori_warga()` | - | Sinkron kategori semua periode |
| `resync_dana_khusus_tagihan(UUID, INT, INT)` | id, target_normal, target_khusus | Resync nominal dana khusus |
| `sync_dana_khusus_participants(UUID)` | dana_khusus_id | Tambah warga aktif yang belum terdaftar |
| `sync_all_active_dana_khusus()` | - | Sync semua dana khusus aktif |

---

## Modul dan Logika

### Iuran Bulanan
- **File utama**: `src/app/(dashboard)/dashboard/iuran/page.tsx`
- **Server actions**: `src/app/(dashboard)/dashboard/iuran/bulk-actions.ts`
- **Sinkronisasi kategori**: `src/app/(dashboard)/dashboard/iuran/sync-kategori-button.tsx`
- Kategori di-resolve dengan fallback: `jimpitan_tagihan.kategori` → `profiles.kategori_tarif`
- Summary cards menghitung dari resolved kategori (bukan raw tagihan kategori)
- Bulk Input di `src/app/(dashboard)/dashboard/iuran/bulk-input-client.tsx`

### Jimpitan
- **File utama**: `src/app/(dashboard)/dashboard/jimpitan/page.tsx`
- **Server actions**: `src/app/(dashboard)/dashboard/jimpitan-actions.ts`
- ACC sesi (`accSesi`) membuat tagihan jika belum ada → WAJIB isi kategori dari profiles
- Pindah kelebihan (`pindahkanKelebihanKeBulanDepan`) juga membuat tagihan → WAJIB isi kategori
- Rekap: `src/app/(dashboard)/dashboard/jimpitan/rekap/page.tsx`

### Dana Khusus
- **File utama**: `src/app/(dashboard)/dashboard/dana-khusus/[id]/page.tsx`
- **Server actions**: `src/app/(dashboard)/dashboard/dana-khusus/dana-khusus-actions.ts`
- Warga baru otomatis masuk dana khusus aktif via trigger SQL 92
- Manual sync via "Sinkronkan Peserta" button

### Kas dan Transaksi
- **File utama**: `src/app/(dashboard)/dashboard/kas/page.tsx`
- Saldo awal bulan = opening balance + transaksi sebelum bulan ini
- Running saldo dimulai dari saldo awal bulan

### Warga
- **Server actions**: `src/app/(dashboard)/dashboard/warga/actions.ts`
- `tambahWarga()`: INSERT profiles → trigger SQL 92 otomatis sync ke dana khusus aktif

---

## Bug dan Perbaikan

### [2026-07-09] Kategori Iuran Bulanan Juli 2026 Salah
- **Masalah**: Semua warga Juli 2026 tampil "Khusus", ringkasan Normal 0/0
- **Penyebab**:
  1. Trigger `sync_jimpitan_tagihan_from_pembayaran()` INSERT tanpa `kategori` → NULL
  2. `accSesi()` INSERT tanpa `kategori` + lookup tarif salah (STANDAR/KURANG/ISTIMEWA)
  3. `pindahkanKelebihanKeBulanDepan()` INSERT tanpa `kategori` + lookup tarif salah
  4. `getWargaWithTagihan()` lookup tarif salah (STANDAR:3000 vs NORMAL:15000)
  5. Halaman iuran: NULL kategori tampil "Khusus" (else branch)
  6. Profile query tidak select `kategori_tarif` untuk fallback
- **File yang diubah**:
  - `src/app/(dashboard)/dashboard/jimpitan-actions.ts` (accSesi, pindahkanKelebihan)
  - `src/app/(dashboard)/dashboard/iuran/bulk-actions.ts` (getWargaWithTagihan, +syncKategoriWarga)
  - `src/app/(dashboard)/dashboard/iuran/page.tsx` (resolve kategori, summary cards)
  - Baru: `src/app/(dashboard)/dashboard/iuran/sync-kategori-button.tsx`
- **Database**: `sql/93-fix-iuran-kategori.sql` (fix trigger + backfill + RPC)
- **Solusi**:
  1. Semua INSERT jimpitan_tagihan sekarang menyertakan `kategori` dari `profiles.kategori_tarif`
  2. Lookup tarif diperbaiki: NORMAL=15000, KHUSUS=10000
  3. Halaman iuran resolve kategori dengan fallback ke profiles
  4. Summary cards hitung dari resolved kategori
  5. SQL 93 backfill kategori NULL + fix trigger + buat RPC sync
- **Migration**: SQL 93 wajib dijalankan di Supabase SQL Editor
- **Status**: Selesai, pushed (commit `e9eae21`)
- **Dampak**: Tidak mengubah nominal pembayaran, kas, atau status Cicil/Lunas

### [2026-07-09] Warga Baru Tidak Masuk Dana Khusus
- **Masalah**: Warga baru yang ditambahkan pengurus tidak otomatis masuk dana khusus aktif
- **Penyebab**: Tidak ada trigger pada `profiles` INSERT yang membuat `dana_khusus_tagihan`
- **File**: `sql/92-auto-sync-new-resident-to-dana-khusus.sql`
- **Solusi**: Trigger `trg_auto_sync_new_resident` pada profiles INSERT/UPDATE
- **Status**: Selesai, pushed (commit `7ac40ec`)

### [2026-07-08] Saldo Awal Bulan Juli Rp0
- **Masalah**: Buku transaksi Juli menampilkan saldo awal Rp0
- **Penyebab**: Filter `tanggal >= firstDayOfMonth AND tanggal <= openingDate` salah saat cash_opening_balances kosong
- **File**: `src/app/(dashboard)/dashboard/kas/page.tsx`
- **Solusi**: Filter `tanggal < firstDayOfMonth` untuk hitung saldo sebelum bulan ini
- **Status**: Selesai

### [2026-07-07] ACC Jimpitan Error source_id
- **Masalah**: Gagal ACC jimpitan karena kolom `source_id` tidak ada
- **Penyebab**: `accSesi` mereferensi kolom `source_id` yang tidak ada di production DB
- **File**: `src/app/(dashboard)/dashboard/jimpitan-actions.ts`
- **Solusi**: Hapus referensi `source_id`, gunakan `trx_id_external` untuk deduplikasi
- **Status**: Selesai

---

## Update Terkini

### [2026-07-09 15:10 WIB] Fix Kategori Iuran Bulanan
- **Permintaan**: Perbaiki bug kategori warga Juli 2026 salah jadi Khusus
- **Temuan**: 6 penyebab (lihat Bug dan Perbaikan)
- **Perubahan yang dilakukan**:
  1. `jimpitan-actions.ts`: Fix `accSesi()` - tambah kategori, login_id, nama_kk_snapshot; fix tarif NORMAL=15000/KHUSUS=10000
  2. `jimpitan-actions.ts`: Fix `pindahkanKelebihanKeBulanDepan()` - tambah kategori; fix tarif lookup
  3. `bulk-actions.ts`: Fix `getWargaWithTagihan()` - fix tarif lookup
  4. `bulk-actions.ts`: Tambah `syncKategoriWarga()` server action
  5. `page.tsx` (iuran): Tambah `kategori_tarif` di profile query, resolve kategori dengan fallback, fix summary cards
  6. Baru: `sync-kategori-button.tsx` - tombol sinkronisasi kategori
  7. Baru: `sql/93-fix-iuran-kategori.sql` - fix trigger, backfill data, RPC sync
- **File yang diubah**: 4 file TS + 1 file SQL baru + 1 komponen baru
- **Tabel/fungsi yang diubah**: `sync_jimpitan_tagihan_from_pembayaran()` (trigger), +`sync_kategori_warga()`, +`sync_all_kategori_warga()`
- **Migration**: SQL 93 wajib dijalankan di Supabase SQL Editor
- **Hasil pengujian**: Build sukses, pushed ke GitHub
- **Status**: Selesai
- **Catatan lanjutan**: User perlu jalankan SQL 93 untuk backfill data Juli dan fix trigger

---

## Pekerjaan Belum Selesai

| Item | Status | Keterangan |
|------|--------|------------|
| Jalankan SQL 93 di Supabase | Pending | Backfill kategori NULL + fix trigger + buat RPC |
| Jalankan SQL 92 di Supabase | Pending | Auto-sync warga baru ke dana khusus |
| Jalankan SQL 91 di Supabase | Pending | Rekap jimpitan + saldo awal kas |
| Jalankan SQL 89 di Supabase | Pending | nota_url, bukti_url, storage bucket |

---

## Riwayat Keputusan

1. **Kategori warga menggunakan `profiles.kategori_tarif`** sebagai single source of truth. `jimpitan_tagihan.kategori` adalah cache/snapshot.
2. **Mapping**: NORMAL→NORMAL, KHUSUS→PERLU_KONFIRMASI (di tagihan).
3. **Tarif**: NORMAL=Rp15.000, KHUSUS=Rp10.000.
4. **Tidak menggunakan** STANDAR/KURANG/ISTIMEWA (legacy, sudah dihapus).
5. **Trigger sync_pembayaran** hanya UPDATE status/total_terbayar, TIDAK mengubah kategori saat DO UPDATE.
6. **Kategori warga baru** ditentukan dari `profiles.kategori_tarif` saat INSERT.
