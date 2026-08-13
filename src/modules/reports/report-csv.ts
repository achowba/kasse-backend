import { stringify } from 'csv-stringify/sync';
import { formatMinorAsMajor } from '@common/money';
import { ReportRowDTO, ReportTotalsDTO } from './dto/report-response.dto';
import { CSV_COLUMNS, CSV_TOTALS_LABEL } from './reports.constants';

/**
 * Renders one amount for a spreadsheet.
 *
 * @remarks
 * Major units, unquoted, with no thousands separator and no currency symbol:
 * `4800.00`, not `$4,800.00`. A spreadsheet reads that as a number, and the CSV
 * import reads it back as the same integer it started as. Formatting it for a
 * human to read would break both.
 *
 * @param minor - The amount in minor units.
 * @returns The amount as a plain decimal string.
 */
const amount = (minor: number): string => formatMinorAsMajor(minor);

/**
 * Renders a percentage, or a dash when there is no answer.
 *
 * @remarks
 * A plan of zero has no percentage, and the report carries `null` there rather
 * than `NaN`. A spreadsheet cell holding `NaN` is worse than an empty one, and a
 * dash reads as deliberate where blank reads as missing data.
 *
 * @param percent - The percentage, or null.
 * @returns The percentage as a string, or a dash.
 */
const percentage = (percent: number | null): string => (percent === null ? '-' : percent.toFixed(2));

/**
 * Renders spend, or a dash when nothing was logged.
 *
 * @param minor - The amount in minor units, or null under the `null` policy.
 * @returns The amount, or a dash.
 */
const optionalAmount = (minor: number | null): string => (minor === null ? '-' : amount(minor));

/**
 * Renders the report as CSV.
 *
 * @remarks
 * A totals row is appended, labelled rather than left as a bare row, because a
 * spreadsheet sorted by the reader would otherwise move it into the middle of the
 * data with nothing marking it as a total.
 *
 * @steps
 * 1. Render each row, converting minor units back to the decimal a person wrote.
 * 2. Append the totals row under a label.
 * 3. Serialise with the header, quoting whatever needs it.
 *
 * @param rows - The report rows.
 * @param totals - The totals across the range.
 * @returns The CSV text, header included.
 */
export const renderReportCsv = (rows: ReportRowDTO[], totals: ReportTotalsDTO): string => {
  const body = rows.map((row: ReportRowDTO) => [
    row.categoryName,
    row.month,
    amount(row.planMinor),
    optionalAmount(row.spentMinor),
    optionalAmount(row.varianceMinor),
    percentage(row.variancePercent),
  ]);

  body.push([
    CSV_TOTALS_LABEL,
    '',
    amount(totals.planMinor),
    amount(totals.spentMinor),
    amount(totals.varianceMinor),
    percentage(totals.variancePercent),
  ]);

  // csv-stringify quotes any field containing a comma or a quote, which is what
  // keeps a category named "Travel, UK" from becoming two columns.
  return stringify(body, { header: true, columns: [...CSV_COLUMNS] });
};
