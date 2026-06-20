# Better xlsx reader: extract shared strings properly, then decode all cells
$path = 'C:\Users\chris\rt03-app\Contoh\SENTRA JUNI 2026.xlsx'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($path)

# Read shared strings
$strings = @()
$ss = $zip.Entries | Where-Object { $_.FullName -eq 'xl/sharedStrings.xml' }
if ($ss) {
    $reader = New-Object System.IO.StreamReader($ss.Open())
    $xml = [xml]$reader.ReadToEnd()
    $reader.Close()
    foreach ($si in $xml.sst.si) {
        $text = ''
        if ($si.r) {
            # Rich text: concat all <t> children
            $text = (($si.r | ForEach-Object {
                if ($_.t.'#cdata-section') { $_.t.'#cdata-section' }
                elseif ($_.t) { $_.t.'#text' }
                else { '' }
            }) -join '')
        } else {
            # Plain text
            if ($si.t.'#cdata-section') { $text = $si.t.'#cdata-section' }
            elseif ($si.t) { $text = $si.t.'#text' }
        }
        $strings += $text
    }
}

# Read each sheet
for ($i = 1; $i -le 10; $i++) {
    $sheetPath = "xl/worksheets/sheet$($i).xml"
    $entry = $zip.Entries | Where-Object { $_.FullName -eq $sheetPath }
    if (-not $entry) { continue }
    $reader = New-Object System.IO.StreamReader($entry.Open())
    $xml = [xml]$reader.ReadToEnd()
    $reader.Close()

    Write-Host ""
    Write-Host "=================== SHEET $i ==================="
    foreach ($row in $xml.worksheet.sheetData.row) {
        $line = ('R{0,3}|' -f [int]$row.r)
        foreach ($c in $row.c) {
            $ref = $c.r
            $t = $c.t
            $v = $c.v
            $val = ''
            if ($t -eq 's') {
                $idx = [int]$v
                $val = $strings[$idx]
                if ($null -eq $val) { $val = '' }
                $val = '"' + $val + '"'
            } elseif ($t -eq 'inlineStr' -and $c.is.t) {
                $val = '"' + $c.is.t.'#text' + '"'
            } elseif ($v) {
                # Number or date — convert Excel serial if it looks like date
                $num = [double]$v
                if ($num -gt 40000 -and $num -lt 60000) {
                    $date = [datetime]::FromOADate($num)
                    $val = "$num ($($date.ToString('yyyy-MM-dd')))"
                } else {
                    $val = "$num"
                }
            } else {
                $val = ''
            }
            $line += " $ref=$val;"
        }
        Write-Host $line
    }
}

$zip.Dispose()
