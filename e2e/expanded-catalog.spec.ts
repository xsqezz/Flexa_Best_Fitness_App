import { test, expect } from '@playwright/test'
import { openAdd } from './add'
import { expandedCatalogExample } from './catalog-fixture'

const code = '3083680592857'
const pagesOrigin = `http://127.0.0.1:${process.env.PLAYWRIGHT_PAGES_ONLY === '1' ? 4175 : 4174}`

for (const [label, address] of [['web demo', '/demo'], ['Pages demo', `${pagesOrigin}/app/#/demo`]]) {
  test(`${label}: expanded catalogue matches the new product by name and barcode`, async ({ page }) => {
    const { name } = expandedCatalogExample()
    const foodResult = page.getByRole('dialog').locator('.food-result').filter({ has: page.getByText(name, { exact: true }) })
    const catalogRequests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/data/polish-products.json')) catalogRequests.push(request.url())
    })
    await page.route('https://world.openfoodfacts.org/**', (route) => route.fulfill({ status: 404, json: {} }))
    await page.goto(address)
    await expect(page.getByRole('heading', { name: 'Cele', exact: true, level: 1 })).toBeVisible()
    await openAdd(page, 'Posiłek')
    const drawer = page.getByRole('dialog')
    await drawer.getByRole('textbox', { name: 'Nazwa produktu', exact: true }).fill(name)
    await drawer.getByRole('button', { name: 'Szukaj', exact: true }).click()
    await expect(foodResult).toBeVisible()
    await expect(foodResult).toContainText('28 kcal')
    expect(catalogRequests).toHaveLength(1)
    expect(new URL(catalogRequests[0]).searchParams.get('v')).toMatch(/^[a-f0-9]{64}$/)
    await drawer.getByRole('button', { name: 'Kod kreskowy', exact: true }).click()
    await drawer.getByLabel('Kod EAN lub UPC').fill(code)
    await drawer.getByRole('button', { name: 'Szukaj', exact: true }).click()
    await foodResult.click()
    await expect(drawer.getByRole('heading', { name, exact: true })).toBeVisible()
    await drawer.getByLabel('Porcja (g)', { exact: true }).fill('200')
    await expect(drawer.locator('.portion-totals')).toContainText('56 kcal')
    expect(catalogRequests).toHaveLength(1)
  })
}
