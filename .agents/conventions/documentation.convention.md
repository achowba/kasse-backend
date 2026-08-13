# Documentation convention

## TSDoc

Every function and method carries TSDoc. No exceptions for short ones: a short function still has a reason to exist that its body does not state.

A block says what it does, the steps it takes when they are not obvious, and why it exists where the reason is not self evident.

```ts
/**
 * Rejects the write when the month is locked.
 *
 * Reads the lock for this user and month, and throws when one exists. Every
 * mutating path calls this so lock enforcement lives in one place and no route
 * can bypass it.
 *
 * @param userId - The authenticated user whose period is being checked.
 * @param month - The month under check, as `YYYY-MM`.
 * @param session - Optional transaction session, so the check and the write it
 *   guards read the same snapshot.
 * @throws PeriodLockedException When a lock exists for that user and month.
 */
```

- Document every parameter with `@param`, the result with `@returns`, and every exception a caller can expect with `@throws`.
- Describe behaviour, not implementation. A caller reads the block to decide whether to call it.
- Update the block in the same edit as the code. A stale comment is worse than none, because it is trusted.

## Comments in the body

- A comment explains why, not what. The code says what.
- Comment the non-obvious decision: why a query is shaped a certain way, why an edge case is handled as it is, why a tempting simpler approach is wrong.
- Do not narrate. `// increment the counter` above `counter++` is noise.

## Module README

Every folder under `src/common/` and `src/modules/` has a `README.md` covering:

1. **What it does.** One paragraph.
2. **How it relates to the rest of the project.** What calls it, what it calls.
3. **Its endpoints,** where it exposes any, as a table of method, path, and purpose.
4. **Its dependencies on other modules,** and why each is needed.

## Keeping docs true

- A README changes in the same commit as the code it describes. Never in a follow up.
- If a change alters a module's endpoints, its configuration, or the project structure, the affected README is part of that change.
- The root README's status table reflects what is actually built, not what is planned.
