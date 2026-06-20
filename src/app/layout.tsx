import type { Metadata, Viewport } from "next"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "SENTRA RT 03",
  description: "Sistem informasi RT 03 - Next.js + Supabase",
  manifest: "/manifest.json",
  applicationName: "SENTRA RT 03",
  authors: [{ name: "SENTRA RT 03" }],
  generator: "SENTRA RT 03",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SENTRA RT 03",
  },
  formatDetection: {
    telephone: false,
  },
  // icon.png, apple-icon.png, favicon.ico di app/ di-handle otomatis
  // oleh Next.js (file-system based metadata).
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f766e" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="font-sans antialiased text-slate-900 bg-slate-50">
        {/* Skip to content untuk a11y keyboard user */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[200] focus:bg-emerald-700 focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:text-sm focus:font-semibold focus:shadow-lg"
        >
          Langsung ke konten
        </a>
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  )
}