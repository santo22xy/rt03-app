// Generate favicon.ico dari logo-sentra-thumb.png
// Format: ICO file dengan embedded PNG (modern, supported by all browsers)
// https://en.wikipedia.org/wiki/ICO_(file_format)

const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'public', 'logo-sentra-thumb.png')
const OUT_ICO = path.join(__dirname, '..', 'src', 'app', 'favicon.ico')
const OUT_ICON = path.join(__dirname, '..', 'src', 'app', 'icon.png')
const OUT_APPLE = path.join(__dirname, '..', 'src', 'app', 'apple-icon.png')

const png = fs.readFileSync(SRC)

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcInput = Buffer.concat([typeBuf, data])
  // CRC32 (PNG spec)
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    crcTable[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of crcInput) crc = (crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8)) >>> 0
  crc = (crc ^ 0xffffffff) >>> 0
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc, 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function makeIco(pngBuf, size) {
  // IHDR with new dimensions
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  // Parse original IHDR
  const origIhdrData = pngBuf.slice(16, 16 + 13)
  const newIhdr = Buffer.alloc(13)
  newIhdr.writeUInt32BE(size, 0) // width
  newIhdr.writeUInt32BE(size, 4) // height
  newIhdr[8] = origIhdrData[8] // bit depth
  newIhdr[9] = origIhdrData[9] // color type
  newIhdr[10] = origIhdrData[10] // compression
  newIhdr[11] = origIhdrData[11] // filter
  newIhdr[12] = origIhdrData[12] // interlace

  // Extract IDAT chunks from original
  const idatChunks = []
  let pos = 8
  while (pos < pngBuf.length) {
    const len = pngBuf.readUInt32BE(pos)
    const type = pngBuf.slice(pos + 4, pos + 8).toString('ascii')
    if (type === 'IDAT') idatChunks.push(pngBuf.slice(pos + 8, pos + 8 + len))
    if (type === 'IEND') break
    pos += 12 + len
  }
  const idatData = Buffer.concat(idatChunks)

  // Reassemble PNG
  const ihdrChunk = pngChunk('IHDR', newIhdr)
  const idatChunk = pngChunk('IDAT', idatData)
  const iendChunk = pngChunk('IEND', Buffer.alloc(0))
  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk])
}

const png16 = makeIco(png, 16)
const png32 = makeIco(png, 32)
const png48 = makeIco(png, 48)

// ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes per image) + image data
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type 1 = ICO
header.writeUInt16LE(3, 4) // image count

const entrySize = 16
let offset = 6 + entrySize * 3

function makeEntry(png, size) {
  const e = Buffer.alloc(entrySize)
  e[0] = size === 256 ? 0 : size // width (0 = 256)
  e[1] = size === 256 ? 0 : size // height
  e[2] = 0 // colors in palette
  e[3] = 0 // reserved
  e.writeUInt16LE(1, 4) // color planes
  e.writeUInt16LE(32, 6) // bits per pixel
  e.writeUInt32LE(png.length, 8) // size of image data
  e.writeUInt32LE(offset, 12) // offset
  offset += png.length
  return e
}

const ico = Buffer.concat([
  header,
  makeEntry(png16, 16),
  makeEntry(png32, 32),
  makeEntry(png48, 48),
  png16,
  png32,
  png48,
])

fs.writeFileSync(OUT_ICO, ico)
fs.copyFileSync(SRC, OUT_ICON)
fs.copyFileSync(SRC, OUT_APPLE)

console.log('Generated:')
console.log(' -', OUT_ICO, '(', ico.length, 'bytes, 16/32/48px)')
console.log(' -', OUT_ICON, '(', png.length, 'bytes)')
console.log(' -', OUT_APPLE, '(', png.length, 'bytes)')
