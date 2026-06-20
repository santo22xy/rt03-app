'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Receipt, Shield, HandCoins,
} from 'lucide-react'
import type { ComponentType } from 'react'

type NavItem = {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
}

const WARGA_NAV: NavItem[] = [
  { href: '/warga', label: 'Beranda', icon: Home },
  { href: '/warga/iuran', label: 'Iuran', icon: Receipt },
  // center FAB: Ronda/Jimpitan (aksi utama warga)
  { href: '/warga/ronda', label: 'Ronda', icon: Shield },
  { href: '/warga/pengumuman', label: 'Info', icon: HandCoins },
]

export function BottomNavWarga() {
  const pathname = usePathname() ?? ''

  function isActive(href: string) {
    if (href === '/warga') return pathname === '/warga'
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Layout: 1 kiri - 1 center FAB - 2 kanan (atau 1-1)
  // Untuk warga: 1 kiri (Beranda), center FAB (Ronda/Jimpitan), 2 kanan (Iuran, Info)
  const leftItems = WARGA_NAV.slice(0, 1)
  const centerItem = WARGA_NAV[2]
  const rightItems = WARGA_NAV.slice(3)

  return (
    <nav
      aria-label="Bottom navigation warga"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="relative grid grid-cols-4 items-center h-16 max-w-lg mx-auto">
        {/* Left 1 */}
        {leftItems.map(item => {
          const active = isActive(item.href)
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

        {/* Center 2 cols (FAB lebih besar, span 2 cols) */}
        {centerItem && (
          <Link
            href={centerItem.href}
            className="relative flex items-center justify-center -mt-7 col-span-2"
            aria-current={isActive(centerItem.href) ? 'page' : undefined}
          >
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 shadow-lg shadow-orange-500/40 ring-4 ring-white" />
            </div>
            <div className="relative flex flex-col items-center justify-center w-16 h-16">
              <centerItem.icon className="w-6 h-6 text-white" />
              <span className="text-[9px] font-bold text-white mt-0.5">Ronda</span>
            </div>
          </Link>
        )}

        {/* Right 1 */}
        {rightItems.map(item => {
          const active = isActive(item.href)
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