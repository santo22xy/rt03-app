import { DanaKhususManager } from './dana-khusus-manager'
import { HeartHandshake, Sparkles } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function DanaKhususPage() {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <HeartHandshake className="w-4 h-4 text-pink-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-pink-600">
            Pengumpulan Dana Khusus
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-pink-600" />
          Dana Khusus RT
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Pengumpulan dana sementara untuk acara RT (Merti Desa, 17 Agustus, Natal)
          atau iuran sosial. Warga bisa bayar dengan <strong>cicilan</strong> — progres
          otomatis masuk ke sisi warga.
        </p>
      </div>

      <DanaKhususManager />
    </div>
  )
}
