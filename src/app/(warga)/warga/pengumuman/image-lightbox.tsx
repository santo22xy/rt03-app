'use client'

import { useState, useEffect } from 'react'
import { ZoomIn, X } from 'lucide-react'

interface ImageLightboxProps {
  src: string
  alt: string
}

/**
 * Thumbnail yang bisa diklik untuk membuka popup full-size.
 * Pakai native overlay (fixed inset-0 z-[100]) supaya tidak bergantung
 * pada behavior Dialog library. Klik backdrop / X / Esc untuk tutup.
 */
export function ImageLightbox({ src, alt }: ImageLightboxProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  return (
    <>
      {/* Thumbnail (clickable) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group block w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 relative cursor-zoom-in transition-shadow hover:shadow-md"
        aria-label={`Buka gambar full-size: ${alt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="w-full max-h-80 object-contain bg-slate-50"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center pointer-events-none">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 shadow-lg">
            <ZoomIn className="w-3.5 h-3.5" />
            Klik untuk perbesar
          </div>
        </div>
      </button>

      {/* Lightbox popup */}
      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-3 sm:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
        >
          {/* Tombol close */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
            }}
            className="absolute top-4 right-4 z-[110] w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white flex items-center justify-center transition-colors"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Gambar full-size */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-[95vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
          />

          {/* Caption di bawah */}
          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none">
            <p className="text-white/95 text-sm font-semibold text-center max-w-2xl mx-auto">
              {alt}
            </p>
            <p className="text-white/60 text-[10px] text-center mt-1">
              Tekan Esc atau klik di luar untuk menutup
            </p>
          </div>
        </div>
      )}
    </>
  )
}