// Junta los avisos que van al móvil: si a alguien le tocan varios gastos del mismo viaje a la vez (al volver la conexión
// de un compañero, por ejemplo), le llega uno solo. Los pagos van siempre de uno en uno.
// En JavaScript porque lo usa la función de Vercel /api/push.
export function groupNotifications(rows) {
  const out = []
  const groups = new Map()
  for (const n of rows) {
    if (n.kind !== 'expenses' || !n.trip_id) {
      out.push(n)
      continue
    }
    const key = `${n.user_id}:${n.trip_id}`
    const g = groups.get(key)
    if (g) g.items.push(n)
    else {
      const slot = { items: [n] }
      groups.set(key, slot)
      out.push(slot)
    }
  }
  return out.map((x) => {
    if (!x.items) return x
    const [first] = x.items
    if (x.items.length === 1) return first
    return { ...first, title: `${x.items.length} cambios en los gastos`, body: x.items.slice(-3).map((n) => n.title).join('\n'), tag: `exp-trip-${first.trip_id}` }
  })
}
