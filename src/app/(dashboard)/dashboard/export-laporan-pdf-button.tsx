'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { FileText, Loader2, Calendar, FileType2 } from 'lucide-react'
import { exportLaporanKasPDFData } from './jimpitan-actions'
import { toast } from 'sonner'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function firstDayOfMonthISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function ExportLaporanPDFButton() {
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState(firstDayOfMonthISO())
  const [endDate, setEndDate] = useState(todayISO())
  const [tipe, setTipe] = useState<'' | 'MASUK' | 'KELUAR'>('')
  const [isPending, startTransition] = useTransition()

  function setPreset(preset: 'thisMonth' | 'lastMonth' | 'thisYear' | 'last7days') {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    if (preset === 'thisMonth') {
      setStartDate(`${yyyy}-${mm}-01`)
      setEndDate(todayISO())
    } else if (preset === 'lastMonth') {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      setStartDate(`${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`)
      setEndDate(`${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, '0')}-${String(lastMonthEnd.getDate()).padStart(2, '0')}`)
    } else if (preset === 'thisYear') {
      setStartDate(`${yyyy}-01-01`)
      setEndDate(todayISO())
    } else if (preset === 'last7days') {
      const week = new Date(today)
      week.setDate(today.getDate() - 7)
      setStartDate(`${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, '0')}-${String(week.getDate()).padStart(2, '0')}`)
      setEndDate(todayISO())
    }
  }

  async function handleExport() {
    const fd = new FormData()
    fd.append('startDate', startDate)
    fd.append('endDate', endDate)
    if (tipe) fd.append('tipe', tipe)

    startTransition(async () => {
      const res = await exportLaporanKasPDFData(fd)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      if (!res?.data) {
        toast.error('Gagal menyiapkan data laporan')
        return
      }

      // Render PDF di client dengan jspdf
      try {
        const { default: jsPDF } = await import('jspdf')
        const { default: autoTable } = await import('jspdf-autotable')

        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        const data = res.data
        const pageW = doc.internal.pageSize.getWidth()

        // === HEADER / KOP SURAT ===
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(16)
        doc.text('LAPORAN KAS RT 03', pageW / 2, 16, { align: 'center' })
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.text('Periode ' + fmtDateID(data.startDate) + ' s/d ' + fmtDateID(data.endDate), pageW / 2, 22, { align: 'center' })
        doc.setFontSize(8)
        doc.setTextColor(120, 120, 120)
        doc.text(
          'Filter: ' + (data.tipeFilter || 'SEMUA (MASUK + KELUAR)') +
          ' · Dicetak oleh ' + (data.generator || 'pengurus') +
          ' · ' + new Date().toLocaleString('id-ID'),
          pageW / 2, 27, { align: 'center' }
        )
        doc.setTextColor(0, 0, 0)
        doc.setLineWidth(0.3)
        doc.line(14, 30, pageW - 14, 30)

        // === RINGKASAN (kotak warna) ===
        let y = 38
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.text('RINGKASAN', 14, y)
        y += 4

        autoTable(doc, {
          startY: y,
          head: [['Komponen', 'Nilai']],
          body: [
            ['Saldo Awal (sebelum ' + data.startDate + ')', 'Rp ' + fmtNum(data.saldoAwal)],
            ['Total Pemasukan (' + data.jumlahMasuk + ' transaksi)', 'Rp ' + fmtNum(data.totalMasuk)],
            ['Total Pengeluaran (' + data.jumlahKeluar + ' transaksi)', 'Rp ' + fmtNum(data.totalKeluar)],
            ['Saldo Periode Ini (Masuk - Keluar)', 'Rp ' + fmtNum(data.totalMasuk - data.totalKeluar)],
            ['Saldo Akhir (Saldo Awal + Periode)', 'Rp ' + fmtNum(data.saldoAkhir)],
          ],
          theme: 'grid',
          headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
          margin: { left: 14, right: 14 },
        })

        // === BREAKDOWN PER KATEGORI ===
        const afterSummary = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
        y = afterSummary + 8
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.text('BREAKDOWN PER KATEGORI', 14, y)

        if (data.kategoriBreakdown.length > 0) {
          autoTable(doc, {
            startY: y + 3,
            head: [['Kategori', 'Pemasukan', 'Pengeluaran', 'Net']],
            body: data.kategoriBreakdown.map((k) => [
              k.kategori,
              'Rp ' + fmtNum(k.masuk),
              'Rp ' + fmtNum(k.keluar),
              'Rp ' + fmtNum(k.masuk - k.keluar),
            ]),
            theme: 'striped',
            headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 9 },
            bodyStyles: { fontSize: 8 },
            columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
            margin: { left: 14, right: 14 },
          })
        } else {
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(9)
          doc.setTextColor(120, 120, 120)
          doc.text('(Tidak ada transaksi untuk periode ini)', 14, y + 5)
          doc.setTextColor(0, 0, 0)
        }

        // === DETAIL TRANSAKSI ===
        const afterBreakdown = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
        y = afterBreakdown + 8
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.text('DETAIL TRANSAKSI', 14, y)

        if (data.detailRows.length > 0) {
          autoTable(doc, {
            startY: y + 3,
            head: [['#', 'Tanggal', 'Uraian', 'Kategori', 'Tipe', 'Nominal', 'Saldo']],
            body: data.detailRows.map((r, i) => [
              String(i + 1),
              r.tanggal,
              r.uraian,
              r.kategori,
              r.tipe,
              (r.tipe === 'MASUK' ? '+' : '−') + ' Rp ' + fmtNum(Number(r.nominal)),
              'Rp ' + fmtNum(r.saldoBerjalan),
            ]),
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 8 },
            bodyStyles: { fontSize: 7 },
            columnStyles: {
              0: { halign: 'center', cellWidth: 8 },
              1: { cellWidth: 22 },
              2: { cellWidth: 50 },
              3: { cellWidth: 28 },
              4: { halign: 'center', cellWidth: 16 },
              5: { halign: 'right', cellWidth: 32 },
              6: { halign: 'right', cellWidth: 32, fontStyle: 'bold' },
            },
            didParseCell: (hookData) => {
              // Color nominal column based on tipe
              if (hookData.section === 'body' && hookData.column.index === 5) {
                const tipeCell = String((hookData.row.raw as unknown[])[4] ?? '')
                if (tipeCell === 'MASUK') hookData.cell.styles.textColor = [16, 185, 129]
                else hookData.cell.styles.textColor = [244, 63, 94]
              }
              if (hookData.section === 'body' && hookData.column.index === 6) {
                hookData.cell.styles.textColor = [37, 99, 235]
              }
            },
            margin: { left: 14, right: 14 },
          })
        } else {
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(9)
          doc.setTextColor(120, 120, 120)
          doc.text('(Tidak ada detail transaksi untuk periode ini)', 14, y + 5)
          doc.setTextColor(0, 0, 0)
        }

        // === FOOTER (tanda tangan) ===
        const pageCount = doc.getNumberOfPages()
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i)
          doc.setFontSize(7)
          doc.setTextColor(150, 150, 150)
          doc.text(
            'Halaman ' + i + ' / ' + pageCount + ' · Laporan Kas RT 03 · ' + new Date().toLocaleDateString('id-ID'),
            pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' }
          )
          doc.setTextColor(0, 0, 0)
        }

        const filename = 'Laporan_Kas_' + data.startDate + '_sd_' + data.endDate + '.pdf'
        doc.save(filename)
        toast.success('PDF berhasil di-download')
        setOpen(false)
      } catch (err) {
        console.error('PDF render error:', err)
        toast.error('Gagal membuat PDF: ' + (err instanceof Error ? err.message : 'unknown'))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium h-8 px-3 shadow-md transition-colors gap-2">
        <FileText className="w-4 h-4" />
        Export PDF
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
              <FileType2 className="w-5 h-5 text-rose-700" />
            </div>
            <div>
              <DialogTitle>Export Laporan Kas (PDF)</DialogTitle>
              <DialogDescription>
                Download PDF siap-cetak dengan ringkasan &amp; detail transaksi
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preset */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Periode Cepat
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPreset('thisMonth')}>
                <Calendar className="w-3 h-3 mr-1" /> Bulan Ini
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setPreset('lastMonth')}>
                <Calendar className="w-3 h-3 mr-1" /> Bulan Lalu
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setPreset('last7days')}>
                <Calendar className="w-3 h-3 mr-1" /> 7 Hari
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setPreset('thisYear')}>
                <Calendar className="w-3 h-3 mr-1" /> Tahun Ini
              </Button>
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="pdf-startDate" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Dari
              </Label>
              <Input
                id="pdf-startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isPending}
                required
              />
            </div>
            <div>
              <Label htmlFor="pdf-endDate" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Sampai
              </Label>
              <Input
                id="pdf-endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isPending}
                required
              />
            </div>
          </div>

          {/* Tipe Filter */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Tipe Transaksi
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTipe('')}
                disabled={isPending}
                className={`px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                  tipe === ''
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setTipe('MASUK')}
                disabled={isPending}
                className={`px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                  tipe === 'MASUK'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Pemasukan
              </button>
              <button
                type="button"
                onClick={() => setTipe('KELUAR')}
                disabled={isPending}
                className={`px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                  tipe === 'KELUAR'
                    ? 'border-rose-500 bg-rose-50 text-rose-700'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Pengeluaran
              </button>
            </div>
          </div>

          <div className="bg-rose-50 border border-rose-100 rounded-lg p-2.5 text-[11px] text-rose-800">
            <p className="font-semibold flex items-center gap-1 mb-0.5">
              <FileText className="w-3 h-3" /> Isi PDF:
            </p>
            <ul className="space-y-0.5 text-[10px]">
              <li>• Kop surat + periode + filter</li>
              <li>• Ringkasan: Saldo Awal, Pemasukan, Pengeluaran, Saldo Akhir</li>
              <li>• Breakdown per kategori (tabel)</li>
              <li>• Detail transaksi + saldo berjalan (tabel berwarna)</li>
              <li>• Footer halaman dengan nomor</li>
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

// Helper: format angka Indonesia (titik ribuan)
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('id-ID')
}

// Helper: format tanggal ID (e.g. "1 Jun 2026")
function fmtDateID(s: string): string {
  const d = new Date(s)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
