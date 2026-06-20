'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Receipt,
  Calendar, HandCoins,
} from 'lucide-react'
import type { ComponentType } from 'react'

type NavItem = {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  match?: string
}

const PENGURUS_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: '/dashboard' },
  { href: '/dashboard/warga', label: 'Warga', icon: Users, match: '/dashboard/warga' },
  // center FAB
  { href: '/dashboard/kas', label: 'Kas', icon: Receipt, match: '/dashboard/kas' },
  { href: '/dashboard/jimpitan', label: 'Jimpitan', icon: HandCoins, match: '/dashboard/jimpitan' },
  { href: '/dashboard/ronda', label: 'Ronda', icon: Calendar, match: '/dashboard/ronda' },
]

export function BottomNavPengurus() {
  const pathname = usePathname() ?? ''

  function isActive(item: NavItem) {
    if (item.href === '/dashboard') return pathname === '/dashboard'
    return pathname === item.href || pathname.startsWith(item.match + '/')
  }

  // Layout: 2 kiri - 1 center FAB - 2 kanan
  const leftItems = PENGURUS_NAV.slice(0, 2)
  const centerItem = PENGURUS_NAV[2]
  const rightItems = PENGURUS_NAV.slice(3)

  return (
    <nav
      aria-label="Bottom navigation pengurus"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="relative grid grid-cols-5 items-center h-16 max-w-lg mx-auto">
        {/* Left 2 */}
        {leftItems.map(item => {
          const active = isActive(item)
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center gap-0.5 h-full group"
              aria-current={active ? 'page' : undefined}
            >
              <item.icon className={`w-5 h-5 transition-colors ${active ? 'text-emerald-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
              <span className={`text-[10px] font-semibold transition-colors ${active ? 'text-emerald-600' : 'text-slate-500 group-hover:text-slate-700'}`}>
                {item.label}
              </span>
            </Link>
          )
        })}

        {/* Center FAB */}
        {centerItem && (
          <Link
            href={centerItem.href}
            className="relative flex items-center justify-center -mt-7"
            aria-current={isActive(centerItem) ? 'page' : undefined}
          >
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 shadow-lg shadow-emerald-500/40 ring-4 ring-white" />
            </div>
            <div className="relative flex flex-col items-center justify-center w-16 h-16">
              <centerItem.icon className="w-6 h-6 text-white" />
            </div>
          </Link>
        )}

        {/* Right 2 */}
        {rightItems.map(item => {
          const active = isActive(item)
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center gap-0.5 h-full group"
              aria-current={active ? 'page' : undefined}
            >
              <item.icon className={`w-5 h-5 transition-colors ${active ? 'text-emerald-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
              <span className={`text-[10px] font-semibold transition-colors ${active ? 'text-emerald-600' : 'text-slate-500 group-hover:text-slate-700'}`}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}