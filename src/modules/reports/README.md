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

## Variance is computed in TypeScript, not in the pipeline

Deliberate. Variance is the piece the report is judged on, and as a pure function over two integers it can be tested exhaustively without a database: plan of zero, missing actual, negative amounts, and rounding are unit tests rather than aggregation fixtures. The database sums; `@common/money` decides what those sums mean.

At a scale where returning one row per cell is too much data, `calculateVariance` moves into `$addFields` and the tests stay valid, because the arithmetic is defined in exactly one place.

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
