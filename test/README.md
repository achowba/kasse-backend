# test

End to end specs, run against a real MongoDB rather than a mock.

## What the suite brings with it

Nothing is borrowed from the machine running it. `global-setup.ts` starts an in-memory MongoDB as a single node replica set, because the CSV import writes in a transaction and transactions require one, and it generates an RSA keypair for token signing.

The keys used to come from a developer's `.env`, which is gitignored. That passed locally and failed everywhere else, and CI failed every e2e test the first time the repository was pushed. Generating them means a fresh clone passes with no setup, no test signing key exists anywhere to leak, and each run gets its own pair so a token cannot outlive the run that made it.

Both are set before any test file loads, which is the point: `AppModule` validates the environment at **import** time, so a value set inside a `beforeAll` would already be too late.

## Why the timeout is 30 seconds, not Jest's 5

Because the thing being tested is deliberately slow.

Password hashing is argon2id at 19 MiB and two passes, which is a security property rather than a defect: it exists to make a stolen hash expensive to attack. The auth suite hashes a password in most of its tests. Add a Nest application boot and a `mongod` per worker, and a loaded machine takes an entire suite past five seconds.

That produced a genuinely misleading failure. When `beforeAll` timed out partway, the access token was never assigned, so every request afterwards sent `Bearer undefined` and the suite reported **`401 Unauthorized`** rather than a timeout. Chasing an authentication bug that does not exist is a bad afternoon, and the honest fix was to stop pretending a suite that hashes passwords fits in a unit test's budget.

## Why the suites run one at a time

`maxWorkers` is 1, and that was measured rather than assumed.

Running in parallel, roughly one full run in five failed with a `socket hang up` on a CSV upload. The same suite passed nineteen for nineteen, six times in a row, on its own. So it was contention between workers sharing one `mongod`, not a defect in the upload path.

Serialising costs about one second: five and a half against four and a half. Five consecutive runs then passed. A second is not worth a suite anyone has to run twice to believe, and a flaky suite is worse than a slow one because it teaches people to ignore red.

## Layout

| File | Holds |
|---|---|
| `global-setup.ts` | The replica set, the generated keypair, and the raised rate limits. |
| `global-teardown.ts` | Stops the replica set. |
| `mongo-global.ts` | The typed handle setup and teardown share. |
| `jest.setup.ts` | Imports `reflect-metadata`, which the decorators need before any module loads. |
| `app.e2e-spec.ts` | Boot, health, the error envelope, request ids. |
| `auth.e2e-spec.ts` | Signup, login, rotation, reuse detection, sessions. |
| `reports.e2e-spec.ts` | The aggregation, which unit tests cannot reach. |
| `imports.e2e-spec.ts` | Fail closed and idempotent replay, both of which are database behaviour. |
| `seed.e2e-spec.ts` | That the spec seeder really does reproduce the published table. |
| `openapi.e2e-spec.ts` | That the committed contract matches the running app. |

## The rate limits are raised here

The suite exercises the report and import routes well past their per account limits, and the credential routes past theirs. They are raised in global setup so these tests are about the report, the import, and authentication rather than about the throttler, which has its own unit tests.

## Regenerating the contract

```bash
npm run openapi:emit
```

Writes `openapi.json` from the running application. `openapi.e2e-spec.ts` fails when the committed file has drifted, which is what keeps the frontend's contract honest without either repository having to reach the other.
