import countries from 'i18n-iso-countries'
import es from 'i18n-iso-countries/langs/es.json'
import type { FeatureCollection, Geometry } from 'geojson'

countries.registerLocale(es)

export const UN_COUNTRY_COUNT = 195

export function countryCodeFromName(name: string): string | undefined {
  return countries.getAlpha2Code(name, 'es') ?? countries.getAlpha2Code(name, 'en')
}

/** ISO alfa-3 (JPN, ISL…) para los sellos. */
export function alpha3(code: string): string {
  return countries.alpha2ToAlpha3(code) ?? code
}

export type ShapeProps = { code: string; name: string }
export type Shapes = FeatureCollection<Geometry, ShapeProps>

let world: Promise<Shapes> | null = null

/**
 * Polígonos de países (Natural Earth 1:50m) con `properties.code` ISO alfa-2, ya simplificados y
 * corregidos para el antimeridiano por `npm run data` (public/geo/world.json). Carga diferida y cacheable.
 */
export function loadWorldShapes(): Promise<Shapes> {
  world ??= fetch('/geo/world.json')
    .then((r) => r.json() as Promise<Shapes>)
    .catch((e) => {
      world = null
      throw e
    })
  return world
}

const regionCache = new Map<string, Promise<Shapes | null>>()

/** Regiones/provincias de un país (Natural Earth admin-1), generadas por `npm run data`. */
export function loadRegionShapes(countryCode: string): Promise<Shapes | null> {
  if (!regionCache.has(countryCode)) {
    regionCache.set(
      countryCode,
      fetch(`/geo/regions/${countryCode}.json`).then((r) => (r.ok ? (r.json() as Promise<Shapes>) : null)),
    )
  }
  return regionCache.get(countryCode)!
}
