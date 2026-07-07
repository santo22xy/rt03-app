'use client'

import { useState, useEffect } from 'react'
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  Loader2, CheckCircle2, AlertCircle, User, Calendar, Users, MessageSquare 
} from 'lucide-react'
import { toast } from 'sonner'
import { submitRondaAttendance } from '../jimpitan-actions'
import { getRondaPetugasForDate } from '../ronda/jadwal-ronda-client' // I need to check where this is
import { formatTanggal } from '@/lib/format'

// Note: I need to find the correct function to get the roster. 
// I'll use a server component or action instead to be safe.
// Actually, I will pass the roster from the parent to this component.

interface RondaPerson {
  profile_id: string
  nama_kk: string
  login_id: string
  is_petugas: boolean
}

interface RondaAttendanceFormProps {
  sesiId: string
  date: string
  roster: RondaPerson[]
  onSuccess: () => void
  onCancel: () => void
}

export function RondaAttendanceForm({ sesiId, date, roster, onSuccess, onCancel }: RondaAttendanceFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [attendance, setAttendance] = useState<Record<string, { isPresent: boolean; isPengganti: boolean; penggantiDariId: string | null; catatan: string | null }>>({})

  useEffect(() => {
    const initial: Record<string, { isPresent: boolean; isPengganti: boolean; penggantiDariId: string | null; catatan: string | null }> = {}
    roster.forEach(p => {
      initial[p.profile_id] = { isPresent: true, isPengganti: false, penggantiDariId: null, catatan: null }
    })
    setAttendance(initial)
  }, [roster])

  const handleToggleHadir = (id: string) => {
    setAttendance(prev => ({
      ...prev,
      [id]: { ...prev[id], isPresent: !prev[id].isPresent }
    }))
  }

  const handleTogglePengganti = (id: string) => {
    setAttendance(prev => ({
      ...prev,
      [id]: { ...prev[id], isPengganti: !prev[id].isPengganti }
    }))
  }

  const handleInputChange = (id: string, field: string, value: string | null) => {
    setAttendance(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }))
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      // Prepare data
      const attendanceData = Object.entries(attendance)
        .map(([profileId, info]) => ({
          profileId,
          isPresent: info.isPresent,
          isPengganti: info.isPengganti,
          penggantiDariId: info.penggantiDariId,
          catatan: info.catatan
        }))
        .filter(d => d.isPresent)

      const result = await submitRondaAttendance(sesiId, attendanceData)

      if (result.success) {
        toast.success('Absensi ronda berhasil disimpan!')
        onSuccess()
      } else {
        toast.error(result.error || 'Gagal menyimpan absensi ronda')
      }
    } catch (err) {
      toast.error('Terjadi kesalahan saat mengirim data')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            Absensi Ronda
          </DialogTitle>
          <DialogDescription>
            Tanggal: {formatTanggal(date)}. 
            Silakan tandai kehadiran petugas yang bertugas hari ini.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1">
          {roster.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Tidak ada jadwal ronda untuk tanggal ini.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {roster.map((person) => (
                <div key={person.profile_id} className="p-3 rounded-lg border bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-slate-500" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{person.nama_kk}</div>
                        <div className="text-[10px] text-muted-foreground">{person.login_id}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`hadir-${person.profile_id}`} className="text-xs">Hadir</Label>
                        <Checkbox 
                          id={`hadir-${person.profile_id}`}
                          checked={attendance[person.profile_id]?.isPresent}
                          onCheckedChange={() => handleToggleHadir(person.profile_id)}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`pengganti-${person.profile_id}`} className="text-xs">Pengganti</Label>
                        <Checkbox 
                          id={`pengganti-${person.profile_id}`}
                          checked={attendance[person.profile_id]?.isPengganti}
                          onCheckedChange={() => handleTogglePengganti(person.profile_id)}
                        />
                      </div>
                    </div>
                  </div>

                  {attendance[person.profile_id]?.isPengganti && (
                    <div className="pl-11 pr-2">
                      <Label className="text-[10px] text-muted-foreground block mb-1">Siapa yang menggantikan?</Label>
                      <select
                        className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                        value={attendance[person.profile_id]?.penggantiDariId || ''}
                        onChange={(e) => handleInputChange(person.profile_id, 'penggantiDariId', e.target.value)}
                      >
                        <option value="">Pilih petugas...</option>
                        {roster.filter(r => r.profile_id !== person.profile_id).map(r => (
                          <option key={r.profile_id} value={r.profile_id}>{r.nama_kk}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {attendance[person.profile_id]?.isPresent && (
                    <div className="pl-11">
                      <Label className="text-[10px] text-muted-foreground block mb-1">Catatan</Label>
                      <Input 
                        className="h-8 text-xs"
                        placeholder="Tambahkan catatan (opsional)..."
                        value={attendance[person.profile_id]?.catatan || ''}
                        onChange={(e) => handleInputChange(person.profile_id, 'catatan', e.target.value)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>Batal</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan Absensi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
