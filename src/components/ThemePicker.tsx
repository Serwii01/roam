import { setThemePref, useTheme, type ThemePref } from '../lib/theme'
import { Icon } from './Icon'

const OPTIONS: { id: ThemePref; label: string; icon: string }[] = [
  { id: 'system', label: 'Automático', icon: 'brightness_auto' },
  { id: 'light', label: 'Claro', icon: 'light_mode' },
  { id: 'dark', label: 'Oscuro', icon: 'dark_mode' },
]

/** Apariencia: la del dispositivo (por defecto) o siempre clara u oscura. Se guarda en este dispositivo. */
export function ThemePicker() {
  const { pref, theme } = useTheme()
  return (
    <div className="card mt-6 space-y-4 p-6" id="apariencia">
      <div>
        <div className="font-display font-semibold">Apariencia</div>
        <p className="text-sm text-ink-soft">
          {pref === 'system' ? `Sigue el tema de tu dispositivo (ahora ${theme === 'dark' ? 'oscuro' : 'claro'}).` : 'Se guarda en este dispositivo.'}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-md bg-surface-low p-1" role="radiogroup" aria-label="Tema">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={pref === o.id}
            onClick={() => setThemePref(o.id)}
            className={`flex flex-col items-center gap-1 rounded-sm px-2 py-2.5 text-sm font-semibold transition sm:flex-row sm:justify-center sm:gap-2 ${
              pref === o.id ? 'bg-card text-ink shadow-card ring-1 ring-outline-soft' : 'text-ink-soft hover:text-ink'
            }`}
          >
            <Icon name={o.icon} size={20} className={pref === o.id ? 'text-accent' : ''} />
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
