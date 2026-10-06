// All monetary values are stored as integer minor units (halalas/cents).
// These helpers are the ONLY place a float touches money, and only for
// display / user input — every value that leaves this file back toward the
// database is converted back to an integer before it's used.

export function centsToDisplay(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Parses a user-typed amount ("12.5") into integer cents (1250).
// Returns null for anything that isn't a valid non-negative number.
export function displayToCents(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export type LineItemInput = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  tax_rate: number; // percent
};

export function calcLineTotal(item: LineItemInput): number {
  const gross = Math.round(item.quantity * item.unit_price_cents);
  return gross - item.discount_cents;
}

export function calcQuoteTotals(items: LineItemInput[]) {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;

  for (const item of items) {
    const gross = Math.round(item.quantity * item.unit_price_cents);
    const lineTotal = gross - item.discount_cents;
    subtotal += gross;
    discount += item.discount_cents;
    tax += Math.round((lineTotal * item.tax_rate) / 100);
  }

  return { subtotal_cents: subtotal, discount_cents: discount, tax_cents: tax, total_cents: subtotal - discount + tax };
}
