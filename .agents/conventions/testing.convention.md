# Testing convention

## Layout

- A unit test sits beside its source as `{name}.spec.ts`. `plans.service.ts` is tested by `plans.service.spec.ts` in the same folder.
- An end to end test lives in `test/` as `{feature}.e2e-spec.ts` and runs under `test/jest-e2e.json`.
- No separate mirror tree. A test next to its subject is found and updated when that subject changes.

## Unit tests

- Every service and every utility has one.
- External dependencies are mocked. A Mongoose model is provided with `getModelToken(Name.name)` and a mock object, so a unit test needs no database.
- Each test covers three things: the happy path, the failure the code is written to reject, and the edge case that breaks a naive implementation. For this project the edge cases that matter are an empty range, a plan of zero, an absent actual, a boundary month, a negative amount, and a malformed CSV row.
- Assert on behaviour, not on how it was reached. Test that a locked month is rejected, not that a particular private method was invoked.
- One reason to fail per test. A test whose name contains "and" is usually two tests.

## End to end tests

- Run against a real MongoDB through `mongodb-memory-server`, started as a replica set so transactions work.
- Go through HTTP with `supertest`. That is the only way to prove a guard, a validation pipe, and an exception filter are actually wired in.
- Three behaviours are covered because they are the ones the product promises: the report's numbers match the stored data, a locked period rejects every kind of edit, and CSV import validates and replays idempotently.

## Determinism

- No unseeded randomness. A seeder or a fixture that varies between runs makes a failure unreproducible.
- No dependence on the real clock for logic under test. Inject the time or freeze it.
- No dependence on test order, and no shared mutable state between tests. Each test sets up and tears down what it needs.

## Coverage

- Coverage thresholds are enforced in the Jest config and CI fails below them.
- Coverage is a floor, not a goal. A pure calculation like the variance module is expected to be covered exhaustively, including every branch of the plan-is-zero and missing-actual cases. Wiring code is not padded with tests to raise a number.
