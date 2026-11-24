// Muestras de la app para la portada, con datos inventados del viaje de ejemplo (Kioto). Son ilustraciones: no se
// pueden tocar y para los lectores de pantalla son una imagen con su descripción.
import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { Stamp } from './Stamp'
import { Flag } from './ui'

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="img" aria-label={label} className="min-w-0 rounded-lg bg-surface-low p-4 sm:p-8">
      <div aria-hidden className="mx-auto max-w-md space-y-3">
        {children}
      </div>
    </div>
  )
}

const DAY = [
  { time: '09:00', name: 'Fushimi Inari-taisha', icon: 'directions_subway', hop: '≈50 min en metro, bus o taxi' },
  { time: '12:30', name: 'Kinkaku-ji', icon: 'directions_walk', hop: '25 min andando · 1,8 km' },
  { time: '15:00', name: 'Ryōan-ji', icon: 'directions_walk', hop: '' },
]

/** Antes: un día del plan, con horas, trayectos y el tiempo. */
export function PlanPanel() {
  return (
    <Panel label="Ejemplo de un día del plan en Kioto: tres sitios con su hora y lo que se tarda entre ellos.">
      <div className="card p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink font-display font-bold text-paper">6</span>
          <div className="min-w-0 flex-1">
            <div className="headline-sm">Jueves · 17 oct</div>
            <div className="flex items-center gap-1.5 text-ink-soft">
              <Flag code="JP" /> Kioto
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-ink-soft">
            <Icon name="partly_cloudy_day" size={18} className="text-accent" /> 24°
          </span>
        </div>
        <ol className="mt-4">
          {DAY.map((s, i) => (
            <li key={s.name}>
              <div className="flex items-center gap-3 rounded-sm bg-surface-low px-3 py-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-white">{i + 1}</span>
                <span className="shrink-0 font-display text-xs font-bold text-ink-soft">{s.time}</span>
                <span className="min-w-0 truncate font-semibold">{s.name}</span>
              </div>
              {s.hop && (
                <div className="flex items-center gap-1.5 py-1.5 pl-4 text-xs text-ink-soft">
                  <Icon name={s.icon} size={15} /> {s.hop}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
      <div className="card flex items-center gap-3 p-4">
        <Icon name="flight_takeoff" size={22} className="shrink-0 text-accent" />
        <div className="min-w-0">
          <div className="font-semibold">Madrid → Tokio</div>
          <div className="text-xs text-ink-soft">12:35 · leído del correo de la reserva</div>
        </div>
      </div>
    </Panel>
  )
}

const DEBTS = [
  { who: 'Julia', what: 'te debe', amount: '45,20 €' },
  { who: 'Marcos', what: 'te debe', amount: '18,00 €' },
]

/** Durante: lo siguiente del día y las cuentas del grupo. */
export function TripPanel() {
  return (
    <Panel label="Ejemplo de la pantalla Hoy, con el siguiente sitio, y de las cuentas del grupo: te deben 63,20 euros.">
      <div className="rounded-md bg-night p-5 text-white">
        <div className="label-stamp text-white/70">Hoy · Lo siguiente</div>
        <div className="mt-2 font-display text-2xl font-bold tracking-tight">Kinkaku-ji</div>
        <div className="mt-1 text-white/70">A las 12:30 · Kioto</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="btn bg-white text-black">
            <Icon name="directions" size={18} /> Cómo llegar
          </span>
          <span className="btn border border-white/30">
            <Icon name="check" size={18} /> Ya lo he visto
          </span>
        </div>
      </div>
      <div className="card p-5">
        <div className="text-ink-soft">Te deben</div>
        <div className="font-display text-3xl font-bold tracking-tight">63,20 €</div>
        <ul className="mt-3 divide-y divide-surface-highest">
          {DEBTS.map((d) => (
            <li key={d.who} className="flex items-center justify-between gap-3 py-2.5">
              <span>
                <b>{d.who}</b> {d.what}
              </span>
              <span className="font-display font-semibold">{d.amount}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center gap-2 px-1 text-xs text-ink-soft">
        <Icon name="cloud_off" size={16} /> Sin conexión: 2 cambios guardados, se enviarán al volver la red
      </div>
    </Panel>
  )
}

const ALERTS = [
  { icon: 'payments', title: 'Julia ha apuntado un gasto', text: 'Cena en Gion · te tocan 21,50 €' },
  { icon: 'check_circle', title: 'Marcos ha confirmado tu pago', text: '18,00 € · Entradas' },
  { icon: 'train', title: 'Mañana, tren a Osaka', text: 'Sale a las 10:00' },
]

/** Juntos: quién va y los avisos del grupo. */
export function GroupPanel() {
  return (
    <Panel label="Ejemplo de un viaje con tres compañeros y sus avisos: un gasto nuevo, un pago confirmado y el tren de mañana.">
      <div className="card flex items-center gap-3 p-4">
        <div className="flex shrink-0 -space-x-2">
          {['JD', 'MR', 'TÚ'].map((x) => (
            <span key={x} className="grid h-10 w-10 place-items-center rounded-full border-2 border-card bg-ink font-display text-xs font-bold text-paper">
              {x}
            </span>
          ))}
        </div>
        <div className="min-w-0">
          <div className="font-semibold">Kioto, los tres</div>
          <div className="text-xs text-ink-soft">Todos podéis editar el viaje</div>
        </div>
      </div>
      <ul className="card divide-y divide-surface-highest px-4">
        {ALERTS.map((a) => (
          <li key={a.title} className="flex items-center gap-3 py-3.5">
            <Icon name={a.icon} size={22} className="shrink-0 text-accent" />
            <div className="min-w-0">
              <div className="font-semibold">{a.title}</div>
              <div className="text-xs text-ink-soft">{a.text}</div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/** Después: sellos y un recuerdo. */
export function MemoryPanel() {
  return (
    <Panel label="Ejemplo de tres sellos del pasaporte, de Japón, Islandia y Perú, y de un recuerdo de hace dos años.">
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-7 py-4">
        <Stamp stampKey="kioto-JP" countryCode="JP" countryName="Japón" place="Tokio" airport="HND" date="2024-10-13" />
        <Stamp stampKey="islandia-IS" countryCode="IS" countryName="Islandia" place="Reikiavik" airport="KEF" date="2024-08-03" />
        <Stamp stampKey="peru-PE" countryCode="PE" countryName="Perú" place="Lima" airport="LIM" date="2023-09-08" />
      </div>
      <div className="card flex items-center gap-3 p-4">
        <Icon name="history" size={24} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Hace 2 años llegabas a Kioto</div>
          <div className="text-xs text-ink-soft">Revive el viaje</div>
        </div>
        <Icon name="play_arrow" size={24} className="shrink-0" />
      </div>
    </Panel>
  )
}
