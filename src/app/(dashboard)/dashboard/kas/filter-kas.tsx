'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ArrowUpCircle, ArrowDownCircle, List } from 'lucide-react'

const FILTERS = [
  { value: 'semua', label: 'Semua', icon: List, color: 'text-slate-600', active: 'border-slate-300 bg-slate-50 text-slate-700' },
  { value: 'masuk', label: 'Pemasukan', icon: ArrowUpCircle, color: 'text-emerald-600', active: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { value: 'keluar', label: 'Pengeluaran', icon: ArrowDownCircle, color: 'text-rose-600', active: 'border-rose-300 bg-rose-50 text-rose-700' },
]

export function FilterKas({ current }: { current: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setFilter(v: string) {
    const sp = new URLSearchParams(searchParams.toString())
    if (v === 'semua') sp.delete('filter')
    else sp.set('filter', v)
    const qs = sp.toString()
    router.push(qs ? `/dashboard/kas?${qs}` : '/dashboard/kas')
  }

  return (
    <div className="inline-flex items-center bg-white rounded-xl border border-slate-200 p-0.5 shadow-sm">
      {FILTERS.map((f) => {
        const isActive = current === f.value
        const Icon = f.icon
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all',
              isActive
                ? f.active
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{f.label}</span>
          </button>
        )
      })}
    </div>
  )
}
