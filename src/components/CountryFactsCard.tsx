import { Icon } from './Icon'
import { COUNTRY_FACTS, needsAdapter, plugList } from '../lib/countryFacts'
import { currencyForCountry, currencyName } from '../lib/money'
import { EU_EEA } from '../lib/packing'

const VISA_INFO = 'https://www.exteriores.gob.es/es/ServiciosAlCiudadano/Paginas/Recomendaciones-de-viaje.aspx'

/** Lo práctico del país en el que se está: a quién llamar, qué enchufe usar y por dónde se conduce. */
export function CountryFactsCard({ country, countryName, home }: { country: string; countryName: string; home?: string | null }) {
  const facts = COUNTRY_FACTS[country]
  if (!facts || country === home) return null
  const adapter = needsAdapter(country, home)
  const currency = currencyForCountry(country)
  // Escrito como `icon: '…'` para que scripts/icons.mjs incluya cada icono en la fuente recortada.
  const rows = [
    { icon: 'emergency', label: 'Emergencias', value: facts.emergency },
    { icon: 'power', label: 'Enchufes', value: `Tipo ${plugList(facts.plugs)} · ${facts.volts} V${adapter === null ? '' : adapter ? ' · necesitas adaptador' : ' · no necesitas adaptador'}` },
    { icon: 'directions_car', label: 'Se conduce', value: facts.left ? 'Por la izquierda' : 'Por la derecha' },
    { icon: 'call', label: 'Prefijo', value: facts.dial },
    ...(currency ? [{ icon: 'payments', label: 'Moneda', value: `${currencyName(currency)} (${currency})` }] : []),
  ]

  return (
    <section className="card p-4">
      <h2 className="font-display font-semibold">Lo básico en {countryName}</h2>
      <dl className="mt-2 space-y-2 text-sm">
        {rows.map(({ icon, label, value }) => (
          <div key={label} className="flex gap-2">
            <Icon name={icon} size={18} className="mt-0.5 shrink-0 text-accent" />
            <div className="min-w-0">
              <dt className="text-xs text-ink-soft">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink-soft">
        Datos orientativos: confírmalos antes de depender de ellos.
        {home === 'ES' && !EU_EEA.has(country) && (
          <>
            {' '}
            Visados y requisitos de entrada, en las{' '}
            <a className="underline" href={VISA_INFO} target="_blank" rel="noreferrer">
              recomendaciones de Exteriores
            </a>
            .
          </>
        )}
      </p>
    </section>
  )
}
