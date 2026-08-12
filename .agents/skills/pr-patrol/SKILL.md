---
name: pr-patrol
description: Reviews a pull request diff against this repo's conventions, its checklist, and the saved implementation plan, then writes a severity rated review. Use before merging, or to review someone else's branch.
---

# pr-patrol

## Purpose

Reviews a diff against the standards this repository already committed to, so a finding cites a rule rather than a preference. Produces a written review with each finding rated blocking, non-blocking, or minor.

## Inputs

| Input | Default | Meaning |
|---|---|---|
| target | current branch | A pull request number, a branch name, or a base and head pair. |
| plan | newest file in `artifacts/plans/` | The plan the work is measured against. |
| scope | whole diff | Restrict to given paths. |

## Workflow

1. **Gather the diff.** `gh pr diff <number>` for a pull request, or `git diff <base>...<head>` for a branch. Read the full files behind the hunks: a diff alone hides whether a guard already exists above the change.
2. **Load the standards.** Every file in `.agents/conventions/`, the checklist in `.github/pull_request_template.md`, and the plan.
3. **Review against each dimension.**
   - Correctness: does it do what it claims, including at the boundaries.
   - Product rules: is the lock gate called on every mutating path, is tenant scoping in the repository layer, is money in minor units, is variance percent `null` when the plan is zero.
   - Data modeling: is every new query pattern indexed, is uniqueness a unique index rather than an application check.
   - Security: validation at the edge, no secret in a log or response, no client supplied object passed into a filter.
   - Error handling: nothing swallowed, one envelope, log before throw.
   - Tests: happy path, failure, and edge cases present, and deterministic.
   - Documentation: TSDoc on every new function, and every affected README updated in the same change.
4. **Verify before reporting.** Read the code path end to end and confirm the finding is real. State the concrete input or state that produces the wrong result. Discard anything that does not survive this step.
5. **Rate each finding.**
   - **Blocking**: incorrect behaviour, a security or data integrity problem, a broken invariant, or a missing test for new logic.
   - **Non-blocking**: a real problem that does not have to stop the merge. Say what should happen and when.
   - **Minor**: naming, wording, or structure. Explicitly optional.
6. **Write the review.** Group by severity, most severe first. Each finding gets the file and line, the rule or invariant it breaks, the failure it produces, and a concrete fix.

## Output

- `artifacts/pr/reviews/<descriptor>_<YYYYMMDDHHMMSS>.review.md`, path printed.
- A summary: counts by severity, and a clear statement of whether anything blocks the merge.
- An empty findings list is a valid result. Say so plainly instead of manufacturing a comment.

## Rules

- Cite the convention. A finding with neither a rule nor a demonstrated failure is a preference, and belongs in Minor or nowhere.
- Do not restate what the diff does. Report what is wrong with it.
- Do not comment on formatting. Prettier and eslint own that, and CI already fails on it.
