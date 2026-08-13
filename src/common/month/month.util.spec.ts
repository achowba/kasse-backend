import {
  addMonths,
  compareMonths,
  fiscalYearRange,
  formatMonth,
  isValidMonth,
  monthsInRange,
  parseMonth,
  quarterMonths,
} from './month.util';

describe('isValidMonth', () => {
  it.each(['2026-01', '2026-12', '1999-06', '0001-01'])('accepts %s', (value: string) => {
    expect(isValidMonth(value)).toBe(true);
  });

  it.each(['2026-00', '2026-13', '2026-1', '26-01', '2026/01', '2026-01-01', '', 'notamonth'])('rejects %p', (value: string) => {
    expect(isValidMonth(value)).toBe(false);
  });
});

describe('parseMonth', () => {
  it('splits a month into its parts', () => {
    expect(parseMonth('2026-07')).toEqual({ year: 2026, month: 7 });
  });

  it('throws on a malformed month rather than returning NaN', () => {
    expect(() => parseMonth('2026-13')).toThrow(/Invalid month/);
  });
});

describe('formatMonth', () => {
  it('pads the month to two digits', () => {
    expect(formatMonth(2026, 1)).toBe('2026-01');
    expect(formatMonth(2026, 12)).toBe('2026-12');
  });

  it('rejects a month number outside 1 through 12', () => {
    expect(() => formatMonth(2026, 0)).toThrow(/Invalid month number/);
    expect(() => formatMonth(2026, 13)).toThrow(/Invalid month number/);
  });
});

describe('compareMonths', () => {
  it('orders chronologically', () => {
    expect(compareMonths('2026-01', '2026-02')).toBeLessThan(0);
    expect(compareMonths('2026-02', '2026-01')).toBeGreaterThan(0);
    expect(compareMonths('2026-01', '2026-01')).toBe(0);
  });

  it('orders across a year boundary, which is why the format is zero padded', () => {
    expect(compareMonths('2025-12', '2026-01')).toBeLessThan(0);
    expect(compareMonths('2026-09', '2026-10')).toBeLessThan(0);
  });

  it('sorts a shuffled list into chronological order', () => {
    const months = ['2026-10', '2025-12', '2026-02', '2026-01'];

    expect([...months].sort(compareMonths)).toEqual(['2025-12', '2026-01', '2026-02', '2026-10']);
  });
});

describe('addMonths', () => {
  it('moves forward within a year', () => {
    expect(addMonths('2026-01', 2)).toBe('2026-03');
  });

  it('crosses into the next year without producing a month 13', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });

  it('moves backwards across a year boundary', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-02', -14)).toBe('2024-12');
  });

  it('returns the same month when moving zero', () => {
    expect(addMonths('2026-06', 0)).toBe('2026-06');
  });

  it('moves whole years', () => {
    expect(addMonths('2026-06', 12)).toBe('2027-06');
    expect(addMonths('2026-06', -12)).toBe('2025-06');
  });
});

describe('monthsInRange', () => {
  it('includes both bounds', () => {
    expect(monthsInRange('2026-01', '2026-03')).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('returns a single month when the bounds match', () => {
    expect(monthsInRange('2026-05', '2026-05')).toEqual(['2026-05']);
  });

  it('returns nothing when the range runs backwards', () => {
    expect(monthsInRange('2026-05', '2026-01')).toEqual([]);
  });

  it('spans a year boundary', () => {
    expect(monthsInRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('rejects a malformed bound instead of looping', () => {
    expect(() => monthsInRange('2026-13', '2026-01')).toThrow(/Invalid month/);
  });
});

describe('quarterMonths', () => {
  it.each([
    ['2026-Q1', ['2026-01', '2026-02', '2026-03']],
    ['2026-Q2', ['2026-04', '2026-05', '2026-06']],
    ['2026-Q3', ['2026-07', '2026-08', '2026-09']],
    ['2026-Q4', ['2026-10', '2026-11', '2026-12']],
  ])('expands %s', (quarter: string, expected: string[]) => {
    expect(quarterMonths(quarter)).toEqual(expected);
  });

  it.each(['2026-Q0', '2026-Q5', '2026-1', 'Q1-2026', ''])('rejects %p', (quarter: string) => {
    expect(() => quarterMonths(quarter)).toThrow(/Invalid quarter/);
  });
});

describe('fiscalYearRange', () => {
  it('is the calendar year when the fiscal year starts in January', () => {
    expect(fiscalYearRange(2026, 1)).toEqual({ from: '2026-01', to: '2026-12' });
  });

  it('spans into the next calendar year for an April start', () => {
    expect(fiscalYearRange(2026, 4)).toEqual({ from: '2026-04', to: '2027-03' });
  });

  it('covers exactly twelve months whatever the start', () => {
    for (let startMonth = 1; startMonth <= 12; startMonth += 1) {
      const { from, to } = fiscalYearRange(2026, startMonth);

      expect(monthsInRange(from, to)).toHaveLength(12);
    }
  });

  it('rejects a start month outside 1 through 12', () => {
    expect(() => fiscalYearRange(2026, 13)).toThrow(/Invalid month number/);
  });
});
