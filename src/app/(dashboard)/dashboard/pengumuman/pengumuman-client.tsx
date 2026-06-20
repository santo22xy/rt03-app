'use client'

import { useState, useEffect, useTransition, useRef, useMemo } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  tambahPengumuman, editPengumuman, hapusPengumuman, togglePublish,
  type PengumumanFormState,
} from './actions'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus, Megaphone, MoreVertical, Pencil, Trash2, Power, PowerOff,
  Loader2, Calendar, FileText, Upload, X, Search,
} from 'lucide-react'
import { formatTanggal } from '@/lib/format'
import { toast } from 'sonner'

// ============================================================
// Types
// ============================================================
export interface PengumumanItem {
  id: string
  judul: string
  konten: string
  priority: 'DARURAT' | 'PENTING' | 'NORMAL'
  is_published: boolean
  published_at: string | null
  gambar_url: string | null
  created_at: string
}

interface PengumumanClientProps {
  initial: PengumumanItem[]
}

const initialState: PengumumanFormState = {}

// ============================================================
// Priority metadata
// ============================================================
const PRIORITY_META: Record<string, {
  label: string
  cls: string
  ringCls: string
  iconCls: string
}> = {
  DARURAT: {
    label: 'Darurat',
    cls: 'bg-rose-100 text-rose-700',
    ringCls: 'ring-rose-300',
    iconCls: 'bg-rose-500',
  },
  PENTING: {
    label: 'Penting',
    cls: 'bg-amber-100 text-amber-700',
    ringCls: 'ring-amber-300',
    iconCls: 'bg-amber-500',
  },
  NORMAL: {
    label: 'Info',
    cls: 'bg-blue-100 text-blue-700',
    ringCls: 'ring-blue-200/60',
    iconCls: 'bg-blue-500',
  },
}

// ============================================================
// Submit button with pending state
// ============================================================
function SubmitButton({
  icon: Icon, label, pendingLabel, variant = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  pendingLabel: string
  variant?: 'default' | 'destructive'
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        <>
          <Icon className="w-4 h-4" />
          {label}
        </>
      )}
    </Button>
  )
}

// ============================================================
// Image preview + upload
// ============================================================
function ImageField({
  name, defaultUrl,
}: {
  name: string
  defaultUrl?: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(defaultUrl ?? null)
  const [removeFlag, setRemoveFlag] = useState(false)
  const [fileChosen, setFileChosen] = useState(false)

  function handleFile(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target?.result as string)
      setRemoveFlag(false)
      setFileChosen(true)
    }
    reader.readAsDataURL(file)
  }

  function handleRemove() {
    setPreview(null)
    setRemoveFlag(true)
    setFileChosen(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="removeImage" value={removeFlag ? 'true' : 'false'} />
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          className="hidden"
          id={`file-${name}`}
        />
        <Label
          htmlFor={`file-${name}`}
          className="flex-1 cursor-pointer inline-flex items-center justify-center gap-2 h-10 rounded-md border border-dashed border-input bg-muted/30 hover:bg-muted/60 px-3 text-sm transition-colors"
        >
          <Upload className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {fileChosen ? 'Ganti gambar' : defaultUrl ? 'Ganti gambar' : 'Upload gambar'}
          </span>
        </Label>
        {preview && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleRemove}
            className="h-10 w-10 text-destructive shrink-0"
            title="Hapus gambar"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      {preview && (
        <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" className="w-full h-40 object-cover" />
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        JPG/PNG/WebP/GIF, max 5 MB. Opsional.
      </p>
    </div>
  )
}

// ============================================================
// Form Dialog (tambah & edit)
// ============================================================
function PengumumanFormDialog({
  open, onOpenChange, target,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  target: PengumumanItem | null
}) {
  const isEdit = !!target
  const action = isEdit ? editPengumuman : tambahPengumuman
  const [state, formAction] = useFormState(action, initialState)

  useEffect(() => {
    if (state?.success) {
      toast.success(state.success)
      onOpenChange(false)
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-purple-600" />
            {isEdit ? 'Edit Pengumuman' : 'Tambah Pengumuman'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Edit pengumuman "${target?.judul}"`
              : 'Pengumuman baru akan muncul di aplikasi warga'}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-3" key={target?.id ?? 'new'}>
          {isEdit && <input type="hidden" name="id" value={target?.id ?? ''} />}

          <div className="space-y-1">
            <Label className="text-xs">Judul <span className="text-rose-500">*</span></Label>
            <Input
              name="judul"
              required
              maxLength={200}
              defaultValue={target?.judul ?? ''}
              placeholder="Cth: Jadwal Ronda Bulan Juli"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Konten <span className="text-rose-500">*</span></Label>
            <textarea
              name="konten"
              required
              maxLength={5000}
              defaultValue={target?.konten ?? ''}
              placeholder="Tulis isi pengumuman di sini..."
              rows={5}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Priority</Label>
            <select
              name="priority"
              defaultValue={target?.priority ?? 'NORMAL'}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="NORMAL">Info (Biasa)</option>
              <option value="PENTING">Penting</option>
              <option value="DARURAT">Darurat</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Gambar (opsional)</Label>
            <ImageField name="gambar" defaultUrl={target?.gambar_url ?? null} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isPublished"
              defaultChecked={target?.is_published ?? false}
              className="rounded"
            />
            <span>Publish sekarang (centang untuk tampil ke warga)</span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <SubmitButton
              icon={isEdit ? Pencil : Plus}
              label={isEdit ? 'Simpan' : 'Tambah'}
              pendingLabel="Menyimpan..."
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Main client component
// ============================================================
export function PengumumanClient({ initial }: PengumumanClientProps) {
  const [list, setList] = useState<PengumumanItem[]>(initial)
  const [filter, setFilter] = useState<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL')
  const [search, setSearch] = useState('')

  const [tambahOpen, setTambahOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PengumumanItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PengumumanItem | null>(null)

  const [isPendingToggle, startToggleTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()

  async function handleTogglePublish(item: PengumumanItem) {
    const fd = new FormData()
    fd.append('id', item.id)
    startToggleTransition(async () => {
      const result = await togglePublish({}, fd)
      if (result?.error) toast.error(result.error)
      else if (result?.success) {
        toast.success(result.success)
        // Optimistic update
        setList((prev) =>
          prev.map((p) =>
            p.id === item.id
              ? {
                  ...p,
                  is_published: !p.is_published,
                  published_at: !p.is_published ? new Date().toISOString() : null,
                }
              : p
          )
        )
      }
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    startDeleteTransition(async () => {
      const fd = new FormData()
      fd.append('id', target.id)
      const result = await hapusPengumuman({}, fd)
      if (result?.error) toast.error(result.error)
      else if (result?.success) {
        toast.success(result.success)
        setList((prev) => prev.filter((p) => p.id !== target.id))
        setDeleteTarget(null)
      }
    })
  }

  // Filtered list
  const filtered = useMemo(() => {
    return list.filter((p) => {
      if (filter === 'PUBLISHED' && !p.is_published) return false
      if (filter === 'DRAFT' && p.is_published) return false
      if (search) {
        const q = search.toLowerCase()
        const match =
          p.judul.toLowerCase().includes(q) ||
          p.konten.toLowerCase().includes(q)
        if (!match) return false
      }
      return true
    })
  }, [list, filter, search])

  const counts = useMemo(() => ({
    all: list.length,
    published: list.filter((p) => p.is_published).length,
    draft: list.filter((p) => !p.is_published).length,
  }), [list])

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Megaphone className="w-4 h-4 text-purple-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-purple-600">
              Pengumuman
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">Info & Pengumuman</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kelola pengumuman untuk warga — {counts.published} published · {counts.draft} draft
          </p>
        </div>
        <Button
          onClick={() => setTambahOpen(true)}
          className="bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600 shadow-lg shadow-purple-500/20"
        >
          <Plus className="w-4 h-4" />
          Tambah Pengumuman
        </Button>
      </div>

      {/* Filter & search */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Filter tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1 shrink-0">
              {[
                { key: 'ALL' as const, label: 'Semua', count: counts.all },
                { key: 'PUBLISHED' as const, label: 'Published', count: counts.published },
                { key: 'DRAFT' as const, label: 'Draft', count: counts.draft },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setFilter(t.key)}
                  className={`px-3 h-8 rounded-md text-xs font-semibold transition-colors ${
                    filter === t.key
                      ? 'bg-white text-purple-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label} ({t.count})
                </button>
              ))}
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari judul atau konten..."
                className="w-full h-10 pl-9 pr-3 rounded-md border border-input bg-background text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm ring-1 ring-slate-200/60">
          <CardContent className="p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-3">
              <Megaphone className="w-7 h-7 text-purple-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {list.length === 0 ? 'Belum ada pengumuman' : 'Tidak ada hasil'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {list.length === 0
                ? 'Klik "Tambah Pengumuman" untuk membuat yang pertama'
                : 'Coba kata kunci lain atau ubah filter'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const meta = PRIORITY_META[p.priority] ?? PRIORITY_META.NORMAL
            return (
              <Card
                key={p.id}
                className={`overflow-hidden border-0 shadow-md ring-1 ${
                  p.priority === 'DARURAT'
                    ? 'ring-rose-300 bg-gradient-to-r from-rose-50 to-orange-50'
                    : p.priority === 'PENTING'
                    ? 'ring-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50'
                    : 'ring-blue-200/60 bg-gradient-to-r from-blue-50 to-indigo-50'
                } ${!p.is_published ? 'opacity-70' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.iconCls} text-white`}>
                      <Megaphone className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-base">{p.judul}</h3>
                        <Badge className={`${meta.cls} text-[9px] hover:${meta.cls}`}>
                          {meta.label}
                        </Badge>
                        {!p.is_published && (
                          <Badge variant="secondary" className="text-[9px]">Draft</Badge>
                        )}
                      </div>
                      {/* Image thumbnail */}
                      {p.gambar_url && (
                        <div className="my-2 relative w-full max-w-md rounded-lg overflow-hidden border border-slate-200 bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.gambar_url}
                            alt={p.judul}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-32 object-cover"
                          />
                        </div>
                      )}
                      {p.konten && (
                        <p className="text-sm text-slate-700 line-clamp-2 whitespace-pre-wrap">
                          {p.konten}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        {p.published_at ? (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Dipublikasi {formatTanggal(p.published_at)}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-600">
                            <FileText className="w-3 h-3" />
                            Draft — belum dipublikasi
                          </span>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Menu aksi pengumuman" />}>
                        <MoreVertical className="w-4 h-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => setEditTarget(p)}>
                          <Pencil className="w-4 h-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleTogglePublish(p)}
                          disabled={isPendingToggle}
                        >
                          {p.is_published ? (
                            <>
                              <PowerOff className="w-4 h-4" /> Unpublish
                            </>
                          ) : (
                            <>
                              <Power className="w-4 h-4 text-emerald-600" /> Publish
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(p)}
                          className="text-rose-600"
                        >
                          <Trash2 className="w-4 h-4" /> Hapus
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialogs */}
      <PengumumanFormDialog
        open={tambahOpen}
        onOpenChange={setTambahOpen}
        target={null}
      />
      <PengumumanFormDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        target={editTarget}
      />
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="w-5 h-5" />
              Hapus Pengumuman?
            </DialogTitle>
            <DialogDescription>
              Tindakan ini tidak bisa dibatalkan. Pengumuman &quot;{deleteTarget?.judul}&quot; akan dihapus permanen
              {deleteTarget?.gambar_url && ' (beserta gambar terkait)'}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menghapus...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Hapus Permanen
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}