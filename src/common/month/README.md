# common/month

Month arithmetic over the `YYYY-MM` string.

## What it does

Validates, parses, formats, compares, and shifts months, expands an inclusive range, expands a calendar quarter, and resolves a fiscal year to the months it covers.

## Why a string and not a Date

A month here is `2026-01`, never a `Date`. Three consequences, all of them the reason for the choice:

1. **It sorts chronologically as text.** A date range filter is `$gte` and `$lte` on an ordinary index, with no computed field and no conversion.
2. **No timezone can move a record.** A `Date` for "January 2026" is a moment, and a moment shifts across offsets. Stored as midnight UTC, it can read as December in a negative offset.
3. **It is what a user means.** Spend belongs to a month, not to an instant. The stored value matches the concept.

The cost is that arithmetic has to be written rather than inherited. `addMonths` works on a zero based absolute month index, so December plus one is January of the next year and never month 13.

## Fiscal years and quarters

A fiscal year is named for the calendar year it starts in. With a January start, fiscal 2026 is `2026-01` to `2026-12`, which is the calendar year and the default. With an April start, fiscal 2026 is `2026-04` to `2027-03`.

Quarters are calendar quarters: Q1 is January through March, whatever a user's fiscal year start is. Locking a quarter writes three month locks, so the lock data shape stays month based and one query answers both.

## How it relates to the rest of the project

Plans, actuals, and period locks all key on a month. Reports filter by a month range. The CSV import validates the month column against `isValidMonth` before writing anything.

## Endpoints

None.

## Dependencies on other modules

None.
