// Cuentas entre los compañeros de un viaje: reparto de cada gasto, saldos y quién paga a quién.
// En JavaScript (con tipos en balances.d.ts) porque lo usan la app y la función de Vercel /api/push, que recuerda las
// deudas pendientes: así el aviso y la pantalla dicen siempre lo mismo.

/** ¿Es un pago entre dos personas (o un cambio de efectivo) y no un gasto? */
export const isSettlement = (e) => e.category === 'settlement'

/**
 * Lo que le toca a cada persona de un gasto, en la moneda del viaje. `people`: todas las del viaje.
 * Sin reparto guardado (gastos de antes de poder elegirlo) se divide entre quienes tienen cuenta, como entonces:
 * así, añadir después a un compañero sin cuenta no cambia lo que ya estaba repartido.
 */
export function sharesOf(e, people) {
  const total = e.amount * e.rate
  const out = new Map()
  const split = (e.split ?? []).filter((x) => x.v > 0)
  const mode = e.split_mode ?? 'equal'
  if (!split.length || mode === 'equal') {
    const members = people.filter((k) => k.startsWith('u:'))
    const who = split.length ? split.map((x) => x.k) : members.length ? members : people
    for (const k of who) out.set(k, total / Math.max(1, who.length))
  } else if (mode === 'percent') {
    for (const x of split) out.set(x.k, (total * x.v) / 100)
  } else if (mode === 'amount') {
    for (const x of split) out.set(x.k, x.v * e.rate)
  } else {
    const sum = split.reduce((a, x) => a + x.v, 0)
    for (const x of split) out.set(x.k, (total * x.v) / sum)
  }
  return out
}

/** Lo pagado y lo que le toca a cada persona. Los pagos rechazados por quien los recibe no cuentan. */
export function balancesOf(expenses, people) {
  const paid = new Map(people.map((p) => [p, 0]))
  const owed = new Map(people.map((p) => [p, 0]))
  for (const e of expenses) {
    const payer = e.payer_key ?? (e.paid_by ? `u:${e.paid_by}` : null)
    if (!payer || e.payment_status === 'rejected') continue // sin «pagó» no entra en las cuentas
    paid.set(payer, (paid.get(payer) ?? 0) + e.amount * e.rate)
    for (const [k, v] of sharesOf(e, people)) owed.set(k, (owed.get(k) ?? 0) + v)
  }
  return { paid, owed }
}

/**
 * Saldo de cada persona redondeado al céntimo. El redondeo puede dejar algún céntimo suelto: se ajusta en el saldo
 * más grande, para que la suma siga siendo cero y no quede una deuda de 0,01 después de pagar.
 */
export function netBalances(paid, owed) {
  const keys = [...new Set([...paid.keys(), ...owed.keys()])]
  const cents = new Map(keys.map((k) => [k, Math.round(((paid.get(k) ?? 0) - (owed.get(k) ?? 0)) * 100)]))
  const rest = [...cents.values()].reduce((a, v) => a + v, 0)
  if (rest && Math.abs(rest) <= keys.length) {
    const big = keys.reduce((a, b) => (Math.abs(cents.get(b)) > Math.abs(cents.get(a)) ? b : a))
    cents.set(big, cents.get(big) - rest)
  }
  // «|| 0» convierte el −0 en 0.
  return new Map([...cents].map(([k, v]) => [k, v / 100 || 0]))
}

/** Quién paga a quién para quedar en paz, con el mínimo de pagos (de mayor deudor a mayor acreedor). */
export function settleBalances(paid, owed) {
  const balance = [...netBalances(paid, owed)].map(([p, v]) => ({ p, v }))
  const debtors = balance.filter((b) => b.v < -0.005).sort((a, b) => a.v - b.v)
  const creditors = balance.filter((b) => b.v > 0.005).sort((a, b) => b.v - a.v)
  const out = []
  for (const d of debtors) {
    let owe = -d.v
    for (const c of creditors) {
      if (owe < 0.005) break
      if (c.v < 0.005) continue
      const x = Math.min(owe, c.v)
      out.push({ from: d.p, to: c.p, amount: Math.round(x * 100) / 100 })
      owe -= x
      c.v -= x
    }
  }
  return out
}
