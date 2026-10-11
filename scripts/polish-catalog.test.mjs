import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchPolishCatalog } from './fetch-polish-catalog.mjs'
import { buildPolishCatalog } from './import-polish-catalog.mjs'

const product = {
  code: '5901234123457', product_name_pl: 'Płatki owsiane', brands: 'Test',
  countries_tags: ['en:poland'], categories_tags: ['en:oat-flakes'],
  nutriments: { 'energy-kcal_100g': 370 },
}
const second = { ...product, code: '4006381333931', product_name_pl: 'Drugi produkt' }
const provenance = { source: 'https://query.openfoodfacts.org/find', fetchedAt: '2026-10-11T16:00:00Z' }
const input = (products, extra = {}) => ({ ...provenance, products, ...extra })

function mockRequests(responses) {
  const calls = []
  const request = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body), headers: options.headers })
    assert.ok(responses.length, 'unexpected export request')
    return new Response(JSON.stringify(responses.shift()), { headers: { 'Content-Type': 'application/json' } })
  }
  return { request, calls }
}

test('exports all country-filtered records instead of a fixed-size sample', async () => {
  const { request, calls } = mockRequests([2, [{ code: product.code }, { code: second.code }], [product, second], 0])
  const raw = await fetchPolishCatalog(request)
  assert.equal(raw.reportedCount, 2)
  assert.deepEqual(raw.products, [product, second])
  assert.deepEqual(raw.unavailableCodes, [])
  assert.equal(calls[2].body.limit, 3)
  assert.deepEqual(calls[2].body.filter, { countries_tags: 'en:poland' })
  assert.match(calls[2].headers['User-Agent'], /Flexa/)
})

test('recovers documents omitted from a bulk response by their exact codes', async () => {
  const { request, calls } = mockRequests([2, [{ code: product.code }, { code: second.code }], [product], [second], 0])
  const raw = await fetchPolishCatalog(request)
  assert.deepEqual(raw.products, [product, second])
  assert.deepEqual(raw.unavailableCodes, [])
  assert.deepEqual(calls[3].body.filter, { code: { $in: [second.code] } })
})

test('records unavailable warehouse documents explicitly after an exact-code retry', async () => {
  const { request } = mockRequests([2, [{ code: product.code }, { code: second.code }], [product], [], 0])
  const raw = await fetchPolishCatalog(request)
  assert.deepEqual(raw.unavailableCodes, [second.code])
  assert.equal(raw.reportedCount, raw.products.length + raw.unavailableCodes.length)
  assert.equal(buildPolishCatalog(raw).statistics.unavailableRecords, 1)
})

test('rejects a truncated or changing source index', async () => {
  const { request } = mockRequests([2, [{ code: product.code }]])
  await assert.rejects(fetchPolishCatalog(request), /source index changed/)
})

test('rejects unrelated or duplicate documents instead of inflating the export', async () => {
  const { request } = mockRequests([1, [{ code: product.code }], [second]])
  await assert.rejects(fetchPolishCatalog(request), /source records changed/)
  const duplicate = mockRequests([1, [{ code: product.code }], [product, product]])
  await assert.rejects(fetchPolishCatalog(duplicate.request), /source records changed/)
})

test('fails explicitly on provider errors and malformed responses', async () => {
  await assert.rejects(fetchPolishCatalog(async () => new Response('', { status: 503 })), /failed \(503\)/)
  await assert.rejects(fetchPolishCatalog(mockRequests(['2']).request), /Invalid source product count/)
  await assert.rejects(fetchPolishCatalog(mockRequests([1, {}]).request), /Invalid product export/)
  await assert.rejects(fetchPolishCatalog(mockRequests([0, 0]).request), /source export is empty/)
})

test('does not infer Polish availability from a GS1 prefix, Polish name, brand or manufacture', () => {
  const foreign = { ...product, countries_tags: ['en:united-states'], origins_tags: ['en:poland'] }
  const unknown = { ...product, countries_tags: undefined, purchase_places_tags: ['Warsaw', 'Lidl'] }
  const data = buildPolishCatalog(input([second, foreign, unknown]))
  assert.deepEqual(data.products.map((record) => record.food.barcode), [second.code])
  assert.equal(data.statistics.excluded.withoutPolishMarket, 2)
})

test('accepts an explicit Polish purchase country and preserves that evidence separately', () => {
  const purchased = { ...second, countries_tags: ['en:germany'], purchase_places_tags: ['Polska'] }
  const data = buildPolishCatalog(input([product, purchased]))
  assert.deepEqual(data.statistics.byMarketEvidence, { countryTag: 1, purchasePlace: 1 })
  assert.deepEqual(data.products.find((record) => record.food.barcode === second.code).marketEvidence,
    { type: 'purchase-place', value: 'Polska' })
  assert.ok(data.products.every((record) => record.polishMarket))
})

test('validates checksums, keeps unknown energy unknown, and deduplicates equivalent GTINs', () => {
  const data = buildPolishCatalog(input([
    product, { ...product, code: `0${product.code}` },
    { ...product, code: '5901234123458' },
    { ...second, nutriments: {} },
    { ...product, product_name_pl: '' },
  ]))
  assert.equal(data.products.length, 2)
  assert.deepEqual(data.statistics.excluded, { withoutPolishMarket: 0, invalidProduct: 2, duplicateBarcode: 1 })
  assert.equal(data.statistics.withEnergy, 1)
  assert.equal(data.products.find((record) => record.food.barcode === second.code).food.nutrients.kcal, null)
  for (const entry of data.coverage) {
    assert.equal(entry.count, data.products.filter((record) => record.requirements.includes(entry.id)).length)
  }
})

test('requires valid provenance and accounts for every source record', () => {
  assert.throws(() => buildPolishCatalog(input([product], { source: 'https://example.com' })))
  assert.throws(() => buildPolishCatalog(input([product], { fetchedAt: 'not a date' })))
  assert.throws(() => buildPolishCatalog(input([product], { reportedCount: 2 })), /Incomplete source export/)
  assert.throws(() => buildPolishCatalog(input([{ ...product, countries_tags: [] }])))
})
