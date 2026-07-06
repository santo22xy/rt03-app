'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Receipt, Shield, Megaphone, HeartHandshake,
} from 'lucide-react'
import type { ComponentType } from 'react'

type NavItem = {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  isCenter?: boolean
}

const WARGA_NAV: NavItem[] = [
  { href: '/warga',              label: 'Beranda',    icon: Home },
  { href: '/warga/iuran',        label: 'Iuran',      icon: Receipt },
  { href: '/warga/dana-khusus',  label: 'Dana Khusus', icon: HeartHandshake, isCenter: true },
  { href: '/warga/ronda',        label: 'Ronda',      icon: Shield },
  { href: '/warga/pengumuman',   label: 'Info',       icon: Megaphone },
]

export function BottomNavWarga() {
  const pathname = usePathname() ?? ''

  function isActive(href: string) {
    if (href === '/warga') return pathname === '/warga'
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <nav
      aria-label="Bottom navigation warga"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="relative grid grid-cols-5 items-end h-20 max-w-lg mx-auto">
        {WARGA_NAV.map((item) => {
          const active = isActive(item.href)
          const isCenter = item.isCenter === true
          const isAccent = item.href === '/warga/dana-khusus'
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className="relative flex flex-col items-center justify-end h-full pb-2 group"
            >
              {isCenter ? (
                <>
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 via-rose-500 to-red-500 shadow-lg shadow-rose-500/40 ring-4 ring-white flex items-center justify-center z-10">
                    <item.icon className="w-6 h-6 text-white" />
                  </div>
                  <span className={`mt-1 text-[10px] font-bold transition-colors ${
                    active ? 'text-pink-700' : 'text-slate-600 group-hover:text-slate-900'
                  }`}>
                    {item.label}
                  </span>
                </>
              ) : (
                <>
                  <item.icon
                    className={`w-5 h-5 transition-colors ${
                      active
                        ? (isAccent ? 'text-pink-600' : 'text-emerald-600')
                        : 'text-slate-500 group-hover:text-slate-700'
                    }`}
                  />
                  <span
                    className={`text-[10px] font-semibold mt-0.5 transition-colors ${
                      active
                        ? (isAccent ? 'text-pink-600' : 'text-emerald-600')
                        : 'text-slate-500 group-hover:text-slate-700'
                    }`}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}