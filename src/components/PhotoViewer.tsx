import { useEffect, useRef } from 'react'
import { Icon } from './Icon'

export interface ViewerPhoto {
  id: string
  url: string
  caption?: string
}

/**
 * Visor a pantalla completa: flechas (también del teclado), deslizar en el móvil, miniaturas y Esc para cerrar.
 * Al llegar al final vuelve a la primera.
 */
export function PhotoViewer({ photos, index, onIndex, onClose }: { photos: ViewerPhoto[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const n = photos.length
  const go = (d: number) => onIndex((index + d + n) % n)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const strip = useRef<HTMLDivElement>(null)
  const photo = photos[index]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') onIndex((index + 1) % n)
      else if (e.key === 'ArrowLeft') onIndex((index - 1 + n) % n)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, n, onIndex, onClose])

  // Sin scroll de la página detrás del visor.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Miniatura activa siempre a la vista; las fotos vecinas se cargan antes de pasar.
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    for (const d of [1, -1]) new Image().src = photos[(index + d + n) % n].url
  }, [index, n, photos])

  if (!photo) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visor de fotos"
      className="fixed inset-0 z-[60] flex flex-col bg-[#0c0c0d] text-white"
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const start = touch.current
        touch.current = null
        if (!start || n < 2) return
        const dx = e.changedTouches[0].clientX - start.x
        const dy = e.changedTouches[0].clientY - start.y
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1)
        else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) onClose()
      }}
    >
      <div className="flex items-center gap-4 px-4 py-3 md:px-6">
        <span className="label-code shrink-0 text-white/70">
          {index + 1} / {n}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-white/90">{photo.caption}</span>
        <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/10" aria-label="Cerrar visor" autoFocus>
          <Icon name="close" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 md:px-20" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <img key={photo.id} src={photo.url} alt={photo.caption ?? ''} className="max-h-full max-w-full select-none object-contain" draggable={false} />
        {n > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/40 hover:bg-white/15 md:left-5"
              aria-label="Foto anterior"
            >
              <Icon name="chevron_left" size={32} />
            </button>
            <button
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/40 hover:bg-white/15 md:right-5"
              aria-label="Foto siguiente"
            >
              <Icon name="chevron_right" size={32} />
            </button>
          </>
        )}
      </div>

      {n > 1 && (
        <div ref={strip} className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:thin] md:justify-center md:px-6">
          {photos.map((p, i) => (
            <button
              key={p.id}
              data-i={i}
              onClick={() => onIndex(i)}
              aria-label={`Foto ${i + 1}`}
              aria-current={i === index}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded-sm transition ${i === index ? 'opacity-100 ring-2 ring-accent' : 'opacity-50 hover:opacity-90'}`}
            >
              <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
