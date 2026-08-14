# Labels convention

Issues and pull requests are triaged with the GitHub label set on `achowba/kasse-backend`. Labels are grouped by category and hue: `type:` (green), `priority:` (red to amber), `status:` (brown), `module:` (blue), `area:` (teal), `integration:` (purple), the GitHub defaults (grey), and flat cross-cutting concerns (orange). Every description says when to apply; GitHub caps each at 100 characters.

## Local cache

A local cache lives at `.artifacts/labels/labels.json` (gitignored), shaped:

```json
{
  "repo": "achowba/kasse-backend",
  "lastFetchedAt": "<ISO 8601 UTC>",
  "labels": [{ "name": "...", "description": "...", "color": "..." }]
}
```

`labels` is the GitHub Labels API array. GitHub is the source of truth; the cache is a refreshable mirror, never hand-edited to diverge from GitHub.

## When labeling a PR or issue

1. **Refresh if stale.** If the cache is missing, or its `lastFetchedAt` is more than 2 days old, refresh it first: `gh api repos/achowba/kasse-backend/labels --paginate`, rewrite the file, and set `lastFetchedAt` to the current UTC time.
2. **Label the relevant dimensions.** Apply from the cache: one `type:` (or `documentation` for a docs-only PR), the `module:`(s) touched, and `priority:`/`status:` as they apply; add `area:`, `integration:`, or a concern label (`security`, `data-integrity`, `error-handling`) where relevant. Example: `gh pr edit <n> --add-label "type:feat,module:reports,priority:high"`.
3. **Upsert a missing label.** If a needed label is not on GitHub yet, create it with a category-appropriate hue (`gh label create "<name>" --color <hex> --description "<text, 100 chars max>" --force`), then refresh the cache. Never delete labels.

## Modules and areas

`module:` names a business domain (`auth`, `users`, `categories`, `plans`, `expenses`, `period-locks`, `reports`, `imports`, `audit-log`, `nl-query`, `health`, `seed`); `area:` names a cross-cutting layer (`ci`, `docker`, `deps`, `lint`, `testing`, `config`, `tenancy`, `observability`, `api-contract`). Prefer a `module:` when the change is domain-specific and an `area:` when it is infrastructural. Avoid time-bound labels (for example a phase number); a label describes what a change touches, not when it lands.

A change can carry more than one `module:`. A period lock gate reached from expenses is genuinely both, and labelling it as one hides half the review surface.

## The concern labels earn their place

`security`, `data-integrity`, and `error-handling` cut across every module, and they are the three dimensions this codebase is most often wrong in. A change carrying one of them is asking for a specific kind of review, which is different from asking for review at all.

## Colors

One hue per category; lightness or saturation varies within a family so every color is unique (no two labels share a hex). The `type:`, `priority:`, and `status:` hexes are copied from `on-defined/api-service` so a shared category looks the same across repositories.
