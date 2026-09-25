# CODEX-README.md

# Saydaliyati Codex Package

You are implementing an existing product specification, not inventing a new product.

## Start here

Read, in order:

1. `MASTER-IMPLEMENTATION-SPEC.md`
2. `DECISIONS.md`
3. `PRODUCT.md`
4. `ARCHITECTURE.md`
5. `DATABASE.md`
6. `API-CONTRACT.md`
7. `API-IMPLEMENTATION-RULES.md`
8. `SECURITY.md`
9. `USER-JOURNEYS.md`
10. `SCREEN-SPECIFICATION.md`
11. `DESIGN-SYSTEM.md`
12. the feature-specific specification relevant to the current task

## First task

Inspect the repository and compare it with the specification.

Do not immediately rewrite code.

Return:

- current repository structure
- implemented areas
- missing areas
- contradictions
- risky areas
- recommended first implementation slice

## Implementation behavior

Prefer small, verifiable changes.

Never:
- bypass authorization
- add direct mobile→database access
- give AI arbitrary SQL access
- silently invent medical behavior
- silently change API contracts
- expose sensitive files publicly
- commit secrets

## Verification after each slice

Run the project's applicable:

```text
tests
typecheck
lint
build
```

Then inspect the diff.

## Documentation synchronization

If implementation changes behavior, update the relevant Markdown specification.

## Final response for each task

Report:

```text
Implemented
Files changed
Tests
Typecheck
Lint
Build
Known limitations
Next recommended slice
```
