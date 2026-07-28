# Requirements: Add "In Progress" Status

**Source:** Jira EPMCDMETST-55986  
**Date:** 2026-07-28

---

## Summary

Add an "In Progress" status to the todo application so tasks can transition through three states: **Todo → In Progress → Done**.

---

## Requirements

### 1. Status Flow
- Tasks follow a strict forward-only lifecycle: `todo` → `inprogress` → `done`
- A task cannot move backwards once it has advanced to a later status

### 2. UI — New "In Progress" Section
- Add a new **"In Progress"** panel between the existing "Todo" and "Done" panels
- Display an empty-state message when no tasks are in progress

### 3. Action Buttons
- **Todo tasks** — show a "Mark In Progress" button (in addition to the existing "Mark Done" button is removed; forward step is In Progress first)
- **In Progress tasks** — show a "Mark Done" button only
- **Done tasks** — no action buttons (read-only)

### 4. API — New Endpoint
- `PATCH /api/tasks/:id/inprogress`
  - Sets `status` to `"inprogress"`
  - Records `startedAt` timestamp (ISO 8601)
  - Returns 404 if task not found
  - Is a no-op if task is already `"inprogress"`

### 5. Data Model
Add `startedAt` field to the task object:

```json
{
  "id": "uuid",
  "title": "string",
  "status": "todo | inprogress | done",
  "createdAt": "ISO timestamp",
  "startedAt": "ISO timestamp | null",
  "completedAt": "ISO timestamp | null"
}
```

### 6. Rendering
- In Progress tasks display an **"In Progress" badge** (visually distinct from the "Done" badge)
- Todo tasks show a **"Mark In Progress"** button; "Mark Done" button is removed from Todo tasks (must go through In Progress first)

---

## Files to Change

| File | Change |
|---|---|
| `server.js` | Add `PATCH /api/tasks/:id/inprogress` endpoint; include `startedAt` in task creation as `null` |
| `public/index.html` | Add "In Progress" `<section>` panel between Todo and Done |
| `public/script.js` | Add `markTaskInProgress()`, update `render()` for three-status display |
| `public/styles.css` | Add styles for `.inprogress-badge` and `.mark-inprogress` button |
