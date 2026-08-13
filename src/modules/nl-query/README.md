# modules/nl-query

Ask about spending in plain language.

```
POST /api/v1/reports/nl-query
{ "question": "How did marketing do in Q1 2026?" }
```

## The model never writes a query

This is the entire design, and it is worth stating as a negative because the obvious implementation is the dangerous one.

The model is **not** asked to produce a database query, an aggregation, a filter document, or SQL. It is given exactly one tool whose schema is a report filter:

```
from            YYYY-MM
to              YYYY-MM
categories      names from this account's own list
groupBy         month | category
missingSpend  zero | null
interpretation  one sentence, shown back to the user
```

It cannot express a collection, a field, an operator, or a database. It never sees a connection string. The category names it may choose from are read from the caller's account and put in the schema, so it picks between words a person recognises rather than between object ids it cannot reason about.

## Its output is input, not instructions

Whatever comes back goes through `ReportQueryDTO`, the same class-validator DTO a hand written request passes, with `whitelist` and `forbidNonWhitelisted` on. Then the same `ReportsService` runs it.

That means **this endpoint cannot reach anything `GET /reports/plan-vs-spend` could not**, whatever the model returns. A reply carrying `$where`, a `userId`, or a `limit` of a million loses those fields at the validation boundary; a reply with a malformed month is a `502`, not a query. Tests assert exactly those cases rather than only the happy path.

Two checks go beyond the DTO:

- **Category names are intersected with the account's own.** The `enum` in the tool schema is guidance to the model, not a guarantee from it.
- **Both months are required.** The DTO marks them optional because a report may instead name a fiscal year, and this tool offers only the range. Without the extra check an omitted month would become an empty string, pass the range comparison, and match every month on record. A test pins this, and it is how the bug was found.

## The interpretation comes back with the data

A user has to be able to see that "last quarter" was read as the months they meant. An answer with no visible interpretation is one the reader has to trust blindly, which is the wrong relationship to have with a model.

The reference month is put in the system prompt so relative phrasing resolves against today rather than against whenever the model believes the present to be.

## It degrades rather than breaks

| Situation | Response |
|---|---|
| No `ANTHROPIC_API_KEY` | `503` with a clear message. Checked before any work, and every other endpoint is unaffected. |
| Model unreachable, or times out after 20s | `502`, with the cause logged. The caller is told to use the report endpoint directly. |
| Model returns no tool call | `502`. `tool_choice` forces the tool, so this should not happen; it is handled because "should not happen" is not "cannot". |
| Model returns an unusable filter | `502`, with the failing field names logged. |

The key is optional in the validated environment on purpose. That is what makes the feature shippable without provisioning a key everywhere, and it means a deployment without one is a working deployment rather than a broken boot.

## What is recorded

The question, the resolved range, the categories, and the row count go to the audit trail. A query that never ran is not recorded, because an entry claiming a question was answered when it was not is worse than no entry.

The question text is stored. It is the user's own words about their own spending, which the trail already holds in more detail, so it carries nothing the audit log did not already have.

## Cost

One model call per question, capped at 1,024 output tokens for a reply that is at most six short fields. The task is filling a small fixed schema from one sentence, which does not need a frontier model, so it uses Sonnet.

## How it relates to the rest of the project

A thin layer over `@modules/reports`. It owns no schema and no collection: its whole job is turning a sentence into a filter the report already knows how to run, which is precisely what keeps the model from reaching further.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/reports/nl-query` | Turn a question into a report filter, run it, and return both. |

## Dependencies on other modules

`@modules/reports`, `@modules/categories`, `@modules/audit-log`, plus `@common/config` for the optional key and `@common/month` for the reference month.
