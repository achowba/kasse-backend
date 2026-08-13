# seed

Two seeders, both deterministic.

```bash
npm run seed:spec    # exactly the published sample table
npm run seed:demo    # a year of varied data
```

Both write to one account, `demo@plan-vs-actual.app`, so a reviewer can log in without being told a generated address, and re-running finds the same account rather than accumulating one per run. The password is in `seed.constants.ts` deliberately: it opens a local database of invented numbers, and a deployment seeds nothing, so the account does not exist there.

## Why they go through the services

Neither seeder writes to a collection directly. That is slower, and it is the point: seeded data passes the same validation, produces the same audit entries, and respects the same period locks as data a user creates. A seeder that wrote documents straight into MongoDB could produce a database shape the application itself could never reach, and then the demo would be proving nothing.

It also means the seeders exercise the write paths. The demo seeder closing a quarter *after* writing is not a detail: closing first would make the seeder reject its own data, which is the lock working.

## `seed:spec`

Writes the four rows of the published sample table and nothing else, so nothing else can be mistaken for part of it.

Two details that matter more than they look:

- **February marketing is planned and never spent.** Not logged as zero. That is the distinction the whole missing-actual policy rests on, and a seeder that wrote a zero expense there would produce a table that looked right while the flag underneath it was wrong. A test asserts `hasActual` is false.
- **`Marketing` and `Payroll` are created on the account**, not resolved from the shared catalogue, which breaks spending down further into `Advertising` and `Salaries`. Bending the sample to fit the catalogue would stop a reader checking it against the table they have.

An e2e test runs this seeder and asserts the report returns the published variances exactly, which is the automated form of the manual check in the plan.

## `seed:demo`

A year of data across eight planned categories and two deliberately unplanned ones, plus a closed quarter.

The mix is chosen so the report shows every case rather than a column of near misses: months over plan, under plan, roughly on plan, planned with nothing spent, and spend against categories with no plan at all. That last one exists because unplanned spend is the row a naive report drops, and demo data without it would hide the bug rather than expose it.

Amounts are shaped rather than uniform. Payroll dwarfs stationery in a real business, and a demo where every category costs about the same makes the chart useless.

## Determinism

`Math.random` is not used anywhere. `deterministicRandom` is a linear congruential generator with a fixed seed: unsuitable for anything cryptographic, which is exactly why it is fine here, where the only requirement is that the numbers look varied and never change.

Two runs produce identical data, so a test can assert something about it and a screenshot taken today still matches next week.

Amounts are rounded to whole major units, because invented data reading as `4813.67` suggests a precision it does not have, and a reviewer should be able to add a column up in their head.

## Idempotency

The account is idempotent: running either seeder twice does not create a second one.

The data is not, and that asymmetry is correct rather than an oversight. Plans are cells, so re-seeding overwrites them. Expenses are line items, so re-seeding appends. That is exactly what those two things mean everywhere else in the system, and making the seeder special would misrepresent them.

## Why it has its own root module

`src/seed/main.ts` boots a context with only the modules seeding needs, not `AppModule`. A running API has no business exposing a way to fill its own database, and keeping `SeedModule` out of the server's graph means no route can reach it by accident. It uses an application context rather than a Nest application, because there is no server to start and creating one would bind a port for a script that writes rows and exits.

The exit code is set on failure. A seeder that logs an error and exits 0 looks like it worked, and the next command in a script would run against an empty database.
