import { useEffect, useState } from 'react'
import { KIND_LABEL, isShortSpotifyLink, parseSpotify, spotifyMeta, type SpotifyMeta } from '../lib/spotify'
import { Icon } from './Icon'

/**
 * Reproductor de Spotify. Hasta que se pulsa solo se ve una fachada propia: no se hace ninguna petición
 * a Spotify (ni título, ni portada, ni reproductor), así no se envía la IP del visitante sin que lo
 * pida (RGPD). Al pulsar se carga el reproductor real. `compact` = barra de 80 px (canción de una parada).
 */
export function SpotifyPlayer({ url, compact = false, className = '' }: { url: string | null | undefined; compact?: boolean; className?: string }) {
  const ref = parseSpotify(url)
  const [active, setActive] = useState(false)
  if (!ref) return null
  const height = compact || ref.kind === 'track' || ref.kind === 'episode' ? 80 : 152
  if (!active)
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        style={{ height }}
        className={`group flex w-full items-center gap-3 rounded-[12px] bg-[#121212] p-3 text-left text-white ${className}`}
        aria-label={`Escuchar ${KIND_LABEL[ref.kind].toLowerCase()} en Spotify`}
      >
        <span className="grid aspect-square h-full place-items-center rounded-md bg-white/10">
          <SpotifyLogo className="h-6 w-6 text-[#1DB954]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="label-stamp block text-white/60">{KIND_LABEL[ref.kind]} · Spotify</span>
          <span className="block truncate font-display font-semibold">Escuchar en Spotify</span>
          {!compact && <span className="block truncate text-xs text-white/50">Al pulsar se carga el reproductor de Spotify</span>}
        </span>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-black transition group-hover:scale-105">
          <Icon name="play_arrow" filled size={24} />
        </span>
      </button>
    )
  return (
    <iframe
      title={`Spotify · ${KIND_LABEL[ref.kind]}`}
      src={ref.embedUrl}
      width="100%"
      height={height}
      loading="lazy"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      className={`block rounded-[12px] border-0 ${className}`}
    />
  )
}

export function useSpotifyMeta(url: string | null | undefined) {
  const [meta, setMeta] = useState<SpotifyMeta | null>(null)
  useEffect(() => {
    const ref = parseSpotify(url)
    setMeta(null)
    if (!ref) return
    let alive = true
    spotifyMeta(ref).then((m) => alive && setMeta(m))
    return () => {
      alive = false
    }
  }, [url])
  return meta
}

/** Campo para pegar un enlace de Spotify, con validación y vista previa (título y portada). */
export function SpotifyField({
  value,
  onChange,
  placeholder = 'Pega un enlace de Spotify: playlist, álbum o canción',
  compact = false,
}: {
  value: string | null
  onChange: (url: string | null) => void
  placeholder?: string
  compact?: boolean
}) {
  const [text, setText] = useState(value ?? '')
  const [error, setError] = useState<string | null>(null)
  const meta = useSpotifyMeta(value)
  const ref = parseSpotify(value)

  useEffect(() => setText(value ?? ''), [value])

  const commit = () => {
    const t = text.trim()
    if (!t) {
      setError(null)
      if (value) onChange(null)
      return
    }
    const parsed = parseSpotify(t)
    if (!parsed) {
      setError(
        isShortSpotifyLink(t)
          ? 'Los enlaces cortos (spotify.link) no funcionan: ábrelo y copia el enlace de open.spotify.com.'
          : 'No parece un enlace de Spotify. En Spotify: ··· → Compartir → Copiar enlace.',
      )
      return
    }
    setError(null)
    setText(parsed.url)
    if (parsed.url !== value) onChange(parsed.url)
  }

  return (
    <div>
      <div className={`flex items-center gap-2 rounded-sm bg-surface-low px-3 ${compact ? '' : 'py-1'}`}>
        <SpotifyLogo className="h-5 w-5 shrink-0 text-[#1DB954]" />
        <input
          className="w-full bg-transparent py-2 text-sm outline-none"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commit())}
        />
        {value && (
          <button type="button" className="text-ink-soft hover:text-red-700" onClick={() => (setText(''), onChange(null))} aria-label="Quitar música">
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      {error && <div className="mt-1.5 text-xs text-red-700">{error}</div>}
      {ref && !compact && (
        <div className="mt-2 flex items-center gap-3 text-sm">
          {meta?.thumbnail && <img src={meta.thumbnail} alt="" className="h-10 w-10 rounded-xs object-cover" />}
          <span className="min-w-0">
            <span className="label-stamp block text-ink-soft">{KIND_LABEL[ref.kind]}</span>
            <span className="block truncate font-medium">{meta?.title ?? 'Enlace de Spotify'}</span>
          </span>
        </div>
      )}
    </div>
  )
}

export function SpotifyLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm5.5 17.3a.75.75 0 0 1-1 .25c-2.85-1.74-6.43-2.13-10.65-1.17a.75.75 0 1 1-.33-1.46c4.62-1.05 8.58-.6 11.74 1.33.36.22.47.69.25 1.05Zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.26-2-8.23-2.59-12.09-1.42a.94.94 0 1 1-.54-1.8c4.4-1.33 9.88-.69 13.61 1.61.44.27.58.85.31 1.3Zm.13-3.4C15.2 8.3 8.73 8.08 5 9.22a1.13 1.13 0 1 1-.66-2.16c4.28-1.3 11.4-1.05 15.9 1.62a1.13 1.13 0 0 1-1.15 1.95Z" />
    </svg>
  )
}
