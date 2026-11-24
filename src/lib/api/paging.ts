// Supabase devuelve como mucho 1.000 filas por consulta (max_rows): la copia de datos tiene que leerlas todas.
export const PAGE = 1000

interface Page<T> {
  data: T[] | null
  error: { message: string } | null
}

/** Todas las filas de una consulta, página a página. La consulta debe llevar un orden fijo para no repetir ni saltar filas. */
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const rows: T[] = []
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < PAGE) return rows
  }
}

/** Trozos de 100: el máximo con el que se borran archivos de una vez. */
export function chunks<T>(list: T[], size = 100): T[][] {
  return Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size))
}
