/**
 * Image quality check untuk KYC (KTP/KK).
 * Semua proses di client-side (browser), tidak ada upload.
 *
 * Photo HANYA untuk preview di HP user, lalu di-attach manual
 * di WhatsApp. Jadi validasi kualitas HANYA warning, tidak
 * block submit (kecuali hard error: format file / size).
 *
 * HARD ERROR (block submit):
 *   - Bukan file image
 *   - Format tidak didukung (bukan jpg/png/webp/heic/heif)
 *   - File > 10MB
 *   - File < 20KB
 *
 * WARNING (tidak block, hanya info):
 *   - Resolusi < 600x400 (KTP/KK scan bisa kecil)
 *   - Blur (Laplacian variance < 30)
 *   - Terlalu gelap (< 15) atau terlalu terang (> 240)
 *
 * Check:
 * 1. Format file (HARD)
 * 2. Ukuran file 20KB - 10MB (HARD)
 * 3. Resolusi minimal 600x400 (WARNING)
 * 4. Blur detection (WARNING)
 * 5. Brightness (WARNING)
 * 6. EXIF orientation (auto-rotate, internal)
 */

export type ImageQualityIssue =
  | 'TOO_SMALL'      // resolusi < 600x400
  | 'TOO_LARGE'      // file > 10MB
  | 'TOO_BLURRY'     // Laplacian variance < threshold
  | 'TOO_DARK'       // mean luminance < 15
  | 'TOO_BRIGHT'     // mean luminance > 240
  | 'WRONG_FORMAT'   // bukan jpg/png/webp
  | 'NOT_IMAGE'      // file bukan image

export interface ImageQualityResult {
  ok: boolean
  hasWarnings: boolean          // true kalau ada warning tapi masih ok (tidak block submit)
  width: number
  height: number
  fileSize: number          // bytes
  blurScore: number         // 0-100, higher = sharper
  brightness: number        // 0-255, mean luminance
  issues: ImageQualityIssue[]
  warnings: ImageQualityIssue[]   // warning vs error
  message: string           // human-readable summary
  dataUrl: string           // base64 data URL (untuk preview)
}

const MIN_WIDTH = 600
const MIN_HEIGHT = 400
const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10MB
const MIN_FILE_SIZE = 20 * 1024        // 20KB (terlalu kecil = kemungkinan blur)
const BLUR_THRESHOLD = 30              // Laplacian variance minimum (lebih longgar)
const BRIGHTNESS_MIN = 15              // terlalu gelap (lebih longgar)
const BRIGHTNESS_MAX = 240             // terlalu terang (lebih longgar)
const ALLOWED_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

/**
 * Decode image, apply EXIF rotation, lalu jalankan quality check.
 * Returns: { width, height, fileSize, blurScore, brightness, dataUrl, issues }
 */
export async function checkImageQuality(
  file: File,
  opts: {
    onProgress?: (stage: string) => void
  } = {}
): Promise<ImageQualityResult> {
  const { onProgress } = opts

  // 1. Validasi format & size — INI ADALAH HARD ERROR (block submit)
  if (!file.type.startsWith('image/')) {
    return emptyResult(file, ['NOT_IMAGE'], 'File bukan gambar')
  }
  if (!ALLOWED_FORMATS.includes(file.type)) {
    return emptyResult(file, ['WRONG_FORMAT'], `Format ${file.type} tidak didukung. Gunakan JPG/PNG/WebP`)
  }
  if (file.size > MAX_FILE_SIZE) {
    return emptyResult(file, ['TOO_LARGE'], `File terlalu besar (${formatBytes(file.size)}). Maksimal 10MB`)
  }
  if (file.size < MIN_FILE_SIZE) {
    return emptyResult(file, ['TOO_SMALL'], `File terlalu kecil (${formatBytes(file.size)}). Foto mungkin blur`)
  }

  onProgress?.('Membaca gambar...')

  // 2. Load ke Image element
  const dataUrl = await readFileAsDataURL(file)
  const img = await loadImage(dataUrl)

  // 3. Apply EXIF orientation + draw to canvas
  onProgress?.('Mengecek kualitas...')
  const { canvas, width, height } = drawWithOrientation(img)

  // 4. Resolusi check — ini WARNING, tidak block submit
  // Foto dari HP sekarang minimal 1080px, tapi KTP/KK hasil scan
  // dari kamera lain bisa lebih kecil. Kita longgarkan.
  const issues: ImageQualityIssue[] = []
  const warnings: ImageQualityIssue[] = []
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    warnings.push('TOO_SMALL')
  }

  // 5. Brightness (mean luminance) — WARNING
  const brightness = computeBrightness(canvas)
  if (brightness < BRIGHTNESS_MIN) {
    warnings.push('TOO_DARK')
  } else if (brightness > BRIGHTNESS_MAX) {
    warnings.push('TOO_BRIGHT')
  }

  // 6. Blur detection (Laplacian variance) — WARNING
  const blurScore = computeBlurScore(canvas)
  if (blurScore < BLUR_THRESHOLD) {
    warnings.push('TOO_BLURRY')
  }

  // ok = true kalau tidak ada HARD ERROR (file format, size, dll)
  // hasWarnings = true kalau ada warning kualitas
  const ok = issues.length === 0
  const hasWarnings = warnings.length > 0
  const message = ok && !hasWarnings
    ? 'Kualitas gambar baik ✓'
    : ok
    ? 'Foto diterima. ' + issuesToMessage(warnings)
    : issuesToMessage(issues)

  return {
    ok,
    hasWarnings,
    width,
    height,
    fileSize: file.size,
    blurScore,
    brightness,
    issues,
    warnings,
    message,
    dataUrl,
  }
}

// ============================================================
// HELPERS
// ============================================================

function emptyResult(
  file: File,
  issues: ImageQualityIssue[],
  message: string
): ImageQualityResult {
  return {
    ok: false,
    hasWarnings: false,
    width: 0,
    height: 0,
    fileSize: file.size,
    blurScore: 0,
    brightness: 0,
    issues,
    warnings: [],
    message,
    dataUrl: '',
  }
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Gagal load gambar'))
    img.src = src
  })
}

/**
 * Apply EXIF orientation ke canvas.
 * Portrait photos dari HP biasanya punya orientasi 6 (rotated 90° CW).
 */
function drawWithOrientation(
  img: HTMLImageElement
): { canvas: HTMLCanvasElement; width: number; height: number } {
  // Baca EXIF orientation (best effort, tidak semua browser support)
  const orientation = getExifOrientation()

  const width = img.naturalWidth
  const height = img.naturalHeight

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D tidak tersedia')

  // Set dimensi canvas sesuai orientation
  if (orientation >= 5 && orientation <= 8) {
    // rotated 90°, swap dimensions
    canvas.width = height
    canvas.height = width
  } else {
    canvas.width = width
    canvas.height = height
  }

  // Apply transform
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, width, 0); break
    case 3: ctx.transform(-1, 0, 0, -1, width, height); break
    case 4: ctx.transform(1, 0, 0, -1, 0, height); break
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break
    case 6: ctx.transform(0, 1, -1, 0, height, 0); break
    case 7: ctx.transform(0, -1, -1, 0, height, width); break
    case 8: ctx.transform(0, -1, 1, 0, 0, width); break
    default: ctx.transform(1, 0, 0, 1, 0, 0)
  }

  ctx.drawImage(img, 0, 0)
  return { canvas, width: canvas.width, height: canvas.height }
}

function getExifOrientation(): number {
  // Best effort: cek marker EXIF sederhana
  // Format: 0xFFD8 (SOI) ... 0xFFE1 (APP1) ... 'Exif\0\0' ... II/MM ... 0x002A
  // Lalu baca tag orientation di offset tertentu
  // Ini simplified, banyak edge case. Browser modern biasanya handle auto-rotate.
  // Kita return 1 (no rotation) sebagai default.
  return 1
}

/**
 * Hitung mean luminance (brightness) dari canvas.
 * Returns: 0-255
 */
function computeBrightness(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 128

  // Sample kecil (max 200x200) untuk speed
  const sampleSize = 200
  const w = Math.min(sampleSize, canvas.width)
  const h = Math.min(sampleSize, canvas.height)
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = w
  tempCanvas.height = h
  const tempCtx = tempCanvas.getContext('2d')
  if (!tempCtx) return 128

  tempCtx.drawImage(canvas, 0, 0, w, h)
  const imageData = tempCtx.getImageData(0, 0, w, h)
  const data = imageData.data

  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    // Luminance formula: 0.299R + 0.587G + 0.114B
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    sum += lum
  }
  return sum / (data.length / 4)
}

/**
 * Hitung blur score dengan Laplacian variance method.
 * Higher = sharper. < 100 = likely blurry.
 *
 * Algoritma:
 * 1. Convert ke grayscale
 * 2. Apply Laplacian kernel: [[0,-1,0],[-1,4,-1],[0,-1,0]]
 * 3. Variance dari hasil = blur score
 */
function computeBlurScore(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 0

  // Sample kecil untuk speed
  const sampleSize = 200
  const w = Math.min(sampleSize, canvas.width)
  const h = Math.min(sampleSize, canvas.height)
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = w
  tempCanvas.height = h
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })
  if (!tempCtx) return 0

  tempCtx.drawImage(canvas, 0, 0, w, h)
  const imageData = tempCtx.getImageData(0, 0, w, h)
  const data = imageData.data

  // Convert ke grayscale array
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b
  }

  // Apply Laplacian kernel
  const laplacian = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x
      const val =
        -gray[idx - w] +
        -gray[idx - 1] +
        4 * gray[idx] +
        -gray[idx + 1] +
        -gray[idx + w]
      laplacian[idx] = val
    }
  }

  // Hitung variance
  let sum = 0
  let sumSq = 0
  const n = (w - 2) * (h - 2)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const val = laplacian[y * w + x]
      sum += val
      sumSq += val * val
    }
  }
  const mean = sum / n
  const variance = sumSq / n - mean * mean

  // Variance bisa negatif karena floating point, clamp ke 0
  return Math.max(0, variance)
}

function issuesToMessage(issues: ImageQualityIssue[]): string {
  const messages: string[] = []
  for (const issue of issues) {
    switch (issue) {
      case 'TOO_SMALL':
        messages.push('Resolusi kecil (min 600x400px), tetapi tetap diterima')
        break
      case 'TOO_LARGE':
        messages.push('File terlalu besar (max 10MB)')
        break
      case 'TOO_BLURRY':
        messages.push('Gambar agak blur, tetapi tetap diterima')
        break
      case 'TOO_DARK':
        messages.push('Gambar agak gelap, tetapi tetap diterima')
        break
      case 'TOO_BRIGHT':
        messages.push('Gambar agak terang, tetapi tetap diterima')
        break
    }
  }
  return messages.join('. ')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Generate WA text template (untuk di-encode ke wa.me URL)
 */
export function generateWaText(params: {
  loginId: string
  namaKtp: string
  statusKeluarga: string
  noWa: string
  namaIstri?: string | null
  namaAnak?: string[]
  catatan?: string | null
}): string {
  const {
    loginId,
    namaKtp,
    statusKeluarga,
    noWa,
    namaIstri,
    namaAnak = [],
    catatan,
  } = params

  const lines = [
    '*🔔 Pengajuan KYC - SENTRA RT 03*',
    '─────────────────────',
    `Login ID  : ${loginId}`,
    `Nama KTP  : ${namaKtp}`,
    `Status    : ${statusKeluarga}`,
    `No WA     : ${noWa}`,
  ]

  if (namaIstri) lines.push(`Istri     : ${namaIstri}`)

  if (namaAnak.length > 0) {
    namaAnak.forEach((nama, i) => {
      if (nama.trim()) lines.push(`Anak ${i + 1}    : ${nama}`)
    })
  }

  if (catatan) {
    lines.push('─────────────────────')
    lines.push(`Catatan: ${catatan}`)
  }

  lines.push('─────────────────────')
  lines.push('📎 *Foto KTP & KK terlampir*')
  lines.push('Mohon dicek & diverifikasi. Terima kasih 🙏')

  return lines.join('\n')
}

/**
 * Generate wa.me URL dengan text template
 */
export function generateWaUrl(phoneE164: string, text: string): string {
  const cleanPhone = phoneE164.replace(/\D/g, '')
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
}
