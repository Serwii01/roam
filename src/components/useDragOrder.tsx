import { useRef, useState } from 'react'
import { Icon } from './Icon'

/**
 * Arrastrar para reordenar una lista, con ratón o con el dedo (pointer events), desde un asa. El elemento
 * sigue al puntero y los demás se apartan para dejarle hueco; al soltar se guarda el nuevo orden. Con
 * teclado, flechas arriba y abajo sobre el asa. Lo usan las paradas de la ruta y los sitios del día a día.
 * `item`: los elementos de la lista (dentro de `list`); `card`: dentro de cada uno, la parte cuyo centro decide
 * dónde cae (por defecto, el elemento entero).
 */
export function useDragOrder(count: number, onMove: (from: number, to: number) => void, { item = ':scope > li', card }: { item?: string; card?: string } = {}) {
  const list = useRef<HTMLOListElement>(null)
  const [state, setState] = useState<{ from: number; to: number; dy: number; h: number } | null>(null)
  const info = useRef<{ startY: number; scroll0: number; mids: number[] } | null>(null)

  const handle = (i: number) =>
    count > 1 ? (
      <button
        type="button"
        aria-label="Arrastrar para cambiar el orden"
        title="Arrastra para cambiar el orden"
        className="-ml-1 grid h-10 w-7 shrink-0 cursor-grab touch-none place-items-center self-center rounded-xs text-ink-soft hover:bg-surface-container hover:text-ink active:cursor-grabbing"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          const items = [...(list.current?.querySelectorAll<HTMLElement>(item) ?? [])]
          // El centro de cada tarjeta (en la ruta, sin el tramo de transporte de encima) decide dónde cae.
          const cards = items.map((el) => (card ? el.querySelector<HTMLElement>(card) : null) ?? el)
          info.current = {
            startY: e.clientY,
            scroll0: scrollY,
            mids: cards.map((el) => {
              const r = el.getBoundingClientRect()
              return r.top + scrollY + r.height / 2
            }),
          }
          setState({ from: i, to: i, dy: 0, h: items[i]?.getBoundingClientRect().height ?? 0 })
        }}
        onPointerMove={(e) => {
          const d = info.current
          if (!d || !state) return
          // Desplaza la página si se arrastra cerca del borde (útil en el móvil).
          if (e.clientY < 90) scrollBy(0, -12)
          else if (e.clientY > innerHeight - 90) scrollBy(0, 12)
          const dy = e.clientY - d.startY + (scrollY - d.scroll0)
          const y = d.mids[state.from] + dy
          let to = 0
          d.mids.forEach((m, j) => j !== state.from && m < y && to++)
          setState({ ...state, to, dy })
        }}
        onPointerUp={() => {
          if (state && state.to !== state.from) onMove(state.from, state.to)
          info.current = null
          setState(null)
        }}
        onPointerCancel={() => {
          info.current = null
          setState(null)
        }}
        onKeyDown={(e) => {
          // Con teclado: flechas arriba y abajo.
          const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1
          if (to >= 0 && to < count) {
            e.preventDefault()
            onMove(i, to)
          }
        }}
      >
        <Icon name="drag_indicator" size={20} />
      </button>
    ) : null

  const style = (i: number): React.CSSProperties | undefined => {
    if (!state) return undefined
    const { from, to, dy, h } = state
    if (i === from) return { transform: `translateY(${dy}px)` }
    if (from < to && i > from && i <= to) return { transform: `translateY(${-h}px)` }
    if (from > to && i < from && i >= to) return { transform: `translateY(${h}px)` }
    return undefined
  }

  return { list, state, handle, style }
}
