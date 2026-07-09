'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { FileText, Loader2, FileType2 } from 'lucide-react'
import { toast } from 'sonner'
import type { RekapRow } from '../../jimpitan-actions'

const BULAN_LIST = [
  { value: '01', label: 'Januari' }, { value: '02', label: 'Februari' },
  { value: '03', label: 'Maret' }, { value: '04', label: 'April' },
  { value: '05', label: 'Mei' }, { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' }, { value: '08', label: 'Agustus' },
  { value: '09', label: 'September' }, { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' }, { value: '12', label: 'Desember' },
]

const BULAN_LABEL_MAP = Object.fromEntries(BULAN_LIST.map(b => [b.value, b.label]))

type Mode = 'single' | 'multi' | 'range'

interface ExportRekapJimpitanPDFProps {
  getDataForPeriod: (periode: string) => Promise<RekapRow[]>
  currentBulan: string
  currentTahun: string
}

export function ExportRekapJimpitanPDF({
  getDataForPeriod,
  currentBulan,
  currentTahun,
}: ExportRekapJimpitanPDFProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('single')
  const [isPending, startTransition] = useTransition()

  // Single mode
  const [singleBulan, setSingleBulan] = useState(currentBulan)
  const [singleTahun, setSingleTahun] = useState(currentTahun)

  // Multi mode
  const [multiTahun, setMultiTahun] = useState(currentTahun)
  const [multiBulanSet, setMultiBulanSet] = useState<Set<string>>(new Set([currentBulan]))

  // Range mode
  const [rangeStartBulan, setRangeStartBulan] = useState('01')
  const [rangeStartTahun, setRangeStartTahun] = useState(currentTahun)
  const [rangeEndBulan, setRangeEndBulan] = useState(currentBulan)
  const [rangeEndTahun, setRangeEndTahun] = useState(currentTahun)

  // Orientation
  const [landscape, setLandscape] = useState(true)

  function toggleMultiBulan(bulan: string) {
    setMultiBulanSet(prev => {
      const next = new Set(prev)
      if (next.has(bulan)) next.delete(bulan)
      else next.add(bulan)
      return next
    })
  }

  function getPeriodes(): string[] {
    if (mode === 'single') {
      return [`${singleTahun}-${singleBulan}-01`]
    }
    if (mode === 'multi') {
      return [...multiBulanSet]
        .sort()
        .map(b => `${multiTahun}-${b}-01`)
    }
    // range
    const start = new Date(Number(rangeStartTahun), Number(rangeStartBulan) - 1, 1)
    const end = new Date(Number(rangeEndTahun), Number(rangeEndBulan) - 1, 1)
    const periodes: string[] = []
    const cur = new Date(start)
    while (cur <= end) {
      const y = cur.getFullYear()
      const m = String(cur.getMonth() + 1).padStart(2, '0')
      periodes.push(`${y}-${m}-01`)
      cur.setMonth(cur.getMonth() + 1)
    }
    return periodes
  }

  function getFilename(periodes: string[]): string {
    if (periodes.length === 1) {
      const [y, m] = periodes[0].split('-')
      return `Laporan_Jimpitan_${BULAN_LABEL_MAP[m]}_${y}.pdf`
    }
    if (mode === 'multi') {
      const labels = periodes.map(p => BULAN_LABEL_MAP[p.split('-')[1]])
      const y = periodes[0].split('-')[0]
      return `Laporan_Jimpitan_${labels.join('_')}_${y}.pdf`
    }
    // range
    const [sy, sm] = periodes[0].split('-')
    const [ey, em] = periodes[periodes.length - 1].split('-')
    if (sy === ey) {
      return `Laporan_Jimpitan_${BULAN_LABEL_MAP[sm]}-${BULAN_LABEL_MAP[em]}_${sy}.pdf`
    }
    return `Laporan_Jimpitan_${BULAN_LABEL_MAP[sm]}_${sy}-${BULAN_LABEL_MAP[em]}_${ey}.pdf`
  }

  async function handleExport() {
    const periodes = getPeriodes()
    if (periodes.length === 0) {
      toast.error('Pilih minimal satu bulan')
      return
    }

    startTransition(async () => {
      try {
        // Fetch semua data per periode
        const allData: Array<{ periode: string; rows: RekapRow[] }> = []
        for (const p of periodes) {
          const result = await getDataForPeriod(p)
          allData.push({ periode: p, rows: result })
        }

        // Import jsPDF
        const { default: jsPDF } = await import('jspdf')
        const { default: autoTable } = await import('jspdf-autotable')

        const orientation = landscape ? 'landscape' : 'portrait'
        const doc = new jsPDF({ orientation: orientation as 'landscape' | 'portrait', unit: 'mm', format: 'a4' })
        const pageW = doc.internal.pageSize.getWidth()
        const pageH = doc.internal.pageSize.getHeight()

        const now = new Date()
        const dicetakStr = now.toLocaleDateString('id-ID', {
          day: 'numeric', month: 'long', year: 'numeric',
        }) + ' ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

        for (let di = 0; di < allData.length; di++) {
          const { periode, rows } = allData[di]
          const [tahun, bulan] = periode.split('-')
          const bulanLabel = BULAN_LABEL_MAP[bulan] ?? bulan

          if (di > 0) doc.addPage()

          // === HEADER ===
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(14)
          doc.text('LAPORAN JIMPITAN RT 03', pageW / 2, 14, { align: 'center' })
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10)
          doc.text(`Periode: ${bulanLabel} ${tahun}`, pageW / 2, 20, { align: 'center' })
          doc.setFontSize(8)
          doc.setTextColor(120, 120, 120)
          doc.text(`Dicetak: ${dicetakStr}`, pageW / 2, 25, { align: 'center' })
          doc.setTextColor(0, 0, 0)
          doc.setLineWidth(0.3)
          doc.line(14, 28, pageW - 14, 28)

          // === RINGKASAN ===
          const totalWarga = rows.length
          const belumCount = rows.filter(r => r.status === 'BELUM').length
          const cicilCount = rows.filter(r => r.status === 'CICIL').length
          const lunasCount = rows.filter(r => r.status === 'LUNAS').length
          const lebihCount = rows.filter(r => r.status === 'LEBIH').length
          const dibawaCount = rows.filter(r => r.status === 'DIBAWA').length
          const hibahCount = rows.filter(r => r.status === 'HIBAH').length

          const totalTarget = rows.reduce((s, r) => s + r.kewajiban_efektif, 0)
          const totalDibayar = rows.reduce((s, r) => s + r.total_bayar, 0)
          const totalKekurangan = rows.filter(r => r.selisih < 0).reduce((s, r) => s + Math.abs(r.selisih), 0)
          const totalKelebihan = rows.filter(r => r.selisih > 0).reduce((s, r) => s + r.selisih, 0)

          let y = 34
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9)
          doc.text('Ringkasan:', 14, y)
          y += 5

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.text(
            `Total Warga: ${totalWarga}  |  Belum: ${belumCount}  |  Cicil: ${cicilCount}  |  Lunas: ${lunasCount}  |  Kelebihan: ${lebihCount + dibawaCount + hibahCount}`,
            14, y
          )
          y += 4
          doc.text(
            `Total Target: ${fmtNum(totalTarget)}  |  Terkumpul: ${fmtNum(totalDibayar)}  |  Kekurangan: ${fmtNum(totalKekurangan)}  |  Kelebihan: ${fmtNum(totalKelebihan)}`,
            14, y
          )
          y += 6

          // === TABEL UTAMA ===
          const tableColumns = [
            { header: 'No', dataKey: 'no' },
            { header: 'Nama', dataKey: 'nama' },
            { header: 'Blok', dataKey: 'blok' },
            { header: 'Target', dataKey: 'target' },
            { header: 'Kredit', dataKey: 'kredit' },
            { header: 'Kewajiban', dataKey: 'kewajiban' },
            { header: 'Dibayar', dataKey: 'dibayar' },
            { header: 'Selisih', dataKey: 'selisih' },
            { header: 'Status', dataKey: 'status' },
            { header: 'Keterangan', dataKey: 'keterangan' },
          ]

          const tableRows = rows.map((r, i) => ({
            no: String(i + 1),
            nama: r.nama_kk,
            blok: `${r.blok}-${r.nomor_rumah}`,
            target: fmtNum(r.target_bulanan),
            kredit: r.kredit_dari_lalu > 0 ? fmtNum(r.kredit_dari_lalu) : '-',
            kewajiban: fmtNum(r.kewajiban_efektif),
            dibayar: r.total_bayar > 0 ? fmtNum(r.total_bayar) : '-',
            selisih: r.selisih === 0 ? '0' : (r.selisih > 0 ? '+' : '') + fmtNum(r.selisih),
            status: r.status,
            keterangan: [r.kelebihan_tujuan, r.kelebihan_catatan].filter(Boolean).join('; ') || '-',
          }))

          const isLandscape = landscape
          const colWidths = isLandscape
            ? { no: 10, nama: 42, blok: 18, target: 22, kredit: 18, kewajiban: 22, dibayar: 22, selisih: 22, status: 18, keterangan: 40 }
            : { no: 8, nama: 32, blok: 14, target: 18, kredit: 14, kewajiban: 18, dibayar: 18, selisih: 18, status: 16, keterangan: 24 }

          autoTable(doc, {
            startY: y,
            columns: tableColumns,
            body: tableRows,
            theme: 'grid',
            headStyles: {
              fillColor: [59, 130, 246],
              textColor: 255,
              fontSize: isLandscape ? 7 : 6,
              fontStyle: 'bold',
              halign: 'center',
            },
            bodyStyles: {
              fontSize: isLandscape ? 7 : 6,
            },
            columnStyles: {
              no: { halign: 'center', cellWidth: colWidths.no },
              nama: { cellWidth: colWidths.nama },
              blok: { halign: 'center', cellWidth: colWidths.blok },
              target: { halign: 'right', cellWidth: colWidths.target },
              kredit: { halign: 'right', cellWidth: colWidths.kredit },
              kewajiban: { halign: 'right', cellWidth: colWidths.kewajiban },
              dibayar: { halign: 'right', cellWidth: colWidths.dibayar },
              selisih: { halign: 'right', cellWidth: colWidths.selisih },
              status: { halign: 'center', cellWidth: colWidths.status },
              keterangan: { cellWidth: colWidths.keterangan },
            },
            margin: { left: 14, right: 14 },
            showHead: 'everyPage',
            didParseCell: (hookData) => {
              if (hookData.section === 'body') {
                const statusVal = String((hookData.row.raw as Record<string, unknown>).status ?? '')
                // Warna bar berdasarkan status
                if (hookData.column.dataKey === 'status' || hookData.column.dataKey === 'keterangan') {
                  // skip coloring for these columns from status
                }
                // Row coloring
                if (statusVal === 'LUNAS') {
                  hookData.cell.styles.fillColor = [220, 252, 231] // green-50
                } else if (statusVal === 'BELUM') {
                  hookData.cell.styles.fillColor = [254, 226, 226] // red-100
                } else if (statusVal === 'LEBIH' || statusVal === 'DIBAWA' || statusVal === 'HIBAH') {
                  hookData.cell.styles.fillColor = [219, 234, 254] // blue-100
                } else if (statusVal === 'CICIL') {
                  hookData.cell.styles.fillColor = [254, 249, 195] // yellow-100
                }

                // Status text color
                if (hookData.column.dataKey === 'status') {
                  if (statusVal === 'LUNAS') hookData.cell.styles.textColor = [22, 163, 74]
                  else if (statusVal === 'BELUM') hookData.cell.styles.textColor = [220, 38, 38]
                  else if (statusVal === 'LEBIH' || statusVal === 'DIBAWA') hookData.cell.styles.textColor = [37, 99, 235]
                  else if (statusVal === 'CICIL') hookData.cell.styles.textColor = [161, 98, 7]
                  else if (statusVal === 'HIBAH') hookData.cell.styles.textColor = [219, 39, 119]
                  hookData.cell.styles.fontStyle = 'bold'
                }

                // Selisih color
                if (hookData.column.dataKey === 'selisih') {
                  const val = Number(String(hookData.cell.raw).replace(/[^0-9-]/g, ''))
                  if (val > 0) hookData.cell.styles.textColor = [37, 99, 235]
                  else if (val < 0) hookData.cell.styles.textColor = [220, 38, 38]
                }

                // Dibayar color
                if (hookData.column.dataKey === 'dibayar' && hookData.cell.raw !== '-') {
                  hookData.cell.styles.textColor = [22, 163, 74]
                }
              }
            },
          })
        }

        // === FOOTER: Nomor halaman ===
        const pageCount = doc.getNumberOfPages()
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i)
          doc.setFontSize(7)
          doc.setTextColor(150, 150, 150)
          doc.text(
            `Halaman ${i} / ${pageCount}  ·  Laporan Jimpitan RT 03  ·  ${new Date().toLocaleDateString('id-ID')}`,
            pageW / 2,
            pageH - 6,
            { align: 'center' }
          )
          doc.setTextColor(0, 0, 0)
        }

        const filename = getFilename(periodes)
        doc.save(filename)
        toast.success(`PDF berhasil di-download: ${filename}`)
        setOpen(false)
      } catch (err) {
        console.error('PDF render error:', err)
        toast.error('Gagal membuat PDF: ' + (err instanceof Error ? err.message : 'unknown'))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium h-9 px-4 shadow-md transition-colors gap-2">
        <FileText className="w-4 h-4" />
        Export PDF
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
              <FileType2 className="w-5 h-5 text-rose-700" />
            </div>
            <div>
              <DialogTitle>Export Rekap Jimpitan (PDF)</DialogTitle>
              <DialogDescription>
                Download PDF rekap jimpitan bulanan siap-cetak
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode Periode */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Mode Periode
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'single', label: 'Satu Bulan' },
                { value: 'multi', label: 'Beberapa Bulan' },
                { value: 'range', label: 'Rentang Bulan' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={`px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                    mode === opt.value
                      ? 'border-rose-500 bg-rose-50 text-rose-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Single Mode */}
          {mode === 'single' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Bulan</Label>
                <Select value={singleBulan} onValueChange={setSingleBulan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BULAN_LIST.map(b => (
                      <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Tahun</Label>
                <Select value={singleTahun} onValueChange={setSingleTahun}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['2025', '2026', '2027'].map(y => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Multi Mode */}
          {mode === 'multi' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Tahun</Label>
                <Select value={multiTahun} onValueChange={setMultiTahun}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['2025', '2026', '2027'].map(y => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Pilih Bulan (bisa lebih dari satu)
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {BULAN_LIST.map(b => (
                    <label
                      key={b.value}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-medium cursor-pointer transition-all ${
                        multiBulanSet.has(b.value)
                          ? 'border-rose-500 bg-rose-50 text-rose-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <Checkbox
                        checked={multiBulanSet.has(b.value)}
                        onCheckedChange={() => toggleMultiBulan(b.value)}
                      />
                      {b.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Range Mode */}
          {mode === 'range' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Dari</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={rangeStartBulan} onValueChange={setRangeStartBulan}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BULAN_LIST.map(b => (
                        <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={rangeStartTahun} onValueChange={setRangeStartTahun}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['2025', '2026', '2027'].map(y => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Sampai</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={rangeEndBulan} onValueChange={setRangeEndBulan}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BULAN_LIST.map(b => (
                        <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={rangeEndTahun} onValueChange={setRangeEndTahun}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['2025', '2026', '2027'].map(y => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Orientasi */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Orientasi Kertas
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLandscape(false)}
                className={`px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                  !landscape
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Portrait
              </button>
              <button
                type="button"
                onClick={() => setLandscape(true)}
                className={`px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                  landscape
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Landscape
              </button>
            </div>
          </div>

          <div className="bg-rose-50 border border-rose-100 rounded-lg p-2.5 text-[11px] text-rose-800">
            <p className="font-semibold flex items-center gap-1 mb-0.5">
              <FileText className="w-3 h-3" /> Isi PDF:
            </p>
            <ul className="space-y-0.5 text-[10px]">
              <li>• Header: judul + periode + tanggal cetak</li>
              <li>• Ringkasan: jumlah warga per status & total keuangan</li>
              <li>• Tabel detail per warga (berwarna sesuai status)</li>
              <li>• Footer: nomor halaman di setiap halaman</li>
              {mode === 'multi' && <li>• Setiap bulan dimulai halaman baru</li>}
              {mode === 'range' && <li>• Urut kronologis per bulan</li>}
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={isPending}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Menyiapkan...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                Download PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function fmtNum(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}
