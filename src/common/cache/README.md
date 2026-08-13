# common/cache

The per account counter that invalidates cached reports.

## Where this sits

Kasse tracks monthly spending targets against what was actually spent. The report is an aggregation across two collections, so it is cached per account. This folder holds the half of that cache which decides when an entry stops being valid.

The cache itself lives in [`modules/reports`](../../modules/reports/README.md). Only the counter is here, and that split is the whole point of the folder existing.

## Why the counter is not in the reports module

Because putting it there creates a dependency cycle that compiles.

The modules that must invalidate a report are **plans**, **expenses**, and **period locks**: every write to any of them changes what a report would say. The module that reads the counter is **reports**, which already imports all three for their models.

If reports owned the counter, those three would have to import reports back. Nest resolves that at runtime, not at compile time, so it does not fail the build. It fails later, as an injected dependency that is `undefined` at whichever call site happens to run first, with an error naming neither module involved.

Putting the counter in `common` means everything depends downward. `npm run lint:circular` runs madge over `src` in CI and fails on any cycle, so the arrangement is enforced rather than remembered.

## How invalidation works

```ts
dataVersionService.current(userId)   // read, starts at 0
dataVersionService.bump(userId)      // called after any write to a plan, expense, or lock
```

The account's version is part of every cache key. Invalidation is therefore **an increment, not a search**: bumping makes every previously cached entry for that account unreachable, whether there was one or fifty. Nothing has to be found and deleted, and nothing can be missed.

A pleasant consequence: because the report's cache key holds the **resolved** month range rather than the request, changing an account's fiscal year start needs no invalidation at all. The same request simply resolves to a different range and therefore a different key.

## Per process, deliberately

Each instance holds its own counter and its own cache. That is consistent rather than broken: an instance only ever needs to invalidate what it cached itself, so nothing is shared and nothing can go stale across instances.

The cost is that a second instance means a second cache, and neither warms the other. That is the correct first thing to change when there is more than one instance, and the root README records it alongside rate limiting, which has the same property for the same reason.

## Global by design

`CacheModule` is `@Global()`. Every writer needs the counter, and threading an import through four feature modules to share one integer would be noise. It holds no domain logic at all, which is what makes that acceptable.

## Dependencies on other modules

None. It depends on `mongoose` only for the `ObjectId` type in its signatures.
