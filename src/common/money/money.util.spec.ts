import { formatMinorAsMajor, isSafeMinorAmount, parseAmountToMinor } from './money.util';

describe('parseAmountToMinor', () => {
  it('reads a whole number of major units', () => {
    expect(parseAmountToMinor('4800')).toBe(480_000);
  });

  it('reads two decimal places', () => {
    expect(parseAmountToMinor('4800.55')).toBe(480_055);
  });

  it('pads a single decimal place', () => {
    expect(parseAmountToMinor('19.8')).toBe(1_980);
  });

  it('reads thousands separators, which a spreadsheet export produces', () => {
    expect(parseAmountToMinor('20,500')).toBe(2_050_000);
    expect(parseAmountToMinor('1,234,567.89')).toBe(123_456_789);
  });

  it('reads a negative amount, which a refund or credit note produces', () => {
    expect(parseAmountToMinor('-19.80')).toBe(-1_980);
  });

  it('reads an explicit positive sign', () => {
    expect(parseAmountToMinor('+42')).toBe(4_200);
  });

  it('ignores surrounding whitespace', () => {
    expect(parseAmountToMinor('  4800.55  ')).toBe(480_055);
  });

  it('is exact where multiplying a float by 100 is not', () => {
    // Math.round(12.345 * 100) is 1234, because 12.345 is stored as
    // 12.34499999999999886. Reading the characters avoids the problem entirely.
    expect(parseAmountToMinor('12.34')).toBe(1_234);
    expect(parseAmountToMinor('0.07')).toBe(7);
    expect(parseAmountToMinor('1.10')).toBe(110);
  });

  it.each(['', '   ', 'abc', '12.345', '1,23', '1..2', '12,', '--5', '1 000', '1e3', '(5.00)'])('rejects %p', (input: string) => {
    expect(() => parseAmountToMinor(input)).toThrow(/Invalid amount/);
  });
});

describe('formatMinorAsMajor', () => {
  it('always writes two decimal places', () => {
    expect(formatMinorAsMajor(480_000)).toBe('4800.00');
    expect(formatMinorAsMajor(1_980)).toBe('19.80');
    expect(formatMinorAsMajor(7)).toBe('0.07');
  });

  it('keeps the sign on a negative amount', () => {
    expect(formatMinorAsMajor(-1_980)).toBe('-19.80');
  });

  it('renders zero as 0.00', () => {
    expect(formatMinorAsMajor(0)).toBe('0.00');
  });

  it('round trips with the parser', () => {
    for (const amount of [0, 7, -7, 1_980, -1_980, 480_055, 123_456_789]) {
      expect(parseAmountToMinor(formatMinorAsMajor(amount))).toBe(amount);
    }
  });
});

describe('isSafeMinorAmount', () => {
  it('accepts a whole number of minor units', () => {
    expect(isSafeMinorAmount(480_000)).toBe(true);
    expect(isSafeMinorAmount(0)).toBe(true);
    expect(isSafeMinorAmount(-1_980)).toBe(true);
  });

  it('rejects a fractional amount, which minor units can never be', () => {
    expect(isSafeMinorAmount(19.8)).toBe(false);
  });

  it('rejects a value beyond exact integer arithmetic', () => {
    expect(isSafeMinorAmount(Number.MAX_SAFE_INTEGER + 2)).toBe(false);
    expect(isSafeMinorAmount(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isSafeMinorAmount(Number.NaN)).toBe(false);
  });
});
