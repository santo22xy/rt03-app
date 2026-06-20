$id = '1M4t6NTPgudRod0jn-fmZSa2VwIaspLaiYj1SkOAg1AY'
$sheets = @(
    '0Iuran_Master',
    '0Jimpitan_Tarif',
    '0Jimpitan_Tagihan',
    '0Jimpitan_Pembayaran',
    '0Jimpitan_Setoran',
    '0Data_Warga',
    '0Kepala_Keluarga',
    '0Anggota_KK',
    '0Kas_Transaksi'
)

foreach ($s in $sheets) {
    $url = "https://docs.google.com/spreadsheets/d/$id/gviz/tq?tqx=out:csv&sheet=$s"
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing
        $lines = $r.Content -split "`n"
        Write-Host ""
        Write-Host "=== $s ($($lines.Count) baris) ==="
        $lines | Select-Object -First 4 | ForEach-Object { Write-Host ("  $_") }
    } catch {
        Write-Host "FAIL $s : $($_.Exception.Message)"
    }
}
