// Diagnostik data: profiles, jadwal_ronda, kas_transaksi, jimpitan_tagihan, jimpitan_sesi
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing env'); process.exit(1) }

const sb = createClient(url, key)

async function run() {
  console.log('=== A. JADWAL_RONDA 2026 ===')
  const { data: jr, error: e1 } = await sb.from('jadwal_ronda').select('*').eq('tahun', 2026).order('tanggal')
  if (e1) console.error(e1)
  console.log(`Total: ${jr?.length ?? 0}`)
  console.table(jr?.map(j => ({ tanggal: j.tanggal, minggu: j.minggu_ke, penjaga: j.nama_penjaga_snapshot, blok: j.blok_snapshot, no: j.nomor_rumah_snapshot })))

  console.log('\n=== B. KAS_TRANSAKSI ===')
  const { data: kt, error: e2 } = await sb.from('kas_transaksi').select('*').order('tanggal')
  if (e2) console.error(e2)
  console.log(`Total: ${kt?.length ?? 0}`)
  const masuk = (kt ?? []).filter(t => t.tipe === 'MASUK').reduce((s, t) => s + Number(t.nominal), 0)
  const keluar = (kt ?? []).filter(t => t.tipe === 'KELUAR').reduce((s, t) => s + Number(t.nominal), 0)
  console.log(`Masuk: ${masuk}, Keluar: ${keluar}, Saldo: ${masuk - keluar}`)
  console.table(kt?.slice(0, 5).map(t => ({ tanggal: t.tanggal, tipe: t.tipe, kategori: t.kategori, uraian: t.uraian, nominal: t.nominal, login: t.login_id })))

  console.log('\n=== C. JIMPITAN_TAGIHAN 2026-06 ===')
  const { data: jt, error: e3 } = await sb.from('jimpitan_tagihan').select('*').eq('periode_bulan', '2026-06-01').order('login_id')
  if (e3) console.error(e3)
  console.log(`Total: ${jt?.length ?? 0}`)
  console.log('Status counts:')
  console.log({
    LUNAS: jt?.filter(j => j.status === 'LUNAS').length,
    CICIL: jt?.filter(j => j.status === 'CICIL').length,
    BELUM: jt?.filter(j => j.status === 'BELUM').length,
    LEBIH: jt?.filter(j => j.status === 'LEBIH').length,
  })
  console.table(jt?.slice(0, 5).map(j => ({ login: j.login_id, nama: j.nama_kk_snapshot, nominal: j.nominal_tagihan, bayar: j.total_terbayar, status: j.status })))

  console.log('\n=== D. JIMPITAN_SESI ===')
  const { data: js, error: e4 } = await sb.from('jimpitan_sesi').select('*').order('tanggal')
  if (e4) console.error(e4)
  console.log(`Total: ${js?.length ?? 0}`)
  console.table(js?.map(s => ({ tanggal: s.tanggal, kelompok: s.kelompok_id, petugas: s.nama_inputter_snapshot || s.nama_petugas_snapshot, status: s.status, total: s.total_nominal || s.total_pendapatan })))

  console.log('\n=== E. JIMPITAN_DETAIL count ===')
  const { data: jd, error: e5 } = await sb.from('jimpitan_detail').select('id, sesi_id')
  if (e5) console.error(e5)
  console.log(`Total jimpitan_detail: ${jd?.length ?? 0}`)

  console.log('\n=== F. JIMPITAN_TARIF ===')
  const { data: jf, error: e6 } = await sb.from('jimpitan_tarif').select('*').order('login_id')
  if (e6) console.error(e6)
  console.log(`Total: ${jf?.length ?? 0}`)
  console.table(jf?.slice(0, 5).map(f => ({ login: f.login_id, nama: f.nama_kk, nominal_aktif: f.nominal_aktif, kategori: f.kategori, aktif: f.is_active })))

  console.log('\n=== G. RONDA KELOMPOK ===')
  const { data: rk, error: e7 } = await sb.from('ronda_kelompok').select('*').eq('is_active', true).order('kelompok_id,urutan')
  if (e7) console.error(e7)
  console.log(`Total: ${rk?.length ?? 0}`)
  console.table(rk?.map(r => ({ kelompok: r.kelompok_id, login: r.login_id, nama: r.nama_kk_snapshot, role: r.role_kelompok, urutan: r.urutan })))

  console.log('\n=== H. IURAN_TAGIHAN 2026-06 ===')
  const { data: it, error: e8 } = await sb.from('iuran_tagihan').select('*').eq('periode_bulan', '2026-06-01')
  if (e8) console.error(e8)
  console.log(`Total: ${it?.length ?? 0}`)

  console.log('\n=== I. IURAN_PEMBAYARAN ===')
  const { data: ip, error: e9 } = await sb.from('iuran_pembayaran').select('*')
  if (e9) console.error(e9)
  console.log(`Total: ${ip?.length ?? 0}`)
}

run().catch(console.error).finally(() => process.exit())