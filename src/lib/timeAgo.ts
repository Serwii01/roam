/** «ahora», «hace 5 min», «hace 3 h», «ayer» o la fecha. */
export function timeAgo(iso: string, now = Date.now()): string {
  const min = Math.floor((now - Date.parse(iso)) / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const day = (t: number) => new Date(t).setHours(0, 0, 0, 0)
  const days = Math.round((day(now) - day(Date.parse(iso))) / 86_400_000)
  if (days === 0) return `hace ${Math.floor(min / 60)} h`
  if (days === 1) return 'ayer'
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(days > 300 ? { year: 'numeric' } : {}) })
}
