# Code standards convention

## Typing

- `strict` is on, along with `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, and `noPropertyAccessFromIndexSignature`. Do not weaken a compiler option to make code pass.
- `any` is a lint error. Use `unknown` and narrow it. If a third party type genuinely forces `any`, disable the rule on that single line with a comment saying why.
- Do not use a non-null assertion (`!`) to silence the compiler. Narrow the type or handle the absent case.
- One exception: a decorated class field uses a definite assignment assertion, as in `@Prop() name!: string`. The decorator assigns the field at runtime and the compiler cannot see it. This applies to Mongoose schema classes and to DTOs, and nowhere else.
- Prefer a union of string literals over an enum. Where an enum is clearer, use a `const` object with a derived type.
- Type every exported function's parameters and return value explicitly. Inference is fine for locals.

## Naming

- `camelCase` for variables and functions, `PascalCase` for classes and types, `SCREAMING_SNAKE_CASE` for module level constants.
- Files are `kebab-case` and carry their role: `plans.service.ts`, `plan.schema.ts`, `create-plan.dto.ts`.
- A money field ends in `Minor` so its unit is visible at the call site: `targetMinor`, `amountMinor`.
- A boolean reads as a predicate: `hasActual`, `isLocked`. Not `actual`, not `lockFlag`.
- Say what a thing is, not what it is not. `activeOnly` rather than `notArchived`.

### Acronyms

- An acronym in a type name is fully uppercase: `UserResponseDTO`, `CSVImportService`, `ErrorResponseDTO`. Never `Dto`, never `Csv`.
- A camelCase name that starts with an acronym lowercases the whole acronym: `apiKey`, `csvRows`. Never `aPIKey`.
- One exception, and it is deliberate: an identifier suffix keeps the conventional `Id` form, as in `userId`, `categoryId`, `requestId`. These are stored schema field names, so renaming them to `userID` would rename fields in every document for no gain, and `Id` is universal in this ecosystem.
- File names stay kebab-case with a lowercase role suffix: `user-response.dto.ts`, not `user-response.DTO.ts`.

## Constants live in their own file

A module level constant does not sit at the top of a service, a repository, a controller, a DTO, a schema, or a module. It goes in a constants file beside them:

```
src/modules/plans/plans.constants.ts
src/common/month/month.constants.ts
```

This is about where a value can be found and changed, not about tidiness. A limit, a timeout, a default, or a pattern is configuration expressed in code, and someone changing it should not have to know which of eight files it was declared in. Collecting them also makes it obvious when the same number has been written twice under different names.

- Name the file after its folder: `<folder>.constants.ts`.
- Export everything from it. A constant used by exactly one file still belongs there, because that is where the next person will look.
- Give each one a doc block saying what it governs and why it has that value. A number with no reason is a number nobody dares change.
- A local inside a function is not a module constant and stays where it is.
- Values shared across features go in `@common/constants`; values belonging to one feature stay in that feature's file.

## Async

- `async`/`await` only. No `.then()` chains.
- Never leave a promise unhandled. `no-floating-promises` is an error. Use `void` deliberately when a fire and forget is genuinely intended, and say why in a comment.
- Do not run independent awaits in sequence. Use `Promise.all` when calls do not depend on each other.
- A function that can reject documents it with `@throws`.

## Structure

- A file holds one exported concern. Aim under 300 lines. Past that, split by responsibility, not by line count.
- A service holds business rules. A controller only translates HTTP to a service call and back. No business logic in a controller.
- No default exports. Named exports keep imports greppable and renames honest.
- Constructor injection only. Do not reach for a module level singleton or a service locator.
- Dead code is deleted, not commented out. Git holds the history.

## No circular dependencies

`npm run lint:circular` runs `madge` over `src` and fails on any cycle. It runs in CI beside the linter.

A cycle between two modules compiles, passes the type checker, and passes unit tests that mock the other side. It fails at runtime instead, as an injected dependency that is `undefined`, at whichever call site happens to run first. That failure names neither module involved, which is why this needs a tool rather than review.

Barrel files make cycles easy to create without noticing: importing `@modules/categories` pulls in everything that barrel re-exports, not the one class named. When a cycle appears, the fix is usually that a shared type belongs in `common/`, or that one direction should be an event rather than a call. Deleting the barrel import in favour of a deep path hides the cycle from a reader while leaving it in place, so it is not a fix.

`import type` is excluded, because a type-only import is erased before it can form a runtime cycle.

## Immutability

- `const` unless reassignment is required.
- Do not mutate a function parameter. Return a new value.
- Treat a document returned from Mongoose as read only unless you are about to save it.
