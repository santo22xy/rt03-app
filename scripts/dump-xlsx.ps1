# Extract data nama KK dari xlsx via Excel COM
$path = 'C:\Users\chris\rt03-app\Contoh\SENTRA JUNI 2026.xlsx'

# Start Excel
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$wb = $excel.Workbooks.Open($path)
Write-Host "Opened: $($wb.Name)"
Write-Host "Sheets: $($wb.Worksheets.Count)"
Write-Host ""

# Iterate semua sheets
for ($i = 1; $i -le $wb.Worksheets.Count; $i++) {
    $ws = $wb.Worksheets.Item($i)
    Write-Host "=================================================="
    Write-Host "SHEET $i : $($ws.Name)"
    Write-Host "=================================================="
    
    $used = $ws.UsedRange
    $rows = $used.Rows.Count
    $cols = $used.Columns.Count
    Write-Host "Range: $($used.Address) ($rows rows x $cols cols)"
    Write-Host ""
    
    # Print first 5 rows (semua kolom)
    $maxShow = [Math]::Min($rows, 5)
    for ($r = 1; $r -le $maxShow; $r++) {
        $line = "R{0,3}|" -f $r
        for ($c = 1; $c -le $cols; $c++) {
            $cell = $ws.Cells.Item($r, $c)
            $val = $cell.Text
            if ($null -eq $val) { $val = '' }
            $val = $val.ToString().Trim()
            if ($val.Length -gt 30) { $val = $val.Substring(0, 30) + '...' }
            $line += " $val;"
        }
        Write-Host $line
    }
    Write-Host ""
}

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect()
Write-Host "Done."
