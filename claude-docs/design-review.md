# Design Review: Add "In Progress" Status

**Feature:** EPMCDMETST-55986  
**Reviewer:** Senior Review (pre-implementation)  
**Date:** 2026-07-28  
**Reviewed artifact:** `claude-docs/architecture.md`  
**Status:** APPROVED WITH CHANGES — architecture.md updated per findings below

---

## Review Summary

The architecture is sound for a single-tier local todo application. No new dependencies or infrastructure are needed. However, **two critical correctness gaps** were found that would allow the strict status transition rule to be bypassed via direct API calls, along with several smaller documentation inaccuracies. All findings are resolved below. Architecture.md has been updated accordingly.

---

## Findings

### CRITICAL

---

#### [C1] Status transition enforcement missing on both PATCH handlers

**Location:** Section 4 (Data Flow), Section 7 (API Contract)

**Problem:**  
The state machine in Section 4.4 defines a strict forward-only lifecycle:
```
todo → inprogress → done
```
But neither PATCH handler enforces the *source* status — only the target (via no-op guard).

- `PATCH /api/tasks/:id/inprogress` only guards "already inprogress". It does **not** reject a `done → inprogress` transition.
- `PATCH /api/tasks/:id/done` only guards "already done". It does **not** reject a `todo → done` transition, meaning a client can skip the In Progress step entirely by calling this endpoint directly on a todo task.

This directly violates the core requirement: *"Tasks follow a strict forward-only lifecycle."*

**Decision:** Both handlers must enforce source status:

| Endpoint | Allowed source status | Reject with |
|---|---|---|
| `PATCH /inprogress` | `todo` only | `400 { error: "Task must be in 'todo' status." }` |
| `PATCH /done` | `inprogress` only | `400 { error: "Task must be in 'inprogress' status." }` |

**Architecture change:** API contract table updated; handler logic updated in Section 4.

---

#### [C2] `writeDb()` described as "atomic" — incorrect claim

**Location:** Section 5 (Key Components), Section 8 (Constraints)

**Problem:**  
The architecture states `writeDb()` "atomically overwrites `db.json`". `fs.writeFileSync` is **not atomic** — a process crash mid-write can leave `db.json` in a corrupt partial state. The claim is misleading and could produce a false sense of safety.

True atomic writes require: write to a temp file → `fs.renameSync` to the target. For a single-user local app this risk is acceptable, but the documentation must be honest.

**Decision:** Remove the word "atomic" from the description. Document the actual risk and why it is accepted at this scope. No code change required for this feature, but the claim is corrected.

**Architecture change:** Section 5 and Section 8 wording corrected.

---

### HIGH

---

#### [H1] `writeDb()` error path is unhandled — server crash risk

**Location:** Section 5 (Key Components)

**Problem:**  
If `fs.writeFileSync` throws (disk full, permission denied, path missing), the exception propagates uncaught through the Express route handler. Express 4.x will pass it to the default error handler, which sends a `500` but may also leave the process in an unstable state depending on the error type.

The architecture does not mention this failure mode at all.

**Decision:** Each route handler must wrap `writeDb()` in a try/catch and return `500 { error: "Storage error." }` on failure. This is a production-correctness requirement, not nice-to-have. Document this in the API contract and handler logic.

**Architecture change:** Section 4 data flows updated; Section 7 API contract adds `500` error case; Section 8 constraint added.

---

#### [H2] Concurrent double-click can cause a lost write (read-modify-write race)

**Location:** Section 8 (Constraints)

**Problem:**  
Section 8 states: *"No concurrency conflicts; `fs.writeFileSync` is sufficient."* This is partially true for distinct users (there are none), but a browser user can fire two simultaneous PATCH requests — for example by double-clicking a button before the UI re-renders. Node.js event loop handles requests concurrently. If two requests both call `readDb()` before either calls `writeDb()`, the second write wins and the first mutation is silently lost.

**Decision:** Accept the risk at this scope with a documented mitigation: buttons must be disabled immediately on click (before the `await`) and re-enabled only after `fetchTasks()` completes. This is a UI-side guard. The architecture's Section 8 is updated to reflect the real constraint and the mitigation.

**Architecture change:** Section 8 updated; UI interaction note added to Section 4 data flows.

---

### MEDIUM

---

#### [M1] `startedAt` backward compatibility — `undefined` is not `null`

**Location:** Section 6 (Data Model), Section 8 (Constraints)

**Problem:**  
The architecture states existing tasks without `startedAt` are *"handled gracefully — the field will be undefined (treated as null)"*. JavaScript treats `undefined` and `null` differently in strict equality (`=== null`), JSON serialisation (`undefined` is omitted from JSON output), and optional chaining. Any frontend or backend code that checks `task.startedAt === null` will fail silently for legacy tasks.

**Decision:** `readDb()` must normalize legacy tasks by adding `startedAt: null` if the field is absent. This keeps the data model consistent without a migration script.

**Architecture change:** Section 6 wording corrected; normalization step added to `readDb()` description in Section 5.

---

#### [M2] API contract does not document `400` and `500` error responses

**Location:** Section 7 (API Contract)

**Problem:**  
The API table only documents `404` for PATCH endpoints. After findings C1 and H1, two new response codes apply: `400` (invalid transition) and `500` (storage error). The contract is incomplete as written.

**Decision:** Update the API contract table to include all possible response codes per endpoint.

**Architecture change:** Section 7 table updated.

---

#### [M3] Component diagram names functions not present in current or planned code

**Location:** Section 3 (Component Diagram)

**Problem:**  
The diagram shows `filterByStatus()`, `buildTodoItem()`, `buildInProgressItem()`, `buildDoneItem()` as distinct functions inside `render()`. The current `script.js` uses a flat loop inside a single `render()` function, and `requirements.md` only says *"update `render()`"*. Introducing four new named functions is a refactoring beyond the feature scope and creates ambiguity about what needs to be implemented.

**Decision:** Simplify the diagram to reflect the actual approach: `render()` remains a single function that filters `tasks[]` by status and builds DOM for three panels. No sub-function decomposition is required.

**Architecture change:** Section 3 component diagram updated.

---

### LOW

---

#### [L1] XSS safety is a deliberate choice — should be documented

**Location:** Section 8 (Constraints)

**Problem:**  
Task titles come from user input and are rendered to the DOM. The current code uses `element.textContent = task.title` (XSS-safe), not `innerHTML`. This is the correct choice and should be explicitly documented as a deliberate security decision, not accidental.

**Decision:** Add a note to Section 8 confirming `textContent` is used intentionally and `innerHTML` must not be introduced.

**Architecture change:** Section 8 security note added.

---

#### [L2] GET /api/tasks has no error case in the API contract

**Location:** Section 7 (API Contract)

**Problem:**  
`GET /api/tasks` shows no error case. If `readDb()` throws unexpectedly, Express 4.x returns a `500`. The contract should document this.

**Decision:** Add `500` as a documented (though unlikely) error for `GET /api/tasks`.

**Architecture change:** Section 7 table updated.

---

#### [L3] HTML element IDs for the In Progress panel not specified

**Location:** Section 3 (Component Diagram), implicitly Section 5

**Problem:**  
The architecture names the In Progress panel visually but does not define the DOM element IDs that `script.js` will use to locate it (`inprogress-list`, `inprogress-empty`). These need to be agreed before implementation to avoid a mismatch between `index.html` and `script.js`.

**Decision:** Standardise on `id="inprogress-list"` and `id="inprogress-empty"` to match the existing naming convention (`todo-list`, `todo-empty`, `done-list`, `done-empty`).

**Architecture change:** Section 5 frontend component table updated.

---

## Agreed Design Decisions

| # | Decision |
|---|---|
| D1 | `PATCH /inprogress` rejects with `400` if source status is not `todo` |
| D2 | `PATCH /done` rejects with `400` if source status is not `inprogress` |
| D3 | Both PATCH handlers wrap `writeDb()` in try/catch; return `500` on storage error |
| D4 | `writeDb()` is NOT described as atomic; the partial-write risk is accepted and documented |
| D5 | `readDb()` normalizes legacy tasks: adds `startedAt: null` if field is absent |
| D6 | Buttons are disabled on click and re-enabled after re-fetch to prevent double-fire |
| D7 | `render()` stays a single function — no sub-function decomposition |
| D8 | `textContent` must be used for all user-supplied content; `innerHTML` is forbidden |
| D9 | In Progress panel DOM IDs: `inprogress-list`, `inprogress-empty` |

---

## Files Changed as a Result of This Review

| File | Sections Updated |
|---|---|
| `claude-docs/architecture.md` | §3 Component Diagram, §4 Data Flows, §5 Key Components, §6 Data Model, §7 API Contract, §8 Constraints |
