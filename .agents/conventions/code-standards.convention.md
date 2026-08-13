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

## Immutability

- `const` unless reassignment is required.
- Do not mutate a function parameter. Return a new value.
- Treat a document returned from Mongoose as read only unless you are about to save it.
