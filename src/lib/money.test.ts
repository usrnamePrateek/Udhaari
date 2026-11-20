import { describe, expect, it } from 'vitest';
import { formatMoney, paiseToInput, parseToPaise, today } from './money';

describe('parseToPaise', () => {
  it.each([
    ['500', 50000],
    ['0.5', 50],
    ['10.05', 1005],
    ['1,234.50', 123450],
    ['₹ 1,00,000', 10000000],
    ['  42 ', 4200],
    ['10.', 1000],
  ])('parses %j → %i paise', (input, expected) => {
    expect(parseToPaise(input)).toBe(expected);
  });

  it.each(['', 'abc', '0', '0.00', '-5', '1.234', '1e3', '12.3.4', '.'])('rejects %j', (input) => {
    expect(parseToPaise(input)).toBeNull();
  });

  it('avoids floating point errors', () => {
    // 0.1 + 0.2 style issues: 19.99 * 100 = 1998.9999999999998 in floats
    expect(parseToPaise('19.99')).toBe(1999);
    expect(parseToPaise('1.10')).toBe(110);
  });
});

describe('paiseToInput', () => {
  it('drops .00 for whole amounts', () => {
    expect(paiseToInput(50000)).toBe('500');
  });
  it('keeps two decimals otherwise', () => {
    expect(paiseToInput(123450)).toBe('1234.50');
    expect(paiseToInput(5)).toBe('0.05');
  });
  it('round-trips with parseToPaise', () => {
    for (const p of [1, 99, 100, 1999, 123450, 10000000]) {
      expect(parseToPaise(paiseToInput(p))).toBe(p);
    }
  });
});

describe('formatMoney', () => {
  it('shows whole rupees without decimals', () => {
    expect(formatMoney(50000)).toBe('₹500');
    expect(formatMoney(0)).toBe('₹0');
  });
  it('shows two decimals when there are paise', () => {
    expect(formatMoney(123450)).toBe('₹1,234.50');
    expect(formatMoney(5)).toBe('₹0.05');
  });
  it('uses Indian digit grouping', () => {
    expect(formatMoney(12345678)).toBe('₹1,23,456.78');
    expect(formatMoney(1000000000)).toBe('₹1,00,00,000');
  });
  it('formats the absolute value (sign is shown by the UI)', () => {
    expect(formatMoney(-50000)).toBe('₹500');
  });
  it('supports other currencies', () => {
    expect(formatMoney(1250, 'USD')).toBe('$12.50');
  });
});

describe('today', () => {
  it('returns local date as YYYY-MM-DD', () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(today()).toBe(expected);
  });
});
