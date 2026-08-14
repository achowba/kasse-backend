import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';

/**
 * Merges the unit and end to end coverage maps into one report.
 *
 * Why this exists: the two suites cover different halves of the codebase and
 * neither number alone is honest about the whole.
 *
 * The unit run excludes controllers, repositories, guards, strategies, and
 * bootstrap, on the reasoning that unit testing a thin translation layer against
 * a mock measures the mock. That is defensible, and it means the unit figure
 * describes services and utilities rather than the application. Meanwhile the
 * end to end suite exercises exactly those excluded layers, against a real
 * database, and contributed nothing to any reported number.
 *
 * So the unit figure understated the position by ignoring the suite that proves
 * tenancy, transactions, and the locked period rules, while also covering a
 * narrower slice than the header suggested. Merging is about making the metric
 * mean what a reader assumes it means, not about making it larger.
 *
 * Istanbul's own merge is used rather than adding a coverage tool: `nyc` would
 * be a new dependency for something Jest already ships the libraries for.
 */

const UNIT = resolve('coverage/coverage-final.json');
const E2E = resolve('coverage-e2e/coverage-final.json');
const OUT = resolve('coverage-merged');

/**
 * Loads a coverage map from disk, failing loudly when it is absent.
 *
 * @remarks
 * A missing file means the suite that produces it did not run, and silently
 * merging one map would report a number that looks complete and is not. That
 * is worse than no number at all.
 *
 * @param path - Where the `coverage-final.json` should be.
 * @param label - The suite, for the error message.
 * @returns The parsed coverage data.
 */
const load = (path, label) => {
  if (!existsSync(path)) {
    throw new Error(`No ${label} coverage at ${path}. Run \`npm run test:cov:all\`, which produces both.`);
  }

  return JSON.parse(readFileSync(path, 'utf8'));
};

const map = libCoverage.createCoverageMap({});

map.merge(load(UNIT, 'unit'));
map.merge(load(E2E, 'end to end'));

const context = libReport.createContext({ dir: OUT, coverageMap: map });

reports.create('text-summary').execute(context);
reports.create('json-summary').execute(context);
reports.create('lcov').execute(context);

const summary = map.getCoverageSummary();

/**
 * Floors for the merged figure.
 *
 * @remarks
 * A number nothing enforces is a number that drifts down one pull request at a
 * time, and nobody notices until it is meaningless. These sit a little below
 * where the suite is today, so ordinary work does not trip them and a real
 * regression does.
 *
 * They are deliberately not the unit thresholds. Those guard a narrower set of
 * files and would be trivially satisfied here.
 */
const FLOORS = { statements: 92, branches: 74, functions: 88, lines: 92 };

console.log('');
console.log('Merged across the unit and end to end suites.');
console.log(`Files: ${map.files().length}`);

const failures = Object.entries(FLOORS).filter(([metric, floor]) => summary[metric].pct < floor);

for (const [metric, floor] of Object.entries(FLOORS)) {
  const actual = summary[metric].pct;
  const mark = actual < floor ? 'BELOW' : 'ok   ';

  console.log(`  ${mark} ${metric.padEnd(11)} ${String(actual).padStart(6)}%   floor ${floor}%`);
}

console.log(`Full report: ${OUT}/lcov-report/index.html`);

if (failures.length > 0) {
  console.error('');
  console.error(`Merged coverage is below its floor: ${failures.map(([metric]) => metric).join(', ')}.`);
  console.error('Add the missing tests rather than lowering the floor. A threshold moved to match reality measures nothing.');
  process.exit(1);
}
