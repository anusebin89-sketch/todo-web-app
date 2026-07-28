# Code Review Findings: Add "In Progress" Status

**Feature:** EPMCDMETST-55986  
**Reviewer:** Peer review (Copilot)  
**Date:** 2026-07-28  
**Files reviewed:**
- `server.js`
- `public/index.html`
- `public/script.js`
- `public/styles.css`
- `tests/server.test.js`
- `package.json`

---

## Overall Verdict

**APPROVED WITH MINOR ISSUES** — The implementation correctly delivers all requirements. No blocking defects. Three actionable items (one error-handling gap, one DRY refactor, one test hygiene fix) are recommended before the PR is merged.

---

## 1. Correctness

> *Does each component behave as specified in requirements.md?*

### Status: PASS

| Requirement | Implemented | Evidence |
|---|---|---|
| `todo → inprogress → done` forward-only lifecycle | ✅ | `server.js:84`, `server.js:109` — both PATCH handlers enforce source status |
| `PATCH /api/tasks/:id/inprogress` endpoint | ✅ | `server.js:76–98` |
| `startedAt` recorded on transition to inprogress | ✅ | `server.js:89` |
| `startedAt: null` on new tasks | ✅ | `server.js:59` |
| "In Progress" panel between Todo and Done | ✅ | `index.html:31–35` |
| DOM IDs `inprogress-list`, `inprogress-empty` | ✅ | `index.html:33–34` |
| Todo tasks: "Mark In Progress" button only | ✅ | `script.js:90–99` |
| In Progress tasks: badge + "Mark Done" button | ✅ | `script.js:110–123` |
| Done tasks: read-only badge, no button | ✅ | `script.js:126–140` |
| Three empty-state messages | ✅ | `script.js:142–144` |
| Legacy `startedAt` normalization | ✅ | `server.js:25–28` |

### Minor Finding — C1: Subtitle text is stale

**File:** `public/index.html:12`  
**Severity:** Low  

```html
<p class="subtitle">Add tasks, then mark them done when completed.</p>
```

The subtitle describes a two-step flow (add → done) but the app now has a three-step flow (add → in progress → done). A user reading this will be confused when they find no "Mark Done" button on a new task.

**Suggestion:** Update to: `"Add tasks, mark them in progress, then done when completed."`

---

## 2. Security

> *Are secrets excluded from output? Is user input validated?*

### Status: PASS WITH ONE GAP

✅ No secrets, tokens, or credentials anywhere in the codebase.  
✅ XSS: all user-supplied task titles rendered via `textContent` — `innerHTML` is not used anywhere. (Design decision D8 correctly implemented.)  
✅ Task ID in URL (`req.params.id`) is compared via `Array.find` string equality — no injection surface.  
✅ `express.json()` body parser uses Express's default 100 KB limit — adequate for this app.

### Finding — S1: Server does not enforce the title length limit

**File:** `server.js:46–49`  
**Severity:** Medium  

`index.html` enforces `maxlength="120"` on the input element. However, this is a client-side constraint only — anyone bypassing the browser (e.g., a `curl` request) can POST a title of arbitrary length, which will be stored verbatim in `db.json` and served back to all clients.

```js
// Current — only checks type and non-empty:
const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
if (!title) { return res.status(400)... }
```

**Suggestion:** Add a server-side length cap matching the HTML constraint:

```js
if (!title || title.length > 120) {
  return res.status(400).json({ error: "Task title is required and must be 120 characters or fewer." });
}
```

A corresponding test case should be added.

---

## 3. Error Handling

> *Are all API failures, missing files, and empty repos handled gracefully?*

### Status: PASS WITH ONE GAP

✅ `readDb()` catches all read/parse errors and returns `{ tasks: [] }` — the app does not crash on a missing or malformed `db.json`.  
✅ All three write handlers (`POST`, `PATCH /inprogress`, `PATCH /done`) wrap `writeDb()` in try/catch and return `500`.  
✅ Frontend button disable guard prevents double-fire on all action buttons.  
✅ Frontend catches errors and shows `alert()` on all action paths.

### Finding — E1: `fetchTasks()` does not check `response.ok`

**File:** `public/script.js:12–16`  
**Severity:** Medium  

```js
async function fetchTasks() {
  const response = await fetch("/api/tasks");
  tasks = await response.json();   // ← no response.ok guard
  render();
}
```

If `GET /api/tasks` ever returns a non-200 response (e.g., the server is misconfigured and returns a `500` error body like `{ "error": "..." }`), `response.json()` will successfully parse it and assign `tasks = { error: "..." }`. The subsequent call to `render()` will then call `tasks.filter(...)` on a plain object, throwing `TypeError: tasks.filter is not a function` — an unhandled crash with no user-visible message.

The path is currently unreachable because `readDb()` swallows all errors, but it is a latent fragility.

**Suggestion:**

```js
async function fetchTasks() {
  const response = await fetch("/api/tasks");
  if (!response.ok) {
    throw new Error("Could not load tasks.");
  }
  tasks = await response.json();
  render();
}
```

### Minor Finding — E2: No server-side logging for storage errors

**File:** `server.js:66–70`, `server.js:91–95`, `server.js:116–120`  
**Severity:** Low  

When `writeDb()` fails, the server returns `500` to the client but logs nothing to stdout/stderr. An operator running `npm start` in a terminal would have no way to know a storage error had occurred.

**Suggestion:** Add a `console.error` before returning 500 in each catch block:

```js
try {
  writeDb(db);
} catch (err) {
  console.error("writeDb failed:", err);
  return res.status(500).json({ error: "Storage error." });
}
```

---

## 4. Test Coverage

> *Do tests cover the happy path AND the 'Not Found' / missing-field edge cases?*

### Status: PASS WITH ONE HYGIENE ISSUE

**Coverage matrix:**

| Scenario | Covered | Test(s) |
|---|---|---|
| GET — empty list | ✅ | Suite 1, test 1 |
| GET — returns all tasks | ✅ | Suite 1, test 2 |
| GET — legacy normalization | ✅ | Suite 1, test 3 |
| POST — valid task, all fields | ✅ | Suite 2, test 1 |
| POST — title whitespace trim | ✅ | Suite 2, test 2 |
| POST — persists to db | ✅ | Suite 2, test 3 |
| POST — empty title (400) | ✅ | Suite 2, test 4 |
| POST — whitespace-only title (400) | ✅ | Suite 2, test 5 |
| POST — missing title field (400) | ✅ | Suite 2, test 6 |
| POST — non-string title (400) | ✅ | Suite 2, test 7 |
| PATCH /inprogress — happy path | ✅ | Suite 3, test 1 |
| PATCH /inprogress — persists | ✅ | Suite 3, test 2 |
| PATCH /inprogress — already inprogress (400) | ✅ | Suite 3, test 3 |
| PATCH /inprogress — done→inprogress blocked (400) | ✅ | Suite 3, test 4 |
| PATCH /inprogress — not found (404) | ✅ | Suite 3, test 5 |
| PATCH /inprogress — completedAt stays null | ✅ | Suite 3, test 6 |
| PATCH /done — happy path | ✅ | Suite 4, test 1 |
| PATCH /done — persists | ✅ | Suite 4, test 2 |
| PATCH /done — todo→done blocked (400) | ✅ | Suite 4, test 3 |
| PATCH /done — already done (400) | ✅ | Suite 4, test 4 |
| PATCH /done — not found (404) | ✅ | Suite 4, test 5 |
| PATCH /done — startedAt preserved | ✅ | Suite 4, test 6 |
| Full lifecycle end-to-end | ✅ | Suite 5, test 1 |
| Skip-inprogress rejected, state unchanged | ✅ | Suite 5, test 2 |

**Not covered (noted as acceptable gaps in unit-test-results.md):**
- `writeDb()` 500 error path — requires filesystem fault injection
- Frontend rendering and button behaviour — requires browser
- Server-side title length limit — no server enforcement exists yet (see S1)

### Finding — T1: `before` is imported but never used

**File:** `tests/server.test.js:1`  
**Severity:** Low (hygiene)  

```js
const { test, describe, before, after, beforeEach } = require("node:test");
//                       ^^^^^^ imported, never called
```

`before` is destructured from `node:test` but no `before()` hook is used anywhere in the file. Remove it from the import.

**Fix:**
```js
const { test, describe, after, beforeEach } = require("node:test");
```

### Finding — T2: No test for malformed db.json fallback

**File:** `tests/server.test.js`  
**Severity:** Low  

`readDb()` has an important silent fallback: if `db.json` is corrupt JSON, it returns `{ tasks: [] }` and the app continues. This path has no test. Consider adding:

```js
test("returns empty task list when db.json contains invalid JSON", async () => {
  fs.writeFileSync(tmpDb, "NOT VALID JSON", "utf8");
  const res = await request(app).get("/api/tasks");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});
```

---

## 5. Code Clarity

> *Are function names self-explanatory? Is logic easy to follow without comments?*

### Status: PASS WITH ONE NOTE

✅ All function names are clear and accurate: `readDb`, `writeDb`, `fetchTasks`, `createTask`, `markTaskInProgress`, `markTaskDone`, `render`, `resetDb`, `makeTodoTask`.  
✅ `render()` logic follows a predictable pattern: clear → partition → build → toggle empty states.  
✅ The normalization spread in `readDb()` is idiomatic JS, though slightly non-obvious:

```js
data.tasks = data.tasks.map((task) => ({
  startedAt: null,
  ...task           // task's own startedAt (if set) overwrites the null default
}));
```

This is correct and elegant — the spread order (default first, task second) is the key insight. It is self-contained and short enough to read without a comment.

### Finding — CL1: Implementation task reference comments should be removed

**Files:** `server.js:24,53,65,75,100,125` · `script.js:32,52,72`  
**Severity:** Low (hygiene)  

Comments like `// T1:`, `// T2:`, `// T7:`, `// T8:`, `// T9:` reference the internal implementation plan task numbers. These are meaningful during development but become noise in production code — a future reader has no context for what "T1" or "T7" means.

**Examples:**
```js
// T1: normalize legacy tasks that pre-date the startedAt field  ← keep the WHY, drop "T1:"
// T2: include startedAt: null in new tasks                      ← remove entirely (obvious from code)
// T2: wrap writeDb in try/catch                                 ← remove entirely (obvious from code)
// T3: new endpoint — transition todo → inprogress               ← keep the WHY, drop "T3:"
// T7: new function — move todo → inprogress                     ← remove entirely (function name says it)
```

**Suggestion:** Strip the `T<n>:` prefix. Keep comments that explain a non-obvious *why* (e.g., the normalization rationale). Remove comments that just describe *what* the code visibly does.

---

## 6. DRY Principle

> *Is there duplicated logic that can be refactored into a shared function?*

### Status: HAS ACTIONABLE REFACTOR

### Finding — DRY1: `markTaskInProgress` and `markTaskDone` are near-identical

**File:** `public/script.js:33–70`  
**Severity:** Medium  

The two functions differ only in their URL path. All other logic — disable, fetch, ok-check, fetchTasks, alert on error, finally re-enable — is identical:

```js
// markTaskInProgress (lines 33–50)
async function markTaskInProgress(taskId, button) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/tasks/${taskId}/inprogress`, { method: "PATCH" });
    if (!response.ok) throw new Error("Could not update task.");
    await fetchTasks();
  } catch (error) { alert(error.message); }
  finally { button.disabled = false; }
}

// markTaskDone (lines 53–70) — identical structure, different path
async function markTaskDone(taskId, button) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/tasks/${taskId}/done`, { method: "PATCH" });
    if (!response.ok) throw new Error("Could not update task.");
    await fetchTasks();
  } catch (error) { alert(error.message); }
  finally { button.disabled = false; }
}
```

**Suggested refactor** — extract a shared `patchTask` helper:

```js
async function patchTask(taskId, endpoint, button) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/tasks/${taskId}/${endpoint}`, { method: "PATCH" });
    if (!response.ok) throw new Error("Could not update task.");
    await fetchTasks();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}

async function markTaskInProgress(taskId, button) {
  await patchTask(taskId, "inprogress", button);
}

async function markTaskDone(taskId, button) {
  await patchTask(taskId, "done", button);
}
```

This keeps the public API identical (named functions are still called by `render()`) while eliminating the duplication.

### Finding — DRY2: Title `<p>` element created identically in all three render loops

**File:** `public/script.js:86–88`, `105–107`, `130–132`  
**Severity:** Low  

The three lines that create and configure the task title paragraph are identical in all three loops:

```js
const title = document.createElement("p");
title.className = "task-title";
title.textContent = task.title;
```

A small helper reduces this to one line per loop and ensures `textContent` (XSS safety) is always used:

```js
function createTitleEl(text) {
  const p = document.createElement("p");
  p.className = "task-title";
  p.textContent = text;
  return p;
}
```

Usage: `const title = createTitleEl(task.title);`

---

## 7. Dependency Safety

> *Are there any known-vulnerable package versions?*

### Status: PASS — 0 vulnerabilities

| Package | Installed | Latest stable | Vulnerabilities |
|---|---|---|---|
| `express` | `4.22.2` | `4.22.x` | None (`npm audit` clean) |
| `supertest` | `7.2.2` | `7.x` | None (`npm audit` clean) |
| Node.js runtime | `v26.4.0` | Current | No advisories |

```
npm audit result: found 0 vulnerabilities
```

✅ All dependencies are current and advisory-free. No action needed.

---

## Summary of Findings

| ID | Area | Severity | Finding | Action |
|---|---|---|---|---|
| C1 | Correctness | Low | Subtitle text describes 2-step flow, not 3-step | Update `index.html:12` |
| S1 | Security | Medium | No server-side title length enforcement | Add `title.length > 120` check in `server.js` |
| E1 | Error Handling | Medium | `fetchTasks()` missing `response.ok` guard — can assign non-array to `tasks` | Add ok check in `script.js:13` |
| E2 | Error Handling | Low | No `console.error` on 500 storage failures | Add logging in each catch block |
| T1 | Test Coverage | Low | `before` imported but never used in test file | Remove from destructure in `tests/server.test.js:1` |
| T2 | Test Coverage | Low | No test for malformed db.json fallback path | Add one test case |
| CL1 | Code Clarity | Low | `// T<n>:` task-reference comments are noise in production code | Strip `T<n>:` prefix; keep meaningful why-comments |
| DRY1 | DRY | Medium | `markTaskInProgress` and `markTaskDone` are near-identical — 20 lines duplicated | Extract shared `patchTask(taskId, endpoint, button)` helper |
| DRY2 | DRY | Low | Title `<p>` element created 3 times identically in `render()` | Extract `createTitleEl(text)` helper |

### Blocking for PR
**S1** and **E1** are the only items that warrant fixing before the PR is raised. Both are correctness/safety gaps, not nit-picks. All others can be addressed in a follow-up or alongside the PR changes.
