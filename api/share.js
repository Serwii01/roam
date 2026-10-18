// /u/:usuario, /u/:usuario/:viaje y /v/:token: la misma app, con las etiquetas de vista previa
// (Open Graph) de ese perfil o viaje, para que WhatsApp y compañía enseñen título, texto e imagen.
import { loadMeta } from './_meta.js'
export const config = { runtime: 'edge' }
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
export default async function handler(req) {
  const url = new URL(req.url)
  const kind = url.searchParams.get('k') ?? 'u'
  const id = url.searchParams.get('id') ?? ''
  const username = url.searchParams.get('u') ?? undefined
  const [htmlRes, meta] = await Promise.all([fetch(new URL('/index.html', url)), loadMeta(kind, id, username).catch(() => null)])
  let html = await htmlRes.text()
  if (meta) {
    const page = new URL(kind === 'v' ? `/v/${id}` : kind === 't' ? `/u/${username}/${id}` : `/u/${id}`, url).href
    const image = new URL(`/api/og?${new URLSearchParams({ k: kind, id, ...(username ? { u: username } : {}) })}`, url).href
    const tags = [
      ['og:type', kind === 'u' ? 'profile' : 'article'],
      ['og:site_name', 'ROAM'],
      ['og:title', meta.title],
      ['og:description', meta.description],
      ['og:url', page],
      ['og:image', image],
      ['og:image:width', '1200'],
      ['og:image:height', '630'],
      ['og:locale', 'es_ES'],
    ]
      .map(([p, c]) => `<meta property="${p}" content="${esc(c)}" />`)
      .concat(
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="description" content="${esc(meta.description)}" />`,
        meta.noindex ? `<meta name="robots" content="noindex" />` : '',
      )
      .join('\n    ')
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)
      .replace(/<meta name="description"[^>]*>/, '')
      .replace('</head>', `    ${tags}\n  </head>`)
  }
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' },
  })
}
