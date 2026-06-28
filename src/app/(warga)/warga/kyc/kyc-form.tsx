'use client'

import { useState, useTransition, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  ArrowRight, ArrowLeft, User, Users, MessageCircle,
  Camera, Check, X, Loader2, AlertTriangle, Image as ImageIcon,
  Sparkles, CheckCircle2,
} from 'lucide-react'
import {
  checkImageQuality,
  generateWaText,
  generateWaUrl,
  type ImageQualityResult,
} from '@/lib/image-quality'
import { KYC_KELUARGA_LABEL, type KycStatusKeluarga } from '@/lib/types'
import { submitKyc } from './actions'

export interface KycFormData {
  namaKtp: string
  statusKeluarga: KycStatusKeluarga | null
  noWa: string
  namaIstri: string
  anak1: string
  anak2: string
  anak3: string
  catatan: string
}

interface Profile {
  loginId: string
  namaKk: string
  blok: string
  nomorRumah: string
}

export function KycForm({
  initialData,
  adminWa,
  profile,
}: {
  initialData: KycFormData
  adminWa: string  // E.164 format
  profile: Profile
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [data, setData] = useState<KycFormData>(initialData)
  const [isPending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Image states
  const [ktpImage, setKtpImage] = useState<ImageQualityResult | null>(null)
  const [kkImage, setKkImage] = useState<ImageQualityResult | null>(null)
  const [analyzingKtp, setAnalyzingKtp] = useState(false)
  const [analyzingKk, setAnalyzingKk] = useState(false)

  // ============================================
  // STEP VALIDATION
  // ============================================
  const step1Valid =
    data.namaKtp.trim().length >= 3 &&
    data.statusKeluarga !== null &&
    /^(08|62|\\+62)[0-9]{8,12}$/.test(data.noWa.replace(/\D/g, '').replace(/^0/, '62').replace(/^\\+/, ''))

  const step2Valid = true  // KK data opsional
  // Image hanya jadi WARNING, tidak block submit. Gambar tetap dikirim via WA.
  // ok = false hanya untuk HARD ERROR (format file, file terlalu besar/kecil)
  // ok = true dengan hasWarnings = true → user bisa tetap submit
  // Kita tetap butuh image untuk preview, jadi require minimal ada image
  const hasBothImages = ktpImage !== null && kkImage !== null
  const step3Valid = hasBothImages && ktpImage?.ok !== false && kkImage?.ok !== false

  // ============================================
  // HANDLERS
  // ============================================
  const updateField = <K extends keyof KycFormData>(key: K, value: KycFormData[K]) => {
    setData(prev => ({ ...prev, [key]: value }))
  }

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (r: ImageQualityResult) => void,
    setLoading: (b: boolean) => void
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const result = await checkImageQuality(file, {
        onProgress: stage => toast.loading(stage, { id: 'img-qc' }),
      })
      toast.dismiss('img-qc')
      setter(result)
      if (!result.ok) {
        // Hard error: format file / size
        toast.error(result.message)
      } else if (result.hasWarnings) {
        // Soft warning: kualitas kurang, tapi tetap bisa lanjut
        toast.warning(result.message, { duration: 4000 })
      } else {
        toast.success('Kualitas gambar baik ✓')
      }
    } catch (err) {
      toast.dismiss('img-qc')
      toast.error('Gagal memproses gambar')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!step3Valid) return
    setSubmitError(null)

    const formData = new FormData(e.currentTarget)
    // Sync dari state ke formData
    formData.set('namaKtp', data.namaKtp)
    formData.set('statusKeluarga', data.statusKeluarga ?? '')
    formData.set('noWa', data.noWa)
    formData.set('namaIstri', data.namaIstri)
    formData.set('anak1', data.anak1)
    formData.set('anak2', data.anak2)
    formData.set('anak3', data.anak3)
    formData.set('catatan', data.catatan)

    startTransition(async () => {
      const result = await submitKyc({}, formData)
      if (result.error) {
        setSubmitError(result.error)
        toast.error(result.error)
      } else {
        setSubmitted(true)
        toast.success(result.success ?? 'Berhasil!')
      }
    })
  }

  // ============================================
  // POST-SUBMIT VIEW (after successful submit)
  // ============================================
  if (submitted) {
    const waText = generateWaText({
      loginId: profile.loginId,
      namaKtp: data.namaKtp,
      statusKeluarga: KYC_KELUARGA_LABEL[data.statusKeluarga!],
      noWa: data.noWa,
      namaIstri: data.namaIstri || null,
      namaAnak: [data.anak1, data.anak2, data.anak3].filter(Boolean),
      catatan: data.catatan || null,
    })
    const waUrl = generateWaUrl(adminWa, waText)

    return (
      <div className="space-y-5">
        {/* Success card */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-3xl p-6 shadow-xl shadow-emerald-500/20 text-center">
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-2">Pengajuan Tersimpan! ✓</h2>
          <p className="text-emerald-50 text-sm">
            Data Anda sudah masuk ke sistem. Sekarang kirim via WhatsApp ke admin.
          </p>
        </div>

        {/* WA button (big) */}
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-2xl p-5 shadow-lg shadow-emerald-500/30 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <MessageCircle className="w-7 h-7" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-base">Kirim via WhatsApp</p>
              <p className="text-xs text-emerald-50">
                Tap untuk buka WA admin, lalu attach foto KTP & KK
              </p>
            </div>
            <ArrowRight className="w-5 h-5" />
          </div>
        </a>

        {/* WA text preview */}
        <details className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
          <summary className="px-4 py-3 text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-100">
            Preview pesan yang akan dikirim
          </summary>
          <pre className="px-4 py-3 text-[11px] text-slate-700 whitespace-pre-wrap border-t border-slate-200 bg-white">
            {waText}
          </pre>
        </details>

        {/* Instructions */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-xs font-bold text-amber-900 mb-2">
            📸 Cara Kirim Foto KTP & KK
          </p>
          <ol className="text-xs text-amber-800 space-y-1.5 list-decimal list-inside">
            <li>Klik tombol WhatsApp di atas</li>
            <li>Di WA, klik ikon 📎 (attach) di sebelah kolom ketik</li>
            <li>Pilih &ldquo;Galeri&rdquo; atau &ldquo;Dokumen&rdquo;</li>
            <li>Pilih foto KTP, lalu foto KK (2 foto)</li>
            <li>Klik &ldquo;Kirim&rdquo; 🚀</li>
          </ol>
        </div>

        {/* Refresh reminder */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
          <p className="text-xs text-blue-800">
            💡 Setelah kirim WA, kembali ke sini dan <strong>refresh halaman</strong> untuk update status.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-xs font-semibold text-blue-700 hover:underline"
          >
            Refresh Halaman
          </button>
        </div>
      </div>
    )
  }

  // ============================================
  // MAIN FORM
  // ============================================
  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {/* Stepper */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          {[1, 2, 3].map(n => (
            <div key={n} className="flex items-center flex-1">
              <div className={`
                w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-colors
                ${step >= n ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}
              `}>
                {step > n ? <Check className="w-4 h-4" /> : n}
              </div>
              {n < 3 && (
                <div className={`
                  flex-1 h-1 mx-2 rounded transition-colors
                  ${step > n ? 'bg-emerald-600' : 'bg-slate-200'}
                `} />
              )}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1 mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <div className="text-center">Data Diri</div>
          <div className="text-center">Data KK</div>
          <div className="text-center">Foto</div>
        </div>
      </div>

      {/* STEP 1: Data Diri */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-4 h-4 text-emerald-600" />
            <h2 className="font-bold text-sm">Data Diri</h2>
          </div>

          <Field
            label="Nama Sesuai KTP"
            required
            error={data.namaKtp && data.namaKtp.length < 3 ? 'Minimal 3 karakter' : null}
          >
            <Input
              value={data.namaKtp}
              onChange={e => updateField('namaKtp', e.target.value)}
              placeholder="Contoh: BUDI SETIAWAN"
              required
              autoCapitalize="characters"
            />
          </Field>

          <Field label="Status dalam Keluarga" required>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(KYC_KELUARGA_LABEL) as KycStatusKeluarga[]).map(status => {
                const selected = data.statusKeluarga === status
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => updateField('statusKeluarga', status)}
                    className={`
                      px-3 py-2.5 rounded-xl border-2 text-xs font-semibold text-left transition-all
                      ${selected
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }
                    `}
                  >
                    {KYC_KELUARGA_LABEL[status]}
                  </button>
                )
              })}
            </div>
          </Field>

          <Field
            label="Nomor WhatsApp Aktif"
            required
            hint="Untuk notifikasi & komunikasi admin"
            error={data.noWa && !/^[\d+\s-]{9,15}$/.test(data.noWa) ? 'Format tidak valid' : null}
          >
            <Input
              type="tel"
              value={data.noWa}
              onChange={e => updateField('noWa', e.target.value)}
              placeholder="0812-3456-7890"
              required
            />
          </Field>
        </div>
      )}

      {/* STEP 2: Data KK */}
      {step === 2 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-emerald-600" />
            <h2 className="font-bold text-sm">Data Kartu Keluarga (Opsional)</h2>
          </div>
          <p className="text-xs text-slate-500 -mt-2">
            Boleh kosong jika tinggal sendiri
          </p>

          <Field label="Nama Istri">
            <Input
              value={data.namaIstri}
              onChange={e => updateField('namaIstri', e.target.value)}
              placeholder="Contoh: SRI MULYANI"
              autoCapitalize="characters"
            />
          </Field>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Nama Anak (max 3)</p>
            <Input
              value={data.anak1}
              onChange={e => updateField('anak1', e.target.value)}
              placeholder="Anak 1"
              autoCapitalize="characters"
            />
            <Input
              value={data.anak2}
              onChange={e => updateField('anak2', e.target.value)}
              placeholder="Anak 2 (opsional)"
              autoCapitalize="characters"
            />
            <Input
              value={data.anak3}
              onChange={e => updateField('anak3', e.target.value)}
              placeholder="Anak 3 (opsional)"
              autoCapitalize="characters"
            />
          </div>

          <Field label="Catatan Tambahan" hint="Misal: ada anggota keluarga lain, dll">
            <Textarea
              value={data.catatan}
              onChange={e => updateField('catatan', e.target.value)}
              placeholder="..."
              rows={3}
              maxLength={300}
            />
          </Field>
        </div>
      )}

      {/* STEP 3: Foto */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Camera className="w-4 h-4 text-emerald-600" />
              <h2 className="font-bold text-sm">Foto KTP & KK</h2>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Foto <span className="font-bold text-slate-700">TIDAK</span> dikirim ke server.
              Tinggal preview di HP, lalu Anda attach manual di WhatsApp.
            </p>

            {/* KTP */}
            <ImageDropzone
              label="Foto KTP"
              result={ktpImage}
              loading={analyzingKtp}
              onChange={e => handleImageUpload(e, setKtpImage, setAnalyzingKtp)}
              onRemove={() => setKtpImage(null)}
            />

            {/* KK */}
            <div className="mt-4">
              <ImageDropzone
                label="Foto Kartu Keluarga (KK)"
                result={kkImage}
                loading={analyzingKk}
                onChange={e => handleImageUpload(e, setKkImage, setAnalyzingKk)}
                onRemove={() => setKkImage(null)}
              />
            </div>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-[11px] text-blue-900">
                <p className="font-semibold mb-1">Tips foto bagus:</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>Pastikan seluruh KTP/KK terlihat</li>
                  <li>Cahaya cukup, tidak silau</li>
                  <li>Letakkan di alas gelap/kontras</li>
                </ul>
                <p className="mt-1.5 text-[10px] text-blue-700 italic">
                  💡 Catatan: Foto dengan kualitas kurang tetap bisa dikirim. Yang penting dokumen terbaca.
                </p>
              </div>
            </div>
          </div>

          {submitError && (
            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{submitError}</p>
            </div>
          )}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-2">
        {step > 1 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((step - 1) as 1 | 2)}
            className="flex-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali
          </Button>
        )}
        {step < 3 ? (
          <Button
            type="button"
            onClick={() => setStep((step + 1) as 2 | 3)}
            disabled={
              (step === 1 && !step1Valid) ||
              (step === 2 && !step2Valid)
            }
            className="flex-1"
          >
            Lanjut
            <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={!step3Valid || isPending}
            className="flex-1"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Kirim Pengajuan
              </>
            )}
          </Button>
        )}
      </div>
    </form>
  )
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[10px] text-slate-500">{hint}</p>}
      {error && <p className="text-[10px] text-red-600 font-semibold">{error}</p>}
    </div>
  )
}

function ImageDropzone({
  label,
  result,
  loading,
  onChange,
  onRemove,
}: {
  label: string
  result: ImageQualityResult | null
  loading: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  if (result) {
    const isWarning = result.ok && result.hasWarnings  // ok tapi ada warning (tidak block)
    const isError = !result.ok  // hard error (block submit)
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700">{label}</p>
          <Badge className={
            isError
              ? 'bg-red-100 text-red-700 hover:bg-red-100'
              : isWarning
              ? 'bg-amber-100 text-amber-700 hover:bg-amber-100'
              : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
          }>
            {isError ? '⚠ Tidak bisa' : isWarning ? '⚠ Ada catatan' : '✓ Bagus'}
          </Badge>
        </div>
        <div className="relative rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50">
          <img
            src={result.dataUrl}
            alt={label}
            className="w-full max-h-64 object-contain"
          />
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 shadow-lg"
            aria-label="Hapus"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className={`text-[10px] ${
          isError ? 'text-red-600' : isWarning ? 'text-amber-700' : 'text-emerald-700'
        }`}>
          {result.message}
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs font-semibold text-slate-700 mb-1.5">{label}</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="w-full border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 rounded-xl p-6 transition-colors text-center disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-6 h-6 text-emerald-600 mx-auto mb-1.5 animate-spin" />
            <p className="text-xs font-semibold text-slate-700">Mengecek kualitas...</p>
          </>
        ) : (
          <>
            <ImageIcon className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
            <p className="text-xs font-semibold text-slate-700">Ketuk untuk pilih foto</p>
            <p className="text-[10px] text-slate-500 mt-0.5">JPG/PNG/WebP, max 10MB</p>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onChange}
        className="hidden"
      />
    </div>
  )
}
