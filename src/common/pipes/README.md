# common/pipes

Boundary conversions shared by every controller.

## Where this sits

Kasse tracks monthly spending targets against what was actually spent. Most validation happens through DTOs and the global `ValidationPipe`, which strips unknown properties and rejects a request carrying them. A path parameter is the one input a DTO cannot reach, so it is handled here.

## `ParseObjectIdPipe`

Turns a path parameter into a Mongo `ObjectId`, rejecting anything malformed with a `400`.

```ts
@Delete(':expenseId')
async remove(@Param('expenseId', ParseObjectIdPipe) expenseId: Types.ObjectId): Promise<void>
```

## Why it exists

Two reasons, and the second matters more than it looks.

**A bad identifier is a bad request, not a server error.** Without the pipe a malformed id travels to the database and surfaces as a Mongoose cast error, which the exception filter can only classify as a `500`. That is the wrong answer and the wrong signal: error rate is an alerting signal, and filling it with requests that were simply malformed makes it useless. The caller sent something invalid, and telling them so is both accurate and actionable.

**It makes service signatures honest.** Converting at the boundary means a service takes `Types.ObjectId` and can trust it. The alternative is every service accepting a `string` and re-validating, which is the same check written many times and forgotten once.

## Where the parsing happens matters

This is the same principle the rest of the codebase follows: convert once, at the edge, and let everything inside work with a type that cannot be wrong. Money is parsed to integer minor units at the edge. Months are validated against a pattern at the edge. Identifiers are parsed here.

The payoff is that a service reading `Types.ObjectId`, `number` minor units, and a `YYYY-MM` string has no defensive code in it at all.

## How it relates to the rest of the project

Used by every controller with an id in its path: expenses, plans, categories, imports, and session revocation.

## Dependencies on other modules

None.
