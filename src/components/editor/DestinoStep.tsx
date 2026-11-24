import { Field, today, type Draft } from './common'
import { useState } from 'react'
import { DateRangeField } from '../DatePicker'
import { Icon } from '../Icon'
import type { TripStyle } from '../../lib/db'
import { TRIP_STYLES } from '../../lib/transport'

/** `canStatus`: en un viaje compartido, solo quien lo creó decide si está realizado o planificado. */
export function DestinoStep({ draft, update, canStatus }: { draft: Draft; update: (p: Partial<Draft>) => void; canStatus: boolean }) {
  const [mate, setMate] = useState('')
  const planned = draft.status === 'planned'
  const now = today()
  const addMate = () => {
    const name = mate.trim()
    if (name && !draft.companions?.includes(name)) update({ companions: [...(draft.companions ?? []), name], solo: false })
    setMate('')
  }
  const future = canStatus && !planned && !!draft.start_date && draft.start_date > now
  const past = canStatus && planned && !!(draft.end_date ?? draft.start_date) && (draft.end_date ?? draft.start_date)! < now

  return (
    <div className="space-y-8">
      <Field label="¿Ya lo has hecho?" hint={canStatus ? undefined : 'Lo decide quien creó el viaje'}>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['done', 'task_alt', 'Ya lo hice', 'Cuenta en tu mapa, tu pasaporte y tus sellos.'],
              ['planned', 'event_upcoming', 'Lo estoy planeando', 'Va a tus planes. No cuenta como visitado hasta que lo hagas.'],
            ] as const
          ).map(([v, icon, title, text]) => {
            const on = draft.status === v
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                disabled={!canStatus}
                onClick={() => update({ status: v })}
                className={`flex items-start gap-3 rounded-md border-2 p-4 text-left transition disabled:cursor-not-allowed ${on ? 'border-accent bg-accent-soft/40' : 'border-surface-highest enabled:hover:border-outline disabled:opacity-50'}`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${on ? 'bg-accent text-white' : 'bg-surface-low text-ink-soft'}`}>
                  <Icon name={icon} />
                </span>
                <span>
                  <span className="block font-display font-semibold">{title}</span>
                  <span className="block text-sm text-ink-soft">{text}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Nombre del viaje">
        <input
          className="field font-display text-lg"
          maxLength={120}
          value={draft.title}
          placeholder={planned ? 'Verano en Japón' : 'Ruta por la Toscana'}
          onChange={(e) => update({ title: e.target.value })}
        />
      </Field>

      <Field label="Fechas" hint="Opcional">
        <DateRangeField start={draft.start_date ?? null} end={draft.end_date ?? null} onChange={(s, e) => update({ start_date: s, end_date: e })} />
        {future && (
          <Suggestion icon="event_upcoming" text="Estas fechas aún no han llegado. ¿Es un viaje que estás planeando?" action="Sí, es un plan" onClick={() => update({ status: 'planned' })} />
        )}
        {past && <Suggestion icon="task_alt" text="Las fechas ya pasaron. ¿Hiciste este viaje?" action="Sí, ya lo hice" onClick={() => update({ status: 'done' })} />}
      </Field>

      <Field label="Tipo de viaje" hint="Opcional">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TRIP_STYLES) as TripStyle[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={draft.style === s}
              onClick={() => update({ style: draft.style === s ? null : s })}
              className={`btn ${draft.style === s ? 'btn-dark' : 'bg-surface-low hover:bg-surface-container'}`}
            >
              <Icon name={TRIP_STYLES[s].icon} size={18} /> {TRIP_STYLES[s].label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="¿Con quién?" hint="Para editar juntos, invítales desde la bitácora del viaje">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={!!draft.solo}
            onClick={() => update({ solo: !draft.solo, companions: draft.solo ? draft.companions : [] })}
            className={`btn ${draft.solo ? 'btn-dark' : 'bg-surface-low hover:bg-surface-container'}`}
          >
            <Icon name="person" size={18} /> En solitario
          </button>
          {draft.companions?.map((c) => (
            <span key={c} className="flex items-center gap-2 rounded-full bg-surface-low py-1 pl-1 pr-2 text-sm">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-[10px] font-bold text-paper">
                {c
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              {c}
              <button type="button" className="grid h-7 w-7 place-items-center rounded-full hover:bg-surface-container" onClick={() => update({ companions: draft.companions?.filter((x) => x !== c) })} aria-label={`Quitar a ${c}`}>
                <Icon name="close" size={16} />
              </button>
            </span>
          ))}
          {!draft.solo && (
            <span className="flex items-center gap-1 rounded-full border border-dashed border-outline px-3 py-1.5 text-sm">
              <Icon name="person_add" size={16} />
              <input
                className="w-40 bg-transparent outline-none"
                placeholder="Nombre y Enter"
                value={mate}
                onChange={(e) => setMate(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMate()}
                onBlur={addMate}
              />
            </span>
          )}
        </div>
      </Field>

      <Field label="Descripción" hint="Una frase que lo resuma">
        <textarea
          className="field min-h-24 resize-y"
          value={draft.description ?? ''}
          placeholder={planned ? 'Templos, ramen y onsen. Volar a Tokio y bajar en tren hasta Osaka.' : 'El silencio de los bosques de bambú al amanecer.'}
          onChange={(e) => update({ description: e.target.value || null })}
        />
      </Field>
    </div>
  )
}

function Suggestion({ icon, text, action, onClick }: { icon: string; text: string; action: string; onClick: () => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-sm bg-accent-soft/50 px-4 py-3 text-sm text-accent-ink">
      <Icon name={icon} size={18} />
      <span className="flex-1">{text}</span>
      <button type="button" className="btn btn-dark py-1.5!" onClick={onClick}>
        {action}
      </button>
    </div>
  )
}
