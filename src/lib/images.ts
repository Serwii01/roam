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

/**
 * Devuelve la foto lista para subir: JPEG de como mucho `max` px de lado y sin metadatos.
 * Lanza un error con el nombre del archivo si no se puede leer.
 */
export async function prepareImage(file: File, max = 2000): Promise<File> {
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
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
  if (!blob) throw new Error(`No se ha podido procesar «${file.name}».`)
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
}
