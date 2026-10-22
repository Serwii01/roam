import type { StyleSpecification } from 'maplibre-gl'

import type { Theme } from './theme'

/** Mapa base moderno y en color (OpenFreeMap "Liberty", gratuito y sin API key); en modo oscuro, su estilo "Dark". */
const STYLE_URL: Record<Theme, string> = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
}

/** Colores de los mapas propios (países, regiones, rutas y puntos) en cada tema. */
export const MAP_COLORS: Record<Theme, { accent: string; ink: string; ocean: string; land: string; border: string; point: string }> = {
  light: { accent: '#d53e00', ink: '#1a1c1d', ocean: '#eef0f2', land: '#e6e5e1', border: '#ffffff', point: '#ffffff' },
  dark: { accent: '#f0571d', ink: '#ececee', ocean: '#16181b', land: '#2b2c30', border: '#111214', point: '#111214' },
}

const modern: Partial<Record<Theme, Promise<StyleSpecification>>> = {}

/**
 * Estilo Liberty adaptado: sin la capa ráster de relieve sombreado (≈2 MB de imágenes por vista que
 * no aportan a rutas y países) y con las etiquetas en español cuando OpenStreetMap las tiene.
 * Se descarga una vez y se reutiliza en todos los mapas.
 */
export function loadModernStyle(theme: Theme = 'light'): Promise<StyleSpecification> {
  modern[theme] ??= fetch(STYLE_URL[theme])
    .then((r) => {
      if (!r.ok) throw new Error(`Estilo ${theme}: ${r.status}`)
      return r
    })
    .then((r) => r.json() as Promise<StyleSpecification>)
    .then((style) => {
      const raster = new Set(Object.entries(style.sources).filter(([, s]) => s.type === 'raster').map(([id]) => id))
      for (const id of raster) delete style.sources[id]
      style.layers = style.layers
        .filter((l) => l.type !== 'raster' && !('source' in l && raster.has(l.source as string)))
        .map((l) =>
          l.type === 'symbol' && l.layout?.['text-field']
            ? { ...l, layout: { ...l.layout, 'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name:latin'], ['get', 'name']] } }
            : l,
        )
      return style
    })
    .catch((e) => {
      delete modern[theme]
      // Si el estilo oscuro no carga, mejor el claro que ningún mapa.
      if (theme === 'dark') return loadModernStyle('light')
      throw e
    })
  return modern[theme]!
}
