import { lazy, Suspense, useMemo, useState } from 'react'
import { ask } from '../components/ConfirmDialog'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar } from '../components/Avatar'
import { DateField } from '../components/DatePicker'
import { Icon } from '../components/Icon'
import { Stamp } from '../components/Stamp'
import { YearInReview } from '../components/YearInReview'
import { PassportAlert } from '../components/Weather'
import { passportWarnings } from '../lib/passportCheck'
import { Empty, Eyebrow, Flag, Spinner, formatDate, monthShort, plural } from '../components/ui'
import { api } from '../lib/api'
import { BADGE_CATEGORIES, computeBadges, computeStamps, type BadgeCategory } from '../lib/badges'
import { alpha3 } from '../lib/countries'
import { CONTINENT_NAMES, type ContinentCode, type Passport } from '../lib/db'
import { useCountries, usePassports, useProfile, useTravelData } from '../lib/hooks'
import { formatKm, isDone, kmByMonth, levelFor, missingContinents } from '../lib/stats'
import { worldCardData } from '../lib/shareData'
import { TRANSPORT } from '../lib/transport'

const ShareSheet = lazy(() => import('../components/ShareSheet').then((m) => ({ default: m.ShareSheet })))

export function PassportPage() {
  const { loading, trips, stats, airports } = useTravelData()
  const profile = useProfile()
  const passports = usePassports()
  const countries = useCountries()
  const [continent, setContinent] = useState<ContinentCode | 'all'>('all')
  const years = stats.years.map((y) => y.year)
  const [year, setYear] = useState<number | null>(null)
  const [sharing, setSharing] = useState(false)
  const shareData = useMemo(() => worldCardData(profile.data, stats, trips, airports), [profile.data, stats, trips, airports])
  const chartYear = year ?? years[0] ?? new Date().getFullYear()

  const stamps = useMemo(() => computeStamps(trips), [trips])
  const badges = useMemo(() => computeBadges(trips, stats, airports, countries.byCode), [trips, stats, airports, countries.byCode])
  const [badgeCat, setBadgeCat] = useState<BadgeCategory | 'all'>('all')
  const [allBadges, setAllBadges] = useState(false)
  const months = useMemo(() => kmByMonth(trips, chartYear, airports), [trips, chartYear, airports])

  if (loading || profile.isLoading) return <Spinner label="Leyendo chip biométrico" />

  const p = profile.data!
  const level = levelFor(stats.countries.length)
  const thisYear = new Date().getFullYear()
  const newThisYear = new Set(
    trips
      .filter((t) => isDone(t) && t.start_date?.startsWith(String(thisYear)))
      .flatMap((t) => t.stops.map((s) => s.country_code)),
  ).size
  const missing = missingContinents(stats.continents)
  const unlocked = badges.filter((b) => b.progress >= 1)
  const inProgress = badges.filter((b) => b.progress < 1).sort((a, b) => b.progress - a.progress)
  const inCat = <T extends { category: BadgeCategory }>(xs: T[]) => (badgeCat === 'all' ? xs : xs.filter((b) => b.category === badgeCat))
  const shownUnlocked = inCat(unlocked)
  const pending = inCat(inProgress)
  const shownPending = allBadges ? pending : pending.slice(0, 6)
  const featured = unlocked.at(-1)
  const firstTrip = trips.filter(isDone).map((t) => t.start_date).filter(Boolean).sort()[0]
  const name = p.display_name || p.username
  const citizenship = passports.data?.length ? passports.data.map((x) => countries.name(x.country_code)).join(' / ') : p.home_country ? countries.name(p.home_country) : '—'
  const mrzCountry = alpha3(passports.data?.[0]?.country_code ?? p.home_country ?? 'XX')
  const mrz = `P<${mrzCountry}${name.toUpperCase().replace(/[^A-Z]/g, '<')}`.padEnd(44, '<').slice(0, 44)
  const filteredStamps = continent === 'all' ? stamps : stamps.filter((s) => countries.byCode.get(s.countryCode)?.continent === continent)
  const stampContinents = [...new Set(stamps.map((s) => countries.byCode.get(s.countryCode)?.continent).filter(Boolean))] as ContinentCode[]
  const maxMonth = Math.max(1, ...months)
  const totalTransportKm = stats.transport.reduce((a, t) => a + t.km, 0)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow>Expedition archive // livestream telemetry</Eyebrow>
          <h1 className="display-hero mt-3">Pasaporte & badges</h1>
          <p className="mt-3 max-w-xl text-ink-soft">Registro biométrico, sellos de control fronterizo y certificaciones de expedición continental.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-accent" onClick={() => setSharing(true)}>
            <Icon name="ios_share" size={18} /> Compartir mi mapa
          </button>
          <button className="btn btn-ghost" onClick={() => window.print()}>
            <Icon name="menu_book" size={18} /> Libreta completa (PDF)
          </button>
        </div>
      </div>
      {sharing && (
        <Suspense fallback={null}>
          <ShareSheet data={shareData} onClose={() => setSharing(false)} />
        </Suspense>
      )}
      <div className="mt-6">
        <PassportAlert warnings={passportWarnings(trips, passports.data ?? [], profile.data?.home_country ?? 'ES')} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex min-w-0 gap-5">
              <div className="relative grid h-28 w-24 shrink-0 place-items-center overflow-hidden rounded-sm bg-surface-low">
                <Avatar profile={p} className="h-20 w-20" />
                <span className="label-stamp absolute bottom-1 right-1 bg-white px-1 text-[8px] text-ink">Valid</span>
              </div>
              <div className="min-w-0">
                <div className="label-stamp text-accent-deep">Specimen ID-{p.id.replace(/-/g, '').slice(0, 5).toUpperCase()} · Chip biométrico 64-bit</div>
                <div className="headline-md mt-2 uppercase">{name}</div>
                <div className="label-stamp mt-1 text-ink-soft">Ciudadanía: {citizenship}</div>
                <div className="label-stamp mt-1 text-ink-soft">
                  Origen expediciones: {firstTrip ? formatDate(firstTrip, 'month') : '—'} {p.home_city ? `· ${p.home_city}` : ''}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="label-stamp text-ink-soft">Pasaporte digital ROAM</div>
              <div className="label-stamp mt-1 inline-block bg-surface-container px-2 py-1">Serie nomad-{thisYear}</div>
              <div className="label-stamp mt-1 text-accent-deep">@{p.username}</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 rounded-sm bg-surface-low p-5 md:grid-cols-4">
            <Big label="Países recorridos" value={stats.countries.length} hint={newThisYear ? `+${newThisYear} este año` : 'Este año: 0'} accentHint />
            <Big label="Continentes" value={stats.continents.length} suffix="/6" hint={missing.length ? `Falta ${CONTINENT_NAMES[missing[0]]}` : 'Todos'} />
            <Big
              label="Km acumulados"
              value={formatKm(stats.totalKm, true).replace('K', '')}
              suffix={stats.totalKm >= 10000 ? 'K' : ''}
              hint={`${(stats.totalKm / 40075).toFixed(2)} vueltas a la Tierra`}
            />
            <Big label="Puntos de sello" value={stamps.length} hint={`${stats.subdivisions.length} regiones`} />
          </div>

          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-display font-semibold uppercase">
                <Icon name="military_tech" className="text-accent" /> Rango actual: {level.current.name} (nivel {level.current.n})
              </span>
              {level.next && (
                <span className="label-stamp text-ink-soft">
                  A {level.next.min - stats.countries.length} países de «{level.next.name}»
                </span>
              )}
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-surface-container">
              <div className="h-full rounded-full bg-accent" style={{ width: `${level.progress * 100}%` }} />
            </div>
            <div className="label-stamp mt-1.5 flex justify-between text-outline">
              <span>{level.previous ? `Nivel ${level.previous.n}: ${level.previous.name} (${level.previous.min} países)` : ''}</span>
              <span>{level.next ? `Próximo hito: ${level.next.min} países` : 'Rango máximo'}</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-surface-highest pt-4">
            <span className="truncate font-mono text-xs tracking-[0.2em] text-ink-soft">{mrz}</span>
            <span className="label-stamp flex items-center gap-1 text-ink-soft">
              <Icon name="qr_code_2" size={16} /> Verificado ROAM
            </span>
          </div>
        </div>

        <div className="flex flex-col rounded-md bg-night p-6 text-white">
          <div className="flex items-center justify-between">
            <span className="label-stamp text-white/70">Insignia destacada</span>
            {featured && <span className="label-stamp bg-accent px-2 py-1">Desbloqueado</span>}
          </div>
          <div className="headline-md mt-3 uppercase">{featured?.title ?? 'Tu primera insignia'}</div>
          <p className="mt-1 text-sm text-white/70">{featured?.description ?? 'Completa una expedición para desbloquearla.'}</p>
          <div className="mx-auto my-6 grid h-36 w-36 place-items-center rounded-md border border-white/15 bg-white/5">
            <div className="grid h-28 w-28 place-items-center rounded-sm border border-dashed border-white/30 text-center">
              <div>
                <Icon name={featured?.icon ?? 'lock'} size={36} />
                <div className="label-stamp mt-2 text-white/80">{featured?.detail ?? 'Bloqueada'}</div>
              </div>
            </div>
          </div>
          <div className="label-stamp mt-auto space-y-1.5 rounded-sm bg-white/5 p-4 text-white/80">
            <div className="flex justify-between">
              <span>Insignias</span>
              <span>
                {unlocked.length} / {badges.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Vuelos registrados</span>
              <span>{stats.flights}</span>
            </div>
            <div className="flex justify-between">
              <span>Aeropuertos</span>
              <span>{stats.airports.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-14">
        <YearInReview trips={trips} airports={airports} countries={countries} profile={profile.data} />
      </div>

      <section className="mt-14">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="label-stamp mb-1.5 text-accent-deep">Archivo aduanero // sellos vinculados</div>
            <h2 className="headline-lg">Sellos digitales de inmigración</h2>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="label-code mr-1 text-ink-soft">Filtrar:</span>
            <button className="chip" aria-pressed={continent === 'all'} onClick={() => setContinent('all')}>
              Todos ({stamps.length})
            </button>
            {stampContinents.map((c) => (
              <button key={c} className="chip" aria-pressed={continent === c} onClick={() => setContinent(c)}>
                {CONTINENT_NAMES[c]}
              </button>
            ))}
          </div>
        </div>
        {filteredStamps.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredStamps.map((s) => (
              <div key={s.key} className="card flex flex-col p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="label-stamp text-accent-deep">{s.domestic ? 'Aeropuerto nacional' : 'Control fronterizo'}</div>
                    <div className="font-display font-semibold uppercase">
                      {countries.name(s.countryCode)} // {s.place}
                    </div>
                  </div>
                  <span className="label-code bg-surface-container px-2 py-0.5">{s.date?.slice(0, 4)}</span>
                </div>
                <div className="grid flex-1 place-items-center py-8">
                  <Stamp stampKey={s.key} countryCode={s.countryCode} countryName={countries.name(s.countryCode)} place={s.place} date={s.date} airport={s.airport} domestic={s.domestic} />
                </div>
                <div className="label-stamp flex justify-between text-ink-soft">
                  <span>{s.domestic ? `Aeropuerto nacional · ${s.airport}` : s.airport ? `Puerto: ${s.airport}` : s.mode ? `Acceso: ${TRANSPORT[s.mode as keyof typeof TRANSPORT]?.label ?? s.mode}` : 'Acceso terrestre'}</span>
                  <span>
                    Lat: {Math.abs(s.lat).toFixed(4)}° {s.lat >= 0 ? 'N' : 'S'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon="approval" title="Sin sellos todavía">
            Cada país al que llegas en una expedición completada te da un sello.
          </Empty>
        )}
      </section>

      <section className="mt-14">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="label-stamp mb-1.5 text-accent-deep">Sistema de méritos // medallas expedicionarias</div>
            <h2 className="headline-lg">Insignias & hitos alcanzados</h2>
          </div>
          <span className="label-code text-ink-soft">
            Desbloqueadas: {unlocked.length} de {badges.length} ({Math.round((unlocked.length / badges.length) * 100)}%)
          </span>
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-1">
          <button className="chip" aria-pressed={badgeCat === 'all'} onClick={() => setBadgeCat('all')}>
            Todas ({badges.length})
          </button>
          {(Object.keys(BADGE_CATEGORIES) as BadgeCategory[]).map((c) => (
            <button key={c} className="chip" aria-pressed={badgeCat === c} onClick={() => setBadgeCat(c)}>
              {BADGE_CATEGORIES[c]} ({unlocked.filter((b) => b.category === c).length}/{badges.filter((b) => b.category === c).length})
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shownUnlocked.map((b) => (
            <div key={b.id} className="card p-5">
              <div className="flex items-start justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-sm bg-surface-low">
                  <Icon name={b.icon} />
                </span>
                <span className="label-stamp bg-accent px-2 py-1 text-white">Logrado</span>
              </div>
              <div className="headline-sm mt-4 uppercase">{b.title}</div>
              <p className="mt-1 text-sm text-ink-soft">{b.description}</p>
              <div className="label-stamp mt-4 border-t border-surface-highest pt-3 text-ink-soft">{b.detail}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {shownPending.map((b) => (
            <div key={b.id} className="card flex items-center gap-4 p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-surface-low">
                <Icon name={b.icon} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <span>
                    <span className="label-stamp block text-ink-soft">Hito en proceso</span>
                    <span className="font-display font-semibold uppercase">{b.title}</span>
                  </span>
                  <span className="label-code text-accent-deep">{b.detail}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-surface-container">
                  <div className="h-full rounded-full bg-ink" style={{ width: `${b.progress * 100}%` }} />
                </div>
                <div className="mt-1 text-xs text-ink-soft">{b.description}</div>
              </div>
            </div>
          ))}
        </div>
        {pending.length > 6 && (
          <button className="btn btn-ghost mt-4 w-full" onClick={() => setAllBadges((v) => !v)}>
            <Icon name={allBadges ? 'expand_less' : 'expand_more'} size={18} />
            {allBadges ? 'Ver menos' : `Ver los ${pending.length} hitos pendientes`}
          </button>
        )}
      </section>

      <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="label-stamp text-ink-soft">Estacionalidad telemétrica</div>
              <h3 className="headline-md mt-1 uppercase">Meses con mayor movilidad</h3>
            </div>
            <select className="label-code rounded-xs bg-surface-container px-2 py-1" value={chartYear} onChange={(e) => setYear(Number(e.target.value))}>
              {(years.length ? years : [chartYear]).map((y) => (
                <option key={y} value={y}>
                  Año {y}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-6 flex h-44 items-end gap-1 sm:gap-1.5">
            {months.map((km, i) => {
              const top = km > 0 && km >= maxMonth * 0.6
              return (
                <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  {top && <span className="label-stamp hidden text-[9px] text-accent-deep sm:block">{formatKm(km, true)}</span>}
                  <div className={`w-full rounded-t-xs ${top ? 'bg-accent' : 'bg-surface-highest'}`} style={{ height: `${Math.max(4, (km / maxMonth) * 140)}px` }} title={`${formatKm(km)} km`} />
                  <span className="label-stamp text-[9px] text-ink-soft">{monthShort(i)}</span>
                </div>
              )
            })}
          </div>
          <div className="label-stamp mt-4 flex justify-between border-t border-surface-highest pt-3 text-ink-soft">
            <span>Pico anual: {monthShort(months.indexOf(Math.max(...months)))}</span>
            <span>
              Total {chartYear}: {formatKm(months.reduce((a, b) => a + b, 0))} km
            </span>
          </div>
        </section>

        <section className="card p-6">
          <div className="label-stamp text-ink-soft">Modalidades cinéticas</div>
          <h3 className="headline-md mt-1 uppercase">Desglose de transporte</h3>
          {stats.transport.length ? (
            <div className="mt-6 flex flex-wrap items-center gap-8">
              <Donut parts={stats.transport.map((t) => t.km)} label={formatKm(totalTransportKm, true)} />
              <ul className="min-w-[200px] flex-1 space-y-2.5 text-sm">
                {stats.transport.map((t, i) => (
                  <li key={t.mode} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT[i % DONUT.length] }} />
                      <Icon name={TRANSPORT[t.mode].icon} size={16} /> {TRANSPORT[t.mode].label}
                      {i === 0 && <span className="label-stamp bg-ink px-1.5 py-0.5 text-white">Favorito</span>}
                    </span>
                    <span className="label-code text-ink-soft">
                      {Math.round((t.km / totalTransportKm) * 100)}% ({formatKm(t.km, true)} km)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-ink-soft">Aún no hay tramos registrados.</p>
          )}
          <div className="label-stamp mt-6 flex justify-between border-t border-surface-highest pt-3 text-ink-soft">
            <span>{plural(stats.flights, 'vuelo', 'vuelos')}</span>
            <span className="text-accent-deep">{plural(stats.transport.find((t) => t.mode === 'train')?.legs ?? 0, 'tramo en tren', 'tramos en tren')}</span>
          </div>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PassportDocs passports={passports.data ?? []} />
        <section className="card p-6">
          <div className="label-stamp text-ink-soft">Terminales registradas</div>
          <h3 className="headline-md mt-1 uppercase">Aeropuertos</h3>
          {stats.airports.length ? (
            <ul className="mt-4 divide-y divide-surface-highest">
              {stats.airports.slice(0, 8).map(({ airport: a, visits }) => (
                <li key={a.iata} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-12 font-display font-bold">{a.iata}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {a.name} <span className="text-ink-soft">· {a.city}</span>
                  </span>
                  <Flag code={a.country_code} />
                  <span className="label-code w-8 text-right text-ink-soft">{visits}×</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-ink-soft">Los aeropuertos aparecen al registrar vuelos.</p>
          )}
        </section>
      </div>
    </div>
  )
}

function Big({ label, value, suffix, hint, accentHint }: { label: string; value: string | number; suffix?: string; hint: string; accentHint?: boolean }) {
  return (
    <div>
      <div className="label-stamp text-ink-soft">{label}</div>
      <div className="mt-1 font-display text-[40px] font-semibold leading-none tracking-tight">
        {value}
        {suffix && <span className="text-xl text-ink-soft">{suffix}</span>}
      </div>
      <div className={`mt-1 text-xs ${accentHint ? 'text-accent-deep' : 'text-ink-soft'}`}>{hint}</div>
    </div>
  )
}

const DONUT = ['#d53e00', '#1a1c1d', '#77777b', '#ffb59f', '#c7c6cb', '#852400', '#46464b']

function Donut({ parts, label }: { parts: number[]; label: string }) {
  const total = parts.reduce((a, b) => a + b, 0) || 1
  const r = 52
  const c = 2 * Math.PI * r
  // Inicio de cada sector del anillo.
  const starts = parts.reduce<number[]>((acc, p, i) => [...acc, acc[i] + (p / total) * c], [0])
  return (
    <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 -rotate-90">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#eeeeef" strokeWidth="14" />
      {parts.map((p, i) => {
        const len = (p / total) * c
        return <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={DONUT[i % DONUT.length]} strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-starts[i]} />
      })}
      <g className="rotate-90" style={{ transformOrigin: '70px 70px' }}>
        <text x="70" y="70" textAnchor="middle" className="fill-ink font-display text-[20px] font-bold">
          {label}
        </text>
        <text x="70" y="86" textAnchor="middle" className="fill-ink-soft text-[8px] tracking-widest">
          KM TOTALES
        </text>
      </g>
    </svg>
  )
}

function PassportDocs({ passports }: { passports: Passport[] }) {
  const qc = useQueryClient()
  const { list } = useCountries()
  const [draft, setDraft] = useState<Partial<Passport> | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const soon = new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10)
  const refresh = () => qc.invalidateQueries({ queryKey: ['passports'] })
  const { name } = useCountries()

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="label-stamp text-ink-soft">Documentación de viaje</div>
          <h3 className="headline-md mt-1 uppercase">Mis pasaportes</h3>
        </div>
        <button className="btn btn-ghost" onClick={() => setDraft({ country_code: '' })}>
          <Icon name="add" size={18} /> Añadir
        </button>
      </div>
      <ul className="mt-4 space-y-2">
        {passports.map((p) => {
          const status = !p.expires_on ? null : p.expires_on < today ? 'Caducado' : p.expires_on < soon ? 'Caduca pronto' : 'Vigente'
          return (
            <li key={p.id} className="flex items-center gap-3 rounded-sm bg-surface-low px-4 py-3">
              <Flag code={p.country_code} className="text-xl" />
              <div className="min-w-0 flex-1">
                <div className="font-display font-semibold">{name(p.country_code)}</div>
                <div className="text-xs text-ink-soft">
                  {p.issued_on && `Expedido ${formatDate(p.issued_on)} · `}Caduca {formatDate(p.expires_on) || '—'}
                </div>
              </div>
              {status && <span className={`label-stamp px-2 py-1 ${status === 'Vigente' ? 'bg-surface-container' : 'bg-accent-soft text-accent-ink'}`}>{status}</span>}
              <button onClick={() => setDraft(p)} aria-label="Editar">
                <Icon name="edit" size={18} />
              </button>
              <button
                onClick={async () => {
                  if (await ask({ title: '¿Eliminar este pasaporte?', confirm: 'Eliminar', danger: true })) {
                    await api.deletePassport(p.id)
                    refresh()
                  }
                }}
                aria-label="Eliminar"
                className="hover:text-red-700"
              >
                <Icon name="delete" size={18} />
              </button>
            </li>
          )
        })}
        {!passports.length && !draft && <li className="text-sm text-ink-soft">Añade tus pasaportes para controlar sus caducidades. Son privados aunque tu perfil sea público.</li>}
      </ul>
      {draft && (
        <form
          className="mt-4 grid grid-cols-1 gap-3 rounded-sm bg-surface-low p-4 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!draft.country_code) return
            await api.savePassport(draft as Passport)
            setDraft(null)
            refresh()
          }}
        >
          <select className="field py-2!" required value={draft.country_code} onChange={(e) => setDraft({ ...draft, country_code: e.target.value })}>
            <option value="">País emisor</option>
            {list.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <DateField variant="field" label="Expedido" placeholder="Elegir fecha" value={draft.issued_on ?? null} onChange={(d) => setDraft({ ...draft, issued_on: d })} />
          <DateField variant="field" label="Caduca" placeholder="Elegir fecha" value={draft.expires_on ?? null} onChange={(d) => setDraft({ ...draft, expires_on: d })} />
          <div className="flex gap-2 sm:col-span-3">
            <button className="btn btn-dark" type="submit">
              Guardar
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setDraft(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
