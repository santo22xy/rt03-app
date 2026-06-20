// Download logo dari imgbb, simpan ke public/
// Usage: node scripts/fetch-logo.mjs
import { writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')

mkdirSync(PUBLIC_DIR, { recursive: true })

const SOURCES = [
  { name: 'logo-sentra-thumb.png', url: 'https://i.ibb.co.com/BHTsWSRf/de8eab2b-b97b-4c00-b974-03ada7d49d64.png' },
  { name: 'logo-sentra-orig.png',  url: 'https://i.ibb.co.com/xKz59RQ2/de8eab2b-b97b-4c00-b974-03ada7d49d64.png' },
]

async function fetchOne({ name, url }) {
  const out = join(PUBLIC_DIR, name)
  console.log(`-> ${name}`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(out, buf)
  const size = statSync(out).size
  console.log(`   ${name}: ${(size / 1024).toFixed(1)} KB`)
  return { name, size }
}

const results = await Promise.all(SOURCES.map(fetchOne))
const totalKb = (results.reduce((s, r) => s + r.size, 0) / 1024).toFixed(1)
console.log(`\nSelesai. Total: ${totalKb} KB tersimpan di public/`)
