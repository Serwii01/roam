import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

/** Pinta cada página en un canvas: un PDF guardado en el móvil no se puede abrir de otra forma en Chrome para Android. */
function PdfPages({ blob, onError }: { blob: Blob; onError: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    let destroy: (() => void) | undefined
    void (async () => {
      try {
        const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
        destroy = () => void task.destroy()
        const pdf = await task.promise
        const width = box.current?.clientWidth || window.innerWidth
        for (let n = 1; n <= pdf.numPages && !cancelled; n++) {
          const page = await pdf.getPage(n)
          const base = page.getViewport({ scale: 1 })
          // Doble de resolución para que un código QR o de barras se pueda escanear.
          const viewport = page.getViewport({ scale: (width / base.width) * Math.max(window.devicePixelRatio || 1, 2) })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.className = 'mb-3 h-auto w-full bg-white'
          await page.render({ canvas, viewport }).promise
          if (!cancelled) box.current?.append(canvas)
        }
      } catch {
        if (!cancelled) onError()
      }
    })()
    const el = box.current
    return () => {
      cancelled = true
      destroy?.()
      el?.replaceChildren()
    }
  }, [blob, onError])
  return <div ref={box} className="mx-auto w-full max-w-3xl" />
}

/** Visor a pantalla completa de un documento o un ticket: funciona con el archivo en el móvil, sin red. */
export function DocViewer({ blob, name, onClose }: { blob: Blob; name: string; onClose: () => void }) {
  const [failed, setFailed] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const fail = useCallback(() => setFailed(true), [])
  const pdf = blob.type === 'application/pdf' || /\.pdf$/i.test(name)
  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  const file = new File([blob], name, { type: blob.type })
  const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={name} className="fixed inset-0 z-[60] flex flex-col bg-[#0c0c0d] text-white">
      <header className="flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
        {canShare && (
          <button type="button" aria-label="Compartir" className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10" onClick={() => void navigator.share({ files: [file] }).catch(() => {})}>
            <Icon name="ios_share" size={20} />
          </button>
        )}
        <button type="button" aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10" onClick={onClose}>
          <Icon name="close" size={22} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {failed ? (
          <p className="p-6 text-center text-white/80">No se ha podido mostrar este archivo.{canShare ? ' Prueba a abrirlo con otra app desde «Compartir».' : ''}</p>
        ) : pdf ? (
          <PdfPages blob={blob} onError={fail} />
        ) : (
          url && <img src={url} alt={name} className="mx-auto h-auto max-w-full bg-white" onError={fail} />
        )}
      </div>
    </div>,
    document.body,
  )
}
