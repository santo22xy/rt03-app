export function formatRupiah(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}

/**
 * Parse string "Rp 15.000" / "15.000" / "15000" menjadi number 15000.
 * Aman untuk input yang diformat pakai Intl.NumberFormat('id-ID').
 */
export function parseRupiah(input: string | number): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0
  const cleaned = String(input).replace(/[^0-9-]/g, '')
  const n = parseInt(cleaned, 10)
  return Number.isFinite(n) ? n : 0
}

export function formatTanggal(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatTanggalSingkat(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function getMonthKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function getMonthName(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1, 1)
  return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
}

export function loginIdFromBlok(blok: string, nomor: string): string {
  return `${blok.toUpperCase()}-${nomor}`
}