/** Parse user input like "1,234.5" into integer paise. Returns null if invalid or <= 0. */
export function parseToPaise(input: string): number | null {
  const clean = input.replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const [whole, frac = ''] = clean.split('.');
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

export function paiseToInput(paise: number): string {
  const s = (paise / 100).toFixed(2);
  return s.endsWith('.00') ? s.slice(0, -3) : s;
}

const fmtCache = new Map<string, Intl.NumberFormat>();
export function formatMoney(paise: number, currency = 'INR'): string {
  let f = fmtCache.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 });
    fmtCache.set(currency, f);
  }
  return f.format(Math.abs(paise) / 100);
}

export function today(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
