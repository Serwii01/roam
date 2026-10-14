// Spotify gratis y sin claves: reproductor embebido (open.spotify.com/embed) y oEmbed para el título
// y la portada. Con sesión de Spotify en el navegador se oyen las canciones completas; sin sesión,
// el reproductor reproduce avances de 30 s.

export type SpotifyKind = 'track' | 'album' | 'playlist' | 'artist' | 'episode' | 'show'

export interface SpotifyRef {
  kind: SpotifyKind
  id: string
  /** URL canónica que se guarda en la base de datos. */
  url: string
  embedUrl: string
}

const KINDS: SpotifyKind[] = ['track', 'album', 'playlist', 'artist', 'episode', 'show']

export const KIND_LABEL: Record<SpotifyKind, string> = {
  track: 'Canción',
  album: 'Álbum',
  playlist: 'Playlist',
  artist: 'Artista',
  episode: 'Episodio',
  show: 'Podcast',
}

/**
 * Acepta enlaces de open.spotify.com (también con /intl-es/ y parámetros) y URIs spotify:tipo:id.
 * Los enlaces cortos spotify.link no se pueden resolver desde el navegador.
 */
export function parseSpotify(input: string | null | undefined): SpotifyRef | null {
  const s = (input ?? '').trim()
  if (!s) return null
  let kind: string | undefined
  let id: string | undefined
  const uri = s.match(/^spotify:([a-z]+):([A-Za-z0-9]{22})$/)
  if (uri) [, kind, id] = uri
  else {
    try {
      const u = new URL(s)
      if (u.hostname !== 'open.spotify.com') return null
      const parts = u.pathname.split('/').filter(Boolean).filter((p) => !p.startsWith('intl-') && p !== 'embed')
      ;[kind, id] = parts
    } catch {
      return null
    }
  }
  if (!kind || !id || !KINDS.includes(kind as SpotifyKind) || !/^[A-Za-z0-9]{22}$/.test(id)) return null
  return {
    kind: kind as SpotifyKind,
    id,
    url: `https://open.spotify.com/${kind}/${id}`,
    embedUrl: `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator&theme=0`,
  }
}

export const isShortSpotifyLink = (s: string) => /^https?:\/\/spotify\.link\//.test(s.trim())

export interface SpotifyMeta {
  title: string
  thumbnail?: string
}

const metaCache = new Map<string, Promise<SpotifyMeta | null>>()

/** Título y portada vía oEmbed (público, sin API key, con CORS). */
export function spotifyMeta(ref: SpotifyRef): Promise<SpotifyMeta | null> {
  if (!metaCache.has(ref.url)) {
    metaCache.set(
      ref.url,
      fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(ref.url)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { title?: string; thumbnail_url?: string } | null) => (j?.title ? { title: j.title, thumbnail: j.thumbnail_url } : null))
        .catch(() => null),
    )
  }
  return metaCache.get(ref.url)!
}
