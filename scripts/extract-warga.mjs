import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const path = 'C:\\Users\\chris\\rt03-app\\Contoh\\SENTRA JUNI 2026.xlsx'
const wb = XLSX.readFile(path)

// === Sheet 1: Jimpitan_Tagihan (ada nama KK, login_id, blok, nomor) ===
const sheet1 = wb.Sheets[wb.SheetNames[0]]
const rows1 = XLSX.utils.sheet_to_json(sheet1, { header: 1, defval: '' })

// Header row 1 columns:
// A=tagihanId, B=tagihanKey, C=periodeBulan, D=loginId, E=blok, F=nomorRumah,
// G=namaKK, H=nominalTagihan, I=totalTerbayar, J=sisa, K=status,
// L=kategoriKhusus, M=catatan, N=createdAt, O=updatedAt

const warga = []
for (let i = 1; i < rows1.length; i++) {
  const row = rows1[i]
  const loginId = String(row[3] || '').trim()
  const blok = String(row[4] || '').trim()
  const nomor = String(row[5] || '').trim()
  const nama = String(row[6] || '').trim()
  const nominal = Number(row[7] || 0)
  const terbayar = Number(row[8] || 0)
  const sisa = Number(row[9] || 0)
  const status = String(row[10] || '').trim()
  const kategori = String(row[11] || '').trim() // 'NORMAL', 'PERLU_KONFIRMASI', etc
  const catatan = String(row[12] || '').trim()

  if (loginId && blok && nomor) {
    warga.push({ loginId, blok, nomor, nama, nominal, terbayar, sisa, status, kategori, catatan })
  }
}

console.log(`=== Sheet 1: Jimpitan_Tagihan (${warga.length} baris data) ===`)
warga.forEach(w => {
  console.log(`  ${w.loginId.padEnd(5)} | ${w.nama.padEnd(22)} | ${w.nominal} | ${w.status.padEnd(15)} | ${w.kategori}`)
})

// === Sheet 2: Jimpitan_Tarif (cek special rate 10000) ===
const sheet2 = wb.Sheets[wb.SheetNames[1]]
const rows2 = XLSX.utils.sheet_to_json(sheet2, { header: 1, defval: '' })
console.log(`\n=== Sheet 2: Jimpitan_Tarif (${rows2.length} baris) ===`)
if (rows2.length > 0) {
  console.log('Header:', rows2[0].slice(0, 12).join(' | '))
  for (let i = 1; i < Math.min(6, rows2.length); i++) {
    console.log(`R${i+1}: ` + rows2[i].slice(0, 12).join(' | '))
  }
}

// Cari rumah dengan tarif 10000 (JANDA / khusus)
const specialRate = []
for (let i = 1; i < rows2.length; i++) {
  const row = rows2[i]
  // D=nomor, F=tarif normal, G=tarif diskon, H=tarif final
  const nomor = row[3]
  const tarifNormal = Number(row[5] || 0)
  const tarifDiskon = Number(row[6] || 0)
  const tarifFinal = Number(row[7] || 0)
  if (tarifFinal > 0 && tarifFinal !== tarifNormal) {
    specialRate.push({ nomor, tarifNormal, tarifDiskon, tarifFinal })
  }
}
console.log(`\nSpecial rate entries (${specialRate.length}):`)
specialRate.forEach(s => console.log(`  nomor=${s.nomor} normal=${s.tarifNormal} diskon=${s.tarifDiskon} final=${s.tarifFinal}`))

// Save
writeFileSync('C:\\Users\\chris\\rt03-app\\scripts\\warga-data.json', JSON.stringify(warga, null, 2))
console.log(`\nSaved ${warga.length} warga to scripts/warga-data.json`)
