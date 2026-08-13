# common/money

Money in minor units, and the variance calculation.

## What it does

`parseAmountToMinor` reads an amount written by a person into an integer count of minor units. `formatMinorAsMajor` writes it back out. `calculateVariance` computes one cell of the plan against spend report.

## Why minor units, and why string parsing

Money is an integer count of cents. A floating point number cannot represent `0.1` exactly, and a report that is wrong by a cent is a wrong report.

The parser reads the characters rather than multiplying a parsed float by 100, because that multiplication is not safe:

```
Math.round(12.345 * 100)  // 1234, not 1235
```

`12.345` is stored as `12.34499999999999886`. Reading the digits either side of the decimal point is exact for every input the parser accepts.

## The variance rules

```
variance   = spend - plan           negative means under plan
variance % = (spend - plan) / plan * 100
```

- **A plan of zero** makes the percentage undefined. It returns `null`, never `NaN` and never `Infinity`. The absolute variance is still returned, because spending against no plan is real overspend and the number is meaningful.
- **Missing spend** follows a policy. Under `ZERO`, the default, it counts as `0` and the variance is the whole plan. Under `NULL`, the spend, variance, and percent are all `null` so a client can render a dash.
- **`hasSpend` is always reported**, so a genuine logged `0` is never confused with nothing logged, whichever policy is in force.
- Percentages are rounded to two decimal places.

`calculateVariance` is a pure function rather than an aggregation stage. It is exhaustively testable, and the table, the chart, and the CSV export all call it, so they cannot disagree with each other.

## How it relates to the rest of the project

The database sums plans and expenses; this module turns those sums into report cells. Plans, expenses, and the CSV import all store amounts through these helpers.

## Endpoints

None.

## Dependencies on other modules

None.
