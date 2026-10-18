// Imagen de vista previa (1200×630) de un perfil público o un viaje compartido, con @vercel/og.
import { ImageResponse } from '@vercel/og'
import { loadMeta, type Kind } from './_meta.ts'

export const config = { runtime: 'edge' }

type Node = { type: string; props: Record<string, unknown> }
const h = (type: string, style: Record<string, unknown>, ...children: (Node | string)[]): Node => ({
  type,
  props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children },
})

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const meta = await loadMeta((url.searchParams.get('k') ?? 'u') as Kind, url.searchParams.get('id') ?? '', url.searchParams.get('u') ?? undefined).catch(() => null)
  const heading = meta?.heading ?? 'ROAM'
  const tree = h(
    'div',
    { width: '100%', height: '100%', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', background: '#111214', color: '#fff', fontFamily: 'sans-serif' },
    h(
      'div',
      { alignItems: 'center', justifyContent: 'space-between', width: '100%' },
      h('div', { alignItems: 'center', fontSize: 36, fontWeight: 700, letterSpacing: 2 }, h('div', { width: 18, height: 18, borderRadius: 9, background: '#ff5a1f', marginRight: 16 }), 'ROAM'),
      h('div', { fontSize: 24, color: '#ff5a1f', letterSpacing: 4 }, (meta?.noindex ? 'VIAJE COMPARTIDO' : 'MAPA DE VIAJES') as string),
    ),
    h(
      'div',
      { flexDirection: 'column' },
      h('div', { fontSize: heading.length > 28 ? 64 : 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, maxWidth: 1050 }, heading),
      h('div', { fontSize: 32, color: '#a3a6ab', marginTop: 18 }, meta?.sub ?? 'Registra tus viajes, rutas, países y sellos.'),
    ),
    h(
      'div',
      { width: '100%' },
      ...(meta?.stats ?? [{ label: 'Gratis', value: 'Tu mapa' }]).map((s) =>
        h('div', { flexDirection: 'column', marginRight: 72 }, h('div', { fontSize: 72, fontWeight: 700, letterSpacing: -2 }, s.value), h('div', { fontSize: 22, color: '#a3a6ab', letterSpacing: 4 }, s.label.toUpperCase())),
      ),
    ),
  )
  return new ImageResponse(tree as never, {
    width: 1200,
    height: 630,
    headers: { 'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
