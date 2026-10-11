import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { catalogSchema } from '../shared/catalog-schema'

export function expandedCatalogExample() {
  const data = catalogSchema.parse(JSON.parse(readFileSync(new URL('../app/public/data/polish-products.json', import.meta.url), 'utf8')))
  const record = data.products.find(({ food }) => food.barcode === '3083680592857')
  if (!record) throw new Error('Brak nowego kodu 3083680592857 w katalogu testowanym przed publikacją.')
  return record.food
}

export async function mockEmptyCatalog(page: Page) {
  await page.route('**/data/polish-products.json*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      version: 1, updatedAt: '2026-10-06T00:00:00Z', license: 'ODbL-1.0',
      attribution: 'Fixture', source: 'https://query.openfoodfacts.org/find', country: 'en:poland',
      products: [{ food: {
        id: 'off:036000291452', name: 'Unrelated fixture', brand: '', barcode: '036000291452',
        source: 'open-food-facts', unit: 'g', nutrients: { kcal: 10, protein: null, carbs: null, fat: null, fiber: null },
      }, requirements: [], polishMarket: false }],
      coverage: Array.from({ length: 150 }, (_, index) => ({ id: index + 1, name: `Fixture ${index}`, count: 0 })),
    }),
  }))
}
