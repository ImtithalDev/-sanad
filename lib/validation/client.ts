export type ClientFormData = {
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  notes: string;
};

export type ClientFormErrors = Partial<Record<keyof ClientFormData, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The browser calls this for instant feedback; the server action below calls
// the exact same function again before touching the database. A client that
// skips its own JS validation (or sends a raw fetch) still hits this wall.
export function validateClientInput(
  data: ClientFormData,
  t: { requiredField: string; invalidEmail: string }
): ClientFormErrors {
  const errors: ClientFormErrors = {};

  if (!data.name || data.name.trim().length === 0) {
    errors.name = t.requiredField;
  } else if (data.name.trim().length > 200) {
    errors.name = t.requiredField; // reuse; a dedicated "too long" string can be added later
  }

  if (data.email && data.email.trim().length > 0 && !EMAIL_RE.test(data.email.trim())) {
    errors.email = t.invalidEmail;
  }

  return errors;
}

export function isValid(errors: ClientFormErrors): boolean {
  return Object.keys(errors).length === 0;
}
