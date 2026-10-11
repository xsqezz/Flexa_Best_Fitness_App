import { describe, expect, it } from 'vitest'
import { assessProduct, assessmentMethod, flexaProductScore, type ProductCategory } from '../../../shared/product-assessment'

const barcode = '3017620422003'
const product = () => ({
  code: barcode, product_name: 'Nutella', brands: 'Ferrero', ingredients_text_pl: 'Cukier, olej palmowy, orzechy, mleko.',
  allergens_tags: ['en:milk', 'en:nuts', 'en:milk'], traces_tags: ['en:soybeans'],
  nutriscore: {
    '2023': {
      grade: 'e', score: 31, nutriscore_computed: 1, nutriscore_applicable: 1,
      nutrients_available: 1, category_available: 1, estimated: 0, preparation: 'as_sold',
      data: {
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
    },
  },
})

describe('Flexa display scale v1', () => {
  it('uses the entire 1–100 range without stepping outside the source grade bands', () => {
    expect(flexaProductScore(-17, 'food')).toBe(100)
    expect(flexaProductScore(55, 'food')).toBe(1)
    expect([0, 1, 2, 3, 10, 11, 18, 19].map((value) => flexaProductScore(value, 'food'))).toEqual([81, 80, 61, 60, 41, 40, 21, 20])
    expect(flexaProductScore(31, 'food')).toBe(14)
  })

  it('is bounded and nonincreasing for every possible source score in each category', () => {
    for (const category of ['food', 'beverage', 'fats'] as ProductCategory[]) {
      let previous = 101
      for (let raw = category === 'beverage' ? -18 : -17; raw <= (category === 'beverage' ? 54 : 55); raw++) {
        const score = flexaProductScore(raw, category)
        expect(Number.isInteger(score)).toBe(true)
        expect(score).toBeGreaterThanOrEqual(1)
        expect(score).toBeLessThanOrEqual(100)
        expect(score).toBeLessThanOrEqual(previous)
        previous = score
      }
    }
  })

  it('applies the beverage and fats thresholds separately and reserves A for water among drinks', () => {
    expect(flexaProductScore(0, 'beverage', true)).toBe(100)
    expect(flexaProductScore(-18, 'beverage')).toBe(80)
    expect([2, 3, 6, 7, 9, 10, 54].map((raw) => flexaProductScore(raw, 'beverage'))).toEqual([61, 60, 41, 40, 21, 20, 1])
    expect([-6, -5, 2].map((raw) => flexaProductScore(raw, 'fats'))).toEqual([81, 80, 61])
  })

  it('rejects nonfinite, fractional and out-of-range scores', () => {
    for (const raw of [NaN, Infinity, -19, 56, 1.5]) expect(() => flexaProductScore(raw, 'food')).toThrow()
    expect(() => flexaProductScore(0, 'food', true)).toThrow()
  })
})

describe('assessment from public source data', () => {
  it('reads an actual 2023 response shape, with traceable factors and separate allergens', () => {
    const result = assessProduct(product(), barcode)
    expect(result).toMatchObject({
      name: 'Nutella', allergens: ['mleko', 'orzechy'], traces: ['soja'],
      rating: { method: assessmentMethod, score: 14, grade: 'e', rawScore: 31, category: 'food', estimated: false },
    })
    expect(result.rating?.negative.find((value) => value.name === 'Cukry')).toMatchObject({ points: 15, value: 56.3, unit: 'g' })
    expect(assessProduct(product(), `0${barcode}`).rating?.score).toBe(14)
  })

  it('shows missing rating instead of inferring a number from calories, old grades or ingredients', () => {
    for (const raw of [
      { code: barcode, nutriments: { 'energy-kcal_100g': 20 } },
      { code: barcode, nutriscore_grade: 'a', nutriscore_version: '2021' },
      { code: barcode, nutriscore: { '2021': product().nutriscore['2023'] } },
      { code: barcode, ingredients_text: 'Water, E300', nutriscore_grade: 'e' },
    ]) expect(assessProduct(raw, barcode).rating).toBeNull()
  })

  it.each(['nutriscore_computed', 'nutriscore_applicable', 'nutrients_available', 'category_available'])('refuses a missing/false %s flag', (key) => {
    const raw = product()
    const score = raw.nutriscore['2023']
    Object.assign(score, { [key]: 0 })
    expect(assessProduct(raw, barcode).rating).toBeNull()
    Reflect.deleteProperty(score, key)
    expect(assessProduct(raw, barcode).rating).toBeNull()
  })

  it('rejects inconsistent grade, source score, component sums and prepared-only data', () => {
    const grade = product(); grade.nutriscore['2023'].grade = 'a'
    const score = product(); score.nutriscore['2023'].score = 12
    const points = product(); points.nutriscore['2023'].data.components.negative[0].points = 5
    const prepared = product(); prepared.nutriscore['2023'].preparation = 'prepared'
    const impossible = product(); impossible.nutriscore['2023'].data.components.negative[0].points_max = 2
    for (const raw of [grade, score, points, prepared, impossible]) expect(assessProduct(raw, barcode).rating).toBeNull()
  })

  it('marks estimates and never promises allergen-free status or invents missing ingredients', () => {
    const raw = product()
    raw.nutriscore['2023'].estimated = 1
    expect(assessProduct(raw, barcode).rating?.estimated).toBe(true)
    const missing = assessProduct({ code: barcode }, barcode)
    expect(missing.ingredients).toBeNull()
    expect(missing.allergens).toEqual([])
    expect(missing.traces).toEqual([])
    expect(missing.rating).toBeNull()
  })

  it('ignores unrecognized factors, preserves zero values and rejects another product', () => {
    const raw = product()
    raw.nutriscore['2023'].data.components.positive.push({ id: 'mystery', points: 0, points_max: 5, value: 0, unit: 'g' })
    expect(assessProduct(raw, barcode).rating?.positive).toHaveLength(1)
    expect(assessProduct(raw, barcode).rating?.positive[0].value).toBe(0)
    expect(() => assessProduct({ ...product(), code: '4006381333931' }, barcode)).toThrow('nie pasuje')
    expect(() => assessProduct(product(), 'invalid')).toThrow('Nieprawidłowy')
  })
})
