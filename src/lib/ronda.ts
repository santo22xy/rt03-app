// Ronda utility helpers
// Helper untuk menghitung tanggal-tanggal Sabtu

/**
 * Get N Saturday ke depan dari hari ini
 * Output value menggunakan format YYYY-MM-DD berdasarkan local date (bukan UTC).
 * Penting untuk konsistensi dengan kolom DATE di Postgres yang pakai tanggal lokal.
 */
export function getNextSaturdays(n: number = 4, fromDate?: Date): Array<{ value: string; label: string }> {
  const today = fromDate ?? new Date()
  // Mulai dari hari ini, cari Sabtu berikutnya
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  // Cari Sabtu pertama (>= today, atau next Saturday)
  // Jika today adalah Sabtu, gunakan today
  while (cursor.getDay() !== 6) {
    cursor.setDate(cursor.getDate() + 1)
  }

  const saturdays: Array<{ value: string; label: string }> = []
  for (let i = 0; i < n; i++) {
    // Format YYYY-MM-DD dari local date (bukan UTC)
    const yyyy = cursor.getFullYear()
    const mm = String(cursor.getMonth() + 1).padStart(2, '0')
    const dd = String(cursor.getDate()).padStart(2, '0')
    const value = `${yyyy}-${mm}-${dd}`
    const label = cursor.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    saturdays.push({ value, label })
    cursor.setDate(cursor.getDate() + 7)
  }
  return saturdays
}

/**
 * Hitung minggu ke berapa dalam bulan (1-5) untuk tanggal tertentu
 */
export function mingguKe(tanggal: string | Date): number {
  const d = typeof tanggal === 'string' ? new Date(tanggal) : tanggal
  return Math.ceil(d.getDate() / 7)
}

/**
 * Cek apakah tanggal tertentu adalah Sabtu
 */
export function isSaturday(tanggal: string | Date): boolean {
  const d = typeof tanggal === 'string' ? new Date(tanggal) : tanggal
  return d.getDay() === 6
}