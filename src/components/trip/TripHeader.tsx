import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../Icon'

/** Centra la pestaña en su barra sin mover la página (scrollIntoView también movería la página). */
export const centerTab = (el: HTMLElement | null) => {
  const bar = el?.parentElement
  if (el && bar) bar.scrollLeft = el.offsetLeft - bar.offsetLeft - (bar.clientWidth - el.clientWidth) / 2
}

/** Título editable con un toque (Enter guarda, Escape cancela). */
export function TitleEdit({ title, onSave }: { title: string; onSave: (t: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  useEffect(() => setValue(title), [title])
  const commit = () => {
    setEditing(false)
    const v = value.trim().slice(0, 120)
    if (v && v !== title) onSave(v)
    else setValue(title)
  }
  if (editing)
    return (
      <input
        aria-label="Nombre del viaje"
        className="display-hero w-full rounded-sm bg-card px-2 outline-none ring-2 ring-accent"
        value={value}
        maxLength={120}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setValue(title)
            setEditing(false)
          }
        }}
      />
    )
  // El lápiz va pegado a la última palabra para que no salte solo a otra línea.
  const words = title.split(' ')
  const last = words.pop()
  return (
    <h1 className="display-hero">
      <button type="button" onClick={() => setEditing(true)} className="group text-left" title="Cambiar el nombre">
        {words.length > 0 && `${words.join(' ')} `}
        <span className="whitespace-nowrap">
          {last}
          <Icon name="edit" size={22} className="ml-2 align-middle text-ink-soft opacity-40 transition group-hover:opacity-100" />
        </span>
      </button>
    </h1>
  )
}

export function MoreMenu({ tripId, owner, deleting, onDelete, onLeave }: { tripId: string; owner: boolean; deleting: boolean; onDelete: () => void; onLeave: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const item = 'flex w-full items-center gap-2 rounded-sm px-3 py-2.5 text-left text-sm hover:bg-surface-low'
  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn btn-ghost" aria-expanded={open} aria-label="Más opciones" onClick={() => setOpen(!open)}>
        <Icon name="more_horiz" size={18} /> <span className="hidden sm:inline">Más</span>
      </button>
      {/* En el móvil el botón puede quedar a la izquierda y un desplegable se saldría de la pantalla: va como hoja desde abajo. */}
      {open && <div className="fixed inset-0 z-40 bg-black/30 sm:hidden" onClick={() => setOpen(false)} />}
      {open && (
        <div
          className="card fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.18)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:mt-2 sm:w-64"
          role="menu"
        >
          <Link to={`/app/viajes/${tripId}/editar?paso=ruta`} className={item} role="menuitem">
            <Icon name="add_location_alt" size={18} /> Añadir o mover paradas
          </Link>
          <Link to={`/app/viajes/${tripId}/editar?paso=recuerdos`} className={item} role="menuitem">
            <Icon name="music_note" size={18} /> Notas, música y portada
          </Link>
          <Link to={`/app/viajes/${tripId}/editar`} className={item} role="menuitem">
            <Icon name="edit_note" size={18} /> Abrir el asistente completo
          </Link>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false)
              setTimeout(() => window.print(), 50)
            }}
          >
            <Icon name="picture_as_pdf" size={18} /> Exportar PDF
          </button>
          {owner && (
            <>
              <div className="my-1 h-px bg-surface-highest" />
              <button
                type="button"
                role="menuitem"
                disabled={deleting}
                className={`${item} text-red-700 hover:bg-red-50`}
                onClick={() => {
                  setOpen(false)
                  onDelete()
                }}
              >
                <Icon name="delete" size={18} /> {deleting ? 'Eliminando…' : 'Eliminar viaje'}
              </button>
            </>
          )}
          {!owner && (
            <>
              <div className="my-1 h-px bg-surface-highest" />
              <button
                type="button"
                role="menuitem"
                disabled={deleting}
                className={`${item} text-red-700 hover:bg-red-50`}
                onClick={() => {
                  setOpen(false)
                  onLeave()
                }}
              >
                <Icon name="logout" size={18} /> {deleting ? 'Quitando…' : 'Quitar de mi cuenta'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
