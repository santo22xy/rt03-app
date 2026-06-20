# Read xlsx contents (sheet names + raw XML extraction)
$path = 'C:\Users\chris\rt03-app\Contoh\SENTRA JUNI 2026.xlsx'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($path)

Write-Host '=== ZIP ENTRIES ==='
foreach ($e in $zip.Entries) {
    Write-Host ('  {0,-50} {1,8} bytes' -f $e.FullName, $e.Length)
}

# Extract sharedStrings
$ss = $zip.Entries | Where-Object { $_.FullName -eq 'xl/sharedStrings.xml' }
if ($ss) {
    $reader = New-Object System.IO.StreamReader($ss.Open())
    $xml = [xml]$reader.ReadToEnd()
    $reader.Close()
    Write-Host ''
    Write-Host '=== SHARED STRINGS ==='
    $i = 0
    foreach ($si in $xml.sst.si) {
        $text = ''
        if ($si.t) { $text = $si.t.'#cdata-section' }
        elseif ($si.t) { $text = $si.t }
        if (-not $text -and $si.r) {
            $text = (($si.r | ForEach-Object { $_.t.'#cdata-section' }) -join '')
        }
        Write-Host ('  [{0,3}] {1}' -f $i, $text)
        $i++
    }
}

# Extract sheet1.xml
$s1 = $zip.Entries | Where-Object { $_.FullName -eq 'xl/worksheets/sheet1.xml' }
if ($s1) {
    $reader = New-Object System.IO.StreamReader($s1.Open())
    $xml = [xml]$reader.ReadToEnd()
    $reader.Close()
    Write-Host ''
    Write-Host '=== SHEET1 ROWS ==='
    foreach ($row in $xml.worksheet.sheetData.row) {
        $line = 'r{0,3}: ' -f [int]$row.r
        foreach ($c in $row.c) {
            $ref = $c.r
            $t = $c.t
            $v = $c.v
            $line += '{0}={1}({2}); ' -f $ref, $v, $t
        }
        Write-Host $line
    }
}

$zip.Dispose()
