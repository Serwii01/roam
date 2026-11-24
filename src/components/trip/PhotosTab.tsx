import { useMemo, useState } from 'react'
import { Icon } from '../Icon'
import type { ViewerPhoto } from '../PhotoViewer'
import { Empty, ErrorNote, plural } from '../ui'
import { api } from '../../lib/api'
import type { TripWithStops } from '../../lib/db'
import { IMAGE_ACCEPT, looksLikeImage } from '../../lib/images'
import { useTravelMutation } from '../../lib/hooks'

export function PhotosTab({
  trip: t,
  gallery,
  participant,
  onOpen,
}: {
  trip: TripWithStops
  gallery: (ViewerPhoto & { thumb: string; stopId: string | null; stopName?: string })[]
  participant: boolean
  onOpen: (i: number) => void
}) {
  const [stopId, setStopId] = useState<string>('')
  const [progress, setProgress] = useState<string | null>(null)
  const upload = useTravelMutation(async (files: File[]) => {
    const images = files.filter(looksLikeImage).slice(0, 10)
    const failed: string[] = []
    for (const [i, f] of images.entries()) {
      setProgress(`Subiendo ${i + 1} de ${images.length}`)
      try {
        await api.uploadPhoto(t.id, f, stopId || null)
      } catch (e) {
        failed.push(e instanceof Error ? e.message : f.name)
      }
    }
    setProgress(null)
    const problems = [...(files.length > images.length ? ['Solo se suben 10 imágenes cada vez.'] : []), ...failed]
    if (problems.length) throw new Error(problems.join(' '))
  })
  // Por parada, en el orden de la ruta; las sueltas al final.
  const groups = useMemo(() => {
    const g: { key: string; title: string; items: { i: number; url: string; id: string }[] }[] = []
    gallery.forEach((p, i) => {
      const key = p.stopId ?? ''
      let grp = g.find((x) => x.key === key)
      if (!grp) g.push((grp = { key, title: p.stopName ?? 'Sin parada', items: [] }))
      grp.items.push({ i, url: p.thumb, id: p.id })
    })
    return g
  }, [gallery])

  return (
    <div>
      {participant && (
        <div className="card mb-6 flex flex-wrap items-center gap-3 p-4">
          <Icon name="add_photo_alternate" className="text-accent" />
          <span className="flex-1 text-sm">
            <b className="font-display">Añadir fotos</b>
            <span className="block text-ink-soft">Hasta 10 cada vez. Las HEIC del iPhone se convierten solas.</span>
          </span>
          {t.stops.length > 0 && (
            <select aria-label="Parada de las fotos" className="h-10 rounded-full bg-surface-low px-3 text-sm ring-1 ring-outline-soft" value={stopId} onChange={(e) => setStopId(e.target.value)}>
              <option value="">Sin parada</option>
              {t.stops.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {i + 1}. {s.name}
                </option>
              ))}
            </select>
          )}
          <label className={`btn cursor-pointer ${upload.isPending ? 'btn-ghost' : 'btn-accent'}`}>
            <Icon name={upload.isPending ? 'sync' : 'upload'} size={18} className={upload.isPending ? 'animate-spin' : ''} /> {progress ?? 'Elegir fotos'}
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              hidden
              disabled={upload.isPending}
              onChange={(e) => {
                if (e.target.files?.length) upload.mutate([...e.target.files])
                e.target.value = ''
              }}
            />
          </label>
          <div className="w-full">
            <ErrorNote error={upload.error} />
          </div>
        </div>
      )}
      {!gallery.length ? (
        <Empty icon="photo_library" title="Aún no hay fotos">
          {participant && <p className="mt-1 text-ink-soft">Súbelas arriba o crea el viaje desde tus fotos para que se coloquen solas.</p>}
        </Empty>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <h3 className="label-stamp mb-2 flex items-center justify-between text-ink-soft">
                <span>{g.title}</span>
                <span>{plural(g.items.length, 'foto', 'fotos')}</span>
              </h3>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {g.items.map((p) => (
                  <button key={p.id} onClick={() => onOpen(p.i)} aria-label={`Ver foto ${p.i + 1} (${g.title})`} className="group relative aspect-square overflow-hidden rounded-sm bg-surface-container">
                    <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
