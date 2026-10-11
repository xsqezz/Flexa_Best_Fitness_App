import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const barcode = '5901234123457'
const record = {
  food: {
    id: `off:${barcode}`, name: 'Płatki owsiane', brand: 'Test', barcode,
    source: 'open-food-facts', unit: 'g',
    nutrients: { kcal: 370, protein: null, carbs: null, fat: null, fiber: null },
  },
  requirements: [56], polishMarket: true,
  marketEvidence: { type: 'country-tag', value: 'en:poland' },
}
const catalog = {
  version: 1, updatedAt: '2026-10-11T16:00:00Z', license: 'ODbL-1.0',
  attribution: 'Open Food Facts contributors', source: 'https://query.openfoodfacts.org/find',
  country: 'en:poland', products: [record],
  coverage: Array.from({ length: 150 }, (_, index) => ({ id: index + 1, name: `Pozycja ${index}`, count: 0 })),
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog))))
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Polish market catalog lookup', () => {
  it('recognizes equivalent barcodes from the local export without querying a remote provider', async () => {
    const { findCatalogFoods } = await import('./catalog')
    expect(await findCatalogFoods({ barcode: `0${barcode}` })).toEqual([record.food])
    expect(await findCatalogFoods({ query: 'platki' })).toEqual([record.food])
    expect(fetch).toHaveBeenCalledOnce()
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/data/polish-products.json')
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]))
    expect(url.searchParams.get('v')).toBe('e'.repeat(64))
  })
  it('does not show foreign supplements from an older cached catalog', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      ...catalog,
      products: [record, {
        ...record, food: { ...record.food, id: 'off:4006381333931', barcode: '4006381333931' },
        polishMarket: false, marketEvidence: undefined,
      }],
    })))
    const { findCatalogFoods } = await import('./catalog')
    expect(await findCatalogFoods({ query: 'platki' })).toEqual([record.food])
    expect(await findCatalogFoods({ barcode: '4006381333931' })).toEqual([])
  })
  it('rejects fabricated market evidence and allows retry after a failed load', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      ...catalog, products: [{ ...record, marketEvidence: { type: 'purchase-place', value: 'USA' } }],
    })))
    const { findCatalogFoods } = await import('./catalog')
    await expect(findCatalogFoods({ barcode })).rejects.toThrow()
    expect(await findCatalogFoods({ barcode })).toEqual([record.food])
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
