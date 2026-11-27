const currency = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyWhole = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number): string {
  return currency.format(value);
}

export function formatCurrencyWhole(value: number): string {
  return currencyWhole.format(value);
}

/** Axis labels: $850, $1.2k, $15k, $1.4M (not "$0k" on every line when amounts are small). */
export function formatCompactCurrency(value: number): string {
  const v = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const trim = (x: number) => x.toFixed(1).replace(/\.0$/, '');
  if (v < 1000) return `${sign}$${Math.round(v)}`;
  if (v < 10_000) return `${sign}$${trim(v / 1000)}k`;
  if (v < 1_000_000) return `${sign}$${Math.round(v / 1000)}k`;
  return `${sign}$${trim(v / 1_000_000)}M`;
}
