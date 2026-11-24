import { expect, test, type Page } from '@playwright/test'

/** La demo acepta cualquier email y contraseña. */
async function entrar(page: Page) {
  await page.goto('/entrar')
  await expect(page.getByText('Modo demo:')).toBeVisible()
  await page.locator('input[type=email]').fill('demo@example.test')
  await page.locator('input[type=password]').fill('demo-prueba')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForURL('**/app**')
}

const sinDesbordes = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)

test('la portada enseña el catálogo y su buscador filtra', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Todo lo que hace ROAM' })).toBeVisible()
  const total = await page.locator('#todo dt').count()
  await page.getByLabel('Buscar una función').fill('pdf')
  await expect.poll(() => page.locator('#todo dt').count()).toBeLessThan(total)
  await sinDesbordes(page)
})

test('el día a día carga el plan de Kioto', async ({ page }) => {
  await entrar(page)
  await page.goto('/app/viajes/kioto/editar?paso=dias')
  await expect(page.getByRole('link', { name: 'Fushimi Inari-taisha en Wikipedia' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Ideas en Kioto' }).first()).toBeVisible()
  await sinDesbordes(page)
})

test('la política de privacidad explica el historial de gastos', async ({ page }) => {
  await page.goto('/privacidad')
  await expect(page.getByText('Historial de gastos:')).toBeVisible()
})
