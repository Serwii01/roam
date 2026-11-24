import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ask, deleteTripQuestion } from '../components/ConfirmDialog'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Icon } from '../components/Icon'
import { usePhotoLinks } from '../lib/photoLinks'
import { PhotoViewer, type ViewerPhoto } from '../components/PhotoViewer'
import { TripBudget, type BudgetStart } from '../components/TripBudget'
import { TripCrew } from '../components/TripCrew'
import { TripLogistics } from '../components/TripLogistics'
import { TripCalendar } from '../components/TripCalendar'
import { TripShareLink } from '../components/TripShareLink'
import { PassportAlert, TripWeatherSummary } from '../components/Weather'
import { Empty, ErrorNote, Spinner, StatTile, coords, formatDate, plural } from '../components/ui'
import { WorldMap } from '../components/LazyWorldMap'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { notifyDone } from '../lib/push'
import { isNote } from '../lib/db'
import { useAirportMap, useCountries, useInvalidateTravel, usePassports, useProfile, useTravelMutation, useTrip } from '../lib/hooks'
import { passportWarnings } from '../lib/passportCheck'
import { tripCardData } from '../lib/shareData'
import { formatKm, legKm, tripCountries, tripDays, tripKm, tripModes } from '../lib/stats'
import { TRANSPORT } from '../lib/transport'
import { DocumentsTab, PackingTab } from './Planner'
import { centerTab, TitleEdit, MoreMenu } from '../components/trip/TripHeader'
import { Destinations, BudgetGlance, PrepChecklist, TripDetails, ReadDetails, Soundtrack } from '../components/trip/TripSummary'
import { DaysTab } from '../components/trip/DaysTab'
import { RouteTab } from '../components/trip/RouteTab'
import { PhotosTab } from '../components/trip/PhotosTab'

const ShareSheet = lazy(() => import('../components/ShareSheet').then((m) => ({ default: m.ShareSheet })))
const TripReplay = lazy(() => import('../components/TripReplay').then((m) => ({ default: m.TripReplay })))

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: 'dashboard', private: false },
  { id: 'dias', label: 'Día a día', icon: 'event_note', private: true },
  { id: 'ruta', label: 'Ruta', icon: 'route', private: false },
  { id: 'fotos', label: 'Fotos', icon: 'photo_library', private: false },
  { id: 'gastos', label: 'Gastos', icon: 'payments', private: true },
  { id: 'equipaje', label: 'Equipaje', icon: 'luggage', private: true },
  { id: 'documentos', label: 'Documentos', icon: 'description', private: true },
] as const
export type TripTab = (typeof TABS)[number]['id']

const today = () => new Date().toISOString().slice(0, 10)

/**
 * /app/viajes/:id — la página de un viaje, por pestañas: resumen (con los datos editables ahí mismo),
 * día a día, ruta, fotos, gastos, equipaje y documentos.
 */
export function TripLogPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const trip = useTrip(id)
  const { name } = useCountries()
  const airports = useAirportMap(trip.data?.stops.flatMap((s) => [s.from_airport, s.to_airport]) ?? [])
  const [viewer, setViewer] = useState<number | null>(null)
  const [sharing, setSharing] = useState(false)
  // ?revive=1: los recuerdos abren el viaje directamente en la repetición.
  const [replaying, setReplaying] = useState(params.get('revive') === '1')
  const me = useAuth().user?.id
  const passports = usePassports()
  const profile = useProfile()
  const save = useTravelMutation((patch: Parameters<typeof api.updateTrip>[1]) => api.updateTrip(id!, patch))
  const invalidate = useInvalidateTravel()
  const remove = useMutation({
    mutationFn: () => api.deleteTrip(id!),
    onSuccess: async () => {
      await invalidate()
      navigate('/app/bitacora', { replace: true })
    },
  })
  // Un compañero quita el viaje de su cuenta: sale del viaje (deja de contar en su pasaporte y su perfil).
  const leave = useMutation({
    mutationFn: () => api.removeTripMember(id!, me!),
    onSuccess: async () => {
      await invalidate()
      navigate('/app/bitacora', { replace: true })
    },
  })
  const tabsRef = useRef<HTMLElement>(null)
  // Desde el resumen se puede ir directo a «editar presupuesto» o «apuntar gasto».
  const [budgetStart, setBudgetStart] = useState<BudgetStart | undefined>()
  // Los avisos y el botón «+» abren directamente el formulario o los saldos: se leen del enlace y se limpian.
  const [opens, setOpens] = useState(0)
  const linkStart: BudgetStart | undefined = params.get('nuevo') ? 'expense' : params.get('ver') === 'saldos' ? 'balances' : undefined
  useEffect(() => {
    if (!linkStart) return
    setBudgetStart(linkStart)
    setOpens((n) => n + 1)
    setParams({ tab: 'gastos' }, { replace: true })
  }, [linkStart, setParams])

  const t = trip.data
  const participant = !!t && (t.user_id === me || (t.member_count ?? 0) > 0)
  const owner = !!t && t.user_id === me
  const tabs = TABS.filter((x) => participant || !x.private)
  const tab: TripTab = tabs.find((x) => x.id === params.get('tab'))?.id ?? 'resumen'
  const goTab = (next: TripTab, start?: BudgetStart) => {
    setBudgetStart(start)
    setParams(next === 'resumen' ? {} : { tab: next }, { replace: true })
    // Si la barra de pestañas quedó arriba, se vuelve a ella para ver el principio de la pestaña.
    const top = tabsRef.current?.getBoundingClientRect().top ?? 0
    if (top < 64) window.scrollBy({ top: top - 64 })
  }

  const links = usePhotoLinks()
  // Todas las fotos en el orden de la ruta (las que no tienen parada, al final), para la galería y el visor.
  const gallery = useMemo<(ViewerPhoto & { thumb: string; stopId: string | null; stopName?: string })[]>(() => {
    if (!t) return []
    const order = new Map(t.stops.map((s, i) => [s.id, i]))
    return [...t.photos]
      .sort((a, b) => (order.get(a.stop_id ?? '') ?? Infinity) - (order.get(b.stop_id ?? '') ?? Infinity))
      .map((p) => {
        const stop = t.stops.find((s) => s.id === p.stop_id)
        const when = stop?.arrived_on ? formatDate(stop.arrived_on, 'long') : null
        return { id: p.id, url: api.photoUrl(p.path), thumb: api.photoThumbUrl(p.path), stopId: p.stop_id, stopName: stop?.name, caption: [p.caption, stop?.name, when].filter(Boolean).join(' · ') || t.title }
      })
  // Los enlaces firmados cambian fuera de React (photoLinks.ts): `links` hace que la galería los vuelva a leer.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [t, links])
  const shareData = useMemo(() => t && tripCardData(t, airports, name), [t, airports, name])
  const sharePhotos = useMemo(() => [...new Set([...(t?.cover_url ? [t.cover_url] : []), ...gallery.map((g) => g.url)])], [t, gallery])
  const openPhoto = (pid: string) => setViewer(Math.max(0, gallery.findIndex((g) => g.id === pid)))
  const closeReplay = () => {
    setReplaying(false)
    if (params.has('revive')) setParams({}, { replace: true })
  }
  const legs = useMemo(() => (t ? t.stops.slice(1).map((s, j) => ({ stop: s, km: legKm(t.stops, j + 1, airports) })) : []), [t, airports])

  if (trip.isLoading) return <Spinner label="Abriendo bitácora" />
  if (!t)
    return (
      <Empty icon="search_off" title="Esta expedición no existe">
        <Link to="/app/bitacora" className="btn btn-dark mt-4">
          Volver a la bitácora
        </Link>
      </Empty>
    )

  const km = tripKm(t, airports)
  const days = tripDays(t)
  const countries = tripCountries(t)
  const modes = tripModes(t)
  const mainMode = modes.sort((a, b) => legs.filter((l) => l.stop.transport_in === b).length - legs.filter((l) => l.stop.transport_in === a).length)[0]
  const first = t.stops[0]
  const destinations = countries.filter((c) => c !== first?.country_code)
  const planned = t.status === 'planned'

  const setStatus = async (status: 'planned' | 'done') => {
    if (status === t.status) return
    const future = t.start_date && t.start_date > today()
    if (
      status === 'done' &&
      future &&
      !(await ask({ title: '¿Marcarlo como realizado?', body: 'Las fechas de este viaje aún no han llegado.', confirm: 'Sí, ya lo hice', icon: 'task_alt' }))
    )
      return
    save.mutate(
      { status },
      // Un viaje compartido realizado sale en el perfil de los compañeros: se les avisa.
      { onSuccess: () => status === 'done' && (t.member_count ?? 0) > 0 && void notifyDone(t.id) },
    )
  }
  const counts: Partial<Record<TripTab, number>> = { fotos: t.photos.length, ruta: t.stops.length, dias: t.sights.filter((x) => !isNote(x)).length }

  const map = (
    <WorldMap className="h-80 shadow-none!" trips={[t]} airports={airports} countries={countries} numbered base="modern" telemetry={false} legend={false} routeLink={false} />
  )

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/app/bitacora" className="label-code flex items-center gap-1 text-ink-soft hover:text-ink">
          <Icon name="arrow_back" size={14} /> Bitácora
        </Link>
        <span className="label-code hidden bg-accent px-2 py-1 text-white sm:inline">EXP · {t.start_date?.slice(0, 4) ?? 'S/F'}</span>
        {/* El estado lo decide solo quien creó el viaje: al marcarlo como realizado sale en el perfil de los compañeros. */}
        {owner ? (
          <div className="flex rounded-full bg-surface-low p-0.5" role="radiogroup" aria-label="Estado del viaje">
            {(['planned', 'done'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={t.status === s}
                disabled={save.isPending}
                onClick={() => setStatus(s)}
                className={`label-code rounded-full px-2.5 py-1 transition ${t.status === s ? (s === 'done' ? 'bg-ink text-paper' : 'bg-accent-soft text-accent-ink') : 'text-ink-soft hover:text-ink'}`}
              >
                {s === 'done' ? 'Realizado' : 'Planificado'}
              </button>
            ))}
          </div>
        ) : (
          <span
            className={`label-code px-2 py-1 ${t.status === 'done' ? 'bg-surface-container' : 'bg-accent-soft text-accent-ink'}`}
            title={participant ? 'Solo quien creó el viaje puede marcarlo como realizado' : undefined}
          >
            {t.status === 'done' ? 'Realizado' : 'Planificado'}
          </span>
        )}
        {first && (
          <span className="label-code hidden items-center gap-1.5 text-ink-soft sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> {coords(first.lat, first.lon)}
          </span>
        )}
      </div>

      {/* En el móvil, la cabecera entera va solo en el resumen: en las demás pestañas queda el título, y el contenido sube. */}
      <div className={`flex flex-wrap items-end justify-between gap-4 ${tab === 'resumen' ? 'mt-4' : 'mt-2 md:mt-4 max-md:[&_.display-hero]:text-2xl max-md:[&_.display-hero]:leading-7'}`}>
        <div className="min-w-0 max-w-4xl flex-[1_1_28rem]">
          {participant ? <TitleEdit title={t.title} onSave={(title) => save.mutate({ title })} /> : <h1 className="display-hero">{t.title}</h1>}
          <p className={`mt-2 text-base text-ink-soft md:mt-3 md:text-lg ${tab === 'resumen' ? '' : 'max-md:hidden'}`}>
            {[
              destinations.map(name).join(', ') || (first && name(first.country_code)),
              km > 0 && `${formatKm(km)} km`,
              days && `${days} días${mainMode ? ` en ${TRANSPORT[mainMode].label.toLowerCase()}` : ''}`,
              t.start_date && formatDate(t.start_date, 'long'),
            ]
              .filter(Boolean)
              .join(' • ')}
          </p>
        </div>
        <div className={`flex flex-wrap gap-2 ${tab === 'resumen' ? '' : 'max-md:hidden'}`}>
          {owner && planned && (
            <button className="btn btn-accent" disabled={save.isPending} onClick={() => setStatus('done')}>
              <Icon name="task_alt" size={18} /> Ya lo hice
            </button>
          )}
          {t.stops.length > 1 && (
            <button className={`btn ${planned ? 'btn-ghost' : 'btn-accent'}`} onClick={() => setReplaying(true)}>
              <Icon name="play_arrow" filled size={18} /> {planned ? 'Ver la ruta animada' : 'Revive el viaje'}
            </button>
          )}
          <button className={`btn ${(planned && owner) || t.stops.length > 1 ? 'btn-ghost' : 'btn-accent'}`} onClick={() => setSharing(true)}>
            <Icon name="ios_share" size={18} /> Compartir<span className="hidden sm:inline"> imagen</span>
          </button>
          {participant && (
            <MoreMenu
              tripId={t.id}
              owner={owner}
              deleting={remove.isPending || leave.isPending}
              onDelete={async () => {
                if (await ask(deleteTripQuestion(t.title))) remove.mutate()
              }}
              onLeave={async () => {
                if (
                  await ask({
                    title: `¿Quitar «${t.title}» de tu cuenta?`,
                    body: 'Saldrás del viaje: dejará de salir en tu bitácora, tu pasaporte y tu perfil. El viaje sigue para los demás, con tus paradas y fotos. Para volver, pide otra invitación.',
                    confirm: 'Quitar de mi cuenta',
                    danger: true,
                    icon: 'logout',
                  })
                )
                  leave.mutate()
              }}
            />
          )}
        </div>
      </div>
      <ErrorNote error={save.error ?? remove.error ?? leave.error} />

      <nav
        ref={tabsRef}
        role="tablist"
        aria-label="Secciones del viaje"
        className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 mt-6 flex gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain border-b border-surface-highest bg-surface/95 px-4 backdrop-blur [scrollbar-width:none] max-md:mt-3 md:-mx-12 md:px-12 print:hidden"
      >
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => goTab(x.id)}
            // La pestaña activa se ve siempre, aunque se llegue con un enlace.
            ref={tab === x.id ? centerTab : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-semibold transition ${tab === x.id ? 'border-accent text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            <Icon name={x.icon} size={18} className={tab === x.id ? 'text-accent' : ''} />
            {x.label}
            {!!counts[x.id] && <span className="rounded-full bg-surface-container px-1.5 text-[11px] text-ink-soft">{counts[x.id]}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'resumen' && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
            <div className="min-w-0 space-y-6">
              <div className="card grid grid-cols-2 gap-2 p-2 md:grid-cols-4">
                <StatTile label="Duración" icon="calendar_month" value={days ?? '—'} unit="días" hint={t.start_date ? `${formatDate(t.start_date)} — ${formatDate(t.end_date)}` : 'Sin fechas'} />
                <StatTile label="Distancia" icon="route" value={formatKm(km)} unit="km" hint={`${(km / 40075).toFixed(2)} vueltas a la Tierra`} />
                <StatTile label="Países" icon="public" value={countries.length} hint={countries.join(' · ') || '—'} />
                <StatTile label="Paradas" icon="pin_drop" value={t.stops.length} hint={plural(t.photos.length, 'foto', 'fotos')} />
              </div>
              {t.stops.length > 0 && <Destinations trip={t} onOpen={() => goTab('ruta')} />}
              {participant && <TripLogistics trip={t} />}
              {participant && <BudgetGlance trip={t} onOpen={(start) => goTab('gastos', start)} />}
              {planned && participant && <PassportAlert warnings={passportWarnings([t], passports.data ?? [], profile.data?.home_country ?? 'ES')} showTrip={false} />}
              {planned && participant && <PrepChecklist trip={t} onTab={goTab} />}
              {participant ? (
                <TripDetails trip={t} saving={save.isPending} onSave={(patch) => save.mutate(patch)} />
              ) : (
                <ReadDetails trip={t} />
              )}
              {t.stops.length > 0 && (t.start_date || t.stops.some((s) => s.arrived_on)) && (
                <section>
                  <h2 className="headline-sm mb-3 flex items-center gap-2 uppercase">
                    <Icon name="partly_cloudy_day" className="text-accent" /> {planned ? 'Tiempo previsto' : 'El tiempo que hizo'}
                  </h2>
                  <TripWeatherSummary trip={t} />
                </section>
              )}
            </div>
            <aside className="min-w-0 space-y-6">
              <div className="card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="headline-sm uppercase">Ruta</h3>
                  <button type="button" className="label-code text-accent-deep hover:underline" onClick={() => goTab('ruta')}>
                    {t.stops.length ? `${plural(t.stops.length, 'parada', 'paradas')} →` : 'Añadir paradas →'}
                  </button>
                </div>
                {map}
              </div>
              {participant && <TripCalendar trip={t} />}
              {participant && <TripShareLink trip={t} />}
              <TripCrew trip={t} />
              <Soundtrack trip={t} />
            </aside>
          </div>
        )}

        {tab === 'dias' && <DaysTab trip={t} onDates={() => goTab('resumen')} />}

        {tab === 'ruta' && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
            <RouteTab trip={t} legs={legs} participant={participant} onPhoto={openPhoto} />
            <aside className="min-w-0 space-y-6 lg:order-none">
              <div className="card p-4 lg:sticky lg:top-32">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="headline-sm uppercase">Mapa</h3>
                  <span className="label-code text-accent-deep">{formatKm(km)} km total</span>
                </div>
                {map}
                {legs.length > 0 && (
                  <ul className="mt-4 space-y-1.5">
                    {legs.map(({ stop, km: lk }, j) => (
                      <li key={stop.id} className="flex items-center gap-3 rounded-sm bg-surface-low px-3 py-2 text-sm">
                        <Icon name={TRANSPORT[stop.transport_in ?? 'car'].icon} size={18} className="text-accent" />
                        <span className="min-w-0 flex-1 truncate">
                          {t.stops[j].name} → {stop.name}
                        </span>
                        <span className="label-code text-ink-soft">{formatKm(lk)} km</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>
        )}

        {tab === 'fotos' && <PhotosTab trip={t} gallery={gallery} participant={participant} onOpen={setViewer} />}

        {tab === 'gastos' && (
          <div className="max-w-3xl">
            <TripBudget key={`${budgetStart ?? 'gastos'}${opens}`} trip={t} start={budgetStart} />
          </div>
        )}

        {tab === 'equipaje' && <PackingTab trip={t} home={profile.data?.home_country ?? 'ES'} />}
        {tab === 'documentos' && <DocumentsTab trip={t} />}
      </div>

      {sharing && shareData && (
        <Suspense fallback={null}>
          <ShareSheet data={shareData} photos={sharePhotos} onClose={() => setSharing(false)} />
        </Suspense>
      )}
      {replaying && t.stops.length > 1 && (
        <Suspense fallback={null}>
          <TripReplay
            trip={t}
            airports={airports}
            countryName={name}
            onShare={() => {
              closeReplay()
              setSharing(true)
            }}
            onClose={closeReplay}
          />
        </Suspense>
      )}
      {viewer !== null && gallery.length > 0 && <PhotoViewer photos={gallery} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />}
    </div>
  )
}
