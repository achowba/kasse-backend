import { ReportRowDTO, ReportTotalsDTO } from './dto/report-response.dto';
import { renderReportCsv } from './report-csv';

/** Stand in for a report row. */
const buildRow = (overrides: Partial<ReportRowDTO> = {}): ReportRowDTO => ({
  categoryId: '65f1c2d3e4b5a6c7d8e9f0a1',
  categoryName: 'Marketing',
  month: '2026-01',
  planMinor: 500_000,
  spentMinor: 480_000,
  varianceMinor: -20_000,
  variancePercent: -4,
  hasPlan: true,
  hasSpend: true,
  ...overrides,
});

const totals: ReportTotalsDTO = {
  planMinor: 500_000,
  spentMinor: 480_000,
  varianceMinor: -20_000,
  variancePercent: -4,
};

/**
 * Splits rendered CSV into lines.
 *
 * @param csv - The rendered text.
 * @returns The non-empty lines.
 */
const lines = (csv: string): string[] =>
  csv
    .trim()
    .split('\n')
    .map((line: string) => line.trim());

describe('renderReportCsv', () => {
  it('writes a header a spreadsheet can label columns from', () => {
    expect(lines(renderReportCsv([buildRow()], totals))[0]).toBe('Category,Month,Plan,Spent,Variance,Variance %');
  });

  it('writes amounts in major units, as a person would', () => {
    const row = lines(renderReportCsv([buildRow()], totals))[1];

    // 4800.00, not 480000 and not $4,800.00. A spreadsheet reads the first as a
    // number and the third as text.
    expect(row).toBe('Marketing,2026-01,5000.00,4800.00,-200.00,-4.00');
  });

  it('appends a labelled totals row', () => {
    const rendered = lines(renderReportCsv([buildRow()], totals));

    // Labelled rather than left bare, because a reader who sorts the sheet would
    // otherwise scatter an unmarked total into the middle of the data.
    expect(rendered[rendered.length - 1]).toBe('Total,,5000.00,4800.00,-200.00,-4.00');
  });

  it('writes a dash where a percentage has no answer, never NaN', () => {
    const rendered = lines(
      renderReportCsv([buildRow({ planMinor: 0, variancePercent: null, varianceMinor: 480_000 })], {
        ...totals,
        planMinor: 0,
        variancePercent: null,
      }),
    );

    // A cell holding NaN is worse than an empty one, and a dash reads as
    // deliberate where blank reads as missing data.
    expect(rendered[1]).toContain(',-');
    expect(rendered[1]).not.toContain('NaN');
    expect(rendered[1]).not.toContain('Infinity');
  });

  it('writes a dash for spend that was never logged', () => {
    const rendered = lines(
      renderReportCsv([buildRow({ spentMinor: null, varianceMinor: null, variancePercent: null, hasSpend: false })], totals),
    );

    expect(rendered[1]).toBe('Marketing,2026-01,5000.00,-,-,-');
  });

  it('quotes a category name containing a comma, so it stays one column', () => {
    const rendered = lines(renderReportCsv([buildRow({ categoryName: 'Travel, UK' })], totals));

    expect(rendered[1]).toContain('"Travel, UK"');
  });

  it('renders a negative amount with its sign rather than in brackets', () => {
    const rendered = lines(renderReportCsv([buildRow({ spentMinor: -25_000, varianceMinor: -525_000 })], totals));

    // Accounting brackets are a display convention a spreadsheet would read as
    // text. The minus sign keeps the column numeric.
    expect(rendered[1]).toContain('-250.00');
  });

  it('renders an empty report as a header and a totals row', () => {
    const rendered = lines(renderReportCsv([], { planMinor: 0, spentMinor: 0, varianceMinor: 0, variancePercent: null }));

    expect(rendered).toHaveLength(2);
    expect(rendered[1]).toBe('Total,,0.00,0.00,0.00,-');
  });
});
