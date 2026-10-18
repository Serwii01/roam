import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { daysBetween, formatDay } from '../components/DatePicker'
import { Icon } from '../components/Icon'
import { PassportAlert, useWeather } from '../components/Weather'
import { Empty, ErrorNote, Flag, Spinner, plural } from '../components/ui'
import { api } from '../lib/api'
import type { DocumentKind, PackingCategory, Stop, TripDocument, TripWithStops } from '../lib/db'
import type { NewSight } from '../lib/api/types'
import { DayPlan } from '../components/DayPlan'
import { useInvalidateTravel, usePassports, useProfile, useTrip } from '../lib/hooks'
import { PACKING_CATEGORIES, PACKING_ORDER, PACKING_TEMPLATES, packingSuggestions } from '../lib/packing'
import { passportWarnings } from '../lib/passportCheck'
import { KIND_LABEL, weatherFor } from '../lib/weather'

const TABS = [
  { id: 'itinerario', label: 'Día a día', icon: 'event_note' },
  { id: 'tiempo', label: 'Tiempo', icon: 'partly_cloudy_day' },
  { id: 'equipaje', label: 'Equipaje', icon: 'luggage' },
  { id: 'documentos', label: 'Documentos', icon: 'description' },
] as const
type TabId = (typeof TABS)[number]['id']

/** /app/viajes/:id/plan — itinerario, tiempo, equipaje y documentos de un viaje. */
export function PlannerPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'itinerario') as TabId
  const trip = useTrip(id)
  const passports = usePassports()
  const profile = useProfile()
  const t = trip.data

  if (trip.isLoading) return <Spinner label="Abriendo el planificador" />
  if (!t)
    return (
      <Empty icon="search_off" title="Este viaje no existe">
        <Link to="/app/bitacora" className="btn btn-dark mt-4">
          Volver a la bitácora
        </Link>
      </Empty>
    )

  const warnings = passportWarnings([t], passports.data ?? [], profile.data?.home_country ?? 'ES')
  const days = t.start_date ? daysBetween(t.start_date, t.end_date ?? t.start_date) : null

  return (
    <div>
      <Link to={`/app/viajes/${t.id}`} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <Icon name="arrow_back" size={16} /> {t.title}
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label-code text-accent-deep">Planificador</div>
          <h1 className="headline-lg mt-1">{t.title}</h1>
          <p className="mt-1 text-ink-soft">
            {t.start_date ? `${formatDay(t.start_date)} – ${formatDay(t.end_date ?? t.start_date)} · ${plural(days ?? 1, 'día', 'días')}` : 'Sin fechas'} · {plural(t.stops.length, 'parada', 'paradas')}
          </p>
        </div>
        <Link to={`/app/viajes/${t.id}/editar?paso=ruta`} className="btn btn-ghost">
          <Icon name="edit_note" size={18} /> Editar ruta
        </Link>
      </div>

      <div className="mt-4">
        <PassportAlert warnings={warnings} showTrip={false} />
      </div>

      <nav className="-mx-4 mt-6 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setParams({ tab: x.id }, { replace: true })}
            className={`btn shrink-0 ${tab === x.id ? 'btn-dark' : 'btn-ghost'}`}
          >
            <Icon name={x.icon} size={18} /> {x.label}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'itinerario' && <DaysTab trip={t} />}
        {tab === 'tiempo' && <WeatherTab trip={t} />}
        {tab === 'equipaje' && <PackingTab trip={t} home={profile.data?.home_country ?? 'ES'} />}
        {tab === 'documentos' && <DocumentsTab trip={t} />}
      </div>
    </div>
  )
}

// ───────────────────────────── Día a día ─────────────────────────────

/** El mismo plan día a día del editor: lo que se ve cada día, con hora y casilla. */
function DaysTab({ trip: t }: { trip: TripWithStops }) {
  const invalidate = useInvalidateTravel()
  const add = useMutation({ mutationFn: ({ stopId, sight }: { stopId: string; sight: NewSight }) => api.addSight(stopId, sight), onSuccess: () => invalidate() })
  const update = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateSight>[1] }) => api.updateSight(id, patch), onSuccess: () => invalidate() })
  const remove = useMutation({ mutationFn: (id: string) => api.deleteSight(id), onSuccess: () => invalidate() })
  return (
    <div>
      <ErrorNote error={add.error ?? update.error ?? remove.error} />
      <DayPlan
        trip={t}
        ops={{ add: (stopId, sight) => add.mutate({ stopId, sight }), update: (id, patch) => update.mutate({ id, patch }), remove: (id) => remove.mutate(id) }}
      />
      {!t.start_date && (
        <Link to={`/app/viajes/${t.id}/editar?paso=destino`} className="btn btn-dark mt-4">
          Poner fechas
        </Link>
      )}
    </div>
  )
}

// ───────────────────────────── Tiempo ─────────────────────────────

function WeatherTab({ trip: t }: { trip: TripWithStops }) {
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

function PackingTab({ trip: t, home }: { trip: TripWithStops; home: string }) {
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

function DocumentsTab({ trip: t }: { trip: TripWithStops }) {
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
                  onClick={() => confirm(`¿Borrar «${d.name}»?`) && remove.mutate(d)}
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

