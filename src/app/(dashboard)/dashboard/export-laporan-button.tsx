'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Download, FileSpreadsheet, Loader2, Calendar, FileText } from 'lucide-react'
import { exportLaporanKas } from './jimpitan-actions'
import { toast } from 'sonner'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function firstDayOfMonthISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function ExportLaporanButton() {
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState(firstDayOfMonthISO())
  const [endDate, setEndDate] = useState(todayISO())
  const [tipe, setTipe] = useState<'' | 'MASUK' | 'KELUAR'>('')
  const [isPending, startTransition] = useTransition()

  function handleExport() {
    const fd = new FormData()
    fd.append('startDate', startDate)
    fd.append('endDate', endDate)
    if (tipe) fd.append('tipe', tipe)

    startTransition(async () => {
      const res = await exportLaporanKas(fd)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      if (!res?.csv || !res?.filename) {
        toast.error('Gagal membuat CSV')
        return
      }
      // Trigger download via Blob
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = res.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('Laporan berhasil di-export')
      setOpen(false)
    })
  }

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium h-8 px-3 shadow-md transition-colors gap-2">
        <Download className="w-4 h-4" />
        Export Laporan
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <DialogTitle>Export Laporan Kas</DialogTitle>
              <DialogDescription>
                Download CSV (bisa dibuka di Excel) dengan ringkasan & detail transaksi
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
              <Label htmlFor="startDate" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Dari
              </Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isPending}
                required
              />
            </div>
            <div>
              <Label htmlFor="endDate" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Sampai
              </Label>
              <Input
                id="endDate"
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

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-[11px] text-blue-800">
            <p className="font-semibold flex items-center gap-1 mb-0.5">
              <FileText className="w-3 h-3" /> Isi CSV:
            </p>
            <ul className="space-y-0.5 text-[10px]">
              <li>• Ringkasan: Saldo Awal, Pemasukan, Pengeluaran, Saldo Akhir</li>
              <li>• Breakdown per kategori</li>
              <li>• Detail transaksi + saldo berjalan</li>
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
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Menyiapkan...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download CSV
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
