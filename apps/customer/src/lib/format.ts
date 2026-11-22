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
