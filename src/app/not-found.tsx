'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Icon + 404 */}
        <div className="space-y-3">
          <div className="mx-auto w-24 h-24 rounded-3xl bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center">
            <span className="text-5xl font-black bg-gradient-to-r from-rose-500 to-pink-600 bg-clip-text text-transparent">
              404
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">
            Halaman Tidak Ditemukan
          </h1>
          <p className="text-sm md:text-base text-slate-600">
            Maaf, halaman yang Anda cari tidak ada atau sudah dipindahkan.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild className="h-11 px-6 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/25">
            <Link href="/dashboard">
              <Home className="w-4 h-4 mr-2" />
              Ke Dashboard
            </Link>
          </Button>
          <Button asChild variant="secondary" className="h-11 px-6">
            <Link href="javascript:history.back()">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Kembali
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
