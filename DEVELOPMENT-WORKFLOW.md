# Saydaliyati --- DEVELOPMENT-WORKFLOW.md

Version: 1.0

## 1. Repository workflow

Before changing code:

``` text
read relevant docs
 ↓
inspect existing implementation
 ↓
identify dependencies
 ↓
make small change
 ↓
run tests
 ↓
run typecheck/lint
 ↓
review diff
```

## 2. Do not rewrite blindly

Preserve working functionality.

Avoid large unrelated refactors during feature implementation.

## 3. Feature slices

Build end-to-end:

``` text
database
→ domain service
→ API
→ mobile
→ tests
```

## 4. Branches

Use focused branches/features.

Examples:

``` text
feature/auth
feature/inventory
feature/scanner
feature/prescription-ocr
feature/treatments
feature/sharing
feature/ai
```

## 5. Commits

Prefer small meaningful commits.

Examples:

``` text
feat: add inventory domain
feat: add medicine barcode lookup
test: cover inventory authorization
fix: prevent duplicate medication events
```

## 6. Code review

Review for:

-   correctness
-   security
-   authorization
-   data ownership
-   tests
-   performance
-   accessibility
-   localization
-   backwards compatibility

## 7. AI coding agents

Agents must:

1.  read the specification
2.  inspect repository
3.  state implementation plan
4.  make focused changes
5.  run verification
6.  report changed files
7.  report remaining risks

Never ask an agent to blindly build the whole application in one prompt.
