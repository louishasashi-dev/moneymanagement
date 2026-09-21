# CLAUDE.md

## 1. CORE PRINCIPLES

You are working on an existing Money Management application with real user data.

The highest priorities are:

1. NEVER lose, overwrite, corrupt, reset, or unnecessarily migrate existing user data.
2. Make the smallest change necessary to complete the requested task.
3. Do not refactor unrelated code.
4. Do not redesign existing architecture unless it is required for the requested feature.
5. Do not create duplicate systems, utilities, database stores, or data models when an existing one can be reused.
6. Preserve existing behavior unless the requested feature explicitly requires changing it.
7. Keep token usage and analysis time efficient.
8. Do not perform broad analysis that does not contribute to the requested task.

---

## 2. BEFORE CODING

Before making changes:

1. Identify only the files directly relevant to the requested feature.
2. Read the minimum amount of code necessary to understand those files.
3. Check existing utilities, database functions, components, and patterns before creating new ones.
4. Check the existing IndexedDB schema if the task touches stored data.
5. Briefly state:
   - what files are relevant
   - what will be changed
   - whether the database/schema needs to change

Do NOT perform a full-project audit unless the requested feature genuinely requires it.

Do NOT inspect every file "just in case".

If the existing architecture is already sufficient, use it.

---

## 3. DATA SAFETY — CRITICAL

This application contains real user data.

Never assume the database is disposable.

NEVER:

- reset IndexedDB
- delete existing records
- recreate the database from scratch
- replace existing data with seed/demo data
- change existing IDs unnecessarily
- change existing transaction IDs
- silently change historical transaction values
- remove old records during a feature implementation
- overwrite existing user data for testing
- run destructive migrations without explicit necessity

When testing:

- use the existing database safely
- do not insert fake data into the user's real database unless explicitly requested
- prefer static/unit-level reasoning or temporary test data that does not modify production user data
- never use a "clear database" approach to solve a migration problem

If a schema migration is required:

1. Preserve all existing records.
2. Add new fields with safe defaults.
3. Keep old fields/data readable when possible.
4. Increment the IndexedDB version correctly.
5. Make migration backward-compatible.
6. Never silently discard information.
7. Explain exactly what the migration does before implementing it.

If there is uncertainty about how existing data should migrate, STOP and explain the ambiguity instead of guessing.

---

## 4. MINIMAL CHANGE POLICY

For every task, follow this order:

1. Understand the requested behavior.
2. Find the existing implementation.
3. Reuse existing code where possible.
4. Make the smallest targeted modification.
5. Verify that existing behavior still works.
6. Only then consider cleanup.

Do NOT:

- rename unrelated variables
- reorganize unrelated folders
- rewrite working components
- replace libraries without a reason
- change styling across the application
- introduce a new framework/pattern unnecessarily
- "modernize" code that is unrelated to the task
- perform large refactors simply because the existing code could be cleaner

A task should not become a refactoring project.

---

## 5. TOKEN EFFICIENCY

Be concise and targeted.

When investigating the codebase:

- Prefer targeted searches.
- Read relevant sections instead of entire large files.
- Do not repeatedly read the same file unless necessary.
- Do not analyze unrelated components.
- Do not explain obvious code line-by-line.
- Do not generate long plans for small changes.

For normal tasks, use this workflow:

1. Locate relevant code.
2. Inspect only the necessary sections.
3. Make the change.
4. Run the most relevant checks/tests.
5. Summarize the result.

Do not spend tokens producing a long architectural analysis unless the task is genuinely architectural or risky.

---

## 6. WHEN TO ASK / WHEN TO PROCEED

Proceed directly when:

- the requested behavior is clear
- existing architecture provides enough information
- the change is low-risk
- no destructive data migration is required

Ask or stop for clarification when:

- implementing the feature requires guessing the meaning of existing user data
- multiple incompatible data models are possible
- existing data could be corrupted or lost
- a destructive migration appears necessary
- the requested behavior conflicts with existing business logic in an unclear way

Never invent business rules to resolve ambiguity involving financial data.

---

## 7. DATABASE / INDEXEDDB RULES

The existing IndexedDB architecture is the source of truth for persisted application data.

Before modifying database-related code:

- locate the existing database initialization
- locate relevant object stores
- locate existing CRUD/helper functions
- understand the minimum required schema change

Prefer extending existing stores over creating new stores.

Prefer extending existing records over duplicating the same information in multiple places.

If a new field is required:

- provide a safe default for existing records
- keep existing records valid
- do not rewrite every record unless necessary

Avoid unnecessary database version bumps.

Every database migration must preserve existing user data.

---

## 8. MONEY / FINANCIAL DATA RULES

Financial values must remain numeric in the database.

Display formatting and stored values are different concerns.

Example:

Display:
1.000.000

Stored value:
1000000

Never store:
"1.000.000"

unless the existing architecture explicitly requires a string for a non-numeric purpose.

Do not introduce floating-point calculations where integer/Rupiah values are sufficient.

Be especially careful about:

- wallet balances
- savings
- debts
- receivables
- payments
- transfers
- planned transactions
- income
- expenses

Never double-count the same financial value.

---

## 9. EXISTING DATA FIRST

When adding a new feature to an existing entity:

- preserve existing records
- preserve existing IDs
- preserve existing relationships
- preserve historical values
- provide compatibility with older records

For example, if a new `storageLocation` field is added to savings, existing savings records must still work.

Do not assume that all existing records already have the new field.

Handle missing fields safely.

---

## 10. UI / DESIGN

Preserve the application's existing visual language.

Do not introduce generic AI-generated dashboard designs.

Do not unnecessarily:

- change colors
- change typography
- change spacing
- replace components
- add excessive cards
- add decorative gradients
- add animations
- redesign navigation

Follow existing components and patterns.

New UI should look like it belongs to the existing application.

---

## 11. REUSE BEFORE CREATE

Before creating a new:

- utility
- formatter
- database function
- component
- hook
- validation function
- PDF/report system

search for an existing implementation.

If an existing implementation can reasonably be reused, reuse it.

Do not create two functions that solve the same problem.

---

## 12. TESTING

After implementing a change:

1. Run the smallest relevant test/build/typecheck available.
2. Check the directly affected functionality.
3. Check for obvious regressions.

Do not run an unnecessarily large test suite for a trivial UI change unless required.

For database-related changes, specifically verify:

- existing records remain readable
- new records work
- old records work
- no data is deleted
- no duplicate financial values are created

---

## 13. GIT / FILE SAFETY

Do not delete or replace files unless necessary.

Do not modify generated files unless required.

Do not modify unrelated files.

Before making a large change, understand the current implementation first.

Keep changes easy to review.

---

## 14. RESPONSE FORMAT

After completing a task, give a concise summary:

### Changed

- file/path — what changed

### Data safety

- whether IndexedDB/schema changed
- whether existing data is preserved

### Verification

- tests/build/checks performed

### Notes

- only important caveats or follow-up items

Do not provide a long explanation unless requested.

---

## 15. SPECIAL RULE FOR RISKY FINANCIAL FEATURES

For changes involving:

- savings
- wallets
- debts
- receivables
- payments
- transfers
- balances
- net worth
- financial reports

be more cautious with data semantics than with UI code.

Before changing financial calculations, identify:

- what the existing value represents
- where it is stored
- whether it is an actual balance or an allocation
- whether it is already included elsewhere

Avoid double counting.

If the current model is ambiguous, explain the ambiguity before changing persisted data.

---

## 16. DEFAULT BEHAVIOR

Unless the user explicitly asks otherwise:

- inspect first, but only what is necessary
- change minimally
- preserve existing user data
- reuse existing architecture
- avoid unnecessary refactoring
- avoid unnecessary dependencies
- avoid unnecessary analysis
- avoid unnecessary output
- test the relevant behavior
- keep the implementation simple and maintainable

The goal is not to rewrite the application.

The goal is to safely improve the existing application.

## 17. SESSION INTERRUPTION / CONTINUATION

For long-running or multi-step tasks, make the work safely resumable.

Do not assume or estimate the user's subscription usage limit.

For multi-step tasks:

1. Create `.claude/progress.md`.
2. Keep it concise.
3. Record:
   - current task
   - completed steps
   - files changed
   - remaining steps
   - tests/checks completed
   - important decisions
   - blocking issues

Update `.claude/progress.md` after meaningful milestones.

When starting a new session or when the user says:

- "lanjut"
- "continue"
- "lanjutkan"
- "continue the task"

First read `.claude/progress.md` if it exists.

Then:

1. Inspect the current git diff/status.
2. Verify the progress against the actual code.
3. Continue from the first unfinished step.
4. Do not restart completed work.
5. Do not redo unnecessary analysis.
6. Update `.claude/progress.md` as progress is made.

If the previous session ended because of a usage limit, context limit, interruption, or restart, use the existing code and `.claude/progress.md` as the source of continuity.

Never reset, revert, or overwrite completed work merely because the session changed.

If the task is fully completed, mark the progress file as completed and stop.

## 18. CHECKPOINTS FOR LONG TASKS

For tasks involving multiple implementation steps, create a checkpoint after each meaningful milestone.

Example:

- [x] Inspect relevant architecture
- [x] Implement database changes
- [x] Implement UI
- [ ] Update reports
- [ ] Run tests
- [ ] Final verification

Keep checkpoints short and factual.

Do not create checkpoints for trivial one-file changes.

## 19. SAFE STOPPING

For long-running tasks:

- prioritize completing the current safe atomic change
- update `.claude/progress.md` after meaningful milestones
- do not start a new large refactor near a stopping point
- do not begin unrelated improvements
- do not leave half-finished database migrations
- do not make speculative changes
- if a safe stopping point is reached, save the checkpoint and stop

## 20. CODE ANALYSIS / MANUAL EDIT MODE

This section overrides the normal implementation workflow when the user explicitly asks for analysis, review, or manual edit instructions.

There are two modes:

### ANALYSIS MODE

Use this when the user asks to:

- analyze code
- review code
- tell what should be changed
- show old code and new code
- suggest edits
- explain how to implement a feature

In ANALYSIS MODE:

- DO NOT modify project files.
- DO NOT run commands that modify project files.
- Inspect the relevant code only.
- Provide exact code changes using "Find this existing code" → "Replace it with".
- The user will apply the changes manually.

### IMPLEMENTATION MODE

Use this only when the user explicitly asks to:

- implement
- apply the changes
- edit the files
- make the changes
- fix the code directly

In IMPLEMENTATION MODE:

- You may modify project files.
- Follow all data-safety and minimal-change rules.
- Run only relevant checks/tests.

If the user's intent is unclear, ask whether they want ANALYSIS MODE or IMPLEMENTATION MODE.

### EXACT CODE REQUIREMENT

Before showing "Find this existing code":

- Verify that the code actually exists in the current project.
- Copy it accurately from the current project.
- Never invent or approximate existing code.
- Do not use `[existing code]` placeholders when the actual code can be inspected.
- If the exact code cannot be located, say so instead of guessing.
