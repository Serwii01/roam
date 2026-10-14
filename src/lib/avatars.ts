/** Monigotes por defecto (public/avatars, generados por `npm run avatars`). */
export const AVATARS = Array.from({ length: 24 }, (_, i) => `/avatars/doodle-${String(i + 1).padStart(2, '0')}.svg`)

/** Avatar por defecto estable para cada usuario: el mismo monigote siempre, sin guardar nada. */
export function defaultAvatar(userId: string): string {
  let h = 0
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) | 0
  return AVATARS[Math.abs(h) % AVATARS.length]
}

export const avatarFor = (p: { id: string; avatar_url: string | null } | undefined | null) => (p ? p.avatar_url || defaultAvatar(p.id) : null)
