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
| `edit_jimpitan_submitted(...)` | sesi_id, changed_by, reason, details, attendance | Edit sesi submitted (atomik) |
| `cancel_jimpitan_submitted(...)` | sesi_id, cancelled_by, reason | Batalkan sesi belum masuk kas |
| `edit_jimpitan_approved(...)` | sesi_id, changed_by, reason, details, attendance | Edit sesi approved + update kas |
| `cancel_jimpitan_approved(...)` | sesi_id, cancelled_by, reason | Batalkan sesi approved + void kas + reversal |

---

## Modul dan Logika

### Iuran Bulanan
- **File utama**: `src/app/(dashboard)/dashboard/iuran/page.tsx`
- **Server actions**: `src/app/(dashboard)/dashboard/iuran/bulk-actions.ts`
- **Pembayaran langsung**: `src/app/(dashboard)/dashboard/iuran/direct-payment-dialog.tsx`
- **Sinkronisasi kategori**: `src/app/(dashboard)/dashboard/iuran/sync-kategori-button.tsx`
- Kategori di-resolve dengan fallback: `jimpitan_tagihan.kategori` → `profiles.kategori_tarif`
- Summary cards menghitung dari resolved kategori (bukan raw tagihan kategori)
- **Jimpitan = cicilan Iuran Bulanan** (bukan tagihan terpisah)
- **Pembayaran langsung**: form dialog, auto-allocate (tunggakan → bulan berjalan → kredit)
- **Tabel baru**: `monthly_payments`, `monthly_payment_allocations`, `resident_credit_balance`
- Bulk Input di `src/app/(dashboard)/dashboard/iuran/bulk-input-client.tsx`

### Jimpitan
- **File utama**: `src/app/(dashboard)/dashboard/jimpitan/page.tsx`
- **Server actions**: `src/app/(dashboard)/dashboard/jimpitan-actions.ts`
- **Form**: `src/app/(dashboard)/dashboard/jimpitan/[id]/jimpitan-form.tsx`
- ACC sesi (`accSesi`) membuat tagihan jika belum ada → WAJIB isi kategori dari profiles
- Pindah kelebihan (`pindahkanKelebihanKeBulanDepan`) juga membuat tagihan → WAJIB isi kategori
- **Edit sesi**: Bendahara bisa edit SUBMITTED dan APPROVED via RPC atomik
- **Batalkan sesi**: Bendahara bisa batalkan SUBMITTED dan APPROVED (soft delete + void kas + reversal)
- **Audit log**: Semua edit/cancel tercatat di `jimpitan_audit_log`
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

### [2026-07-09 16:30 WIB] Fitur Edit & Batalkan Sesi Jimpitan (Submitted + Approved)
- **Permintaan**: Bendahara dapat mengedit dan membatalkan sesi submitted dan approved
- **Aturan akses**:
  - BENDAHARA/KETUA_RT/SUPERADMIN: bisa edit & batalkan SUBMITTED dan APPROVED
  - Role lain: tidak bisa edit/batalkan APPROVED
  - Validasi di backend via RPC (SECURITY DEFINER), bukan hanya UI
- **Perubahan yang dilakukan**:
  1. `sql/94-edit-cancel-jimpitan-sesi.sql`:
     - Kolom baru: `jimpitan_sesi.revised_at/revised_by/revision_reason/revision_count`
     - Kolom baru: `kas_transaksi.source_type/source_id/voided/voided_at/voided_by/void_reason/reversal_of`
     - Tabel baru: `jimpitan_audit_log` (module, session_id, action, old_data, new_data, reason, changed_by)
     - RPC `edit_jimpitan_submitted()`: edit sesi submitted (atomik)
     - RPC `cancel_jimpitan_submitted()`: batalkan sesi belum masuk kas
     - RPC `edit_jimpitan_approved()`: edit sesi approved + update kas_transaksi yang sama
     - RPC `cancel_jimpitan_approved()`: void kas_transaksi + buat reversal (KELUAR) + tandai cancelled
     - Backfill `source_type/source_id` dari sesi yang sudah ada
     - RLS update: bendahara boleh UPDATE sesi
  2. `jimpitan-actions.ts`:
     - Update `cancelJimpitanSesi()`: handle APPROVED via `cancel_jimpitan_approved` RPC, SUBMITTED via `cancel_jimpitan_submitted`
     - Baru: `editJimpitanSesi()`: wrap RPC edit_submitted/edit_approved
     - Baru: `getJimpitanAuditLog()`: ambil audit log sesi
  3. `jimpitan-form.tsx`:
     - Tambah `editMode` state untuk mode edit
     - Tambah `canEdit` flag (SUBMITTED/APPROVED untuk bendahara)
     - `isLocked` sekarang bisa di-override oleh `editMode`
     - Tombol "Edit Data" + "Batalkan Sesi" + "Riwayat Perubahan"
     - Dialog alasan edit (wajib minimal 5 karakter)
     - Dialog audit log (menampilkan semua perubahan)
     - Warning amber untuk sesi APPROVED
     - Mode edit banner (blue)
     - Update cancel dialog: warning void kas untuk APPROVED
- **Strategi kas**:
  - Edit approved: UPDATE nominal kas_transaksi yang sama (via `kas_transaction_id`)
  - Cancel approved: void transaksi lama (voided=true) + buat transaksi reversal KELUAR
- **File yang diubah**: 3 file (1 SQL baru, 2 TS modified)
- **Tabel baru**: `jimpitan_audit_log`
- **Kolom baru**: jimpitan_sesi (+4), kas_transaksi (+7)
- **RPC baru**: `edit_jimpitan_submitted`, `cancel_jimpitan_submitted`, `edit_jimpitan_approved`, `cancel_jimpitan_approved`
- **Migration**: SQL 94 wajib dijalankan di Supabase SQL Editor
- **Hasil pengujian**: Build sukses, pushed ke GitHub (commit `bc5a495`)
- **Status**: Selesai
- **Risiko**:
  - RPC `edit_jimpitan_approved` menghapus dan meng-insert ulang jimpitan_detail → perlu pastikan `jimpitan_tagihan` trigger tidak bermasalah
  - Transaksi reversal menggunakan kategori `REVERSAL_JIMPITAN` → pastikan halaman kas menanganinya dengan benar
  - Tidak ada mekanisme restore/pulihkan sesi cancelled (belum diimplementasikan)

### [2026-07-09 18:00 WIB] Kartu Ringkasan Interaktif Rekap Jimpitan
- **Permintaan**: Kartu ringkasan pada halaman Rekap Jimpitan Bulanan menjadi filter cepat
- **Perubahan yang dilakukan**:
  1. `rekap/page.tsx`:
     - Tambah `quickFilter` state: 'all' | 'paid' | 'shortage' | 'excess'
     - Kartu Total Warga/Terkumpul/Kekurangan/Kelebihan jadi tombol interaktif
     - Klik kartu filter tabel: `paidAmount > 0`, `paidAmount < effectiveDue`, `paidAmount > effectiveDue`
     - Klik kartu aktif lagi → kembali ke 'all'
     - Chip filter aktif dengan tombol × hapus filter
     - Tampilkan jumlah "Menampilkan X dari Y warga"
     - Empty state kontekstual per filter
     - Reset quickFilter saat ganti bulan/tahun
     - Aksesibilitas: `role="button"`, `tabIndex`, `aria-pressed`, `aria-label`, handler Enter/Space
  2. `rekap/export-rekap-pdf.tsx`:
     - Tambah props `quickFilter` dan `quickFilterLabel`
     - PDF export ikuti filter aktif
     - Tambah label "Filter: ..." di header PDF jika filter aktif
- **File yang diubah**: 2 file (`rekap/page.tsx`, `rekap/export-rekap-pdf.tsx`)
- **Tidak mengubah**: perhitungan nominal, status pembayaran, database
- **Hasil pengujian**: Build sukses, pushed ke GitHub (commit `45a7d13`)
- **Status**: Selesai

### [2026-07-09 20:00 WIB] Sistem Pembayaran Iuran Bulanan Terintegrasi Jimpitan
- **Permintaan**: Jimpitan = cicilan Iuran Bulanan. Tambah pembayaran langsung, alokasi multi-bulan, kredit, hibah.
- **Konsep desain**:
  - Jimpitan bukan tagihan terpisah — metode cicilan untuk Iuran Bulanan
  - Pembayaran: Jimpitan (via sesi) atau Langsung (via form Bendahara)
  - Alokasi: per-bulan, tunggakan, di muka, kredit, hibah
  - Kas masuk saat uang diterima, bukan saat alokasi
- **Perubahan yang dilakukan**:
  1. `sql/95-integrated-payment-system.sql`:
     - Tabel `monthly_payments`: menyimpan setiap penerimaan uang
     - Tabel `monthly_payment_allocations`: alokasi per-bulan dari setiap pembayaran
     - Tabel `resident_credit_balance`: saldo kredit per warga
     - RPC `get_warga_payment_summary(UUID, DATE)`: ringkasan pembayaran warga
     - RPC `input_direct_payment(...)`: pembayaran langsung + auto-allocate + kas masuk
     - RPC `sync_tagihan_from_allocations(UUID)`: sinkronisasi tagihan dari alokasi
     - RPC `get_all_warga_payment_status(DATE)`: ringkasan semua warga periode tertentu
     - Backfill dari data jimpitan approved yang sudah ada
  2. `iuran/bulk-actions.ts`:
     - Tambah interface `WargaPaymentSummary`, `PeriodePaymentRow`
     - Tambah `getWargaPaymentSummary()`: ringkasan warga via RPC
     - Tambah `inputPembayaranLangsung()`: wrapper RPC pembayaran langsung
     - Tambah `getPeriodePaymentStatus()`: wrapper RPC ringkasan periode
  3. `iuran/direct-payment-dialog.tsx` (baru):
     - Dialog input pembayaran langsung
     - Pilih warga → tampilkan ringkasan (target, jimpitan, langsung, kredit, tunggakan)
     - Input tanggal, nominal, metode, catatan
     - Info alokasi otomatis
  4. `iuran/direct-payment-button.tsx` (baru):
     - Client wrapper untuk tombol + dialog
  5. `iuran/page.tsx`:
     - Tambah tombol "Bayar Langsung" di header
- **Struktur data baru**:
  - `monthly_payments`: id, profile_id, payment_date, total_amount, payment_channel (jimpitan/direct), payment_method, source_type, source_id, status, notes, created_by, approved_by, cancelled_at
  - `monthly_payment_allocations`: id, payment_id, profile_id, period_month, period_year, allocated_amount, allocation_type (arrears/current_month/advance/credit/donation/unallocated)
  - `resident_credit_balance`: profile_id (PK), credit_balance, total_donated
- **Alokasi otomatis**: tunggakan paling lama → bulan berjalan → sisa jadi kredit
- **Integrasi kas**: `input_direct_payment` buat `kas_transaksi` MASUK langsung
- **Backfill**: data jimpitan approved yang sudah ada → `monthly_payments` dengan `payment_channel='jimpitan'`
- **File yang diubah**: 3 file baru + 2 file modified
- **Migration**: SQL 95 wajib dijalankan di Supabase SQL Editor
- **Hasil pengujian**: Build sukses, pushed ke GitHub (commit `af64506`)
- **Status**: Selesai (fase 1: pembayaran langsung + alokasi otomatis)
- **Pekerjaan lanjutan**:
  - Dialog alokasi manual (custom allocation)
  - Multi-month payment UI
  - Alokasi kelebihan ke bulan berikutnya
  - Hibah dari kelebihan
  - Edit/cancel pembayaran langsung
  - Integrasi dengan rekap bulanan dan PDF

---

## Pekerjaan Belum Selesai

| Item | Status | Keterangan |
|------|--------|------------|
| Jalankan SQL 95 di Supabase | Pending | Sistem pembayaran terintegrasi + tabel baru |
| Jalankan SQL 94 di Supabase | Pending | Edit/cancel sesi jimpitan + audit log |
| Jalankan SQL 93 di Supabase | Pending | Backfill kategori NULL + fix trigger + buat RPC |
| Jalankan SQL 92 di Supabase | Pending | Auto-sync warga baru ke dana khusus |
| Jalankan SQL 91 di Supabase | Pending | Rekap jimpitan + saldo awal kas |
| Jalankan SQL 89 di Supabase | Pending | nota_url, bukti_url, storage bucket |
| Pulihkan sesi cancelled | Belum | Fitur restore belum diimplementasikan |
| Uji end-to-end edit/cancel | Belum | Perlu uji setelah SQL 94 dijalankan |

---

## Riwayat Keputusan

1. **Kategori warga menggunakan `profiles.kategori_tarif`** sebagai single source of truth. `jimpitan_tagihan.kategori` adalah cache/snapshot.
2. **Mapping**: NORMAL→NORMAL, KHUSUS→PERLU_KONFIRMASI (di tagihan).
3. **Tarif**: NORMAL=Rp15.000, KHUSUS=Rp10.000.
4. **Tidak menggunakan** STANDAR/KURANG/ISTIMEWA (legacy, sudah dihapus).
5. **Trigger sync_pembayaran** hanya UPDATE status/total_terbayar, TIDAK mengubah kategori saat DO UPDATE.
6. **Kategori warga baru** ditentukan dari `profiles.kategori_tarif` saat INSERT.
7. **Edit/cancel sesi jimpitan** menggunakan RPC atomik (SECURITY DEFINER) untuk memastikan konsistensi data.
8. **Ses APPROVED tidak boleh di-hard delete** — gunakan soft delete (status=CANCELLED) + void kas_transaksi + reversal.
9. **Transaksi kas dari jimpitan** di-link via `jimpitan_sesi.kas_transaction_id` → `kas_transaksi.id`, dan di-backfill ke `kas_transaksi.source_type/source_id`.
10. **Audit log wajib** untuk setiap edit/cancel sesi — tersimpan di `jimpitan_audit_log` dengan old_data dan new_data (JSONB).
11. **Kartu ringkasan rekap jimpitan** berfungsi sebagai filter cepat (paid/shortage/excess). Klik kartu aktif → kembali ke 'all'. Filter reset saat ganti periode.
12. **Jimpitan adalah cicilan Iuran Bulanan**, bukan tagihan terpisah. Pembayaran dapat melalui Jimpitan (sesi) atau Langsung (form Bendahara).
13. **Alokasi otomatis**: tunggakan paling lama → bulan berjalan → sisa jadi kredit. Hibah hanya jika dipilih warga.
14. **Kas masuk saat uang diterima**, bukan saat alokasi. Alokasi ke bulan depan tidak membuat kas baru.
