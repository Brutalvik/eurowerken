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

export function formatCompactCurrency(value: number): string {
  return `$${Math.round(value / 1000)}k`;
}
