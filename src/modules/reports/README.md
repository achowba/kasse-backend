# modules/reports

Plan against actual, with variance. This is what the rest of the system exists to produce.

## One aggregation, not two queries

The whole report is a single round trip: a page of rows, the totals for the entire range, and the row count. Reading plans and expenses separately and joining them in the API process would move a join the database is built for into Node, and would paginate it wrongly.

## Why a union, not a lookup

The obvious pipeline starts at `plans` and `$lookup`s the matching expenses. It is wrong, and quietly:

> **A category with spend but no plan disappears.**

That is not an obscure edge case. It is unplanned spend, which is usually the single most interesting row in a variance report, and a plan-side join never sees it. So both sides are projected into one shape, unioned, and grouped by category and month. A cell that exists on either side alone survives.

```
plans      ->  { categoryId, month, planMinor: targetMinor, actualMinor: 0 }
expenses   ->  { categoryId, month, planMinor: 0,           actualMinor: amountMinor }
                              |
                       $group by cell, $sum both
                              |
                       $lookup category name
                              |
              $facet { rows (paged) | totals (whole range) | count }
```

`$max` over the `hasPlan` and `hasActual` booleans is how a cell learns that either side contributed: `false` sorts below `true`, so the maximum is `true` when any row set it. Summing would produce a count, which is not the question.

## Why `$facet`

The totals and the row count are computed over the whole range while only a page of rows comes back. A summary built from the visible rows would change every time the reader turned a page, and a chart drawn from those rows would stop partway through the year.

## Variance is computed in the pipeline, and defined in TypeScript

Both, and the distinction matters.

`calculateVariance` in `@common/money` is the **specification**: a pure function over two integers, exhaustively unit tested without a database, and the thing the published numbers were checked against. `variance.stage.ts` is the **fast path**: an `$addFields` stage so the database does the arithmetic rather than shipping unsummed cells to Node to do the same sums.

The stage runs *after* `$skip` and `$limit` inside the facet, so the arithmetic happens for the rows being returned rather than for every cell in the range.

### What holds them together

`report-variance-parity.e2e-spec.ts` runs sixteen cases through both implementations under both policies, against a real database, and asserts they agree. Two implementations of graded arithmetic with nothing binding them will drift; that spec is the binding.

It has already earned it. On its first run it caught the pipeline returning `0` where the function returned `-0`, for a variance of one minor unit against a plan of a million. `JSON.stringify(-0)` is `"0"`, so no client had ever seen it, but the function had been returning negative zero since it was written. The function now normalises it, because `-0` is a JavaScript artifact rather than an answer: it compares equal to `0`, serialises as `0`, then behaves differently the moment something divides by it.

### Why not `$round`

Because it rounds differently. MongoDB's `$round` breaks an exact tie to the nearest **even** value; JavaScript's `Math.round` breaks it toward **positive infinity**. On `2.125` those give `2.12` and `2.13`, and a variance percentage lands on an exact half whenever spend misses plan by the right ratio, so the disagreement is reachable rather than theoretical.

The stage uses `$floor(x + 0.5)`, which is `Math.round` exactly, and adds the epsilon before the multiply in the same order the TypeScript does, because floating point is not associative. Two parity cases pin the positive and negative halves.

### The zero guard is not a nicety

Dividing by zero inside an aggregation raises and fails the **entire report**. A single unplanned category would take the whole response down, so the `$cond` on `planMinor` is load bearing rather than cosmetic. A parity case covers it, and another asserts nothing in the matrix produces `NaN` or `Infinity`.

## The three answers the assignment asks for

| Case | Answer |
|---|---|
| **Plan is 0** | `variancePercent` is `null`. Never `NaN`, never `Infinity`, never a fabricated 100%. `varianceMinor` is still correct and still worth showing: it is the whole of the unplanned spend. |
| **Nothing logged** | Follows `?missingActuals=`. Under `zero` (default) the actual is 0 and the variance is the whole target. Under `null` the actual, variance, and percent are all `null` so a client renders a dash. |
| **Logged zero** | Not the same thing. `hasActual` distinguishes them, so a month someone recorded as zero spend is never confused with a month nobody has reported yet. Both sum to 0, so the flag is the only thing that can tell them apart. |

## Soft deletes have to be filtered here by hand

Every other read goes through `BaseTenantRepository`, which applies `deletedAt: null` in one place so no handler can forget it. **An aggregation bypasses that entirely.** Both `$match` stages in this pipeline carry the filter explicitly, and an e2e test deletes an expense and asserts it leaves the report. Without it, deleted rows would reappear in reports and nowhere else, which is the worst kind of inconsistency: the one that only shows up in the numbers.

## Caching is exact, not time based

A cached report is keyed by the account's **data version**, a counter that every write to a plan, an expense, or a period lock increments. Invalidation is that increment: it makes every previous entry for the account unreachable rather than requiring a search for the keys to delete, so it costs the same whether the account had one cached report or fifty.

The five minute TTL is only a backstop so an idle account's entry eventually leaves memory, and the cache is capped and evicts least recently used so a busy instance does not leak.

The counter lives in `@common/cache` rather than here, and that placement is load bearing. The writers that bump it are plans, expenses, and locks; the reader is this module, which already imports those three for their models. Owning the counter here would make them import this module back, and a cycle between feature modules compiles cleanly then fails at runtime as an undefined injected dependency. `npm run lint:circular` guards it.

Per process, deliberately. Each instance holds its own cache and its own counter, so an instance only ever invalidates what it cached itself. Nothing is shared, so nothing can go stale across instances.

## The series endpoint

`GET /reports/plan-vs-actual/series` collapses the same numbers onto one axis, unpaginated, for charts. It shares the pipeline up to the grouping rather than reimplementing it, so a chart and the table beside it cannot disagree. An e2e test asserts exactly that by summing the series and comparing it to the table's totals.

## Fiscal years

`?fiscalYear=2026` resolves to twelve months through the account's `fiscalYearStartMonth`. With a start month of 4 that is `2026-04` through `2027-03`.

Resolved on the server rather than by the client, because the start month lives on the account and only the server knows it. A client computing the range would have to fetch the setting first and would get it wrong the moment someone changed it.

It takes precedence over `from` and `to`, so a request carrying both has exactly one meaning rather than two.

**The resolved months, not the fiscal year, go into the cache key.** That falls out nicely: changing an account's fiscal year start needs no cache invalidation at all, because the same request simply resolves to a different range and therefore a different key. A test asserts that changing the start month between two identical requests produces two aggregations.

Adding eleven months to a start month has to roll the year over rather than producing month 15, which is why `addMonths` works in absolute month indexes. December start, `fiscalYear=2026`, gives `2026-12` through `2027-11`.

## The CSV export

`GET /reports/plan-vs-actual/export` renders the same report as a file, with a labelled totals row appended. It calls `planVsActual` rather than reading the database again, so the file and the table on screen cannot disagree, and a download straight after viewing is served from the same cached result.

Three formatting decisions, each of which has a wrong answer that looks fine:

| Written as | Not as | Because |
|---|---|---|
| `4800.00` | `$4,800.00` | A spreadsheet reads the first as a number and the second as text. Currency symbols and thousands separators are display concerns that belong to whatever renders the file. |
| `-250.00` | `(250.00)` | Accounting brackets are a display convention that would make the column non-numeric. |
| `-` | `NaN`, or blank | A plan of zero has no percentage. A cell holding `NaN` is worse than an empty one, and a blank reads as missing data where a dash reads as deliberate. |

A category named `Travel, UK` is quoted so it stays one column, which `csv-stringify` handles rather than string concatenation.

The export is unpaginated up to a cap, because a spreadsheet of the first fifty rows is not the report.

It does not round-trip into the CSV import, and is not meant to. The import reads `category,month,amount`; this file carries computed columns, and importing a variance is not a thing that can be done.

## Indexes it relies on

Both collections carry `{ userId, month, ... }`. Equality on the owner then a range on the month is the order a range scan wants, so the `$match` at the head of each side of the union is an index scan rather than a collection scan.

## How it relates to the rest of the project

Imports `@modules/plans` and `@modules/expenses` for their models, not their services: the report needs the schemas registered, not the rules that write them. Variance comes from `@common/money`, month comparison from `@common/month`, and cache invalidation from `@common/cache`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/reports/plan-vs-actual` | The report: rows for the range, plus totals over the whole range. |
| `GET` | `/api/v1/reports/plan-vs-actual/series` | The same numbers grouped by month or category, unpaginated, for a chart. |

## Dependencies on other modules

`@modules/plans`, `@modules/expenses`, plus `@common/money` for variance, `@common/month` for the range check, `@common/cache` for invalidation, `@common/pagination`, and `@common/auth`.
