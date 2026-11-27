const money = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const moneyWhole = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

/** $1,234.50 (CAD). */
export function formatMoney(value: number): string {
  return money.format(value);
}

/** $1,235 (CAD), for estimates and ranges. */
export function formatMoneyWhole(value: number): string {
  return moneyWhole.format(value);
}

/**
 * How the invoice PDF hides contact details (same rules as maskPhone and maskEmail in @eurowerken/shared/invoice-pdf,
 * repeated here so pages that only describe the setting do not load pdf-lib).
 * "403 471 7769" -> "403 471 xxxx".
 */
export function invoiceMaskedPhone(phone: string | null | undefined): string {
  let left = 4;
  return (phone ?? '')
    .trim()
    .split('')
    .reverse()
    .map((c) => (left > 0 && /\d/.test(c) ? (left--, 'x') : c))
    .reverse()
    .join('');
}

/** "vikcanada90@gmail.com" -> "vixxx0@gmail.com". */
export function invoiceMaskedEmail(email: string | null | undefined): string {
  const s = (email ?? '').trim();
  const at = s.lastIndexOf('@');
  if (at < 1) return s ? 'xxx' : '';
  const name = s.slice(0, at);
  const domain = s.slice(at);
  if (name.length <= 3) return `${name[0]}xxx${domain}`;
  return `${name.slice(0, 2)}xxx${name.slice(-1)}${domain}`;
}
