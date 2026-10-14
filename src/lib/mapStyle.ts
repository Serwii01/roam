import type { StyleSpecification } from 'maplibre-gl'

/** Mapa base moderno y en color (OpenFreeMap "Liberty", gratuito y sin API key). */
const LIBERTY = 'https://tiles.openfreemap.org/styles/liberty'

let modern: Promise<StyleSpecification> | null = null

/**
 * Estilo Liberty adaptado: sin la capa ráster de relieve sombreado (≈2 MB de imágenes por vista que
 * no aportan a rutas y países) y con las etiquetas en español cuando OpenStreetMap las tiene.
 * Se descarga una vez y se reutiliza en todos los mapas.
 */
export function loadModernStyle(): Promise<StyleSpecification> {
  modern ??= fetch(LIBERTY)
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
      modern = null
      throw e
    })
  return modern
}
