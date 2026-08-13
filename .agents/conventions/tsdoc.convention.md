# TSDoc convention

"TSDoc" and "JSDoc" mean the same thing in this repository: the doc comment block above a declaration. The linter that checks it is `eslint-plugin-tsdoc`, which is why the file is named this way.

Enforced, not just expected. `tsdoc/syntax` is an eslint error, so a malformed or unknown tag fails the build rather than review.

## What gets a block

Everything exported, and every method: functions, methods, classes, interfaces, type aliases, enums, and exported constants. A short declaration still has a reason to exist that its body does not state.

One exception: a constructor that only assigns injected dependencies does not need its own block. The class block already covers it, and documenting it would be narration rather than information.

## The block goes above the declaration

Never inside it. One block per declaration, describing its members with `@property`.

Wrong:

```ts
export interface IErrorResponse {
  /** HTTP status. */
  statusCode: number;
  /** Stable code a client branches on. */
  code: ErrorCodeEnum;
}
```

Right:

```ts
/**
 * The single shape every error response takes.
 *
 * @property statusCode - HTTP status, repeated in the body so a logged payload is self contained.
 * @property code - Stable code a client branches on, never a substring of the message.
 */
export interface IErrorResponse {
  statusCode: number;
  code: ErrorCodeEnum;
}
```

The same rule covers object literals, enums, and type aliases. A member list stays scannable when it is not tripled in height by interleaved comments, and one block moves as a unit when the declaration moves.

## Tags

Standard TSDoc: `@remarks`, `@param`, `@returns`, `@throws`, `@typeParam`, `@example`, `@see`, `@deprecated`, and the inline `{@link}`.

Two custom block tags are declared in `tsdoc.json`, which is the only place a new tag may be introduced:

| Tag | Use |
|---|---|
| `@property` | One per member of an interface, enum, type alias, or object literal. Repeatable. |
| `@steps` | The ordered steps a function takes, where the sequence is the thing worth knowing. |

Using a tag that is not standard and not in `tsdoc.json` is a lint error. Add the definition deliberately or use an existing tag.

## Content

- Say what it does and why it exists. Describe behaviour, not implementation: a caller reads the block to decide whether to call it.
- Document every parameter with `@param`, the result with `@returns`, and every exception a caller can expect with `@throws`.
- Put the non-obvious reasoning in `@remarks`: why the query is shaped this way, why the tempting simpler approach is wrong.
- Update the block in the same edit as the code. A stale block is worse than none, because it is trusted.

```ts
/**
 * Rejects the write when the month is locked.
 *
 * @remarks
 * Every mutating path calls this, so lock enforcement lives in one place and no
 * route can bypass it.
 *
 * @steps
 * 1. Read the lock for this user and month.
 * 2. Throw when one exists.
 *
 * @param userId - The authenticated user whose period is being checked.
 * @param month - The month under check, as `YYYY-MM`.
 * @param session - Optional transaction session, so the check and the write it
 *   guards read the same snapshot.
 * @throws PeriodLockedException When a lock exists for that user and month.
 */
```
