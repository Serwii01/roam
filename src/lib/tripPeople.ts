// Las personas entre las que se reparten los gastos de un viaje.
import type { Expense, TripMember } from './db'

/** Una persona del reparto: con cuenta ('u:<id>') o compañero añadido a mano ('g:<nombre>'). */
export interface Person {
  key: string
  name: string
  me: boolean
  guest: boolean
  avatar: { id: string; avatar_url: string | null; display_name?: string | null; username?: string }
}

/** Participantes con cuenta más los compañeros sin cuenta (sin repetir a quien ya está por nombre). */
export function tripPeople(members: TripMember[], companions: string[], me: string): Person[] {
  const out: Person[] = members.map((m) => ({
    key: `u:${m.user_id}`,
    name: m.user_id === me ? 'Tú' : m.display_name || m.username,
    me: m.user_id === me,
    guest: false,
    avatar: { id: m.user_id, avatar_url: m.avatar_url, display_name: m.display_name, username: m.username },
  }))
  const taken = new Set(members.flatMap((m) => [m.display_name, m.username].filter(Boolean).map((n) => n!.trim().toLowerCase())))
  for (const raw of companions) {
    const name = raw.trim().slice(0, 80)
    if (!name || taken.has(name.toLowerCase())) continue
    taken.add(name.toLowerCase())
    out.push({ key: `g:${name}`, name, me: false, guest: true, avatar: { id: `g:${name}`, avatar_url: null, display_name: name } })
  }
  return out
}
/** Quién pagó, como clave de persona (los gastos antiguos solo guardan la cuenta). */
export const payerOf = (e: Expense) => e.payer_key ?? (e.paid_by ? `u:${e.paid_by}` : null)
