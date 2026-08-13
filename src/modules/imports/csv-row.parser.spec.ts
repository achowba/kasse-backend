import { parseExpenseCsv } from './csv-row.parser';
import { MAX_ROWS } from './imports.constants';

/**
 * Builds a CSV buffer from lines.
 *
 * @param lines - The lines, header first.
 * @returns The file's bytes.
 */
const csv = (...lines: string[]): Buffer => Buffer.from(lines.join('\n'), 'utf8');

const header = 'category,month,amount,note';

describe('parseExpenseCsv', () => {
  describe('a well formed file', () => {
    it('reads every row', () => {
      const result = parseExpenseCsv(csv(header, 'Marketing,2026-01,4800.00,Q1 campaign', 'Payroll,2026-01,20500.00,'));

      expect(result.rowCount).toBe(2);
      expect(result.errors).toEqual([]);
      expect(result.rows).toEqual([
        { line: 2, categoryName: 'Marketing', month: '2026-01', amountMinor: 480_000, note: 'Q1 campaign' },
        { line: 3, categoryName: 'Payroll', month: '2026-01', amountMinor: 2_050_000, note: null },
      ]);
    });

    it('parses an amount exactly, without going through a float', () => {
      const result = parseExpenseCsv(csv(header, 'Marketing,2026-01,4800.10,'));

      // 4800.10 * 100 in floating point is 480009.99999999994, which truncates to
      // 480009. Reading the digits gives the cent that a float loses.
      expect(result.rows[0]?.amountMinor).toBe(480_010);
    });

    it('accepts a negative amount, which is how a refund arrives', () => {
      const result = parseExpenseCsv(csv(header, 'Marketing,2026-01,-250.00,Credit note'));

      expect(result.rows[0]?.amountMinor).toBe(-25_000);
    });

    it('treats the note as optional', () => {
      const result = parseExpenseCsv(csv('category,month,amount', 'Marketing,2026-01,100.00'));

      expect(result.rows[0]?.note).toBeNull();
    });
  });

  describe('what a spreadsheet actually sends', () => {
    it('ignores header case and surrounding spaces', () => {
      const result = parseExpenseCsv(csv(' Category , MONTH , Amount ', 'Marketing,2026-01,100.00'));

      expect(result.errors).toEqual([]);
      expect(result.rows[0]?.categoryName).toBe('Marketing');
    });

    it('ignores columns it has no use for', () => {
      const result = parseExpenseCsv(csv('category,month,amount,vendor,cost_centre', 'Marketing,2026-01,100.00,Acme,CC-1'));

      // A file exported from an accounting system carries plenty this import does
      // not need. Rejecting it would make the user edit the file for no reason.
      expect(result.errors).toEqual([]);
      expect(result.rows).toHaveLength(1);
    });

    it('strips a byte order mark, which Excel writes on export', () => {
      // Written as an escape rather than the literal character, so the intent is
      // visible in the diff instead of being an invisible byte.
      const result = parseExpenseCsv(Buffer.from(`\ufeff${header}\nMarketing,2026-01,100.00,`, 'utf8'));

      expect(result.errors).toEqual([]);
      expect(result.rows).toHaveLength(1);
    });

    it('keeps a quoted note containing a comma intact', () => {
      const result = parseExpenseCsv(csv(header, 'Marketing,2026-01,100.00,"Ads, print and radio"'));

      expect(result.rows[0]?.note).toBe('Ads, print and radio');
    });

    it('skips blank lines rather than reporting them as rows', () => {
      const result = parseExpenseCsv(csv(header, 'Marketing,2026-01,100.00,', '', 'Payroll,2026-01,200.00,'));

      expect(result.rowCount).toBe(2);
      expect(result.errors).toEqual([]);
    });
  });

  describe('rejected rows', () => {
    it('points at the line in the file, counting the header as line 1', () => {
      const result = parseExpenseCsv(csv(header, 'Marketing,2026-01,100.00,', 'Payroll,2026-13,200.00,'));

      // Line 3, not index 1. Reporting the index would send someone to the wrong
      // line of their spreadsheet.
      expect(result.errors).toEqual([{ line: 3, column: 'month', message: '"2026-13" is not a month in YYYY-MM format.' }]);
    });

    it('reports every bad row rather than stopping at the first', () => {
      const result = parseExpenseCsv(csv(header, ',2026-01,100.00,', 'Payroll,not-a-month,200.00,', 'Legal,2026-01,abc,'));

      // Someone fixing a spreadsheet needs everything wrong with it at once, not
      // one problem per upload.
      expect(result.errors.map((error) => [error.line, error.column])).toEqual([
        [2, 'category'],
        [3, 'month'],
        [4, 'amount'],
      ]);
      expect(result.rows).toEqual([]);
    });

    it('keeps the good rows alongside the errors, so the caller decides what to do', () => {
      const result = parseExpenseCsv(csv(header, 'Marketing,2026-01,100.00,', 'Payroll,2026-13,200.00,'));

      expect(result.rows).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.rowCount).toBe(2);
    });

    it('rejects a missing category', () => {
      const result = parseExpenseCsv(csv(header, '  ,2026-01,100.00,'));

      expect(result.errors[0]).toEqual({ line: 2, column: 'category', message: 'A category is required.' });
    });

    it('rejects an amount that is not a number', () => {
      const result = parseExpenseCsv(csv(header, 'Marketing,2026-01,4 800 kr,'));

      expect(result.errors[0]?.column).toBe('amount');
    });

    it('rejects a month with a day on it', () => {
      const result = parseExpenseCsv(csv(header, 'Marketing,2026-01-15,100.00,'));

      expect(result.errors[0]?.column).toBe('month');
    });

    it('rejects month 13', () => {
      const result = parseExpenseCsv(csv(header, 'Marketing,2026-13,100.00,'));

      expect(result.errors[0]?.column).toBe('month');
    });
  });

  describe('files that cannot be used at all', () => {
    it('rejects a file with no data rows', () => {
      expect(() => parseExpenseCsv(csv(header))).toThrow('no data rows');
    });

    it('names every missing required column at once', () => {
      expect(() => parseExpenseCsv(csv('category,note', 'Marketing,hello'))).toThrow(/month, amount/);
    });

    it('rejects a file over the row cap', () => {
      const rows = Array.from({ length: MAX_ROWS + 1 }, () => 'Marketing,2026-01,1.00,');

      expect(() => parseExpenseCsv(csv(header, ...rows))).toThrow(/more than the/);
    });

    it('accepts a file exactly at the row cap', () => {
      const rows = Array.from({ length: MAX_ROWS }, () => 'Marketing,2026-01,1.00,');

      expect(parseExpenseCsv(csv(header, ...rows)).rowCount).toBe(MAX_ROWS);
    });
  });
});
