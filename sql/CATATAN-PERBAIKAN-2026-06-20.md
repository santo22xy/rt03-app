# Perbaikan 20 Juni 2026

## Root Cause: View `v_penjaga_efektif` Hilang dari Database

### Gejala

View `v_penjaga_efektif` yang didefinisikan di `sql/20-ronda-jimpitan-tables.sql` (line 170) **tidak ada di database**. Akibatnya:

- Dashboard pengurus (`/dashboard`) kartu "Jadwal Berikutnya" kosong
- Halaman `/warga` (beranda warga) section jadwal kosong
- Halaman `/warga/ronda` list jadwal kosong
- Halaman `/dashboard/jimpitan/[id]` info penjaga tidak muncul
- Halaman `/warga/jimpitan/[id]` info penjaga tidak muncul
- Auto-mark attendance penjaga di submit jimpitan gagal

Semua query return **0 rows** karena PostgREST return 404 untuk view yang tidak ada.

### Penyebab

View kemungkinan hilang karena:

1. SQL 42 pernah `DROP POLICY` + `CREATE POLICY` di tabel `profiles` dan tabel lain - ini tidak seharusnya menghapus view
2. Database di-reset / di-restore dari backup yang lebih lama
3. Schema migration yang drop schema `public` tanpa recreate view

## Solusi

### File SQL 49 — WAJIB dijalankan user

[sql/49-create-v-penjaga-efektif.sql](file:///c:/Users/chris/rt03-app/sql/49-create-v-penjaga-efektif.sql)

Isinya:

1. **Section A**: Diagnosa count `jadwal_ronda` + `ronda_swap`
2. **Section B**: `CREATE OR REPLACE VIEW v_penjaga_efektif` dengan:
   - Kolom penjaga asli (`profile_asli_id`, `nama_asli`, `blok_asli`, `nomor_rumah_asli`)
   - Kolom penjaga efektif (`profile_efektif_id`, `nama_efektif`) — `COALESCE(swap, asli)`
   - Placeholder `blok_snapshot_efektif`, `nomor_rumah_snapshot_efektif` (NULL, untuk future)
   - Flag `is_swapped` (true kalau ada swap aktif)
   - `LEFT JOIN ronda_swap` dengan filter `is_active=true AND tanggal=j.tanggal`
   - `WHERE j.is_active=true` (sinkron dengan SQL 42 yang activate jadwal masa depan)
3. **Section C**: `NOTIFY pgrst, 'reload schema'` — force PostgREST refresh cache
4. **Section D**: Verifikasi view return data (sample 10 baris)
5. **Section E**: Status check
6. **Section F**: **Simulasi 6 query persis seperti di kode** untuk validasi fix end-to-end:
   - F1: dashboard/page.tsx - next jadwal
   - F2: warga/page.tsx - jadwal saya
   - F3: warga/ronda/page.tsx - 4 minggu ke depan
   - F4-F5: jimpitan/[id] page (pengurus & warga) - penjaga by tanggal sesi
   - F6: jimpitan-actions.ts - auto-mark attendance
7. **Section G**: Verifikasi PostgREST exposure (`pg_views`, view_definition, summary)

### Cara Jalanin

1. Buka https://supabase.com/dashboard/project/kjnmyiqzamftysgndbne/sql/new
2. Paste isi `sql/49-create-v-penjaga-efektif.sql`
3. Klik **Run** (atau Ctrl+Enter)
4. Pastikan **Section G "Summary akhir"** output:
   ```
   jadwal_aktif | rows_di_view | total_sesi | status
   -------------+--------------+------------+--------------------------------
   10           | 10           | N          | ✅ FIX BERHASIL - view aktif dan return data
   ```
5. Tunggu 10-30 detik untuk PostgREST cache sync
6. Refresh browser tab aplikasi

## View Schema (untuk referensi kode)

| Column                       | Type           | Sumber                              |
|------------------------------|----------------|-------------------------------------|
| `jadwal_id`                  | UUID           | `jadwal_ronda.id`                   |
| `tanggal`                    | DATE           | `jadwal_ronda.tanggal`              |
| `minggu_ke`, `bulan`, `tahun`| INT            | `jadwal_ronda.*`                    |
| `profile_asli_id`            | UUID           | `jadwal_ronda.penjaga_profile_id`   |
| `nama_asli`                  | TEXT           | `jadwal_ronda.nama_penjaga_snapshot`|
| `blok_asli`                  | TEXT           | `jadwal_ronda.blok_snapshot`        |
| `nomor_rumah_asli`           | TEXT           | `jadwal_ronda.nomor_rumah_snapshot` |
| `profile_efektif_id`         | UUID           | `COALESCE(swap, asli)`              |
| `nama_efektif`               | TEXT           | `COALESCE(swap, asli)`              |
| `blok_snapshot_efektif`      | TEXT (NULL)    | placeholder (future)                |
| `nomor_rumah_snapshot_efektif` | TEXT (NULL)  | placeholder (future)                |
| `is_swapped`                 | BOOLEAN        | `(s.id IS NOT NULL)`                |

## Catatan Teknis

### Kenapa view tidak pakai `ORDER BY` di SELECT langsung?

`ORDER BY` di dalam view definition di PostgreSQL **diabaikan** saat view di-query
(kecuali pakai `SELECT * FROM view ORDER BY ...`). View + query klien tetap bisa
pakai ORDER BY sendiri, jadi tidak masalah. ORDER BY di view definition hanya untuk
dokumentasi.

### Kenapa view filter `is_active = true`?

Sinkron dengan Section E di SQL 42 yang activate jadwal masa depan. Kalau jadwal
`is_active = false`, view skip — supaya UI tidak menampilkan jadwal yang sudah
dihapus/diarsipkan.

### Kenapa ada placeholder kolom `blok_snapshot_efektif` dll?

`ronda_swap` belum punya kolom `blok_pengganti` / `nomor_rumah_pengganti`. Kalau
nantinya ditambah, view bisa di-update tanpa breaking change (NULL → real value).

## Verifikasi Setelah Run SQL 49

```sql
-- Expected: 1 row
SELECT viewname FROM pg_views WHERE viewname = 'v_penjaga_efektif';

-- Expected: ~10 rows (atau sebanyak jadwal_ronda yang aktif)
SELECT COUNT(*) FROM v_penjaga_efektif;

-- Expected: rows muncul (sesuai jadwal Ronda)
SELECT * FROM v_penjaga_efektif ORDER BY tanggal LIMIT 5;
```

Setelah SQL 49 sukses, halaman-halaman berikut harusnya kembali normal:

- `/dashboard` — kartu "Jadwal Ronda Berikutnya" muncul
- `/warga` — section jadwal ronda
- `/warga/ronda` — list jadwal 4 minggu
- `/dashboard/jimpitan/[id]` — info penjaga jadwal
- `/warga/jimpitan/[id]` — info penjaga jadwal
- Submit jimpitan — auto-mark attendance penjaga
