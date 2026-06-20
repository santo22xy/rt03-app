'use client'

import { useState, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface CollapsibleCardProps {
  label: string
  title: string
  icon: ReactNode
  iconBgClass?: string
  iconColorClass?: string
  defaultOpen?: boolean
  children: ReactNode
}

export function CollapsibleCard({
  label,
  title,
  icon,
  iconBgClass = 'bg-emerald-100',
  iconColorClass = 'text-emerald-600',
  defaultOpen = true,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Card className="border-0 shadow-md rounded-3xl overflow-hidden">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between gap-3 p-4 hover:bg-muted/30 active:bg-muted/50 transition-colors text-left"
          aria-expanded={open}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <h2 className="text-base font-bold mt-0.5 leading-tight">{title}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className={cn('w-9 h-9 rounded-2xl flex items-center justify-center', iconBgClass)}>
              <div className={iconColorClass}>{icon}</div>
            </div>
            <ChevronDown
              className={cn(
                'w-4 h-4 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180'
              )}
            />
          </div>
        </button>
        {open && (
          <div className="px-4 pb-4 pt-0 animate-in slide-in-from-top-2 duration-200">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
