import { z } from "zod";

// Financial-safety note that applies to every schema below: suggested_unit_price_cents
// (and any other number an AI feature ever returns) is a SUGGESTION only. It
// is never written to the database directly — the user reviews/edits it in
// the UI, and then the existing create_quote_with_items / create_invoice_with_items
// RPCs (Phase 4/5) do the actual, authoritative calculation. Nothing here is
// ever treated as a computed total, tax, or document number.

export const quoteDraftItemSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().positive().max(1000),
  suggested_unit_price_cents: z.number().int().nonnegative().nullable(),
  tax_rate: z.number().min(0).max(100),
});

export const quoteDraftSchema = z.object({
  items: z.array(quoteDraftItemSchema).min(1).max(30),
  notes: z.string().max(1000).nullable(),
  terms: z.string().max(1000).nullable(),
});
export type QuoteDraft = z.infer<typeof quoteDraftSchema>;

export const improveDescriptionSchema = z.object({
  description: z.string().min(1).max(500),
});
export type ImproveDescriptionResult = z.infer<typeof improveDescriptionSchema>;

export const clientMessageSchema = z.object({
  message: z.string().min(1).max(2000),
});
export type ClientMessageResult = z.infer<typeof clientMessageSchema>;

export const businessTermsSchema = z.object({
  text: z.string().min(1).max(1000),
});
export type BusinessTermsResult = z.infer<typeof businessTermsSchema>;
