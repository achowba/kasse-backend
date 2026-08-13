---
name: pr-doc-creator
description: Analyses the local changes and writes a pull request description in this repo's template format, then opens or updates the pull request assigned to its author. Use when a branch is ready to review.
---

# pr-doc-creator

## Purpose

Turns a diff into a pull request description a reviewer can act on. It fills every section of `.github/pull_request_template.md`, applies labels from a locally cached label list, and assigns the pull request to its author.

## Inputs

| Input | Default | Meaning |
|---|---|---|
| base branch | `main` | What the branch is compared against. |
| pull request number | none | When given, updates that pull request instead of creating one. |
| draft | false | Opens as a draft. |

## Workflow

1. **Read the change.** `git diff <base>...HEAD` for content, `git log <base>..HEAD` for the intent the author already wrote down. Group the diff by concern, not by file.
2. **Read the template.** Take the section headings from `.github/pull_request_template.md` rather than assuming them, so the description tracks the template if it changes.
3. **Sync the label cache.** Read `artifacts/pr/labels/index.json`. Refresh it when the file is absent or its `lastSyncedAt` is more than 4 days old:

   ```bash
   gh label list --limit 200 --json name,description
   ```

   Write the result back with a fresh `lastSyncedAt`. Never call the API when the cache is fresh.

   ```json
   { "lastSyncedAt": "2026-08-12T17:00:00.000Z", "labels": [{ "name": "backend", "description": "..." }] }
   ```

4. **Draft the description.** Fill `What?`, `Why?`, `How?`, and `Testing?` from the diff and the commit bodies. Leave `Screenshots` out when there is nothing visual, rather than writing "N/A". Put deliberate follow up work in `Anything Else?`.
5. **Check the checklist honestly.** Tick only what is true. An unticked box is information; a falsely ticked one is a defect.
6. **Cross-reference.** Confirm the change moves the project toward the deliverables and meets the standards in `.agents/conventions/`. Note any gap in `Anything Else?`.
7. **Write the file,** then create or update the pull request.

   ```bash
   gh pr create --title "<type(scope): description>" --body-file <path> --assignee @me --label <labels>
   gh pr edit <number> --body-file <path>
   ```

## Output

- The description at `artifacts/pr/<branch>_<YYYYMMDDHHMMSS>.notes.md`, per the artifacts convention.
- A created or updated pull request, assigned to its author, with labels applied.
- The pull request URL printed.

## Rules

- Follow `.agents/conventions/language-and-style.convention.md`. No filler, no marketing words, no praise of the code.
- Describe what the change does and what it costs. Do not claim a benefit the diff does not deliver.
- Never invent a test that was not run.
