import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { ErrorNote } from './ui'
import { FORMATS, canUsePhoto, canvasToBlob, renderCard, type CardData, type CardFormat, type CardLayout, type CardTheme } from '../lib/shareCard'

const THEMES: { id: CardTheme; label: string; icon: string }[] = [
  { id: 'dark', label: 'Noche', icon: 'dark_mode' },
  { id: 'light', label: 'Día', icon: 'light_mode' },
  { id: 'photo', label: 'Foto', icon: 'image' },
  { id: 'clear', label: 'Sticker', icon: 'layers' },
]

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'roam'

/** Ventana para crear y compartir una imagen del viaje o del mapa, al estilo Strava. */
export function ShareSheet({ data, photos = [], onClose }: { data: Omit<CardData, 'photo'>; photos?: string[]; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [format, setFormat] = useState<CardFormat>('story')
  const [theme, setTheme] = useState<CardTheme>('dark')
  const [layout, setLayout] = useState<CardLayout>('map')
  const [usable, setUsable] = useState<string[]>([])
  const [photo, setPhoto] = useState<string | undefined>()
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<string | null>(null)

  // Solo se ofrecen las fotos que el navegador deja usar en el canvas.
  const photoKey = photos.join('|')
  useEffect(() => {
    let alive = true
    Promise.all(photos.slice(0, 12).map(async (p) => ((await canUsePhoto(p)) ? p : null))).then((ok) => {
      if (!alive) return
      const list = ok.filter((p): p is string => !!p)
      setUsable(list)
      setPhoto((cur) => cur ?? list[0])
    })
    return () => {
      alive = false
    }
  }, [photoKey])

  useEffect(() => {
    let alive = true
    setBusy(true)
    renderCard(canvas.current!, { ...data, photo }, format, theme, layout)
      .then(() => alive && setError(null))
      .catch((e) => alive && setError(e))
      .finally(() => alive && setBusy(false))
    return () => {
      alive = false
    }
  }, [data, photo, format, theme, layout])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const fileName = `roam-${slug(data.title)}-${layout === 'list' ? 'cifras-' : ''}${format}.png`

  async function file() {
    return new File([await canvasToBlob(canvas.current!)], fileName, { type: 'image/png' })
  }

  async function download() {
    try {
      const url = URL.createObjectURL(await file())
      const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      setDone('Imagen descargada')
    } catch (e) {
      setError(e)
    }
  }

  const canShareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })
  async function share() {
    try {
      const f = await file()
      await navigator.share({ files: [f], title: data.title })
      setDone('¡Compartido!')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e)
    }
  }

  const themes = THEMES.filter((t) => t.id !== 'photo' || usable.length > 0)

  return (
    <div role="dialog" aria-modal="true" aria-label="Compartir imagen" className="fixed inset-0 z-[60] overflow-y-auto bg-black/70 p-0 backdrop-blur-sm md:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mx-auto flex min-h-full max-w-5xl flex-col bg-surface md:min-h-0 md:rounded-md md:shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-surface-highest px-5 py-4">
          <div>
            <div className="label-code text-accent-deep">Compartir</div>
            <h2 className="headline-sm">Crea tu imagen</h2>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-container" aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </div>

        <div className="grid flex-1 gap-6 p-5 md:grid-cols-[minmax(0,1fr)_300px]">
          <div
            className={`relative grid min-h-0 place-items-center rounded-sm p-4 ${theme === 'clear' ? 'bg-[conic-gradient(#ddd_25%,#f5f5f5_0_50%,#ddd_0_75%,#f5f5f5_0)] bg-[length:24px_24px]' : 'bg-surface-container'}`}
          >
            <canvas
              ref={canvas}
              aria-label="Vista previa de la imagen"
              className="block h-auto max-h-[62vh] w-auto max-w-full rounded-sm shadow-lg"
              style={{ aspectRatio: `${FORMATS[format].w} / ${FORMATS[format].h}` }}
            />
            {busy && (
              <span className="label-code absolute right-6 top-6 rounded-sm bg-ink/80 px-2 py-1 text-white">Dibujando…</span>
            )}
          </div>

          <div className="space-y-6">
            <fieldset>
              <legend className="label-code mb-2 text-ink-soft">Formato</legend>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(FORMATS) as CardFormat[]).map((f) => (
                  <button
                    key={f}
                    aria-pressed={format === f}
                    onClick={() => setFormat(f)}
                    className={`rounded-sm border px-2 py-2.5 text-center transition ${format === f ? 'border-ink bg-ink text-white' : 'border-surface-highest hover:border-ink'}`}
                  >
                    <span className="block font-display font-semibold">{FORMATS[f].label}</span>
                    <span className="label-code opacity-70">{FORMATS[f].hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {!!data.highlights?.length && (
              <fieldset>
                <legend className="label-code mb-2 text-ink-soft">Diseño</legend>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'map' as const, label: 'Mapa', icon: 'map' },
                    { id: 'list' as const, label: 'Cifras', icon: 'format_list_numbered' },
                  ].map((l) => (
                    <button
                      key={l.id}
                      aria-pressed={layout === l.id}
                      onClick={() => setLayout(l.id)}
                      className={`flex items-center gap-2 rounded-sm border px-3 py-2.5 transition ${layout === l.id ? 'border-ink bg-ink text-white' : 'border-surface-highest hover:border-ink'}`}
                    >
                      <Icon name={l.icon} size={18} /> <span className="font-display font-semibold">{l.label}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <fieldset>
              <legend className="label-code mb-2 text-ink-soft">Estilo</legend>
              <div className="grid grid-cols-2 gap-2">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    aria-pressed={theme === t.id}
                    onClick={() => setTheme(t.id)}
                    className={`flex items-center gap-2 rounded-sm border px-3 py-2.5 transition ${theme === t.id ? 'border-accent bg-accent-soft/50 text-accent-ink' : 'border-surface-highest hover:border-ink'}`}
                  >
                    <Icon name={t.icon} size={18} /> <span className="font-display font-semibold">{t.label}</span>
                  </button>
                ))}
              </div>
              {theme === 'clear' && <p className="mt-2 text-sm text-ink-soft">Fondo transparente: pégala como sticker encima de tu foto en la story.</p>}
            </fieldset>

            {theme === 'photo' && usable.length > 1 && (
              <fieldset>
                <legend className="label-code mb-2 text-ink-soft">Foto de fondo</legend>
                <div className="grid grid-cols-4 gap-2">
                  {usable.map((p, i) => (
                    <button
                      key={p}
                      aria-label={`Usar la foto ${i + 1}`}
                      aria-pressed={photo === p}
                      onClick={() => setPhoto(p)}
                      className={`aspect-square overflow-hidden rounded-sm ${photo === p ? 'ring-2 ring-accent ring-offset-2' : 'opacity-70 hover:opacity-100'}`}
                    >
                      <img src={p} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <ErrorNote error={error} />
            <div className="space-y-2">
              {canShareFiles && (
                <button className="btn btn-accent w-full" disabled={busy} onClick={share}>
                  <Icon name="ios_share" size={18} /> Compartir
                </button>
              )}
              <button className={`btn w-full ${canShareFiles ? 'btn-ghost' : 'btn-accent'}`} disabled={busy} onClick={download}>
                <Icon name="download" size={18} /> Descargar PNG
              </button>
              {done && <p className="label-code text-center text-accent-deep">{done}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
