import { parse } from 'csv-parse/sync';
import { parseAmountToMinor } from '@common/money';
import { isValidMonth } from '@common/month';
import { FORBIDDEN_CHARACTERS_MESSAGE, hasForbiddenCharacters, sanitiseText } from '@common/text';
import { MAX_ROWS, NOTE_COLUMN, REQUIRED_COLUMNS } from './imports.constants';
import { IImportRowError } from './schemas/import-batch.schema';

/**
 * One row that parsed and validated on its own.
 *
 * @remarks
 * The category is still a name here. Resolving it to an identifier needs the
 * database, which this module deliberately does not touch, so that happens in the
 * service where the account is known.
 *
 * @property line - Where it came from in the file, so an error can point at it.
 * @property categoryName - The category as written in the file.
 * @property month - The month, already validated as `YYYY-MM`.
 * @property amountMinor - The amount, as an exact integer count of minor units.
 * @property note - The optional note, or null.
 */
export interface IParsedRow {
  line: number;
  categoryName: string;
  month: string;
  amountMinor: number;
  note: string | null;
}

/**
 * What one file amounted to.
 *
 * @property rows - The rows that validated.
 * @property errors - The rows that did not, each naming its line.
 * @property rowCount - How many data rows the file carried, valid or not.
 */
export interface IParseResult {
  rows: IParsedRow[];
  errors: IImportRowError[];
  rowCount: number;
}

/**
 * Normalises a header cell for matching.
 *
 * @param header - The header as written in the file.
 * @returns The header, lowercased and trimmed.
 */
const normaliseHeader = (header: string): string => header.trim().toLowerCase();

/**
 * Reads a value from a row by column name, whatever case the header used.
 *
 * @remarks
 * Sanitised rather than merely trimmed, because a spreadsheet is where invisible
 * characters come from. A cell exported as UTF-8 with a BOM carries one on the
 * first value in the file, and a name copied out of a web page routinely brings
 * a no break space or a zero width space with it. Trimming leaves every one of
 * them in place, since none is whitespace as far as `trim` is concerned.
 *
 * That mattered twice. A category cell holding nothing but invisible characters
 * passed the "a category is required" check and then failed later as an unknown
 * category, pointing the reader at the wrong problem. And a note kept characters
 * that no one could see, which came back out of the CSV export.
 *
 * @param row - The parsed row, keyed by its normalised headers.
 * @param column - The column to read.
 * @returns The sanitised value, or an empty string when the column is absent.
 */
const cell = (row: Record<string, string>, column: string): string => sanitiseText(row[column] ?? '');

/**
 * Parses and validates an uploaded CSV without touching the database.
 *
 * @remarks
 * Every row is checked before any is written, because the import is fail closed:
 * a file either lands whole or not at all. A row that fails contributes an error
 * naming its line rather than aborting the pass, so a user editing a spreadsheet
 * sees everything wrong with it at once instead of fixing one row per upload.
 *
 * Deliberately pure. It takes a buffer and returns rows and errors, which makes
 * every parsing rule testable without a database, an account, or a request.
 *
 * @steps
 * 1. Parse the file with headers normalised, so `Category`, `category`, and
 *    ` CATEGORY ` are the same column.
 * 2. Reject the file outright when a required column is missing or the row count
 *    is over the cap, since neither is something a per row error can express.
 * 3. Check each row: the category is present, the month is `YYYY-MM`, and the
 *    amount parses to an exact integer.
 * 4. Return the rows that passed and the errors for those that did not.
 *
 * @param file - The uploaded file's bytes.
 * @returns The valid rows, the per row errors, and the total row count.
 * @throws Error When the file is not parseable as CSV at all, or is structurally unusable.
 */
export const parseExpenseCsv = (file: Buffer): IParseResult => {
  // Typed on the binding rather than asserted on the call. `parse` is declared to
  // return `any`, so an assertion here reads as redundant to the linter and gets
  // removed, taking the only type information in the function with it.
  const records: Record<string, string>[] = parse(file, {
    columns: (header: string[]): string[] => header.map(normaliseHeader),
    skip_empty_lines: true,
    trim: true,
    // Rows with the wrong number of fields become per row errors below rather
    // than throwing, so one ragged line does not cost the user the whole report
    // of what is wrong with their file.
    relax_column_count: true,
    bom: true,
  });

  const headers = records.length > 0 ? Object.keys(records[0] ?? {}) : [];
  const missing = REQUIRED_COLUMNS.filter((column: string) => !headers.includes(column));

  if (records.length === 0) {
    throw new Error('The file has no data rows.');
  }

  if (missing.length > 0) {
    throw new Error(`The file is missing the ${missing.join(', ')} column${missing.length > 1 ? 's' : ''}.`);
  }

  if (records.length > MAX_ROWS) {
    throw new Error(`The file has ${records.length} rows, which is more than the ${MAX_ROWS} this endpoint accepts.`);
  }

  const rows: IParsedRow[] = [];
  const errors: IImportRowError[] = [];

  records.forEach((record: Record<string, string>, index: number) => {
    // The header is line 1, so the first data row is line 2. Reporting the array
    // index instead would send someone to the wrong line of their spreadsheet.
    const line = index + 2;
    const categoryName = cell(record, 'category');
    const month = cell(record, 'month');
    const amount = cell(record, 'amount');
    const note = cell(record, NOTE_COLUMN);

    if (categoryName === '') {
      errors.push({ line, column: 'category', message: 'A category is required.' });

      return;
    }

    // Refused rather than cleaned, for the same reason a request body is: a
    // control character or a text direction override in a spreadsheet cell is
    // not a paste accident, and silently repairing one would hide it. Reported
    // per row, like every other rejection here, so the reader is sent to the
    // line that needs fixing.
    const offendingColumn = [
      { column: 'category', value: categoryName },
      { column: NOTE_COLUMN, value: note },
    ].find(({ value }) => hasForbiddenCharacters(value));

    if (offendingColumn !== undefined) {
      errors.push({
        line,
        column: offendingColumn.column,
        message: `A ${offendingColumn.column} ${FORBIDDEN_CHARACTERS_MESSAGE}.`,
      });

      return;
    }

    if (!isValidMonth(month)) {
      errors.push({ line, column: 'month', message: `"${month}" is not a month in YYYY-MM format.` });

      return;
    }

    let amountMinor: number;

    try {
      amountMinor = parseAmountToMinor(amount);
    } catch {
      errors.push({ line, column: 'amount', message: `"${amount}" is not an amount.` });

      return;
    }

    rows.push({ line, categoryName, month, amountMinor, note: note === '' ? null : note });
  });

  return { rows, errors, rowCount: records.length };
};
