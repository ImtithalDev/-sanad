export type LineItemDraft = {
  description: string;
  quantity: string; // raw string from the input, parsed at validation time
  unit_price: string;
  discount: string;
  tax_rate: string;
  product_id?: string;
};

export type DocumentHeaderDraft = {
  client_id: string;
  issue_date: string;
  expiry_or_due_date: string;
  currency: string;
  notes: string;
  terms: string;
};

export type DocumentErrors = {
  header?: Partial<Record<keyof DocumentHeaderDraft, string>>;
  items?: Record<number, Partial<Record<keyof LineItemDraft, string>>>;
  general?: string;
};

export function validateDocument(
  header: DocumentHeaderDraft,
  items: LineItemDraft[],
  t: { requiredField: string }
): DocumentErrors {
  const errors: DocumentErrors = {};

  if (!header.issue_date) {
    errors.header = { ...errors.header, issue_date: t.requiredField };
  }

  if (items.length === 0) {
    errors.general = "at_least_one_item";
    return errors;
  }

  const itemErrors: DocumentErrors["items"] = {};
  items.forEach((item, idx) => {
    const rowErrors: Partial<Record<keyof LineItemDraft, string>> = {};
    if (!item.description || item.description.trim().length === 0) {
      rowErrors.description = t.requiredField;
    }
    const qty = Number(item.quantity);
    if (!item.quantity || !Number.isFinite(qty) || qty <= 0) {
      rowErrors.quantity = t.requiredField;
    }
    const price = Number(item.unit_price);
    if (item.unit_price === "" || !Number.isFinite(price) || price < 0) {
      rowErrors.unit_price = t.requiredField;
    }
    if (Object.keys(rowErrors).length > 0) {
      itemErrors[idx] = rowErrors;
    }
  });

  if (Object.keys(itemErrors).length > 0) {
    errors.items = itemErrors;
  }

  return errors;
}

export function hasErrors(errors: DocumentErrors): boolean {
  return !!(errors.general || errors.header || errors.items);
}
