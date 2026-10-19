import { useMemo, useState } from 'react'
import { ask } from '../components/ConfirmDialog'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDay } from '../components/DatePicker'
import { Icon } from '../components/Icon'
import { useWeather } from '../components/Weather'
import { ErrorNote, Flag } from '../components/ui'
import { api } from '../lib/api'
import type { DocumentKind, PackingCategory, Stop, TripDocument, TripWithStops } from '../lib/db'
import { PACKING_CATEGORIES, PACKING_ORDER, PACKING_TEMPLATES, packingSuggestions } from '../lib/packing'
import { KIND_LABEL, weatherFor } from '../lib/weather'

// Pestañas del viaje que antes vivían en el planificador (/app/viajes/:id/plan): tiempo, equipaje y
// documentos. Ahora están en la página del viaje; la dirección antigua lleva a la pestaña equivalente.
const OLD_TABS: Record<string, string> = { itinerario: 'dias', tiempo: 'resumen', equipaje: 'equipaje', documentos: 'documentos' }

export function PlannerPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const tab = OLD_TABS[params.get('tab') ?? 'itinerario'] ?? 'dias'
  return <Navigate to={`/app/viajes/${id}${tab === 'resumen' ? '' : `?tab=${tab}`}`} replace />
}

// ───────────────────────────── Tiempo ─────────────────────────────

export function WeatherTab({ trip: t }: { trip: TripWithStops }) {
  const stops = t.stops.map((s) => ({ s, date: s.arrived_on ?? t.start_date }))
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stops.map(({ s, date }, i) => (
          <WeatherCard key={s.id} stop={s} date={date} n={i + 1} />
        ))}
      </div>
      <p className="mt-4 text-xs text-ink-soft">
        Datos del tiempo de{' '}
        <a href="https://open-meteo.com" target="_blank" rel="noreferrer" className="underline">
          Open-Meteo
        </a>{' '}
        (CC BY 4.0). Más allá de 15 días se muestra el clima habitual de esas fechas (media de los 3 años anteriores).
      </p>
    </div>
  )
}

function WeatherCard({ stop, date, n }: { stop: Stop; date: string | null; n: number }) {
  const w = useWeather(stop.lat, stop.lon, date)
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-xs text-white">{n}</span>
        <span className="min-w-0 flex-1 truncate font-display font-semibold">{stop.name}</span>
        <Flag code={stop.country_code} />
      </div>
      <div className="mt-1 text-sm text-ink-soft">{date ? formatDay(date) : 'Sin fecha'}</div>
      {!date ? (
        <p className="mt-3 text-sm text-ink-soft">Pon la fecha de llegada para ver el tiempo.</p>
      ) : w.isError ? (
        <p className="mt-3 text-sm text-ink-soft">No se pudo consultar el tiempo.</p>
      ) : !w.data ? (
        <div className="mt-3 h-16 animate-pulse rounded-sm bg-surface-container" />
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <Icon name={w.data.icon} size={40} className="text-accent" />
          <div>
            <div className="font-display text-2xl font-bold">
              {Math.round(w.data.tmax)}° <span className="text-base font-normal text-ink-soft">/ {Math.round(w.data.tmin)}°</span>
            </div>
            <div className="text-sm">
              {w.data.label} · {w.data.rain}
            </div>
            <div className="label-stamp mt-0.5 text-ink-soft">{KIND_LABEL[w.data.kind]}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────────── Equipaje ─────────────────────────────

export function PackingTab({ trip: t, home }: { trip: TripWithStops; home: string }) {
  const qc = useQueryClient()
  const items = useQuery({ queryKey: ['packing', t.id], queryFn: () => api.listPacking(t.id) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['packing', t.id] })
  const addMany = useMutation({ mutationFn: (x: Parameters<typeof api.addPackingItems>[1]) => api.addPackingItems(t.id, x), onSuccess: refresh })
  const update = useMutation({ mutationFn: ({ id, packed }: { id: string; packed: boolean }) => api.updatePackingItem(id, { packed }), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: string) => api.deletePackingItem(id), onSuccess: refresh })
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState<PackingCategory>('other')
  const countries = [...new Set(t.stops.map((s) => s.country_code))]
  const weather = useQueries({
    queries: t.stops
      .map((s) => ({ s, date: s.arrived_on ?? t.start_date }))
      .filter((x) => x.date)
      .map(({ s, date }) => ({ queryKey: ['weather', s.lat.toFixed(2), s.lon.toFixed(2), date], queryFn: () => weatherFor(s.lat, s.lon, date!), staleTime: 3 * 3_600_000 })),
  })
  const list = useMemo(() => items.data ?? [], [items.data])
  const have = new Set(list.map((x) => x.label.toLowerCase()))
  const suggestions = packingSuggestions({ countries, home, weather: weather.map((w) => w.data).filter((w): w is NonNullable<typeof w> => !!w) }).filter((x) => !have.has(x.label.toLowerCase()))
  const packed = list.filter((x) => x.packed).length

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <ErrorNote error={items.error ?? addMany.error ?? update.error ?? remove.error} />
        {list.length > 0 && (
          <div className="card p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-display font-semibold">
                {packed} de {list.length} en la maleta
              </span>
              {packed > 0 && (
                <button type="button" className="text-ink-soft hover:text-ink" onClick={() => list.filter((x) => x.packed).forEach((x) => update.mutate({ id: x.id, packed: false }))}>
                  Desmarcar todo
                </button>
              )}
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-container">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(packed / list.length) * 100}%` }} />
            </div>
          </div>
        )}
        {!list.length && !items.isLoading && (
          <div className="card p-6 text-center text-ink-soft">
            <Icon name="luggage" size={36} className="text-accent" />
            <p className="mt-2">Empieza con una plantilla o con las sugerencias para este viaje.</p>
          </div>
        )}
        {PACKING_ORDER.map((c) => {
          const group = list.filter((x) => x.category === c)
          if (!group.length) return null
          return (
            <section key={c} className="card p-4">
              <h3 className="mb-2 flex items-center gap-2 font-display font-semibold">
                <Icon name={PACKING_CATEGORIES[c].icon} size={18} className="text-accent" /> {PACKING_CATEGORIES[c].label}
                <span className="label-stamp ml-auto text-ink-soft">
                  {group.filter((x) => x.packed).length}/{group.length}
                </span>
              </h3>
              <ul className="space-y-1">
                {group.map((x) => (
                  <li key={x.id} className="flex items-center gap-2 rounded-sm px-1 py-1 hover:bg-surface-low">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={x.packed}
                      onClick={() => update.mutate({ id: x.id, packed: !x.packed })}
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-sm border-2 transition ${x.packed ? 'border-accent bg-accent text-white' : 'border-outline hover:border-ink'}`}
                      aria-label={x.packed ? `Sacar ${x.label}` : `Meter ${x.label} en la maleta`}
                    >
                      {x.packed && <Icon name="check" size={16} />}
                    </button>
                    <span className={`min-w-0 flex-1 ${x.packed ? 'text-ink-soft line-through' : ''}`}>{x.label}</span>
                    <button type="button" aria-label={`Quitar ${x.label}`} onClick={() => remove.mutate(x.id)} className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-red-50 hover:text-red-700">
                      <Icon name="close" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        <form
          className="card flex flex-wrap gap-2 p-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!label.trim()) return
            addMany.mutate([{ label: label.trim().slice(0, 80), category, position: list.length }])
            setLabel('')
          }}
        >
          <input aria-label="Cosa que llevar" className="min-w-0 flex-1 rounded-sm bg-surface-low px-3 py-2 ring-1 ring-outline-soft focus:ring-2 focus:ring-ink" placeholder="Añadir algo a la lista…" value={label} onChange={(e) => setLabel(e.target.value)} />
          <select aria-label="Categoría" className="rounded-sm bg-surface-low px-2 ring-1 ring-outline-soft" value={category} onChange={(e) => setCategory(e.target.value as PackingCategory)}>
            {PACKING_ORDER.map((c) => (
              <option key={c} value={c}>
                {PACKING_CATEGORIES[c].label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-dark" disabled={!label.trim()}>
            Añadir
          </button>
        </form>
      </div>

      <aside className="space-y-4">
        <div className="card p-4">
          <div className="mb-2 font-display font-semibold">Plantillas</div>
          <div className="grid grid-cols-2 gap-2">
            {PACKING_TEMPLATES.map((tpl) => {
              const missing = tpl.items.filter((x) => !have.has(x.label.toLowerCase()))
              return (
                <button
                  key={tpl.id}
                  type="button"
                  disabled={!missing.length || addMany.isPending}
                  onClick={() => addMany.mutate(missing.map((x, i) => ({ ...x, position: list.length + i })))}
                  className="flex items-center gap-2 rounded-sm bg-surface-low px-3 py-2.5 text-left text-sm transition hover:bg-surface-container disabled:opacity-50"
                >
                  <Icon name={tpl.icon} size={18} className="text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{tpl.label}</span>
                    <span className="text-xs text-ink-soft">{missing.length ? `+${missing.length}` : 'Añadida'}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        {suggestions.length > 0 && (
          <div className="card p-4">
            <div className="mb-1 font-display font-semibold">Para este viaje</div>
            <p className="mb-2 text-xs text-ink-soft">Según el destino y el tiempo previsto.</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((x) => (
                <button key={x.label} type="button" onClick={() => addMany.mutate([{ ...x, position: list.length }])} className="inline-flex items-center gap-1 rounded-full bg-surface-low px-2.5 py-1 text-sm hover:bg-surface-container">
                  <Icon name="add" size={14} className="text-accent" /> {x.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost mt-3 w-full" onClick={() => addMany.mutate(suggestions.map((x, i) => ({ ...x, position: list.length + i })))}>
              Añadir todas
            </button>
          </div>
        )}
      </aside>
    </div>
  )
}

// ───────────────────────────── Documentos ─────────────────────────────

const DOC_KINDS: Record<DocumentKind, { label: string; icon: string }> = {
  flight: { label: 'Vuelo o tren', icon: 'airplane_ticket' },
  lodging: { label: 'Alojamiento', icon: 'hotel' },
  insurance: { label: 'Seguro', icon: 'health_and_safety' },
  ticket: { label: 'Entradas', icon: 'confirmation_number' },
  other: { label: 'Otro', icon: 'description' },
}

export function DocumentsTab({ trip: t }: { trip: TripWithStops }) {
  const qc = useQueryClient()
  const docs = useQuery({ queryKey: ['documents', t.id], queryFn: () => api.listDocuments(t.id) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['documents', t.id] })
  const [kind, setKind] = useState<DocumentKind>('flight')
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const f of files) await api.uploadDocument(t.id, f, kind)
    },
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: (d: TripDocument) => api.deleteDocument(d), onSuccess: refresh })
  const open = useMutation({
    // La pestaña se abre en el mismo toque (si no, Safari la bloquea) y luego se le pone el enlace temporal.
    mutationFn: async (d: TripDocument) => {
      const tab = window.open('about:blank', '_blank')
      try {
        const url = await api.documentUrl(d)
        if (tab) {
          tab.opener = null
          tab.location.href = url
        } else location.href = url
      } catch (e) {
        tab?.close()
        throw e
      }
    },
  })
  const list = docs.data ?? []

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <ErrorNote error={docs.error ?? upload.error ?? remove.error ?? open.error} />
        {list.length ? (
          <ul className="space-y-2">
            {list.map((d) => (
              <li key={d.id} className="card flex items-center gap-3 p-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-sm bg-surface-low">
                  <Icon name={DOC_KINDS[d.kind].icon} className="text-accent" />
                </span>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open.mutate(d)}>
                  <span className="block truncate font-semibold hover:underline">{d.name}</span>
                  <span className="text-xs text-ink-soft">
                    {DOC_KINDS[d.kind].label} · {d.size ? `${(d.size / 1024 / 1024).toFixed(1)} MB` : ''} · {formatDay(d.created_at.slice(0, 10))}
                  </span>
                </button>
                <button type="button" className="btn btn-ghost shrink-0" onClick={() => open.mutate(d)}>
                  <Icon name="open_in_new" size={18} /> <span className="hidden sm:inline">Abrir</span>
                </button>
                <button
                  type="button"
                  aria-label={`Borrar ${d.name}`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-red-50 hover:text-red-700"
                  onClick={async () => (await ask({ title: `¿Borrar «${d.name}»?`, body: 'El archivo se elimina para todos los participantes.', confirm: 'Borrar', danger: true })) && remove.mutate(d)}
                >
                  <Icon name="delete" size={18} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card p-6 text-center text-ink-soft">
            <Icon name="folder_open" size={36} className="text-accent" />
            <p className="mt-2">Guarda aquí los billetes, reservas y seguros para tenerlos a mano durante el viaje.</p>
          </div>
        )}
      </div>
      <aside className="card space-y-3 p-4">
        <div className="font-display font-semibold">Subir documento</div>
        <select aria-label="Tipo de documento" className="field py-2!" value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
          {(Object.keys(DOC_KINDS) as DocumentKind[]).map((k) => (
            <option key={k} value={k}>
              {DOC_KINDS[k].label}
            </option>
          ))}
        </select>
        <label className={`btn w-full cursor-pointer ${upload.isPending ? 'btn-ghost' : 'btn-accent'}`}>
          <Icon name={upload.isPending ? 'sync' : 'upload_file'} size={18} className={upload.isPending ? 'animate-spin' : ''} /> {upload.isPending ? 'Subiendo…' : 'Elegir PDF o imagen'}
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            multiple
            hidden
            disabled={upload.isPending}
            onChange={(e) => {
              if (e.target.files?.length) upload.mutate([...e.target.files])
              e.target.value = ''
            }}
          />
        </label>
        <p className="flex gap-2 text-xs text-ink-soft">
          <Icon name="lock" size={14} className="mt-0.5 shrink-0" /> Privado: solo los participantes del viaje pueden abrirlos, con enlaces que caducan en 5 minutos. Máximo 10 MB por archivo. Evita
          subir copias del pasaporte o del DNI si no hacen falta.
        </p>
      </aside>
    </div>
  )
}

