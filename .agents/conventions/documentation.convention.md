# Documentation convention

## Doc blocks

See [tsdoc](tsdoc.convention.md). It covers where a block goes, which tags exist, and what it must say.

## Comments in the body

- A comment explains why, not what. The code says what.
- Comment the non-obvious decision: why a query is shaped a certain way, why an edge case is handled as it is, why a tempting simpler approach is wrong.
- Do not narrate. `// increment the counter` above `counter++` is noise.

## Module README

Every folder under `src/common/` and `src/modules/` has a `README.md` covering:

1. **What it does.** One paragraph.
2. **How it relates to the rest of the project.** What calls it, what it calls.
3. **Its endpoints,** where it exposes any, as a table of method, path, and purpose.
4. **Its dependencies on other modules,** and why each is needed.

## Keeping docs true

- A README changes in the same commit as the code it describes. Never in a follow up.
- If a change alters a module's endpoints, its configuration, or the project structure, the affected README is part of that change.
- The root README's status table reflects what is actually built, not what is planned.
