const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?(?:\d[-.\s]?){9,14}\d/;
const CARD_RE = /\b(?:\d[ -]*?){13,19}\b/;
const UPI_RE = /\b[a-z0-9.\-_]{2,}@[a-z]{2,}\b/i;

export function hasSensitiveData(input: string) {
  const text = input.trim();
  if (!text) return false;
  return EMAIL_RE.test(text) || PHONE_RE.test(text) || CARD_RE.test(text) || UPI_RE.test(text);
}

export function roundLocationForPrivacy(value: number, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
