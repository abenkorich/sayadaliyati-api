# AI Coding Agent Development Rules

These rules are intended for Codex/Astra or another coding agent working
in this repository.

## 1. General

Before changing code:

1.  inspect the repository
2.  read relevant docs
3.  understand existing patterns
4.  identify dependencies
5.  make the smallest coherent change

Never rewrite the project without a concrete reason.

## 2. Source of truth

Root-level Markdown specifications are authoritative unless a newer approved
decision explicitly changes them. Keep them at the root. Approved decision records
may live under docs/decisions/; foundation-proposal.md contains approved decisions
and separately labeled open items despite its filename.

If code and documentation disagree:

-   do not silently choose
-   identify the discrepancy
-   update the implementation and documentation together

## 3. Work in vertical slices

Each task should ideally include:

``` text
schema/migration
→ domain/service
→ API
→ validation
→ tests
→ mobile UI
→ integration
```

## 4. Database rules

-   migrations only
-   foreign keys
-   appropriate indexes
-   timestamps
-   constraints for impossible states
-   transactions for multi-record operations
-   never expose database IDs without authorization considerations

## 5. Backend rules

-   controllers stay thin
-   business logic belongs in services/domain modules
-   DTO/schema validation at boundaries
-   authorization before sensitive reads/writes
-   stable error codes
-   typed responses

## 6. Mobile rules

-   no business logic duplicated unnecessarily
-   API access through shared client
-   loading/error/empty states
-   optimistic UI only when safe
-   accessibility labels
-   RTL tested
-   responsive text
-   no hard-coded API URLs in source

## 7. AI rules

-   no unrestricted SQL
-   tools enforce authorization
-   structured data before model interpretation
-   uncertain extraction requires confirmation
-   prompt changes require tests
-   never let model output silently mutate medical records

## 8. Security rules

Never commit:

-   secrets
-   API keys
-   passwords
-   production database URLs
-   tokens

Do not log sensitive health information.

## 9. Testing

Minimum layers:

-   unit tests
-   service tests
-   API integration tests
-   authorization tests
-   critical mobile flow tests

Critical flows must be tested end-to-end.

## 10. Git

Use small commits.

Preferred format:

``` text
feat(medicine): add barcode lookup
feat(inventory): add expiry tracking
fix(sharing): prevent expired code redemption
test(authz): cover cross-patient access
```

## 11. Definition of done

A feature is not done until:

-   implementation works
-   validation exists
-   authorization exists
-   tests pass
-   errors are handled
-   UI supports loading/empty/error states
-   localization keys exist
-   docs are updated when behavior changes

## 12. Agent reporting

At the end of every task report:

### Changed

files/modules changed

### Why

short rationale

### Tests

commands run and result

### Known issues

anything unresolved

### Next recommended task

one concrete next step

## 13. Forbidden shortcut

Do not create fake APIs, fake database data or placeholder security and
call the feature complete.

Mocks are acceptable only when explicitly marked as mocks and covered by
a replacement task.
