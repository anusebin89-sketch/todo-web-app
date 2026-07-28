# Architecture: Add "In Progress" Status

**Feature:** EPMCDMETST-55986  
**Date:** 2026-07-28  
**Scope:** Additive change to existing single-page todo application  
**Revision:** Updated after design review — see `design-review.md` for full findings

---

## 1. System Overview

The todo application is a **single-tier, server-rendered SPA** running entirely on a single Node.js process. There is no external database, no authentication layer, and no build pipeline. The architecture is intentionally minimal — this feature extends it in-place without adding new infrastructure.

```
┌─────────────────────────────────────────────────────┐
│                     Browser                         │
│                                                     │
│  ┌──────────┐   ┌──────────┐   ┌────────────────┐  │
│  │index.html│   │styles.css│   │   script.js    │  │
│  │  (Shell) │   │ (Styles) │   │ (State + View) │  │
│  └──────────┘   └──────────┘   └───────┬────────┘  │
│                                        │ fetch()    │
└────────────────────────────────────────┼────────────┘
                                         │ HTTP/REST
┌────────────────────────────────────────┼────────────┐
│              Node.js Process           │            │
│                                        ▼            │
│  ┌─────────────────────────────────────────────┐   │
│  │              Express Server                  │   │
│  │                (server.js)                   │   │
│  │                                              │   │
│  │  GET  /api/tasks                             │   │
│  │  POST /api/tasks                             │   │
│  │  PATCH /api/tasks/:id/inprogress  ← NEW      │   │
│  │  PATCH /api/tasks/:id/done                   │   │
│  └──────────────────┬──────────────────────────┘   │
│                     │ fs.readFileSync / writeFileSync│
│                     ▼                               │
│            ┌─────────────┐                          │
│            │   db.json   │                          │
│            │ (Flat-file  │                          │
│            │  storage)   │                          │
│            └─────────────┘                          │
└─────────────────────────────────────────────────────┘
```

---

## 2. Technology Choices

| Layer | Technology | Rationale |
|---|---|---|
| Runtime | Node.js (built-in `crypto`, `fs`) | Already in use; no new dependency |
| HTTP Server | Express 4.x | Already in use |
| Persistence | JSON flat-file (`db.json`) | Adequate for a single-user local app; no migration needed |
| Frontend | Vanilla JS (ES2020+) | No framework overhead; consistent with existing code |
| Styling | Plain CSS custom properties | Consistent with existing stylesheet |
| Build tooling | None | App ships directly; no bundler or transpiler |

No new packages or infrastructure are required for this feature.

---

## 3. Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Browser)                                         │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  script.js                                           │   │
│  │                                                      │   │
│  │  State Layer          View Layer                     │   │
│  │  ┌──────────────┐     ┌──────────────────────────┐  │   │
│  │  │ tasks[]      │────▶│ render()                 │  │   │
│  │  │              │     │  filters tasks[] by      │  │   │
│  │  │ fetchTasks() │     │  status and builds DOM   │  │   │
│  │  │              │     │  for all three panels    │  │   │
│  │  └──────────────┘     └──────────────────────────┘  │   │
│  │                                                      │   │
│  │  Action Layer                                        │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │ createTask()                                   │  │   │
│  │  │ markTaskInProgress()  ← NEW                    │  │   │
│  │  │ markTaskDone()                                 │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  index.html                                          │   │
│  │  ┌─────────┐  ┌─────────────┐  ┌────────────────┐   │   │
│  │  │  Todo   │  │ In Progress │  │      Done      │   │   │
│  │  │  Panel  │  │   Panel     │  │     Panel      │   │   │
│  │  │         │  │  ← NEW      │  │                │   │   │
│  │  └─────────┘  └─────────────┘  └────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                         │ REST API
┌────────────────────────┼────────────────────────────────────┐
│  Backend (server.js)   │                                    │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Route Handlers                                     │    │
│  │                                                     │    │
│  │  GET  /api/tasks        → readDb() → res.json()     │    │
│  │  POST /api/tasks        → validate → writeDb()      │    │
│  │  PATCH /:id/inprogress  → validate → writeDb() ←NEW │    │
│  │  PATCH /:id/done        → validate → writeDb()      │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │                                 │
│  ┌────────────────────────▼────────────────────────────┐    │
│  │  Storage Helpers                                    │    │
│  │  readDb()  → fs.readFileSync → JSON.parse           │    │
│  │             + normalize legacy tasks                │    │
│  │  writeDb() → JSON.stringify → fs.writeFileSync      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow

### 4.1 Create Task
```
User types title → form submit
  → POST /api/tasks { title }
    → validate title (non-empty string)
    → create task { id, title, status:"todo", createdAt, startedAt:null, completedAt:null }
    → try { writeDb() } catch → 500
  ← 201 { task }
→ fetchTasks() → render()
```

### 4.2 Mark In Progress  ← NEW
```
User clicks "Mark In Progress" (button disabled immediately to prevent double-fire)
  → PATCH /api/tasks/:id/inprogress
    → find task by id → 404 if missing
    → if task.status !== "todo" → 400 { error: "Task must be in 'todo' status." }
    → task.status = "inprogress"
    → task.startedAt = new Date().toISOString()
    → try { writeDb() } catch → 500
  ← 200 { task }
→ fetchTasks() → render() → button re-enabled
  → task moves from Todo panel to In Progress panel
```

### 4.3 Mark Done
```
User clicks "Mark Done" (button disabled immediately to prevent double-fire)
  → PATCH /api/tasks/:id/done
    → find task by id → 404 if missing
    → if task.status !== "inprogress" → 400 { error: "Task must be in 'inprogress' status." }
    → task.status = "done"
    → task.completedAt = new Date().toISOString()
    → try { writeDb() } catch → 500
  ← 200 { task }
→ fetchTasks() → render() → button re-enabled
  → task moves from In Progress panel to Done panel
```

### 4.4 Status Transition State Machine
```
         ┌──────────┐
  create  │          │  PATCH /inprogress
 ────────▶│   todo   │──────────────────▶┌────────────┐
          │          │  (source must     │            │  PATCH /done
          └──────────┘   be "todo")      │ inprogress │──────────────▶┌──────┐
                                         │            │  (source must  │ done │
                                         └────────────┘   be          └──────┘
                                                          "inprogress")

  No backward transitions are permitted.
  Invalid source status → 400 Bad Request.
```

---

## 5. Key Components and Responsibilities

### Backend

| Component | File | Responsibility |
|---|---|---|
| HTTP Server | `server.js` | Bootstraps Express, serves static assets from `/public`, listens on `PORT` (default 3000) |
| Task Router | `server.js` (inline routes) | Handles all `/api/tasks` endpoints; owns request validation and HTTP response codes |
| `PATCH /inprogress` handler | `server.js` ← **NEW** | Validates source status is `todo`; sets `inprogress` + `startedAt`; wraps `writeDb()` in try/catch |
| `PATCH /done` handler | `server.js` | Validates source status is `inprogress`; sets `done` + `completedAt`; wraps `writeDb()` in try/catch |
| `readDb()` | `server.js` | Reads and parses `db.json`; returns `{ tasks: [] }` on any read error; normalizes legacy tasks (adds `startedAt: null` if absent) |
| `writeDb()` | `server.js` | Serialises state and overwrites `db.json` via `fs.writeFileSync` (see constraints for write-safety note) |
| Flat-file store | `db.json` | Single source of truth; JSON object with `tasks` array |

### Frontend

| Component | File | Responsibility |
|---|---|---|
| App Shell | `index.html` | Static HTML skeleton; declares three status panels with standardised IDs (see below) |
| State holder | `script.js` (`tasks[]`) | In-memory cache of the last fetched task list |
| `fetchTasks()` | `script.js` | Fetches all tasks from `GET /api/tasks`; triggers `render()` |
| `markTaskInProgress()` | `script.js` ← **NEW** | Disables button; calls `PATCH /:id/inprogress`; triggers re-fetch; re-enables on completion |
| `markTaskDone()` | `script.js` | Disables button; calls `PATCH /:id/done`; triggers re-fetch; re-enables on completion |
| `render()` | `script.js` | Single function; partitions `tasks[]` by status; builds DOM for all three panels; shows/hides empty states |
| Stylesheet | `styles.css` | Visual styling; adds `.inprogress-badge` and `.mark-inprogress` button styles |

### Standardised DOM Element IDs

| Panel | List element | Empty-state element |
|---|---|---|
| Todo | `todo-list` | `todo-empty` |
| In Progress ← NEW | `inprogress-list` | `inprogress-empty` |
| Done | `done-list` | `done-empty` |

---

## 6. Data Model

### Task Object (after this feature)

```json
{
  "id":          "uuid-v4",
  "title":       "string (1–120 chars)",
  "status":      "todo | inprogress | done",
  "createdAt":   "ISO 8601 timestamp",
  "startedAt":   "ISO 8601 timestamp | null",
  "completedAt": "ISO 8601 timestamp | null"
}
```

### db.json Structure

```json
{
  "tasks": [ ...Task ]
}
```

### Backward Compatibility

Existing tasks in `db.json` that pre-date this feature lack the `startedAt` field. `readDb()` must normalize these by adding `startedAt: null` explicitly. This prevents `undefined` vs `null` mismatches in downstream code. No migration script is needed.

---

## 7. API Contract

| Method | Path | Body | 200/201 | 400 | 404 | 500 |
|---|---|---|---|---|---|---|
| `GET` | `/api/tasks` | — | `Task[]` | — | — | storage error |
| `POST` | `/api/tasks` | `{ "title": "string" }` | `Task` (201) | title empty | — | storage error |
| `PATCH` | `/api/tasks/:id/inprogress` | — | `Task` | source not `todo` | task missing | storage error |
| `PATCH` | `/api/tasks/:id/done` | — | `Task` | source not `inprogress` | task missing | storage error |

---

## 8. Constraints and Assumptions

- **Single user, single process:** Designed for local use only. Concurrent requests from the same browser (e.g., double-click) are mitigated by disabling action buttons immediately on click and re-enabling after re-fetch completes.

- **`writeDb()` is not atomic:** `fs.writeFileSync` can leave `db.json` partially written if the process crashes mid-write. This risk is accepted at this scope. True atomic writes would require write-to-temp + `fs.renameSync`. If data durability becomes a requirement, replace with SQLite.

- **`writeDb()` errors surface as 500:** All route handlers wrap `writeDb()` in try/catch. A storage failure returns `500 { error: "Storage error." }` rather than crashing the server.

- **No persistence migration:** `readDb()` normalizes legacy tasks by adding `startedAt: null` where absent. No separate migration script is needed.

- **No rollback support:** Status transitions are intentionally one-directional per requirements. Invalid transitions return `400`.

- **No authentication:** Application is local/internal; security is out of scope.

- **XSS safety:** All user-supplied content (task titles) is written to the DOM via `element.textContent` only. Use of `innerHTML` with task data is forbidden.

- **Scalability:** Flat-file storage is appropriate for this use case. If task volume grows beyond ~10,000 records, replacing `db.json` with SQLite would be the recommended next step.
