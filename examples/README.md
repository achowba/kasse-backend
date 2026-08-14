# examples

Sample files for trying the CSV import without writing one first.

| File | What it does |
|---|---|
| [`expenses.csv`](expenses.csv) | 15 rows across three months. Imports cleanly. |
| [`expenses-with-errors.csv`](expenses-with-errors.csv) | Six rows, four of them broken in a different way each. Imports nothing. |

## Trying them

Sign up, then upload. No other setup is needed: every category in `expenses.csv` comes from the shared catalogue that is seeded at boot, so a brand new account can import it immediately.

```bash
TOKEN=$(curl -s -X POST http://localhost:1413/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.test","password":"a-long-enough-password"}' \
  | jq -r .accessToken)

curl -X POST http://localhost:1413/api/v1/imports/expenses \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -F "file=@examples/expenses.csv"
```

Then read the result back:

```bash
curl "http://localhost:1413/api/v1/reports/plan-vs-spend?from=2026-01&to=2026-03" \
  -H "Authorization: Bearer $TOKEN"
```

Spend appears with no plan against it, so every variance is the full amount. Set a few targets with `PUT /plans` to see the table do its actual job.

## `expenses.csv`

```csv
category,month,amount,note
Salaries,2026-01,42000.00,January payroll run
Payroll Taxes,2026-01,9870.55,
Advertising,2026-01,4800.00,Q1 campaign
```

Chosen to exercise the things that are easy to get wrong rather than to look tidy:

| Row | What it is there for |
|---|---|
| `Payroll Taxes,2026-01,9870.55,` | An empty `note`, which is optional and must not become the string `""`. |
| `Software Subscriptions,2026-01,1249.99` | An amount whose exact minor units matter. Parsed digit by digit it stores `124999`. Through a float it would store `124998`. |
| `Advertising,2026-03,-450.00` | A negative amount. A refund is real spending data and is deliberately allowed. |
| Three months of the same categories | So the report has something to group, and `?from=2026-01&to=2026-03` returns more than one row per category. |

## `expenses-with-errors.csv`

Uploading it returns `422` with `IMPORT_VALIDATION_FAILED` and this list:

| Line | Column | Why |
|---|---|---|
| 3 | `category` | No category of that name on the account. |
| 4 | `month` | `2026-1` is not `YYYY-MM`. |
| 5 | `amount` | `seven hundred` is not a number. |
| 6 | `category` | Empty. |

Two things worth noticing, because both are deliberate.

**Line numbers are spreadsheet lines, not row indexes.** The header is line 1, so the first data row is line 2. Reporting an array index would send somebody to the wrong line of their file, which is worse than not locating the error at all.

**Nothing is written, including the two rows that are perfectly valid.** The import is all or nothing: it validates every row before writing any, inside one transaction. A file that half imported would leave a user reconciling which rows landed, which is a worse position than a rejection they can fix and retry.

## What is not here

A file that is valid but *idempotent-replayed*, because that needs two requests rather than a different file. Upload `expenses.csv` twice with the **same** `Idempotency-Key` and the second call returns the original batch instead of doubling the spend. Change the key and it imports again, which is correct: a different key means a different intent.
