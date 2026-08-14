# docs

Reference material that is not code.

| File | What it is |
|---|---|
| [`plan-vs-actual-tracker.pdf`](plan-vs-actual-tracker.pdf) | The specification this product was built against. |

## Reading it alongside the code

The brief describes what the product should do. The [root README](../README.md) describes what was built and why, and answers each requirement in its own section rather than in a checklist:

| The brief asks for | Where it is answered |
|---|---|
| Authentication, each user seeing only their own data | [Security](../README.md#security), and `BaseTenantRepository`, which scopes every query in one place rather than per handler |
| Categories | [Endpoints](../README.md#endpoints). A seeded catalogue shared by every account, plus categories an account owns |
| Plans as monthly targets | [Plans are cells, expenses are line items](../README.md#plans-are-cells-expenses-are-line-items) |
| Logging spend, by hand or by CSV | [Endpoints](../README.md#endpoints), with runnable samples in [`examples/`](../examples/) |
| The variance report | [Variance, and the three cases that break it](../README.md#variance-and-the-three-cases-that-break-it), and [The report aggregation](../README.md#the-report-aggregation) |
| Locked periods | [Locking a period](../README.md#locking-a-period) |

Where the implementation goes further than the brief, or deliberately stops short of it, that is recorded in [Assumptions and tradeoffs](../README.md#assumptions-and-tradeoffs) rather than left for a reader to infer.

## Why the PDF is here at all

So the requirements and the implementation live in one place. A specification that arrives as an attachment is a specification nobody can find six months later, and the questions it settles keep getting re-asked.

It sits in `docs/` rather than at the repository root deliberately. The root is the first screen anybody sees, and the README belongs there.
