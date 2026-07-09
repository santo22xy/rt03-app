'use client'

import { useState, useEffect } from 'react'
import { 
  Calendar, 
  Search, 
  Loader2,
  ArrowUpCircle,
  ArrowDownCircle,
  Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { getActiveResidents, getGuardMembersForDate, pengurusInputJimpitanManual } from '../jimpitan-actions'
import { formatRupiah } from '@/lib/format'
import { toast } from 'sonner'

interface Resident {
  id: string
  nama_kk: string
  login_id: string
  blok: string
  nomor_rumah: string
}

interface ManualJimpitanFormProps {
  role: string
}

export function ManualJimpitanForm({ role }: ManualJimpitanFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [residents, setResidents] = useState<Resident[]>([])
  const [residentsLoading, setResidentsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [blokFilter, setBlokFilter] = useState('')
  const [nomorRumahFilter, setNomorRumahFilter] = useState('')
  const [sortField, setSortField] = useState<'nama' | 'blok' | 'nomor_rumah'>('blok')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [data, setData] = useState<Record<string, { nominal: number; isBayar: boolean }>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [guardMembers, setGuardMembers] = useState<Array<{ profile_id: string; nama_kk_snapshot: string }>>([])
  const [attendance, setAttendance] = useState<Record<string, boolean>>({})
  const [loadingGuard, setLoadingGuard] = useState(false)

  useEffect(() => {
    async function fetchResidents() {
      try {
        const res = await getActiveResidents()
        // Default sort: Blok (Asc) -> Nomor Rumah (Asc)
        const sorted = [...res].sort((a, b) => {
          const blokComp = a.blok.localeCompare(b.blok)
          if (blokComp !== 0) return blokComp
          const numA = parseInt(a.nomor_rumah, 10) || 0
          const numB = parseInt(b.nomor_rumah, 10) || 0
          return numA - numB
        })
        setResidents(sorted)
        // Initialize data with 0 nominal and false isBayar
        const initialData: Record<string, { nominal: number; isBayar: boolean }> = {}
        sorted.forEach((r) => {
          initialData[r.id] = { nominal: 0, isBayar: false }
        })
        setData(initialData)
      } catch (err) {
        console.error('Failed to fetch residents:', err)
        toast.error('Gagal memuat daftar warga')
      } finally {
        setResidentsLoading(false)
      }
    }
    fetchResidents()
  }, [])

  // Fetch guard members when date changes
  useEffect(() => {
    if (!selectedDate) return
    let cancelled = false
    setLoadingGuard(true)
    setAttendance({})
    getGuardMembersForDate(selectedDate)
      .then(members => {
        if (cancelled) return
        setGuardMembers(members)
        // Default semua hadir
        const defaultAttendance: Record<string, boolean> = {}
        members.forEach(m => { defaultAttendance[m.profile_id] = true })
        setAttendance(defaultAttendance)
      })
      .catch(() => {
        if (!cancelled) setGuardMembers([])
      })
      .finally(() => {
        if (!cancelled) setLoadingGuard(false)
      })
    return () => { cancelled = true }
  }, [selectedDate])

  const handleNominalChange = (id: string, val: string) => {
    const num = parseInt(val.replace(/\D/g, ''), 10) || 0
    setData(prev => ({
      ...prev,
      [id]: { ...prev[id], nominal: num }
    }))
  }

  const handleToggleBayar = (id: string) => {
    setData(prev => ({
      ...prev,
      [id]: { ...prev[id], isBayar: !prev[id].isBayar }
    }))
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      // Prepare details for submission
      const details = Object.entries(data)
        .map(([id, info]) => {
          const resident = residents.find(r => r.id === id)
          if (!resident) return null
          return {
            profileId: id,
            nominal: info.nominal,
            isBayar: info.isBayar
          }
        })
        .filter((d): d is { profileId: string; nominal: number; isBayar: boolean } => d !== null && (d.isBayar || d.nominal > 0))

      if (details.length === 0) {
        toast.error('Harap pilih minimal satu warga yang membayar')
        setIsSubmitting(false)
        return
      }

      const formData = new FormData()
      formData.append('tanggal', selectedDate)
      formData.append('details', JSON.stringify(details))

      // Sertakan data absensi penjaga
      if (guardMembers.length > 0) {
        const attendanceData = guardMembers.map(m => ({
          profile_id: m.profile_id,
          nama_snapshot: m.nama_kk_snapshot,
          hadir: attendance[m.profile_id] ?? false,
        }))
        formData.append('attendance', JSON.stringify(attendanceData))
      }

      const result = await pengurusInputJimpitanManual(formData)

      if (result.success) {
        toast.success('Jimpitan manual berhasil dibuat! Menunggu ACC Bendahara.')
        setIsOpen(false)
        // Reset form
        setData(prev => {
          const reset: Record<string, { nominal: number; isBayar: boolean }> = {}
          residents.forEach(r => reset[r.id] = { nominal: 0, isBayar: false })
          return reset
        })
      } else {
        toast.error(result.error || 'Gagal membuat jimpitan manual')
      }
    } catch (err) {
      toast.error('Terjadi kesalahan saat mengirim data')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Get unique blok values for filter
  const uniqueBlok = Array.from(new Set(residents.map(r => r.blok))).sort()
  
  const filteredAndSortedResidents = residents
    .filter(r => {
      const matchesSearch = 
        r.nama_kk.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.login_id.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesBlok = !blokFilter || r.blok === blokFilter
      const matchesNomorRumah = !nomorRumahFilter || r.nomor_rumah.toLowerCase().includes(nomorRumahFilter.toLowerCase())
      return matchesSearch && matchesBlok && matchesNomorRumah
    })
    .sort((a, b) => {
      let comparison = 0
      if (sortField === 'nama') {
        comparison = a.nama_kk.localeCompare(b.nama_kk)
      } else if (sortField === 'blok') {
        comparison = a.blok.localeCompare(b.blok)
      } else if (sortField === 'nomor_rumah') {
        const numA = parseInt(a.nomor_rumah, 10) || 0
        const numB = parseInt(b.nomor_rumah, 10) || 0
        comparison = numA - numB
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Calendar className="w-4 h-4" />
          Input Manual (Tanggal Lampau)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Input Manual Jimpitan</DialogTitle>
          <DialogDescription>
            Pilih tanggal dan masukkan data jimpitan untuk warga yang membayar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tanggal">Tanggal Jimpitan</Label>
              <Input 
                id="tanggal" 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="blok">Blok</Label>
              <select 
                id="blok"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={blokFilter}
                onChange={(e) => setBlokFilter(e.target.value)}
              >
                <option value="">Semua Blok</option>
                {uniqueBlok.map(blok => (
                  <option key={blok} value={blok}>{blok}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nomorRumah">Nomor Rumah</Label>
              <Input 
                id="nomorRumah"
                placeholder="Nomor Rumah..."
                value={nomorRumahFilter}
                onChange={(e) => setNomorRumahFilter(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="search">Cari Nama/ID</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="search"
                  placeholder="Nama atau ID..." 
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Sorting Controls */}
          <div className="flex items-center gap-4 p-2 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="whitespace-nowrap">Urutkan berdasarkan:</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="text-xs bg-white border border-input rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-ring/50"
                value={sortField}
                onChange={(e) => setSortField(e.target.value as any)}
              >
                <option value="nama">Nama</option>
                <option value="blok">Blok</option>
                <option value="nomor_rumah">Nomor Rumah</option>
              </select>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? (
                  <ArrowUpCircle className="w-4 h-4 text-emerald-600" />
                ) : (
                  <ArrowDownCircle className="w-4 h-4 text-rose-600" />
                )}
              </Button>
            </div>
          </div>

          <div className="rounded-md border">
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase text-muted-foreground bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 w-12">Bayar</th>
                    <th className="px-4 py-2">Nama Warga</th>
                    <th className="px-4 py-2 w-32 text-right">Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  {residentsLoading ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                      </td>
                    </tr>
                  ) : filteredAndSortedResidents.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                        Warga tidak ditemukan
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedResidents.map((r) => (
                      <tr key={r.id} className={`border-t ${data[r.id]?.isBayar ? 'bg-emerald-50/50' : ''}`}>
                        <td className="px-4 py-2 text-center">
                          <Checkbox 
                            checked={data[r.id]?.isBayar}
                            onCheckedChange={() => handleToggleBayar(r.id)}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className="font-medium">{r.nama_kk}</div>
                          <div className="text-[10px] text-muted-foreground">{r.blok} - {r.nomor_rumah} ({r.login_id})</div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="relative flex items-center">
                            <span className="absolute left-2 text-xs text-muted-foreground">Rp</span>
                            <Input 
                              type="text"
                              className="pl-8 text-right h-8"
                              value={data[r.id]?.nominal ? formatRupiah(data[r.id].nominal) : ''}
                              onChange={(e) => handleNominalChange(r.id, e.target.value)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Absensi Penjaga */}
        <div className="space-y-3 px-1">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Absensi Penjaga</span>
            {!loadingGuard && guardMembers.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {Object.values(attendance).filter(Boolean).length}/{guardMembers.length} hadir
              </Badge>
            )}
          </div>
          {loadingGuard ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : guardMembers.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              Tidak ada jadwal penjaga untuk tanggal ini
            </p>
          ) : (
            <div className="rounded-md border divide-y">
              {guardMembers.map(m => (
                <label
                  key={m.profile_id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${attendance[m.profile_id] ? 'bg-emerald-50/50' : ''}`}
                >
                  <Checkbox
                    checked={attendance[m.profile_id] ?? false}
                    onCheckedChange={(checked) =>
                      setAttendance(prev => ({ ...prev, [m.profile_id]: !!checked }))
                    }
                  />
                  <span className="text-sm">{m.nama_kk_snapshot}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Batal</Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Simpan & Kirim untuk ACC
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}