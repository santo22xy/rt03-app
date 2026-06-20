'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ============================================================
// Types
// ============================================================
export type PengumumanFormState = {
  error?: string
  success?: string
}

const PRIORITY_VALID = ['DARURAT', 'PENTING', 'NORMAL'] as const
type Priority = (typeof PRIORITY_VALID)[number]

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

// ============================================================
// Helpers
// ============================================================
function sanitizeExt(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (fromName && fromName.length <= 5) return fromName
  // fallback dari mime
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/gif') return 'gif'
  return 'jpg'
}

async function uploadImage(file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('Ukuran gambar max 5 MB')
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    throw new Error('Format gambar harus JPG, PNG, WebP, atau GIF')
  }

  const ext = sanitizeExt(file)
  const filename = `pengumuman-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const admin = createAdminClient()
  const { error } = await admin.storage
    .from('pengumuman-images')
    .upload(filename, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: '3600',
    })

  if (error) {
    throw new Error('Upload gambar gagal: ' + error.message)
  }

  const { data: urlData } = admin.storage
    .from('pengumuman-images')
    .getPublicUrl(filename)

  return urlData.publicUrl
}

async function deleteImage(url: string | null | undefined): Promise<void> {
  if (!url) return
  try {
    const marker = '/pengumuman-images/'
    const idx = url.indexOf(marker)
    if (idx === -1) return
    const path = url.slice(idx + marker.length).split('?')[0]
    if (!path) return
    const admin = createAdminClient()
    await admin.storage.from('pengumuman-images').remove([path])
  } catch {
    // best-effort cleanup
  }
}

// ============================================================
// Tambah pengumuman
// ============================================================
export async function tambahPengumuman(
  _prev: PengumumanFormState,
  formData: FormData
): Promise<PengumumanFormState> {
  const judul = String(formData.get('judul') ?? '').trim()
  const konten = String(formData.get('konten') ?? '').trim()
  const priority = String(formData.get('priority') ?? 'NORMAL').toUpperCase() as Priority
  const isPublishedRaw = formData.get('isPublished')
  const isPublished = isPublishedRaw === 'on' || isPublishedRaw === 'true'
  const imageFile = formData.get('gambar') as File | null

  // Validasi
  if (!judul) return { error: 'Judul wajib diisi' }
  if (judul.length > 200) return { error: 'Judul max 200 karakter' }
  if (!konten) return { error: 'Konten wajib diisi' }
  if (konten.length > 5000) return { error: 'Konten max 5000 karakter' }
  if (!PRIORITY_VALID.includes(priority)) return { error: 'Priority tidak valid' }

  let gambar_url: string | null = null
  try {
    gambar_url = await uploadImage(imageFile)
  } catch (e) {
    return { error: (e as Error).message }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('info_pengumuman').insert({
    judul,
    konten,
    priority,
    is_published: isPublished,
    published_at: isPublished ? new Date().toISOString() : null,
    gambar_url,
    target: 'SEMUA',
  })

  if (error) {
    await deleteImage(gambar_url)
    return { error: 'Gagal menambah pengumuman: ' + error.message }
  }

  revalidatePath('/dashboard/pengumuman')
  revalidatePath('/warga/pengumuman')
  revalidatePath('/warga')
  return { success: `Pengumuman "${judul}" berhasil ditambahkan` }
}

// ============================================================
// Edit pengumuman
// ============================================================
export async function editPengumuman(
  _prev: PengumumanFormState,
  formData: FormData
): Promise<PengumumanFormState> {
  const id = String(formData.get('id') ?? '').trim()
  const judul = String(formData.get('judul') ?? '').trim()
  const konten = String(formData.get('konten') ?? '').trim()
  const priority = String(formData.get('priority') ?? 'NORMAL').toUpperCase() as Priority
  const isPublishedRaw = formData.get('isPublished')
  const isPublished = isPublishedRaw === 'on' || isPublishedRaw === 'true'
  const imageFile = formData.get('gambar') as File | null
  const removeImage = formData.get('removeImage') === 'true'

  // Validasi
  if (!id) return { error: 'ID pengumuman tidak valid' }
  if (!judul) return { error: 'Judul wajib diisi' }
  if (judul.length > 200) return { error: 'Judul max 200 karakter' }
  if (!konten) return { error: 'Konten wajib diisi' }
  if (konten.length > 5000) return { error: 'Konten max 5000 karakter' }
  if (!PRIORITY_VALID.includes(priority)) return { error: 'Priority tidak valid' }

  const admin = createAdminClient()

  // Ambil data existing
  const { data: existing } = await admin
    .from('info_pengumuman')
    .select('gambar_url, is_published, published_at')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return { error: 'Pengumuman tidak ditemukan' }

  let gambar_url: string | null | undefined = existing.gambar_url
  let oldImageToDelete: string | null = null

  // Handle image changes
  try {
    // User wants to remove existing image
    if (removeImage && gambar_url) {
      oldImageToDelete = gambar_url
      gambar_url = null
    }
    // User uploaded a new image
    if (imageFile && imageFile.size > 0) {
      const newUrl = await uploadImage(imageFile)
      if (newUrl) {
        if (gambar_url) oldImageToDelete = gambar_url
        gambar_url = newUrl
      }
    }
  } catch (e) {
    return { error: (e as Error).message }
  }

  // Set published_at
  let published_at = existing.published_at
  if (isPublished && !existing.is_published) {
    published_at = new Date().toISOString()
  } else if (!isPublished) {
    published_at = null
  }

  const { error } = await admin
    .from('info_pengumuman')
    .update({
      judul,
      konten,
      priority,
      is_published: isPublished,
      published_at,
      gambar_url,
    })
    .eq('id', id)

  if (error) {
    return { error: 'Gagal memperbarui pengumuman: ' + error.message }
  }

  // Cleanup old image after successful update
  if (oldImageToDelete) {
    await deleteImage(oldImageToDelete)
  }

  revalidatePath('/dashboard/pengumuman')
  revalidatePath('/warga/pengumuman')
  revalidatePath(`/warga/pengumuman/${id}`)
  revalidatePath('/warga')
  return { success: `Pengumuman "${judul}" berhasil diperbarui` }
}

// ============================================================
// Hapus pengumuman
// ============================================================
export async function hapusPengumuman(
  _prev: PengumumanFormState,
  formData: FormData
): Promise<PengumumanFormState> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { error: 'ID tidak valid' }

  const admin = createAdminClient()

  // Ambil data dulu (untuk hapus gambar & dapat judul)
  const { data: existing } = await admin
    .from('info_pengumuman')
    .select('gambar_url, judul')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return { error: 'Pengumuman tidak ditemukan' }

  const { error } = await admin.from('info_pengumuman').delete().eq('id', id)
  if (error) return { error: 'Gagal menghapus pengumuman: ' + error.message }

  // Cleanup image storage (best-effort)
  if (existing.gambar_url) {
    await deleteImage(existing.gambar_url)
  }

  revalidatePath('/dashboard/pengumuman')
  revalidatePath('/warga/pengumuman')
  revalidatePath('/warga')
  return { success: `Pengumuman "${existing.judul}" berhasil dihapus` }
}

// ============================================================
// Toggle publish (draft <-> published)
// ============================================================
export async function togglePublish(
  _prev: PengumumanFormState,
  formData: FormData
): Promise<PengumumanFormState> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { error: 'ID tidak valid' }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('info_pengumuman')
    .select('is_published, judul')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return { error: 'Pengumuman tidak ditemukan' }

  const newState = !existing.is_published
  const { error } = await admin
    .from('info_pengumuman')
    .update({
      is_published: newState,
      published_at: newState ? new Date().toISOString() : null,
    })
    .eq('id', id)

  if (error) return { error: 'Gagal toggle publish: ' + error.message }

  revalidatePath('/dashboard/pengumuman')
  revalidatePath('/warga/pengumuman')
  revalidatePath('/warga')
  return {
    success: `"${existing.judul}" sekarang ${newState ? 'PUBLISHED' : 'DRAFT'}`,
  }
}