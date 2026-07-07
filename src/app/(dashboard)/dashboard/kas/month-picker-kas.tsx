'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Helper to format month in Bahasa Indonesia
const BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

export function MonthPickerKas({
  availableMonths,
  currentMonth,
}: {
  availableMonths: string[] // format "YYYY-MM"
  currentMonth: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Find current index for arrow navigation
  const currentIndex = availableMonths.indexOf(currentMonth)

  function setMonth(monthKey: string) {
    const sp = new URLSearchParams(searchParams.toString())
    if (!monthKey) sp.delete('month')
    else sp.set('month', monthKey)
    const qs = sp.toString()
    router.push(qs ? `/dashboard/kas?${qs}` : '/dashboard/kas')
  }

  function nextMonth() {
    if (currentIndex < availableMonths.length - 1) {
      setMonth(availableMonths[currentIndex + 1])
    }
  }

  function prevMonth() {
    if (currentIndex > 0) {
      setMonth(availableMonths[currentIndex - 1])
    }
  }

  // Format display
  const [year, month] = currentMonth.split('-').map(Number)
  const display = `${BULAN[month - 1]} ${year}`

  return (
    <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
      <button
        type="button"
        onClick={prevMonth}
        disabled={currentIndex === 0}
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-lg transition-all',
          currentIndex === 0
            ? 'text-slate-300 cursor-not-allowed'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        )}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <select
        value={currentMonth}
        onChange={(e) => setMonth(e.target.value)}
        className="bg-transparent border-0 text-sm font-semibold text-slate-800 focus:ring-0 outline-none cursor-pointer px-1"
      >
        {availableMonths.map((m) => {
          const [y, mo] = m.split('-').map(Number)
          return (
            <option key={m} value={m}>
              {BULAN[mo - 1]} {y}
            </option>
          )
        })}
      </select>
      <button
        type="button"
        onClick={nextMonth}
        disabled={currentIndex === availableMonths.length - 1}
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-lg transition-all',
          currentIndex === availableMonths.length - 1
            ? 'text-slate-300 cursor-not-allowed'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        )}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
