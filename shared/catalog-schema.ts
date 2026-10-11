import { z } from 'zod'
import { foodSchema } from './domain.ts'
import { polishPurchasePlaces } from './polish-catalog.ts'

export const polishMarketEvidenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('country-tag'), value: z.literal('en:poland') }),
  z.object({ type: z.literal('purchase-place'), value: z.enum(polishPurchasePlaces) }),
])

export const catalogSchema = z.object({
  version: z.literal(1),
  updatedAt: z.iso.datetime({ offset: true }),
  license: z.literal('ODbL-1.0'),
  attribution: z.string().min(1),
  source: z.url(),
  country: z.literal('en:poland'),
  products: z.array(z.object({
    food: foodSchema,
    requirements: z.array(z.number().int().min(1).max(150)),
    polishMarket: z.boolean(),
    marketEvidence: polishMarketEvidenceSchema.optional(),
  })).min(1),
  coverage: z.array(z.object({ id: z.number().int(), name: z.string(), count: z.number().int().nonnegative() })).length(150),
})
