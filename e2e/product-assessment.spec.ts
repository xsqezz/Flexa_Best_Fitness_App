import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockEmptyCatalog } from './catalog-fixture'

const code = '3017620422003'
const scoredProduct = () => ({
  code, product_name: 'Nutella', brands: 'Ferrero',
  nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, fiber_100g: 0 },
  nutrition: { aggregated_set: { per: '100g', preparation: 'as_sold', nutrients: {
    'energy-kcal': { value: 539, unit: 'kcal' }, proteins: { value: 6.3, unit: 'g' },
    carbohydrates: { value: 57.5, unit: 'g' }, fat: { value: 30.9, unit: 'g' },
  } } },
  ingredients_text_pl: 'Cukier, olej palmowy, orzechy laskowe, mleko.',
  allergens_tags: ['en:milk', 'en:nuts'], traces_tags: ['en:soybeans'],
  nutriscore: { '2023': {
    grade: 'e', score: 31, nutriscore_computed: 1, nutriscore_applicable: 1, nutrients_available: 1, category_available: 1,
    preparation: 'as_sold', estimated: 0, data: {
      is_beverage: 0, is_water: 0, is_fat_oil_nuts_seeds: 0, negative_points: 31, positive_points: 0,
      components: {
        negative: [
          { id: 'energy', points: 6, points_max: 10, value: 2252, unit: 'kJ' },
          { id: 'sugars', points: 15, points_max: 15, value: 56.3, unit: 'g' },
          { id: 'saturated_fat', points: 10, points_max: 10, value: 10.6, unit: 'g' },
          { id: 'salt', points: 0, points_max: 20, value: 0.11, unit: 'g' },
        ],
        positive: [{ id: 'fiber', points: 0, points_max: 5, value: 0, unit: 'g' }],
      },
    },
  } },
})

async function openScanner(page: Page) {
  await page.goto('/demo')
  await expect(page.getByRole('heading', { name: 'Cele', level: 1, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Dodaj', exact: true }).first().click()
  await page.getByRole('dialog', { name: 'Dodaj' }).getByRole('button', { name: /^Skanuj kod kreskowy/ }).click()
  const drawer = page.getByRole('dialog', { name: 'Dodaj posiłek' })
  await drawer.getByLabel('Kod EAN lub UPC').fill(code)
  await drawer.getByRole('button', { name: 'Szukaj', exact: true }).click()
  return drawer
}

const mealCount = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('flexa:demo:v1')!).meals.length as number)
test.beforeEach(async ({ page }) => { await mockEmptyCatalog(page) })

test('barcode rating explains the actual score, ingredients and allergens without logging food', async ({ page }, testInfo) => {
  let requests = 0
  await page.route('https://world.openfoodfacts.org/**', (route) => {
    requests++
    return route.fulfill({ json: { product: scoredProduct() } })
  })
  const drawer = await openScanner(page)
  const before = await mealCount(page)
  const assessment = drawer.getByRole('region', { name: 'Ocena produktu' })
  await expect(assessment.getByLabel('Ocena Flexa: 14 na 100')).toBeVisible()
  await expect(assessment).toContainText('Nutri-Score E')
  await expect(assessment).toContainText('nie bezpieczeństwa')
  await page.screenshot({ path: testInfo.outputPath('barcode-rating.png') })
  await assessment.locator('summary').click()
  await expect(assessment).toContainText('Cukry')
  await expect(assessment).toContainText('56,3 g')
  await expect(assessment).toContainText('mleko, orzechy')
  await expect(assessment).toContainText('Może zawierać: soja')
  await expect(assessment).toContainText('A → 81–100')
  await expect(assessment.getByRole('link')).toHaveAttribute('href', `https://world.openfoodfacts.org/product/${code}`)
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(axe.violations.map((value) => ({ id: value.id, nodes: value.nodes.map((node) => node.target) }))).toEqual([])
  expect(await mealCount(page)).toBe(before)
  expect(requests).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await drawer.getByRole('button', { name: /Nutella.*539 kcal/ }).click()
  await expect(page.getByRole('dialog').getByLabel('Ocena Flexa: 14 na 100')).toBeVisible()
  await page.getByRole('dialog').getByLabel('Porcja (g)', { exact: true }).fill('20')
  await page.getByRole('dialog').getByRole('button', { name: 'Dodaj do dziennika' }).click()
  await expect.poll(() => mealCount(page)).toBe(before + 1)
  expect(requests).toBe(1)
})

test('a product with incomplete or old scoring data stays unrated and is still usable', async ({ page }) => {
  const { nutriscore: _, ...withoutScore } = scoredProduct()
  await page.route('https://world.openfoodfacts.org/**', (route) => route.fulfill({
    json: { product: { ...withoutScore, nutriscore_grade: 'a', nutriscore_version: '2021', allergens_tags: [] } },
  }))
  const drawer = await openScanner(page)
  const assessment = drawer.getByRole('region', { name: 'Ocena produktu' })
  await expect(assessment.getByText('Brak oceny', { exact: true })).toBeVisible()
  await expect(assessment.locator('.assessment-score')).toHaveCount(0)
  await assessment.locator('summary').click()
  await expect(assessment).toContainText('to nie potwierdza ich braku')
  await expect(drawer.getByRole('button', { name: /Nutella.*539 kcal/ })).toBeEnabled()
})

test('provider outages are explicit and can be retried without inventing a rating', async ({ page }) => {
  let down = true
  await page.route('https://world.openfoodfacts.org/**', (route) => route.fulfill(down
    ? { status: 503, json: {} } : { json: { product: scoredProduct() } }))
  const drawer = await openScanner(page)
  await expect(drawer.getByText(/Nie udało się sprawdzić oceny/)).toBeVisible()
  await expect(drawer.locator('.assessment-score')).toHaveCount(0)
  down = false
  await drawer.getByRole('button', { name: 'Ponów sprawdzenie oceny' }).click()
  await expect(drawer.getByLabel('Ocena Flexa: 14 na 100')).toBeVisible()
  await expect(drawer.getByRole('alert')).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: /Nutella.*539 kcal/ })).toBeVisible()
})

test('not found and wrong barcode responses never show an unrelated product rating', async ({ page }) => {
  await page.route('https://world.openfoodfacts.org/**', (route) => route.fulfill({ status: 404, json: {} }))
  const drawer = await openScanner(page)
  await expect(drawer.getByText(/Brak oceny — tego kodu nie ma/)).toBeVisible()
  await expect(drawer.locator('.assessment-score')).toHaveCount(0)
  await drawer.getByLabel('Kod EAN lub UPC').fill('4006381333931')
  await page.route('https://world.openfoodfacts.org/**', (route) => route.fulfill({ json: { product: scoredProduct() } }))
  await drawer.getByRole('button', { name: 'Szukaj', exact: true }).click()
  await expect(drawer.getByText(/Nie udało się sprawdzić oceny/)).toBeVisible()
  await expect(drawer.getByRole('region', { name: 'Ocena produktu' })).toHaveCount(0)
})

test('camera decoding automatically opens the rating and stops the camera', async ({ page }) => {
  await page.addInitScript((barcode) => {
    let stopped = 0
    Object.defineProperty(window, 'cameraStops', { get: () => stopped })
    Object.defineProperty(window, 'BarcodeDetector', { value: class {
      static async getSupportedFormats() { return ['ean_13'] }
      async detect() { return [{ rawValue: barcode }] }
    } })
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 160; canvas.height = 100
      canvas.getContext('2d')?.fillRect(0, 0, 160, 100)
      const stream = canvas.captureStream(10)
      for (const track of stream.getTracks()) {
        const original = track.stop.bind(track)
        track.stop = () => { stopped++; original() }
      }
      return stream
    } })
  }, code)
  await page.route('https://world.openfoodfacts.org/**', (route) => route.fulfill({ json: { product: scoredProduct() } }))
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Dodaj', exact: true }).first().click()
  await page.getByRole('dialog', { name: 'Dodaj' }).getByRole('button', { name: /^Skanuj kod kreskowy/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Skanuj aparatem' }).click()
  await expect(page.getByRole('dialog').getByLabel('Ocena Flexa: 14 na 100')).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, 'cameraStops'))).toBeGreaterThan(0)
  await expect(page.getByRole('dialog').locator('video')).toHaveCount(0)
})
