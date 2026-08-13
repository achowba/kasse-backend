# Artifacts convention

Every workflow output goes under `artifacts/`. Never the system temp directory, which is volatile, hidden from search, and gone on reboot.

## Naming

```
artifacts/<category>/<descriptor>_<YYYYMMDDHHMMSS>.<type>.md
```

- `<descriptor>` is short and `snake_case`.
- `<YYYYMMDDHHMMSS>` is the creation time, from `date "+%Y%m%d%H%M%S"`.
- `<type>` matches the kind of output: `plan`, `review`, `notes`, `ref`, `handoff`.
- Print the path after writing the file, so it can be found again.

## Categories

| Path | Holds | Example |
|---|---|---|
| `artifacts/plans/` | Implementation plans, written before the code they describe | `kasse_backend_20260812171645.plan.md` |
| `artifacts/pr/reviews/` | Review output from the `pr-patrol` skill | `feat_reports_20260812184500.review.md` |
| `artifacts/pr/labels/` | Cached repository labels. A cache keyed by `lastSyncedAt`, so it is exempt from the naming pattern above | `index.json` |
| `artifacts/notes/` | Research and scratch write ups | `mongo_index_tradeoffs_<TS>.notes.md` |
| `artifacts/refs/` | Lookup documents reused across sessions | `report_pipeline_<TS>.ref.md` |
| `artifacts/handoffs/` | Session handoffs | `backend_state_<TS>.handoff.md` |

Create a new category when none fits, and follow the same pattern inside it.

## Not committed

`artifacts/` is in `.gitignore`. These files are working output, not deliverables: a plan, a review, or a scratch note is not part of the running service and does not belong in its history.

A plan is written before the work starts, and work proceeds from the saved file rather than from memory.
