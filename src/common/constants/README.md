# common/constants

Values more than one feature needs.

## Where this sits

Kasse tracks monthly spending targets against what was actually spent. This folder holds the handful of values that genuinely cross feature boundaries.

The bar for living here is deliberately high. A value used by exactly one module belongs in that module's `<folder>.constants.ts`, where the next person will look for it. This folder is for things the whole service agrees on.

## What it holds

| Constant | Governs |
|---|---|
| `API_PREFIX` | The global route prefix, `api`. Combined with URI versioning it produces `/api/v1/...`. |
| `API_DOC_VERSION` | The version reported in the OpenAPI document. |
| `BOOTSTRAP_CONTEXT` | The log context on the startup line, so the line a developer greps for on every restart has one spelling. |

## Why the document version is not the package version

`API_DOC_VERSION` is deliberately separate from the version in `package.json`. One describes the **contract**, the other describes the **build**. A release that fixes a bug without changing any route changes the package version and must not change the contract version, because a client watching for contract changes would be woken for nothing.

## A note on the prefix

`API_PREFIX` is applied by `app.setGlobalPrefix`, and Nest applies it to middleware paths too. That is not obvious and it caused a real bug: the request logger was registered for `*splat`, became `/api/*splat`, and silently stopped logging every request outside `/api`. Details in [common/logging](../logging/README.md).

## Why constants live in their own files at all

A limit, a timeout, a default, or a pattern is configuration expressed in code. Someone changing one should not have to know which of eight files declared it. Collecting them also makes it obvious when the same number has been written twice under different names.

Each one carries a doc block saying what it governs and why it has that value, because a number with no stated reason is a number nobody dares change.

## Dependencies on other modules

None.
