# Implementation Plan: Add "In Progress" Status

**Feature:** EPMCDMETST-55986  
**Date:** 2026-07-28  
**Source documents:** `architecture.md`, `design-review.md`, `requirements.md`  
**Total tasks:** 9  
**Phases:** 4

---

## Dependency Graph

```
Phase 1 — Foundation (all independent, can run in parallel)
─────────────────────────────────────────────────────────
 T1: readDb() normalize          ─────────┐
 T2: POST startedAt + try/catch  ─────────┤
 T5: index.html panel            ─────────┤
 T6: styles.css                  ─────────┘
                                          │
                              depends on  │
                                          ▼
Phase 2 — Backend Core (T1 must complete first)
────────────────────────────────────────────────
 T3: PATCH /inprogress (new)     ◄── T1
 T4: PATCH /done (enforce)       ◄── T1
         │                    │
         └──────────┬─────────┘
                    │
Phase 3 — Frontend Logic (T3+T4+T5 must all complete first)
────────────────────────────────────────────────────────────
 T7: markTaskInProgress()        ◄── T3, T5
 T8: markTaskDone() guard        ◄── T4, T5
         │                    │
         └──────────┬─────────┘
                    │
Phase 4 — Render Integration (T5+T6+T7+T8 must all complete first)
────────────────────────────────────────────────────────────────────
 T9: render() — three panels     ◄── T5, T6, T7, T8
```

---

## Blocked Task Summary

| Task | Blocked by | Reason |
|---|---|---|
| T3 | T1 | New endpoint reads task objects — normalization must be in place so all tasks have consistent fields |
| T4 | T1 | Updated handler reads task objects — same reason |
| T7 | T3, T5 | Calls the new backend endpoint; references DOM IDs from the new HTML panel |
| T8 | T4, T5 | Relies on backend enforcing `inprogress → done`; references DOM IDs |
| T9 | T5, T6, T7, T8 | Calls `markTaskInProgress()` and `markTaskDone()`; references all three panel DOM IDs; uses new CSS classes |

T1, T2, T5, T6 have **no blockers** — they can all start immediately and in parallel.

---

## Phase 1 — Foundation

*No dependencies. All four tasks are independent and can be implemented in any order or simultaneously.*

---

### T1 · `readDb()` — normalize legacy tasks
**File:** `server.js`  
**Priority:** P1 — must complete before Phase 2  
**Blocked by:** nothing  
**Blocks:** T3, T4

**What to change:**  
After parsing `db.json`, iterate over every task and set `startedAt = null` if the field is absent. This ensures every task object returned by `readDb()` conforms to the full data model regardless of when it was created.

**Acceptance:**
- A task created before this feature (no `startedAt` field in `db.json`) is returned by `GET /api/tasks` with `startedAt: null`
- A task with `startedAt` already set is returned unchanged
- `readDb()` error path (malformed file) still returns `{ tasks: [] }`

---

### T2 · `POST /api/tasks` — add `startedAt: null` + try/catch on `writeDb()`
**File:** `server.js`  
**Priority:** P1  
**Blocked by:** nothing  
**Blocks:** nothing (but aligns new tasks with the full data model)

**What to change:**
1. Add `startedAt: null` to the task object created in the POST handler (alongside existing `completedAt: null`)
2. Wrap the `writeDb(db)` call in try/catch; on error return `res.status(500).json({ error: "Storage error." })`

**Acceptance:**
- `POST /api/tasks` response body includes `startedAt: null`
- Simulating a `writeDb()` failure (e.g., bad path in test) returns `500` not an unhandled crash

---

### T5 · `index.html` — add "In Progress" panel
**File:** `public/index.html`  
**Priority:** P1  
**Blocked by:** nothing  
**Blocks:** T7, T8, T9

**What to change:**  
Insert a new `<section class="panel">` between the existing Todo and Done sections with the following structure:

```html
<section class="panel">
  <h2>In Progress</h2>
  <ul id="inprogress-list" class="task-list inprogress"></ul>
  <p id="inprogress-empty" class="empty-state">No tasks in progress.</p>
</section>
```

DOM IDs are fixed by design decision D9: `inprogress-list`, `inprogress-empty`.

**Acceptance:**
- Three panels visible in the browser: Todo, In Progress, Done (in that order)
- Empty-state text shows by default (no tasks yet)
- Panel matches visual style of existing Todo/Done panels

---

### T6 · `styles.css` — In Progress visual styles
**File:** `public/styles.css`  
**Priority:** P1  
**Blocked by:** nothing  
**Blocks:** T9 (uses these class names in generated DOM)

**What to add:**
1. `.inprogress-badge` — pill badge for In Progress tasks, visually distinct from `.done-badge` (use an amber/yellow tint to convey "active work")
2. `.mark-inprogress` — button style for "Mark In Progress" action on Todo tasks, matching the existing `.mark-done` button pattern

**Acceptance:**
- In Progress badge is visually different from Done badge (different colour)
- "Mark In Progress" button is visually consistent with "Mark Done" button
- No existing styles are broken

---

## Phase 2 — Backend Core

*Requires T1 to be complete. T3 and T4 are independent of each other and can be implemented in parallel.*

---

### T3 · `PATCH /api/tasks/:id/inprogress` — new endpoint
**File:** `server.js`  
**Priority:** P2  
**Blocked by:** T1  
**Blocks:** T7

**What to implement:**

```
app.patch("/api/tasks/:id/inprogress", handler)
  1. readDb()
  2. find task by req.params.id → 404 if not found
  3. if task.status !== "todo" → 400 { error: "Task must be in 'todo' status." }
  4. task.status = "inprogress"
  5. task.startedAt = new Date().toISOString()
  6. try { writeDb(db) } catch → 500 { error: "Storage error." }
  7. res.json(task)
```

**Acceptance:**
- `PATCH /inprogress` on a `todo` task → `200` with updated task (`status: "inprogress"`, `startedAt` set)
- `PATCH /inprogress` on an `inprogress` task → `400`
- `PATCH /inprogress` on a `done` task → `400`
- `PATCH /inprogress` on unknown id → `404`
- `startedAt` is a valid ISO 8601 timestamp

---

### T4 · `PATCH /api/tasks/:id/done` — enforce source status + try/catch
**File:** `server.js`  
**Priority:** P2  
**Blocked by:** T1  
**Blocks:** T8

**What to change** (existing handler):
1. Replace the current no-op guard (`if task.status === "done" return`) with a strict source check: if `task.status !== "inprogress"` → `400 { error: "Task must be in 'inprogress' status." }`
2. Wrap `writeDb(db)` in try/catch → `500 { error: "Storage error." }` on failure

**Acceptance:**
- `PATCH /done` on an `inprogress` task → `200` (unchanged behaviour, now correctly guarded)
- `PATCH /done` on a `todo` task → `400` (previously accepted — this is the correctness fix from design review C1)
- `PATCH /done` on a `done` task → `400`
- `PATCH /done` on unknown id → `404`

---

## Phase 3 — Frontend Logic

*Requires T3, T4, and T5 to be complete. T7 and T8 are independent of each other.*

---

### T7 · `script.js` — add `markTaskInProgress()`
**File:** `public/script.js`  
**Priority:** P3  
**Blocked by:** T3 (backend endpoint), T5 (DOM panel must exist)  
**Blocks:** T9

**What to implement:**

```js
async function markTaskInProgress(taskId, button) {
  button.disabled = true;                         // guard: disable before await (design D6)
  try {
    const response = await fetch(`/api/tasks/${taskId}/inprogress`, { method: "PATCH" });
    if (!response.ok) throw new Error("Could not update task.");
    await fetchTasks();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}
```

**Acceptance:**
- Calling `markTaskInProgress()` moves the task from Todo panel to In Progress panel after re-render
- Button is disabled during the request and re-enabled after (including on error)
- Network error shows an alert

---

### T8 · `script.js` — update `markTaskDone()` with button guard
**File:** `public/script.js`  
**Priority:** P3  
**Blocked by:** T4 (backend enforces inprogress→done), T5 (DOM panel)  
**Blocks:** T9

**What to change** (existing function):  
Add `button` as a parameter. Disable the button before `await`, re-enable in `finally`. This mirrors the pattern from T7 and closes design review finding H2.

```js
async function markTaskDone(taskId, button) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/tasks/${taskId}/done`, { method: "PATCH" });
    if (!response.ok) throw new Error("Could not update task.");
    await fetchTasks();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}
```

**Acceptance:**
- Button is disabled during request and re-enabled after (including on error)
- Task moves from In Progress panel to Done panel after re-render

---

## Phase 4 — Render Integration

*Requires T5, T6, T7, T8 to all be complete. This is the final integration task.*

---

### T9 · `script.js` — update `render()` for three panels
**File:** `public/script.js`  
**Priority:** P4 — final task  
**Blocked by:** T5 (DOM IDs), T6 (CSS classes), T7 (markTaskInProgress fn), T8 (markTaskDone fn)  
**Blocks:** nothing

**What to change:**

1. **Add DOM references** at top of file (alongside existing declarations):
   ```js
   const inprogressList  = document.getElementById("inprogress-list");
   const inprogressEmpty = document.getElementById("inprogress-empty");
   ```

2. **Partition tasks into three groups** inside `render()`:
   ```js
   const todoTasks       = tasks.filter(t => t.status === "todo");
   const inprogressTasks = tasks.filter(t => t.status === "inprogress");
   const doneTasks       = tasks.filter(t => t.status === "done");
   ```

3. **Clear all three lists** at the start of render:
   ```js
   todoList.innerHTML = "";
   inprogressList.innerHTML = "";
   doneList.innerHTML = "";
   ```

4. **Todo items** — replace "Mark Done" button with "Mark In Progress" button:
   - Button class: `mark-inprogress`
   - Button text: `"Mark In Progress"`
   - Click handler: `markTaskInProgress(task.id, button)`
   - Use `textContent` for title (XSS safety — design D8)

5. **In Progress items** — show `.inprogress-badge` + "Mark Done" button:
   - Badge class: `inprogress-badge`, text: `"In Progress"`
   - Button class: `mark-done`
   - Button text: `"Mark Done"`
   - Click handler: `markTaskDone(task.id, button)`
   - Use `textContent` for title

6. **Done items** — unchanged (`.done-badge` only, no action button)

7. **Empty states** — update all three:
   ```js
   todoEmpty.style.display       = todoTasks.length       ? "none" : "block";
   inprogressEmpty.style.display = inprogressTasks.length ? "none" : "block";
   doneEmpty.style.display       = doneTasks.length       ? "none" : "block";
   ```

**Acceptance:**
- New task appears in Todo panel with "Mark In Progress" button (no "Mark Done")
- Clicking "Mark In Progress" moves task to In Progress panel with badge + "Mark Done" button
- Clicking "Mark Done" from In Progress moves task to Done panel with "Done" badge
- All three empty states show/hide correctly
- No `innerHTML` used for task data anywhere

---

## Full Task Reference

| Task | Phase | File | Blocked by | Blocks | Description |
|---|---|---|---|---|---|
| T1 | 1 | `server.js` | — | T3, T4 | `readDb()` normalize legacy `startedAt` |
| T2 | 1 | `server.js` | — | — | `POST`: add `startedAt:null` + try/catch |
| T5 | 1 | `index.html` | — | T7, T8, T9 | Add In Progress panel HTML |
| T6 | 1 | `styles.css` | — | T9 | Add `.inprogress-badge` + `.mark-inprogress` |
| T3 | 2 | `server.js` | T1 | T7 | New `PATCH /inprogress` endpoint |
| T4 | 2 | `server.js` | T1 | T8 | Update `PATCH /done`: enforce source + catch |
| T7 | 3 | `script.js` | T3, T5 | T9 | Add `markTaskInProgress()` |
| T8 | 3 | `script.js` | T4, T5 | T9 | Update `markTaskDone()` with button guard |
| T9 | 4 | `script.js` | T5, T6, T7, T8 | — | Update `render()` for three panels |

---

## Recommended Implementation Order

For a single developer working sequentially:

```
T1 → T2 → T5 → T6 → T3 → T4 → T7 → T8 → T9
```

- Complete all Phase 1 tasks first (T1 before T2, since T1 is higher-risk)  
- Backend core next (T3 then T4 — testable via curl before touching the frontend)  
- Frontend logic (T7, T8 — functions can be written without a running server)  
- Render integration last (T9 — end-to-end integration point, test manually in browser)
