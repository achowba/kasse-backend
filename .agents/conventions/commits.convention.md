# Commits convention

This is enforced, not just documented. `commitlint` runs from a Husky `commit-msg` hook and rejects a message that breaks the rules below. `commitlint.config.mjs` extends `@commitlint/config-conventional` and adds `scope-empty: [2, 'never']`, which is what makes the scope mandatory.

`.gitmessage` is the commit template. Point git at it once per clone:

```bash
git config commit.template .gitmessage
```

## Format

Conventional Commits, with a scope that is required rather than optional.

```
type(scope): description
```

- `type` is one of `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`.
- `scope` is required. It is the module or area touched: `plans`, `actuals`, `reports`, `auth`, `categories`, `locks`, `imports`, `audit`, `nl-query`, `platform`, `scaffold`, `docker`, `seed`. For cross-cutting work use `repo`, `deps`, `ci`, `config`, or `docs`.
- `description` is imperative and lower case, with no trailing full stop. "add the lock gate", not "Added the lock gate."
- Keep the subject line under 72 characters.

## Body

- Explain why the change exists and what a reviewer should know. The diff already says what changed line by line.
- Note any decision a reader might question, and any tradeoff taken.
- Reference the behaviour that changed, not the files touched.

## Scope of a commit

- One logical change per commit. A rename bundled with a behaviour change hides the behaviour change.
- Every commit leaves the repository working: it builds, it lints, it passes its tests.
- A commit that changes a module includes that module's README update and its tests. Not a follow up.

## Branches

```
type/short-description
```

`feat/period-locks`, `fix/variance-zero-plan`, `docs/module-readmes`.

## Pull requests

- One reviewable concern per pull request, under roughly 400 lines of diff where the change allows.
- A pull request leaves the project in a working state on its own.
- The description follows `.github/pull_request_template.md`.
- Before opening one: run the checks, sweep the diff for convention drift, and update every README the change affects.
