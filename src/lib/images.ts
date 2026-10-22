// Preparación de fotos antes de subirlas: admite HEIC/HEIF (iPhone), reduce el tamaño y vuelve a
// codificar en JPEG. Al recodificar se eliminan los metadatos EXIF, que en las fotos de móvil
// incluyen las coordenadas GPS exactas de dónde se tomaron.

/** Para el atributo `accept` de los <input type="file">: en Windows los .heic no traen tipo MIME. */
export const IMAGE_ACCEPT = 'image/*,.heic,.heif'

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i
const HEIC_EXT = /\.(heic|heif)$/i
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])

export const looksLikeImage = (f: File) => f.type.startsWith('image/') || IMAGE_EXT.test(f.name)

/** HEIC por tipo, extensión o firma del archivo (`ftypheic`…), por si llega sin tipo ni extensión. */
async function isHeicFile(f: File): Promise<boolean> {
  if (/image\/hei[cf]/.test(f.type) || HEIC_EXT.test(f.name)) return true
  if (f.type && f.type !== 'application/octet-stream') return false
  const head = new Uint8Array(await f.slice(0, 12).arrayBuffer())
  const ascii = String.fromCharCode(...head)
  return ascii.slice(4, 8) === 'ftyp' && HEIC_BRANDS.has(ascii.slice(8, 12))
}

async function decode(file: File): Promise<ImageBitmap> {
  if (await isHeicFile(file)) {
    // Safari (17+) lee HEIC por sí mismo; en el resto se carga el conversor (≈760 KB) solo ahora.
    try {
      return await createImageBitmap(file)
    } catch {
      const { heicTo } = await import('heic-to')
      return heicTo({ blob: file, type: 'bitmap' })
    }
  }
  return createImageBitmap(file)
}

/** Lado mayor de las fotos subidas: de sobra para verlas a pantalla completa en un móvil o un portátil. */
export const PHOTO_MAX = 1600
/** Miniaturas de las cuadrículas y portadas de tarjeta. */
export const THUMB_MAX = 640

/** Calidades JPEG que se prueban, de mejor a peor, hasta que la foto cabe en su presupuesto de tamaño. */
const QUALITIES = [0.8, 0.72, 0.64, 0.56]
/** Tamaño objetivo: ~350 KB una foto y ~60 KB una miniatura (una foto de móvil sin tocar pesa 3-10 MB). */
const budgetFor = (max: number) => (max > THUMB_MAX ? 350_000 : 60_000)

/**
 * Devuelve la foto lista para subir: JPEG de como mucho `max` px de lado, sin metadatos y, si se pasa del
 * presupuesto de tamaño, con algo menos de calidad (casi nunca hace falta bajar de 0,72).
 * Lanza un error con el nombre del archivo si no se puede leer.
 */
export async function prepareImage(file: File, max = PHOTO_MAX): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await decode(file)
  } catch {
    throw new Error(`No se ha podido leer «${file.name}». Prueba con una foto JPG, PNG o HEIC.`)
  }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  // JPEG no tiene transparencia: un PNG con fondo transparente saldría negro.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const budget = budgetFor(max)
  let blob: Blob | null = null
  for (const q of QUALITIES) {
    blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q))
    if (!blob || blob.size <= budget) break
  }
  if (!blob) throw new Error(`No se ha podido procesar «${file.name}».`)
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
}
