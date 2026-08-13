## What?

<!-- What changed, at a level a reviewer can follow without opening the diff or
an issue tracker. Prose, not a ticket number. -->

## Why?

<!-- The goal this serves. Why the change is worth making now. -->

## How?

<!-- The decisions a reviewer should know about: the approach taken, the
alternatives rejected, anything in the diff that would otherwise look odd. Skip
the line by line narration; the diff covers that. -->

## Testing?

<!-- What was added or changed, and how it was verified. Tests belong in this
pull request, not a later one. Include the commands run and their result. -->

## Screenshots (optional)

<!-- Useful for backend work too: a response body, a failing request, an
explain() plan, a log line. -->

## Anything Else?

<!-- Follow up work, technical debt taken on deliberately, or something worth a
wider discussion. Say so here rather than leaving it for someone to find. -->

## Checklist

<!-- Run the `pr-patrol` skill against this diff before requesting review. It
checks the change against the conventions and writes its findings to
artifacts/pr/reviews/. -->


- [ ] Follows the conventions in [AGENTS.md](../AGENTS.md).
- [ ] Every new function and method carries TSDoc.
- [ ] Every README affected by this change is updated in this pull request.
- [ ] Tests cover the happy path, the failures, and the edge cases.
- [ ] `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` all pass.
- [ ] No secret, token, or personal identifier is logged, committed, or returned.
- [ ] Leaves the project in a working state on its own.
