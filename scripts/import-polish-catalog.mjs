import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { catalogSchema } from '../shared/catalog-schema.ts'
import { normalizeOFF } from '../shared/food.ts'
import { matchingRequirements, polishPurchasePlaces, requiredProducts } from '../shared/polish-catalog.ts'

const exportSchema = z.object({
  products: z.array(z.unknown()).min(1),
  fetchedAt: z.iso.datetime({ offset: true }),
  source: z.literal('https://query.openfoodfacts.org/find'),
  reportedCount: z.number().int().positive().optional(),
  unavailableCodes: z.array(z.string()).default([]),
})
const tagsSchema = z.object({
  countries_tags: z.array(z.string()).default([]),
  purchase_places_tags: z.array(z.string()).default([]),
  categories_tags: z.array(z.string()).default([]),
})

export function buildPolishCatalog(input) {
  const raw = exportSchema.parse(input)
  if (new Set(raw.unavailableCodes).size !== raw.unavailableCodes.length
    || (raw.reportedCount !== undefined && raw.reportedCount !== raw.products.length + raw.unavailableCodes.length)) {
    throw new Error('Incomplete source export; the catalog was not replaced.')
  }
  const records = new Map()
  const excluded = { withoutPolishMarket: 0, invalidProduct: 0, duplicateBarcode: 0 }
  for (const product of raw.products) {
    const tags = tagsSchema.safeParse(product)
    const place = tags.success ? tags.data.purchase_places_tags.find((value) => polishPurchasePlaces.includes(value)) : undefined
    const marketEvidence = tags.success && tags.data.countries_tags.includes('en:poland')
      ? { type: 'country-tag', value: 'en:poland' }
      : place ? { type: 'purchase-place', value: place } : null
    if (!marketEvidence) {
      excluded.withoutPolishMarket++
      continue
    }
    const food = normalizeOFF(product)
    if (!food?.barcode) {
      excluded.invalidProduct++
      continue
    }
    // Zero-padded GTINs identify the same item, not additional products.
    const key = food.barcode.padStart(14, '0')
    if (records.has(key)) {
      excluded.duplicateBarcode++
      continue
    }
    const names = [food.name, product.product_name, product.product_name_pl, product.generic_name, product.generic_name_pl].filter(Boolean).join(' ')
    const requirements = matchingRequirements(names, food.brand, tags.data.categories_tags)
    records.set(key, { food, requirements, polishMarket: true, marketEvidence })
  }
  const products = [...records.values()].sort((a, b) => a.food.barcode.localeCompare(b.food.barcode))
  const counts = new Map()
  for (const { requirements } of products) {
    for (const id of requirements) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const result = {
    version: 1, updatedAt: raw.fetchedAt,
    license: 'ODbL-1.0', attribution: 'Open Food Facts contributors',
    source: raw.source, country: 'en:poland',
    selection: { countries_tags: 'en:poland', purchase_places_tags: [...polishPurchasePlaces] },
    statistics: {
      indexedRecords: raw.reportedCount ?? raw.products.length,
      sourceRecords: raw.products.length, unavailableRecords: raw.unavailableCodes.length,
      products: products.length, excluded,
      withEnergy: products.filter((record) => record.food.nutrients.kcal !== null).length,
      byMarketEvidence: {
        countryTag: products.filter((record) => record.marketEvidence.type === 'country-tag').length,
        purchasePlace: products.filter((record) => record.marketEvidence.type === 'purchase-place').length,
      },
    },
    products,
    coverage: requiredProducts.map((entry) => ({ id: entry.id, name: entry.name, count: counts.get(entry.id) ?? 0 })),
  }
  catalogSchema.parse(result)
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2]
  if (!input) throw new Error('Provide an official country-filtered export JSON path.')
  const result = buildPolishCatalog(JSON.parse(readFileSync(input, 'utf8')))
  const output = join('app', 'public', 'data', 'polish-products.json')
  mkdirSync(dirname(output), { recursive: true })
  const temporary = `${output}.tmp`
  writeFileSync(temporary, JSON.stringify(result))
  renameSync(temporary, output)
  console.log(JSON.stringify({
    output, ...result.statistics, covered: result.coverage.filter((entry) => entry.count > 0).length,
    required: result.coverage.length, missing: result.coverage.filter((entry) => entry.count === 0),
  }, null, 2))
}
