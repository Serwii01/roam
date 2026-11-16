import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { api } from '../lib/api'
import { usePhotoLinks } from '../lib/photoLinks'

/**
 * Foto del bucket privado por su ruta. Se repinta cuando se firman enlaces nuevos y, si el enlace falla (caducado)
 * o aún no hay (foto recién subida, caché del móvil sin enlace), pide uno nuevo y lo vuelve a intentar.
 * Mientras no hay enlace no pinta nada: el hueco de detrás hace de fondo.
 */
export function PhotoImg({ path, full = false, ...img }: { path: string; full?: boolean } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  usePhotoLinks()
  const src = full ? api.photoUrl(path) : api.photoThumbUrl(path)
  const [failed, setFailed] = useState<string | null>(null)
  // Las fotos aún sin subir (cola sin conexión) se enseñan desde el móvil y no se firman.
  const local = path.startsWith('local:')

  useEffect(() => {
    if (!src && !local) void api.refreshPhotos([path])
  }, [src, local, path])

  if (!src || src === failed) return null
  return (
    <img
      {...img}
      src={src}
      onError={(e) => {
        setFailed(src)
        if (!local) void api.refreshPhotos([path])
        img.onError?.(e)
      }}
    />
  )
}
