import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { polishPurchasePlaces } from '../shared/polish-catalog.ts'

const source = 'https://query.openfoodfacts.org/find'
const headers = {
  'Content-Type': 'application/json',
  'User-Agent': 'Flexa/0.1 (+https://github.com/xsqezz/flexa.click)',
}
const filters = [
  { countries_tags: 'en:poland' },
  { countries_tags: { $nin: ['en:poland'] }, purchase_places_tags: { $in: [...polishPurchasePlaces] } },
]
const projection = Object.fromEntries([
  'code', 'product_name', 'product_name_pl', 'generic_name', 'generic_name_pl',
  'brands', 'countries_tags', 'purchase_places_tags', 'categories_tags', 'nutriments', 'nutrition',
].map((field) => [field, true]))

export async function fetchPolishCatalog(request = fetch) {
  async function post(url, body) {
    const response = await request(url, {
      method: 'POST', headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    })
    if (!response.ok) throw new Error(`Open Food Facts export failed (${response.status}): ${url}`)
    return response.json()
  }
  async function find(query) {
    const products = await post(source, query)
    if (!Array.isArray(products) || products.some((product) => typeof product?.code !== 'string')) {
      throw new Error('Invalid product export response.')
    }
    return products
  }
  const products = []
  const queries = []
  const unavailableCodes = []
  let reportedCount = 0
  for (const filter of filters) {
    const count = await post('https://query.openfoodfacts.org/count', filter)
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid source product count.')
    if (count === 0) continue
    const index = await find({ filter, projection: { code: true }, limit: count + 1 })
    const codes = new Set(index.map((product) => product.code))
    if (index.length !== count || codes.size !== count) throw new Error('The source index changed; retry the export.')
    const query = { filter, projection, limit: count + 1 }
    const records = await find(query)
    const returned = new Set()
    for (const product of records) {
      if (!codes.has(product.code) || returned.has(product.code)) throw new Error('The source records changed; retry the export.')
      returned.add(product.code)
    }
    const missing = [...codes].filter((code) => !returned.has(code))
    // The warehouse index can retain deleted documents. Verify each missing
    // code directly before distinguishing unavailable records from truncation.
    if (missing.length) {
      const recovered = await find({ filter: { code: { $in: missing } }, projection, limit: missing.length + 1 })
      for (const product of recovered) {
        if (!missing.includes(product.code) || returned.has(product.code)) throw new Error('Invalid recovery export.')
        returned.add(product.code)
        records.push(product)
      }
      unavailableCodes.push(...missing.filter((code) => !returned.has(code)))
    }
    products.push(...records)
    queries.push({ ...query, indexedCount: count, exportedCount: records.length })
    reportedCount += count
  }
  if (!products.length) throw new Error('The source export is empty.')
  return { source, fetchedAt: new Date().toISOString(), reportedCount, unavailableCodes, queries, products }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2]
  if (!output) throw new Error('Provide an output path for the official country-filtered export.')
  const data = await fetchPolishCatalog()
  if (data.unavailableCodes.length) {
    console.warn(`The source index contains ${data.unavailableCodes.length} unavailable documents; their codes are listed in the saved export.`)
  }
  mkdirSync(dirname(output), { recursive: true })
  const temporary = `${output}.tmp`
  writeFileSync(temporary, JSON.stringify(data))
  renameSync(temporary, output)
  console.log(JSON.stringify({ output, indexed: data.reportedCount, products: data.products.length, unavailable: data.unavailableCodes.length, fetchedAt: data.fetchedAt }))
}
