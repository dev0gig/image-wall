// Erzeugt das Favicon von Image Wall im einheitlichen Icon-Stil:
// dunkler 135°-Verlauf, abgerundete Ecken, Lucide-Symbol "images" in Weiss
// mit weichem Schatten (kein harter Versatz, kein langer Diagonalschatten).
//
// Ergebnis: public/favicon.svg, public/favicon.ico, public/apple-touch-icon.png
//
// Braucht sharp – ist absichtlich KEINE Abhaengigkeit des Projekts, damit der
// Build schlank bleibt. Zum Neuerzeugen einmalig:
//   npm i --no-save sharp && node scripts/gen-icons.mjs
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = process.argv[2] || resolve(here, '../public')

const S = 1024                       // Arbeitsgroesse
const RAD = Math.round(S * 93 / 512) // Eckenradius wie bei den anderen Icons

// Dunkler, edler Verlauf (oben links -> unten rechts)
const G_FROM = '#3A4152'
const G_TO = '#0A0B0E'
// Schatten in einer dunklen Toenung des Hintergrunds, nie schwarz
const SHADOW = { r: 0x05, g: 0x07, b: 0x0d }

// Symbolgroesse = Anteil der bemalten Flaeche am Canvas.
// Tab-Icon groesser, damit es bei 16 px noch lesbar ist; das Homescreen-Icon
// folgt dem Standardmass 41,7 % der anderen Apps.
const COVERAGE_FAVICON = 0.62
const COVERAGE_HOMESCREEN = 0.417

// Lucide "images" (v1.28.0), unveraendert uebernommen
const ICON_NODES = [
  ['path', { d: 'm22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16' }],
  ['path', { d: 'M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2' }],
  ['circle', { cx: '13', cy: '7', r: '1', fill: 'currentColor' }],
  ['rect', { x: '8', y: '2', width: '14', height: '14', rx: '2' }],
]

const iconBody = (color) => ICON_NODES
  .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs)
    .map(([k, v]) => `${k}="${v === 'currentColor' ? color : v}"`).join(' ')} />`)
  .join('')

const symbolGroup = (scale, tx, ty, color = '#fff') =>
  `<g transform="translate(${tx},${ty}) scale(${scale})" fill="none" stroke="${color}" ` +
  `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconBody(color)}</g>`

const symbolSvg = (scale, tx, ty) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${symbolGroup(scale, tx, ty)}</svg>`)

async function alphaOf(buffer) {
  const { data } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const a = new Uint8Array(S * S)
  for (let p = 0; p < S * S; p++) a[p] = data[p * 4 + 3]
  return a
}

// Bounding-Box der soliden Symbolpixel – nachmessen statt schaetzen
function boundsOf(alpha) {
  let x0 = S, y0 = S, x1 = -1, y1 = -1
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (alpha[y * S + x] > 200) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

// Symbol so skalieren und schieben, dass die bemalte Flaeche exakt der
// Zielgroesse entspricht und mittig sitzt (zwei Messdurchgaenge reichen).
async function fitSymbol(coverage) {
  const target = coverage * S
  let scale = target / 22
  let tx = 0, ty = 0, box
  for (let i = 0; i < 3; i++) {
    box = boundsOf(await alphaOf(symbolSvg(scale, tx, ty)))
    const longest = Math.max(box.w, box.h)
    scale *= target / longest
    box = boundsOf(await alphaOf(symbolSvg(scale, tx, ty)))
    tx += (S - box.w) / 2 - box.x0
    ty += (S - box.h) / 2 - box.y0
  }
  return { scale, tx, ty, box: boundsOf(await alphaOf(symbolSvg(scale, tx, ty))) }
}

const bgSvg = () => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${G_FROM}"/>
      <stop offset="1" stop-color="${G_TO}"/>
    </linearGradient>
    <radialGradient id="h" cx="0.22" cy="0.18" r="0.75">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${S}" height="${S}" rx="${RAD}" ry="${RAD}" fill="url(#g)"/>
  <rect width="${S}" height="${S}" rx="${RAD}" ry="${RAD}" fill="url(#h)"/>
</svg>`)

async function tinted(alpha, opacity) {
  const raw = Buffer.alloc(S * S * 4, 0)
  for (let p = 0; p < S * S; p++) {
    const a = Math.round(alpha[p] * opacity)
    if (a > 0) {
      raw[p * 4] = SHADOW.r; raw[p * 4 + 1] = SHADOW.g; raw[p * 4 + 2] = SHADOW.b; raw[p * 4 + 3] = a
    }
  }
  return sharp(raw, { raw: { width: S, height: S, channels: 4 } }).png().toBuffer()
}

async function shadowLayer(alpha, opacity, sigma, dx, dy) {
  const blurred = await sharp(await tinted(alpha, opacity)).blur(sigma).png().toBuffer()
  return sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: blurred, left: Math.round(dx), top: Math.round(dy) }])
    .png().toBuffer()
}

async function render(coverage) {
  const fit = await fitSymbol(coverage)
  const svg = symbolSvg(fit.scale, fit.tx, fit.ty)
  const alpha = await alphaOf(svg)
  const symbol = await sharp(svg).png().toBuffer()

  // Weicher Ambient- + Kontaktschatten (Werte fuer 1024 px)
  const ambient = await shadowLayer(alpha, 0.34, 16, 5, 12)
  const contact = await shadowLayer(alpha, 0.30, 4, 0, 4)

  const png = await sharp(await sharp(bgSvg()).png().toBuffer())
    .composite([{ input: ambient }, { input: contact }, { input: symbol }])
    .png().toBuffer()

  return { png, fit }
}

// ICO mit eingebetteten PNGs (16/32/48) – von allen aktuellen Browsern gelesen
function ico(images) {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4)
  let offset = 6 + images.length * 16
  const dir = []
  for (const { size, data } of images) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12)
    dir.push(e)
    offset += data.length
  }
  return Buffer.concat([head, ...dir, ...images.map((i) => i.data)])
}

const svgFile = (fit) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${G_FROM}"/>
      <stop offset="1" stop-color="${G_TO}"/>
    </linearGradient>
    <radialGradient id="h" cx="0.22" cy="0.18" r="0.75">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="s" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="5" dy="12" stdDeviation="16" flood-color="rgb(${SHADOW.r},${SHADOW.g},${SHADOW.b})" flood-opacity="0.34"/>
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="rgb(${SHADOW.r},${SHADOW.g},${SHADOW.b})" flood-opacity="0.30"/>
    </filter>
  </defs>
  <rect width="${S}" height="${S}" rx="${RAD}" ry="${RAD}" fill="url(#g)"/>
  <rect width="${S}" height="${S}" rx="${RAD}" ry="${RAD}" fill="url(#h)"/>
  <g filter="url(#s)">${symbolGroup(fit.scale, fit.tx, fit.ty)}</g>
</svg>
`

const tab = await render(COVERAGE_FAVICON)
const home = await render(COVERAGE_HOMESCREEN)

const sizes = [16, 32, 48]
const scaled = []
for (const size of sizes) {
  scaled.push({ size, data: await sharp(tab.png).resize(size, size).png({ compressionLevel: 9 }).toBuffer() })
}

await writeFile(resolve(outDir, 'favicon.ico'), ico(scaled))
await writeFile(resolve(outDir, 'favicon.svg'), svgFile(tab.fit))
await writeFile(resolve(outDir, 'apple-touch-icon.png'),
  await sharp(home.png).resize(180, 180).png({ compressionLevel: 9 }).toBuffer())

const pct = (b) => (Math.max(b.w, b.h) / S * 100).toFixed(1) + ' %'
console.log(`favicon.ico   ${sizes.join('/')} px, Symbol ${pct(tab.fit.box)} der Flaeche`)
console.log(`favicon.svg   skalierbar,        Symbol ${pct(tab.fit.box)} der Flaeche`)
console.log(`apple-touch-icon.png 180 px,     Symbol ${pct(home.fit.box)} der Flaeche`)
