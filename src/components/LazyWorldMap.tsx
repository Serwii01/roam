import { lazy, Suspense, useEffect, useRef, useState, type ComponentProps } from 'react'
import type { WorldMap as WorldMapImpl } from './WorldMap'

// El motor de mapas (MapLibre, ~600 kB con su worker) va en su propio trozo: las páginas se pintan sin
// esperarlo y el mapa se descarga solo cuando está a punto de verse.
const Impl = lazy(() => import('./WorldMap').then((m) => ({ default: m.WorldMap })))

/** Precarga el motor de mapas (p. ej. al pasar el ratón por un enlace que lleva a un mapa). */
export const preloadMap = () => import('./WorldMap')

type Props = ComponentProps<typeof WorldMapImpl>

export function WorldMap(props: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])
  const placeholder = <div ref={ref} className={`animate-pulse rounded-md bg-surface-container ${props.className ?? ''}`} aria-hidden />
  if (!visible) return placeholder
  return (
    <Suspense fallback={<div className={`animate-pulse rounded-md bg-surface-container ${props.className ?? ''}`} aria-hidden />}>
      <Impl {...props} />
    </Suspense>
  )
}
