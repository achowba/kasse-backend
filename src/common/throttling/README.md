# common/throttling

Rate limiting keyed by account rather than by address.

## Why an address is the wrong unit

The default `ThrottlerGuard` counts by IP. For an authenticated API that is wrong in both directions at once:

- **Too coarse.** An office, a school, a VPN, anything behind NAT shares one address. One person running reports exhausts the bucket for everyone sitting next to them, and the product appears broken for people who did nothing. This is the failure that generates support tickets.
- **Too loose.** One account can spread requests across a laptop, a phone, and a handful of cloud addresses and never reach a per address limit. The thing being limited is not the thing doing the work.

Once a request is authenticated the **account** is the meaningful unit of abuse, so that is what gets counted.

## What still counts by address

Unauthenticated requests, because there is nothing else to count. Signup and login have to be limited before anybody has an account, and those routes keep their own tighter credential limits.

A request with no resolvable address, which can happen behind a proxy that strips it, counts under a shared `unknown` bucket. That throttles more than it strictly should, which is the safe direction: the unsafe one is an unattributable flood that is never counted at all.

The `user:` and `ip:` prefixes exist so a request that has just authenticated cannot arrive at a bucket its address had already been filling.

Reading `request.user` is safe here because of guard order: the global authentication guard runs first, so by the time this guard is reached a token has either been verified or the route is public.

## The two expensive routes

Beyond the global limit, two routes carry their own, because they are not the same size of request:

| Route | Limit | Why |
|---|---|---|
| `GET /reports/plan-vs-actual` and its series and export | 60/min | An aggregation across two collections. Cached per account and per data version, so a reader refreshing the same view costs one query and then nothing. The limit bounds *distinct questions*, not page views, which is why it can sit well below the global limit without getting in anyone's way. |
| `POST /imports/expenses` | 6/min | Parses up to 5 MB in memory, validates every row, and writes up to ten thousand records in one transaction. The most expensive thing an authenticated caller can ask for, by a wide margin. Six per minute is more than anyone uploading spreadsheets needs. |

## Why the limits are configuration

They read `process.env` directly, which is the same documented exception the credential route limits take: `@Throttle` is a decorator, so its values are needed when the class is defined, before any injector exists.

Being configuration is not only for deployments. The end to end suite runs far more than six imports, and a hardcoded limit would quietly turn the import tests into throttler tests. The suite raises both in global setup, and the throttler has its own tests instead.

## What this is not

In-memory, per instance. Two instances mean two counters and effectively double the limit. That is acceptable at one instance and is the first thing to change when there is more than one: `@nestjs/throttler` takes a shared storage adapter, and the README at the repo root records this alongside the report cache, which has the same property for the same reason.

## Dependencies on other modules

`@nestjs/throttler` for the guard it extends, and `@common/auth` for the shape the JWT strategy attaches to the request.
