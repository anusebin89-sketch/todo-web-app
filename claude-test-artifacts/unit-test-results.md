# Unit Test Results: Add "In Progress" Status

**Feature:** EPMCDMETST-55986  
**Date:** 2026-07-28  
**Test runner:** Node.js built-in `node:test` (v26.4.0)  
**HTTP client:** `supertest`  
**Test file:** `tests/server.test.js`

---

## Summary

| Metric | Value |
|---|---|
| Total tests | 27 |
| Passed | 27 |
| Failed | 0 |
| Skipped | 0 |
| Duration | ~108 ms |
| Result | **PASS** |

---

## Test Suites

### 1. GET /api/tasks — 4 tests

Tests that the task listing endpoint returns correct data and applies the legacy normalization introduced in T1.

| # | Test | Result | Notes |
|---|---|---|---|
| 1.1 | Returns empty array when no tasks exist | PASS | Baseline — no state leak between tests |
| 1.2 | Returns all tasks | PASS | Confirms task data is read and returned correctly |
| 1.3 | Normalizes legacy tasks that lack `startedAt` — injects `null` | PASS | Validates design decision D5: `readDb()` coerces `undefined` → `null` for backwards compatibility |
| 1.4 | Returns empty array when db.json contains invalid JSON | PASS | Covers `readDb()` silent-fallback path for malformed JSON (T2) |

---

### 2. POST /api/tasks — 9 tests

Tests task creation: field defaults, validation, persistence.

| # | Test | Result | Notes |
|---|---|---|---|
| 2.1 | Creates a task with `status: "todo"` and all required fields | PASS | Confirms `startedAt: null` and `completedAt: null` are set on creation (T2) |
| 2.2 | Trims whitespace from title | PASS | Input sanitisation at the boundary |
| 2.3 | Persists the task to db | PASS | File is written; task survives a subsequent `readDb()` call |
| 2.4 | Returns 400 when title is empty string | PASS | Server-side validation |
| 2.5 | Returns 400 when title is only whitespace | PASS | Trim + empty check combined |
| 2.6 | Returns 400 when title field is missing | PASS | Missing body field handled gracefully |
| 2.7 | Returns 400 when title is not a string | PASS | Type guard: `typeof title === "string"` check works |
| 2.8 | Returns 400 when title exceeds 120 characters | PASS | Server-side length cap mirrors HTML `maxlength="120"` (S1) |
| 2.9 | Accepts a title of exactly 120 characters | PASS | Boundary value — confirms the 120-char limit is inclusive |

---

### 3. PATCH /api/tasks/:id/inprogress — 6 tests

Tests the new endpoint (T3). Covers the happy path, all invalid source statuses, 404, and timestamp correctness.

| # | Test | Result | Notes |
|---|---|---|---|
| 3.1 | Transitions a `todo` task to `inprogress` and records `startedAt` | PASS | `startedAt` is a valid ISO timestamp ≥ request start time |
| 3.2 | Persists `status` and `startedAt` to db file | PASS | Change survives a real disk write |
| 3.3 | Returns 400 when task is already `inprogress` | PASS | Guards against `inprogress → inprogress` no-op / bad double-fire |
| 3.4 | Returns 400 when task is `done` — backward transition blocked | PASS | Enforces strict forward-only state machine (design decision D1) |
| 3.5 | Returns 404 for unknown task id | PASS | Standard not-found path |
| 3.6 | `completedAt` remains `null` after `todo → inprogress` | PASS | Confirms `completedAt` is not accidentally set |

---

### 4. PATCH /api/tasks/:id/done — 6 tests

Tests the updated `done` endpoint (T4). The critical change is the source-status enforcement that closes design review finding C1.

| # | Test | Result | Notes |
|---|---|---|---|
| 4.1 | Transitions an `inprogress` task to `done` and records `completedAt` | PASS | `completedAt` is a valid ISO timestamp ≥ request start time |
| 4.2 | Persists `status` and `completedAt` to db file | PASS | Change survives a real disk write |
| 4.3 | Returns 400 when task is `todo` — must go through `inprogress` first | PASS | **Core correctness fix from design review [C1]**: previously this returned 200 and bypassed the state machine |
| 4.4 | Returns 400 when task is already `done` | PASS | No idempotent re-completion allowed |
| 4.5 | Returns 404 for unknown task id | PASS | Standard not-found path |
| 4.6 | `startedAt` is preserved after `inprogress → done` | PASS | Transition must not overwrite the in-progress timestamp |

---

### 5. Full task lifecycle — 2 tests

End-to-end tests that drive the complete workflow from creation to completion through the real API.

| # | Test | Result | Notes |
|---|---|---|---|
| 5.1 | A task travels the complete lifecycle: create → inprogress → done | PASS | `startedAt` set on transition, `completedAt` set on completion, both timestamps preserved |
| 5.2 | Skipping `inprogress` — direct `todo → done` — is rejected and state is unchanged | PASS | Task remains `todo` in db after the 400 rejection |

---

## Test Design Notes

### Isolation Strategy
Each test resets the db via a temp file (`os.tmpdir()/todo-test-<pid>.json`) injected through `process.env.DB_PATH`. `server.js` reads `DB_PATH` at runtime, so tests never touch `db.json`. The temp file is deleted in the `after()` hook.

### No Mocking
Tests hit the real Express routes and perform real `fs.writeFileSync` / `fs.readFileSync` operations. This matches the architecture's flat-file storage model and catches any discrepancy between what the handler returns and what is actually persisted.

### Coverage by Architecture Task

| Impl plan task | Covered by suite(s) |
|---|---|
| T1 — `readDb()` normalization | Suite 1, test 1.3 |
| T2 — `POST` `startedAt:null` + try/catch + malformed JSON fallback | Suite 1 test 1.4, Suite 2 tests 2.1, 2.3 |
| T3 — `PATCH /inprogress` new endpoint | Suite 3, all 6 tests |
| T4 — `PATCH /done` enforce source + try/catch | Suite 4, all 6 tests |
| D1 — `inprogress` rejects non-`todo` source | Suite 3, tests 3.3, 3.4 |
| D2 — `done` rejects non-`inprogress` source | Suite 4, test 4.3 |
| D5 — legacy `startedAt` normalization | Suite 1, test 1.3 |
| S1 — server-side 120-char title length cap | Suite 2, tests 2.8, 2.9 |
| Full lifecycle correctness | Suite 5, both tests |

### Not Covered (out of scope for unit tests)
- Frontend rendering (`render()`, DOM panel visibility) — requires browser / Playwright
- `writeDb()` storage error path (`500` response) — requires filesystem fault injection
- Button disable/re-enable guard (T7, T8) — client-side behaviour, not testable via HTTP

---

## How to Run

```bash
npm test
```

Expected output:
```
ℹ tests 27
ℹ pass  27
ℹ fail  0
```
