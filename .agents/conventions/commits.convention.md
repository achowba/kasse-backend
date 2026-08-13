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
- `scope` is required. It is the module or area touched: `plans`, `expenses`, `reports`, `auth`, `categories`, `locks`, `imports`, `audit`, `nl-query`, `platform`, `scaffold`, `docker`, `seed`. For cross-cutting work use `repo`, `deps`, `ci`, `config`, or `docs`.
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
- Labels come from [labels](labels.convention.md): one `type:`, the `module:`(s) touched, and any concern that applies.
- Before opening one: run the checks, sweep the diff for convention drift, and update every README the change affects.

### Work reaches main through a pull request

Not by pushing to it. A branch, a pull request, a description, and a merge, even when the author is the only person on the repository.

The description is the reason. A commit message explains a change to whoever runs `git log`; a pull request explains it to whoever is deciding whether to accept it, and those are different audiences with different questions. Writing that down at the time is also the cheapest moment to notice that a change does two things and should have been two pull requests.

### A pull request title is a sentence, not a commit subject

The two are deliberately different, and using one format for both is the mistake this section exists to prevent.

| | Format | Example |
|---|---|---|
| **Commit subject** | `type(scope): description`, enforced by commitlint | `feat(reports): plan against spend, with variance` |
| **Pull request title** | A sentence in the imperative, sentence case, no prefix | `Report plan against spend, with variance` |

A commit subject is parsed. The type and scope drive changelogs and tooling, so they belong in a fixed grammar.

A pull request title is **read**, in a list, by a person deciding what to open. `type:` and `module:` labels already carry the classification, in a form that filters and colours; repeating it in the title spends the first fifteen characters of every row on information that is already there, and makes a list of pull requests read like machine output.

So: no `feat:`, no `fix(scope):`, no ticket prefix. Say what the change does to the product, and let the labels say what kind of change it is.

Two more rules that follow from a title being read rather than parsed:

- **Describe the outcome, not the mechanism.** `Stop the container crash looping in development mode` beats `Add a pino-pretty resolve check`. The second is the diff; the first is why anyone cares.
- **No trailing period**, and no `WIP`. A draft pull request is how you say it is not ready.
