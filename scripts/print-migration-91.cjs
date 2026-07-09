// Cetak SQL migrasi 91 ke terminal. Salin dari "-- ====" pertama sampai "NOTIFY pgrst".

const fs = require('fs')
const sql = fs.readFileSync('sql/91-rekap-jimpitan-saldo-awal.sql', 'utf8')
console.log(sql)
