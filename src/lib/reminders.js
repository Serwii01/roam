// Recordatorios de cada mañana sobre los gastos de los viajes en grupo. En JavaScript porque los calcula la función de
// Vercel /api/push, con las mismas cuentas que la app (balances.js).
import { balancesOf, isSettlement, netBalances, settleBalances } from './balances.js'

const DAY = 86_400_000
const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY)
/** Días después de terminar el viaje en los que se recuerda una deuda. Sin insistir más. */
const DEBT_DAYS = [1, 4, 10, 30]
const money = (n, currency) => new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(n).replace(/\u00a0/g, ' ')

/**
 * Avisos del día `today` (AAAA-MM-DD). `list`: [{ trip, users, expenses, budget }].
 *  · Deudas: 1, 4, 10 y 30 días después de terminar, a quien debe dinero.
 *  · Pagos sin confirmar: a quien los recibe, a los 2 y a los 7 días.
 *  · Gastos de ayer: durante el viaje, si ayer nadie apuntó nada y el grupo ya usa los gastos.
 * Con las cuentas cerradas no se recuerda nada.
 */
export function reminders(list, today) {
  const out = []
  for (const { trip, users, expenses, budget } of list) {
    if (users.length < 2 || budget?.closed_at) continue
    const url = `/app/viajes/${trip.id}?tab=gastos`
    const add = (user_id, tag, title, body, link = url) => out.push({ user_id, trip_id: trip.id, kind: 'reminders', title, body, url: link, tag })

    for (const e of expenses) {
      if (!isSettlement(e) || e.payment_status !== 'pending') continue
      const to = e.split?.[0]?.k?.replace(/^u:/, '')
      const age = days(e.created_at.slice(0, 10), today)
      if (users.includes(to) && (age === 2 || age === 7)) add(to, `confirm-${e.id}`, `¿Has recibido ${money(e.amount * e.rate, budget?.currency ?? 'EUR')}?`, `Tienes un pago por confirmar · ${trip.title}`, `${url}&ver=saldos`)
    }

    const since = trip.end_date ? days(trip.end_date, today) : null
    if (since !== null && DEBT_DAYS.includes(since)) {
      const people = [...users.map((u) => `u:${u}`), ...(trip.companions ?? []).map((n) => `g:${n.trim().slice(0, 80)}`)]
      const { paid, owed } = balancesOf(expenses, people)
      const net = netBalances(paid, owed)
      const transfers = settleBalances(paid, owed)
      for (const u of users) {
        const bal = net.get(`u:${u}`) ?? 0
        if (bal > -0.005) continue
        const n = transfers.filter((t) => t.from === `u:${u}`).length
        add(u, `debt-${trip.id}`, `Te queda por pagar ${money(-bal, budget?.currency ?? 'EUR')}`, `${n === 1 ? 'Un pago' : `${n} pagos`} para quedar en paz · ${trip.title}`, `${url}&ver=saldos`)
      }
    }

    const day = trip.start_date ? days(trip.start_date, today) : -1
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - DAY).toISOString().slice(0, 10)
    // Desde el tercer día (el primero suele ser el vuelo) y hasta el día de vuelta.
    if (day >= 2 && since !== null && since <= 0 && expenses.length && !expenses.some((e) => e.spent_on === yesterday))
      for (const u of users) add(u, `daily-${trip.id}`, '¿Falta algún gasto de ayer?', `Ayer no se apuntó nada en «${trip.title}». Toca para añadirlo.`, `${url}&nuevo=1`)
  }
  return out
}
