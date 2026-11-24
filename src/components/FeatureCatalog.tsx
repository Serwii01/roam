import { useState } from 'react'
import { FEATURE_COUNT, FEATURE_GROUPS, searchFeatures } from '../lib/featureCatalog'
import { Icon } from './Icon'

/** Todas las funciones de la app, con buscador e índice por temas. */
export function FeatureCatalog() {
  const [q, setQ] = useState('')
  const groups = searchFeatures(q)
  const found = groups.reduce((n, g) => n + g.items.length, 0)
  return (
    <section id="todo" className="mx-auto max-w-[1400px] px-4 pb-20 pt-8 md:px-12">
      <h2 className="headline-lg">Todo lo que hace ROAM</h2>
      <p className="mt-3 max-w-xl text-base text-ink-soft">{FEATURE_COUNT} funciones en {FEATURE_GROUPS.length} temas. Todas incluidas, todas gratis.</p>
      <label className="relative mt-6 block max-w-xl">
        <span className="sr-only">Buscar una función</span>
        <Icon name="search" size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
        <input type="search" className="field pl-11!" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca: sin conexión, gastos, PDF…" />
      </label>
      <p role="status" className="mt-2 min-h-6 text-ink-soft">
        {q.trim() ? (found ? `${found} ${found === 1 ? 'función' : 'funciones'}` : 'Nada con esas palabras. Prueba con otra.') : ''}
      </p>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
        <nav aria-label="Temas" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-0">
            {groups.map((g) => (
              <li key={g.id}>
                <a href={`#f-${g.id}`} className="flex min-h-10 items-center gap-2 rounded-full bg-surface-low px-3.5 text-ink-soft hover:text-ink lg:rounded-sm lg:bg-transparent lg:px-0">
                  <Icon name={g.icon} size={18} className="text-accent" /> {g.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-14">
          {groups.map((g) => (
            <div key={g.id} id={`f-${g.id}`} className="scroll-mt-24 border-t-2 border-ink pt-5">
              <h3 className="headline-md flex items-center gap-2.5">
                <Icon name={g.icon} size={26} className="text-accent" /> {g.title}
              </h3>
              <p className="mt-1 text-base text-ink-soft">{g.text}</p>
              <dl className="mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map(([name, text]) => (
                  <div key={name}>
                    <dt className="font-display text-[15px] font-semibold">{name}</dt>
                    <dd className="mt-0.5 text-ink-soft">{text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
