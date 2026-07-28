# Gherkin Test Cases — Todo Application
**Feature:** Todo Application — Full Functional & Integration Verification  
**Date:** 2026-07-28  
**Author:** Verification Suite  
**Total Scenarios:** 41

---

## Feature: GET /api/tasks — Task Retrieval

| TC ID | Scenario | Given | When | Then |
|---|---|---|---|---|
| TC-GET-001 | Returns empty array when no tasks exist | the database is empty | a GET request is sent to /api/tasks | the response status is 200 and the body is an empty array |
| TC-GET-002 | Returns all stored tasks | 2 tasks exist in the database (one todo, one inprogress) | a GET request is sent to /api/tasks | the response status is 200 and the body contains 2 tasks |
| TC-GET-003 | Normalizes legacy tasks missing startedAt | a legacy task exists without the startedAt field | a GET request is sent to /api/tasks | the response status is 200 and the task's startedAt field is null |
| TC-GET-004 | Returns empty array when db.json is corrupt | the database file contains invalid JSON | a GET request is sent to /api/tasks | the response status is 200 and the body is an empty array |
| TC-GET-005 | Response body is an array type | any database state | a GET request is sent to /api/tasks | the response body is of type Array |
| TC-GET-006 | Each task contains all required fields | one task exists in the database | a GET request is sent to /api/tasks | the task object includes id, title, status, createdAt, startedAt, and completedAt |

---

## Feature: POST /api/tasks — Task Creation

| TC ID | Scenario | Given | When | Then |
|---|---|---|---|---|
| TC-POST-001 | Creates task with valid title | the database is empty | a POST request with body {"title":"Buy milk"} is sent to /api/tasks | the response status is 201 and the body contains the created task with title "Buy milk" |
| TC-POST-002 | Created task has status 'todo' | the database is empty | a POST request with a valid title is sent to /api/tasks | the response body has status equal to "todo" |
| TC-POST-003 | Created task has null startedAt and completedAt | the database is empty | a POST request with a valid title is sent to /api/tasks | startedAt and completedAt in the response body are both null |
| TC-POST-004 | Created task is persisted to the database | the database is empty | a POST request with title "Persisted" is sent to /api/tasks | reading the database file shows 1 task with title "Persisted" |
| TC-POST-005 | Whitespace is trimmed from title | the database is empty | a POST request with title "  Trimmed  " is sent to /api/tasks | the response status is 201 and the returned title is "Trimmed" |
| TC-POST-006 | Rejects empty string title | the database is empty | a POST request with title "" is sent to /api/tasks | the response status is 400 and the body contains an error field |
| TC-POST-007 | Rejects whitespace-only title | the database is empty | a POST request with title "   " is sent to /api/tasks | the response status is 400 and the body contains an error field |
| TC-POST-008 | Rejects missing title field | the database is empty | a POST request with an empty body {} is sent to /api/tasks | the response status is 400 and the body contains an error field |
| TC-POST-009 | Rejects non-string title type | the database is empty | a POST request with title value 99 (number) is sent to /api/tasks | the response status is 400 and the body contains an error field |
| TC-POST-010 | Rejects title longer than 120 characters | the database is empty | a POST request with a 121-character title is sent to /api/tasks | the response status is 400 and the body contains an error field |
| TC-POST-011 | Accepts title of exactly 120 characters | the database is empty | a POST request with a 120-character title is sent to /api/tasks | the response status is 201 and the returned title has length 120 |
| TC-POST-012 | Accepts title of exactly 1 character | the database is empty | a POST request with title "Z" is sent to /api/tasks | the response status is 201 and the returned title is "Z" |
| TC-POST-013 | Accepts title with special characters | the database is empty | a POST request with title "Fix bug: <div> & 'quote' @ #100!" is sent to /api/tasks | the response status is 201 and the returned title matches the input exactly |
| TC-POST-014 | Response includes a valid UUID id | the database is empty | a POST request with a valid title is sent to /api/tasks | the response body id field matches UUID v4 format |
| TC-POST-015 | Response includes a valid ISO 8601 createdAt | the database is empty | a POST request with a valid title is sent to /api/tasks | the response body createdAt is a parseable ISO 8601 timestamp not earlier than the request time |

---

## Feature: PATCH /api/tasks/:id/inprogress — Start Task

| TC ID | Scenario | Given | When | Then |
|---|---|---|---|---|
| TC-INP-001 | Transitions todo task to inprogress | a task with status "todo" exists with id "t1" | a PATCH request is sent to /api/tasks/t1/inprogress | the response status is 200 and the returned task status is "inprogress" |
| TC-INP-002 | Sets a valid startedAt timestamp | a task with status "todo" exists with id "t1" | a PATCH request is sent to /api/tasks/t1/inprogress | the response body startedAt is a valid ISO timestamp greater than or equal to request start time |
| TC-INP-003 | Persists inprogress state and startedAt to database | a task with status "todo" exists with id "t1" | a PATCH request is sent to /api/tasks/t1/inprogress | reading the database shows the task with status "inprogress" and a non-null startedAt |
| TC-INP-004 | Rejects inprogress→inprogress transition | a task with status "inprogress" exists with id "t1" | a PATCH request is sent to /api/tasks/t1/inprogress | the response status is 400 and the error message mentions "todo" |
| TC-INP-005 | Rejects done→inprogress backward transition | a task with status "done" exists with id "t1" | a PATCH request is sent to /api/tasks/t1/inprogress | the response status is 400 and the error message mentions "todo" |
| TC-INP-006 | Returns 404 for unknown task id | the database is empty | a PATCH request is sent to /api/tasks/ghost/inprogress | the response status is 404 and the body contains an error field |
| TC-INP-007 | completedAt remains null after todo→inprogress | a task with status "todo" exists with id "t1" | a PATCH request is sent to /api/tasks/t1/inprogress | the response body completedAt is null |

---

## Feature: PATCH /api/tasks/:id/done — Complete Task

| TC ID | Scenario | Given | When | Then |
|---|---|---|---|---|
| TC-DONE-001 | Transitions inprogress task to done | a task with status "inprogress" exists with id "t1" | a PATCH request is sent to /api/tasks/t1/done | the response status is 200 and the returned task status is "done" |
| TC-DONE-002 | Sets a valid completedAt timestamp | a task with status "inprogress" exists with id "t1" | a PATCH request is sent to /api/tasks/t1/done | the response body completedAt is a valid ISO timestamp greater than or equal to request start time |
| TC-DONE-003 | Persists done state and completedAt to database | a task with status "inprogress" exists with id "t1" | a PATCH request is sent to /api/tasks/t1/done | reading the database shows the task with status "done" and a non-null completedAt |
| TC-DONE-004 | Rejects todo→done transition (must go through inprogress) | a task with status "todo" exists with id "t1" | a PATCH request is sent to /api/tasks/t1/done | the response status is 400 and the error message mentions "inprogress" |
| TC-DONE-005 | Rejects done→done re-completion | a task with status "done" exists with id "t1" | a PATCH request is sent to /api/tasks/t1/done | the response status is 400 and the body contains an error field |
| TC-DONE-006 | Returns 404 for unknown task id | the database is empty | a PATCH request is sent to /api/tasks/ghost/done | the response status is 404 and the body contains an error field |
| TC-DONE-007 | startedAt is preserved after inprogress→done | a task with status "inprogress" and startedAt "2026-07-28T08:00:00.000Z" exists | a PATCH request is sent to /api/tasks/t1/done | the response body startedAt equals "2026-07-28T08:00:00.000Z" unchanged |

---

## Feature: Integration Scenarios — End-to-End Workflows

| TC ID | Scenario | Given | When | Then |
|---|---|---|---|---|
| TC-INT-001 | Full lifecycle todo→inprogress→done | the database is empty | a task is created, then patched to inprogress, then patched to done in sequence | each step returns 200/201, timestamps are set at each stage, final database state is "done" with all 3 timestamps present |
| TC-INT-002 | Skipping inprogress (todo→done) is rejected | a new task in "todo" state exists | a PATCH request to /done is sent immediately | the response is 400 and the task remains in "todo" status confirmed by GET |
| TC-INT-003 | Multiple tasks coexist in different states | 3 tasks are created (A: todo, B: inprogress, C: done) | GET /api/tasks is called | each task has its correct independent status |
| TC-INT-004 | All created tasks are returned by GET | 3 tasks (Alpha, Beta, Gamma) are created sequentially | GET /api/tasks is called | the response contains all 3 tasks with correct titles |
| TC-INT-005 | Transitioning one task does not affect sibling tasks | 2 tasks (A and B) are created in todo state | Task A is transitioned to inprogress | Task B status remains "todo" and startedAt remains null |
| TC-INT-006 | Error responses always contain an error field | N/A | invalid requests are sent (empty title, unknown id, bad state transition) | every error response body has an error field of type string |
