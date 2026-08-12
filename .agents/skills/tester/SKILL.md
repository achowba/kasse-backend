---
name: tester
description: Generates unit, integration, or end to end tests for a file, module, or feature, following this repo's Jest setup and naming, covering the happy path, failures, and edge cases. Use after writing code that has no tests yet.
---

# tester

## Purpose

Writes tests that would actually catch a regression, using the project's real Jest configuration rather than a generic template.

## Inputs

| Input | Default | Meaning |
|---|---|---|
| target | required | A file, a module folder, or a feature name. |
| kind | inferred | `unit`, `integration`, or `e2e`. A service or utility infers `unit`; a controller with a guard or a pipe infers `e2e`. |
| run | true | Run the tests after writing them and iterate until they pass. |

## Workflow

1. **Read the target and its neighbours.** The service under test, its schema, its DTOs, and any guard or filter in its request path. A test written from a signature alone tests the signature.
2. **Read the conventions.** `.agents/conventions/testing.convention.md` for layout, naming, and determinism. Match the surrounding tests instead of introducing a second style.
3. **Detect the setup.** Unit tests run under the Jest config in `package.json` with `rootDir` at `src`. End to end tests run under `test/jest-e2e.json`. Never add a third configuration.
4. **Enumerate cases before writing any.** For each public method list:
   - the happy path,
   - every failure the code explicitly rejects,
   - the edge cases that break a naive implementation. In this project those are: an empty date range, a plan of zero, an absent actual against a present plan, an actual with no plan, a boundary month such as `2026-01` or `2026-12`, a negative amount, a locked period, a month change across a lock, and a malformed or duplicated CSV row.

   Say which cases were chosen and which were left out, and why.
5. **Write the tests.**
   - Unit: beside the source as `{name}.spec.ts`. Mock the Mongoose model with `getModelToken(Name.name)` so no database is needed. Mock every external dependency.
   - End to end: `test/{feature}.e2e-spec.ts`, driven through `supertest` against `mongodb-memory-server` started as a replica set, so guards, pipes, filters, and transactions are all genuinely exercised.
   - One reason to fail per test. Assert on behaviour, never on which private method ran.
   - No unseeded randomness, no reliance on the real clock, no dependence on test order.
6. **Run them.** `npm test` or `npm run test:e2e`. Fix the tests when they are wrong. When a test reveals a defect in the source, report it rather than weakening the test to pass.

## Output

- The test files, in the correct location with the correct names.
- The run result, quoted.
- A list of the cases covered, plus anything deliberately not covered and why.

## Rules

- A test that cannot fail is worse than no test. If it passes against deliberately broken source, it is not a test.
- Do not raise coverage with tests that assert nothing meaningful.
- Do not change the source to make a test easier unless the change is an improvement on its own terms.
