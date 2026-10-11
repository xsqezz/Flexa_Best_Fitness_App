import { z } from 'zod'
import { isValidBarcode, sameBarcode } from './domain.ts'

export const assessmentMethod = 'flexa-nutriscore-2023-v1'
export type ProductGrade = 'a' | 'b' | 'c' | 'd' | 'e'
export type ProductCategory = 'food' | 'beverage' | 'fats'

export const gradeDescriptions: Record<ProductGrade, string> = {
  a: 'Bardzo korzystny profil odżywczy',
  b: 'Korzystny profil odżywczy',
  c: 'Pośredni profil odżywczy',
  d: 'Mniej korzystny profil odżywczy',
  e: 'Najmniej korzystny profil odżywczy',
}

const componentNames: Record<string, string> = {
  energy: 'Energia',
  energy_from_saturated_fat: 'Energia z tłuszczów nasyconych',
  sugars: 'Cukry',
  saturated_fat: 'Tłuszcze nasycone',
  saturated_fat_ratio: 'Udział tłuszczów nasyconych',
  salt: 'Sól',
  non_nutritive_sweeteners: 'Substancje słodzące w napoju',
  fiber: 'Błonnik',
  proteins: 'Białko',
  fruits_vegetables_legumes: 'Owoce, warzywa i strączki',
}

const allergenNames: Record<string, string> = {
  'en:gluten': 'gluten', 'en:milk': 'mleko', 'en:eggs': 'jaja', 'en:fish': 'ryby',
  'en:peanuts': 'orzeszki ziemne', 'en:nuts': 'orzechy', 'en:soybeans': 'soja',
  'en:celery': 'seler', 'en:mustard': 'gorczyca', 'en:sesame-seeds': 'sezam',
  'en:crustaceans': 'skorupiaki', 'en:molluscs': 'mięczaki', 'en:lupin': 'łubin',
  'en:sulphur-dioxide-and-sulphites': 'dwutlenek siarki i siarczyny',
}

export type AssessmentFactor = { name: string; points: number; value: number | null; unit: string }
export type ProductAssessment = {
  barcode: string
  name: string
  brand: string
  ingredients: string | null
  allergens: string[]
  traces: string[]
  rating: {
    method: typeof assessmentMethod
    score: number
    grade: ProductGrade
    rawScore: number
    category: ProductCategory
    estimated: boolean
    negative: AssessmentFactor[]
    positive: AssessmentFactor[]
  } | null
}

const flag = z.union([z.literal(0), z.literal(1), z.boolean()])
const component = z.object({
  id: z.string().max(80),
  points: z.number().int().min(0).max(55),
  points_max: z.number().int().min(0).max(55),
  value: z.number().finite().nonnegative().nullable().optional(),
  unit: z.string().max(12).optional(),
}).refine((value) => value.points <= value.points_max)

const updatedScore = z.object({
  grade: z.enum(['a', 'b', 'c', 'd', 'e']),
  score: z.number().int().min(-18).max(55),
  nutriscore_computed: flag,
  nutriscore_applicable: flag,
  nutrients_available: flag,
  category_available: flag,
  estimated: flag.optional(),
  preparation: z.literal('as_sold'),
  data: z.object({
    is_beverage: flag,
    is_water: flag,
    is_fat_oil_nuts_seeds: flag,
    negative_points: z.number().int().min(0).max(55),
    positive_points: z.number().int().min(0).max(55),
    components: z.object({
      negative: z.array(component).max(10),
      positive: z.array(component).max(10),
    }),
  }),
})

/** Flexa's display scale, not an official Nutri-Score percentage. Each grade occupies a separate 20-point band. */
export function flexaProductScore(rawScore: number, category: ProductCategory, water = false): number {
  const minimumScore = category === 'beverage' ? -18 : -17
  const maximumScore = category === 'beverage' ? 54 : 55
  if (!Number.isInteger(rawScore) || rawScore < minimumScore || rawScore > maximumScore) throw new Error('Nieprawidłowy wynik Nutri-Score.')
  if (water && category !== 'beverage') throw new Error('Nieprawidłowa kategoria wody.')
  if (water) return 100
  const intervals = category === 'beverage'
    ? [[-18, 2, 61, 80], [3, 6, 41, 60], [7, 9, 21, 40], [10, 54, 1, 20]]
    : category === 'fats'
      ? [[-17, -6, 81, 100], [-5, 2, 61, 80], [3, 10, 41, 60], [11, 18, 21, 40], [19, 55, 1, 20]]
      : [[-17, 0, 81, 100], [1, 2, 61, 80], [3, 10, 41, 60], [11, 18, 21, 40], [19, 55, 1, 20]]
  const band = intervals.find(([low, high]) => rawScore >= low && rawScore <= high)
  if (!band) throw new Error('Nieprawidłowy zakres oceny.')
  const [low, high, minimum, maximum] = band
  return Math.round(maximum - (rawScore - low) / (high - low) * (maximum - minimum))
}

function gradeFor(raw: number, category: ProductCategory, water: boolean): ProductGrade {
  if (water) return 'a'
  if (category === 'beverage') return raw <= 2 ? 'b' : raw <= 6 ? 'c' : raw <= 9 ? 'd' : 'e'
  return raw <= (category === 'fats' ? -6 : 0) ? 'a' : raw <= 2 ? 'b' : raw <= 10 ? 'c' : raw <= 18 ? 'd' : 'e'
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null
}

function allergens(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((value): value is string => typeof value === 'string')
    .slice(0, 30).map((value) => allergenNames[value] ?? value.replace(/^[a-z]{2}:/, '').replaceAll('-', ' ').slice(0, 80)))]
}

const points = (values: z.infer<typeof component>[]) => values.reduce((sum, value) => sum + value.points, 0)
const factors = (values: z.infer<typeof component>[]): AssessmentFactor[] => values
  .filter((value) => value.id in componentNames)
  .map((value) => ({ name: componentNames[value.id], points: value.points, value: value.value ?? null, unit: value.unit ?? '' }))

/** Rejects older algorithms, missing inputs, inconsistent scores and wrong products instead of inventing a health rating. */
export function assessProduct(raw: unknown, barcode: string): ProductAssessment {
  if (!isValidBarcode(barcode)) throw new Error('Nieprawidłowy kod kreskowy.')
  const product = z.record(z.string(), z.unknown()).safeParse(raw)
  if (!product.success || typeof product.data.code !== 'string' || !sameBarcode(product.data.code, barcode)) {
    throw new Error('Odpowiedź bazy nie pasuje do zeskanowanego produktu.')
  }
  const entry = product.data
  const code = entry.code
  const versions = z.record(z.string(), z.unknown()).safeParse(entry.nutriscore)
  const parsed = updatedScore.safeParse(versions.success ? versions.data['2023'] : null)
  let rating: ProductAssessment['rating'] = null
  if (parsed.success) {
    const score = parsed.data
    const data = score.data
    const category = data.is_beverage ? 'beverage' : data.is_fat_oil_nuts_seeds ? 'fats' : 'food'
    const water = Boolean(data.is_water)
    if (score.nutriscore_computed && score.nutriscore_applicable && score.nutrients_available && score.category_available
      && score.score >= (category === 'beverage' ? -18 : -17) && score.score <= (category === 'beverage' ? 54 : 55)
      && (!water || category === 'beverage')
      && !(data.is_beverage && data.is_fat_oil_nuts_seeds)
      && score.grade === gradeFor(score.score, category, water)
      && score.score === data.negative_points - data.positive_points
      && points(data.components.negative) === data.negative_points && points(data.components.positive) === data.positive_points) {
      rating = {
        method: assessmentMethod,
        score: flexaProductScore(score.score, category, water),
        grade: score.grade, rawScore: score.score, category,
        estimated: Boolean(score.estimated),
        negative: factors(data.components.negative), positive: factors(data.components.positive),
      }
    }
  }
  return {
    barcode: typeof code === 'string' ? code : barcode,
    name: text(entry.product_name_pl, 200) ?? text(entry.product_name, 200) ?? 'Produkt z kodu',
    brand: text(entry.brands, 100) ?? '',
    ingredients: text(entry.ingredients_text_pl, 4000) ?? text(entry.ingredients_text, 4000),
    allergens: allergens(entry.allergens_tags), traces: allergens(entry.traces_tags), rating,
  }
}
