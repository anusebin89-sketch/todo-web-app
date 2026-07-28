/**
 * Comprehensive Verification Suite — Todo Application
 * Maps 1-to-1 with Gherkin TC IDs in gherkin-test-cases.md
 * Covers: GET /api/tasks, POST /api/tasks, PATCH /inprogress, PATCH /done, Integration
 */

const { test, describe, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");

// ─── Isolated DB setup ────────────────────────────────────────────────────────

const tmpDb = path.join(os.tmpdir(), `todo-verify-${process.pid}.json`);

function resetDb(tasks = []) {
  fs.writeFileSync(tmpDb, JSON.stringify({ tasks }, null, 2), "utf8");
}

function readDb() {
  return JSON.parse(fs.readFileSync(tmpDb, "utf8"));
}

resetDb();
process.env.DB_PATH = tmpDb;

const app = require("../server");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTodo(overrides = {}) {
  return {
    id: "task-001",
    title: "Sample task",
    status: "todo",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    ...overrides
  };
}

function makeInProgress(overrides = {}) {
  return makeTodo({ id: "task-002", status: "inprogress", startedAt: new Date().toISOString(), ...overrides });
}

function makeDone(overrides = {}) {
  return makeInProgress({
    id: "task-003",
    status: "done",
    completedAt: new Date().toISOString(),
    ...overrides
  });
}

// ─── TC-GET: GET /api/tasks ───────────────────────────────────────────────────

describe("TC-GET: GET /api/tasks", () => {
  beforeEach(() => resetDb());

  test("TC-GET-001: returns 200 and empty array when no tasks exist", async () => {
    const res = await request(app).get("/api/tasks");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  test("TC-GET-002: returns 200 and all stored tasks", async () => {
    resetDb([makeTodo(), makeInProgress()]);
    const res = await request(app).get("/api/tasks");
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
  });

  test("TC-GET-003: normalizes legacy tasks missing startedAt — injects null", async () => {
    const legacy = {
      id: "legacy-001",
      title: "Legacy",
      status: "done",
      createdAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-02T00:00:00.000Z"
    };
    resetDb([legacy]);
    const res = await request(app).get("/api/tasks");
    assert.equal(res.status, 200);
    assert.equal(res.body[0].startedAt, null);
  });

  test("TC-GET-004: returns empty array when db.json contains invalid JSON", async () => {
    fs.writeFileSync(tmpDb, "CORRUPT", "utf8");
    const res = await request(app).get("/api/tasks");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  test("TC-GET-005: response body is an array type", async () => {
    const res = await request(app).get("/api/tasks");
    assert.ok(Array.isArray(res.body), "Response body must be an array");
  });

  test("TC-GET-006: each task contains all required fields (id, title, status, createdAt, startedAt, completedAt)", async () => {
    resetDb([makeTodo()]);
    const res = await request(app).get("/api/tasks");
    const task = res.body[0];
    const requiredFields = ["id", "title", "status", "createdAt", "startedAt", "completedAt"];
    for (const field of requiredFields) {
      assert.ok(Object.prototype.hasOwnProperty.call(task, field), `Field '${field}' must be present`);
    }
  });
});

// ─── TC-POST: POST /api/tasks ─────────────────────────────────────────────────

describe("TC-POST: POST /api/tasks", () => {
  beforeEach(() => resetDb());

  test("TC-POST-001: returns 201 and created task for valid title", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "Buy milk" });
    assert.equal(res.status, 201);
    assert.equal(res.body.title, "Buy milk");
  });

  test("TC-POST-002: created task has status 'todo'", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "Check mail" });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, "todo");
  });

  test("TC-POST-003: created task has null startedAt and completedAt", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "Run tests" });
    assert.equal(res.status, 201);
    assert.equal(res.body.startedAt, null);
    assert.equal(res.body.completedAt, null);
  });

  test("TC-POST-004: created task is persisted to the database", async () => {
    await request(app).post("/api/tasks").send({ title: "Persisted" });
    const db = readDb();
    assert.equal(db.tasks.length, 1);
    assert.equal(db.tasks[0].title, "Persisted");
  });

  test("TC-POST-005: leading and trailing whitespace is trimmed from title", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "  Trimmed  " });
    assert.equal(res.status, 201);
    assert.equal(res.body.title, "Trimmed");
  });

  test("TC-POST-006: returns 400 when title is empty string", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "" });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test("TC-POST-007: returns 400 when title is only whitespace", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "   " });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test("TC-POST-008: returns 400 when title field is missing entirely", async () => {
    const res = await request(app).post("/api/tasks").send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test("TC-POST-009: returns 400 when title is a non-string type (number)", async () => {
    const res = await request(app).post("/api/tasks").send({ title: 99 });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test("TC-POST-010: returns 400 when title exceeds 120 characters", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "x".repeat(121) });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test("TC-POST-011: accepts title of exactly 120 characters", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "a".repeat(120) });
    assert.equal(res.status, 201);
    assert.equal(res.body.title.length, 120);
  });

  test("TC-POST-012: accepts title of exactly 1 character", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "Z" });
    assert.equal(res.status, 201);
    assert.equal(res.body.title, "Z");
  });

  test("TC-POST-013: accepts title containing special characters and symbols", async () => {
    const title = "Fix bug: <div> & 'quote' @ #100!";
    const res = await request(app).post("/api/tasks").send({ title });
    assert.equal(res.status, 201);
    assert.equal(res.body.title, title);
  });

  test("TC-POST-014: response includes a non-empty UUID id field", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "UUID check" });
    assert.equal(res.status, 201);
    assert.ok(res.body.id, "id must be present");
    assert.match(res.body.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test("TC-POST-015: response includes a valid ISO 8601 createdAt timestamp", async () => {
    const before = Date.now();
    const res = await request(app).post("/api/tasks").send({ title: "Timestamp check" });
    assert.equal(res.status, 201);
    const ts = new Date(res.body.createdAt).getTime();
    assert.ok(!isNaN(ts), "createdAt must be a valid date");
    assert.ok(ts >= before, "createdAt must not be in the past");
  });
});

// ─── TC-INP: PATCH /api/tasks/:id/inprogress ─────────────────────────────────

describe("TC-INP: PATCH /api/tasks/:id/inprogress", () => {
  beforeEach(() => resetDb());

  test("TC-INP-001: returns 200 and transitions todo task to inprogress", async () => {
    resetDb([makeTodo({ id: "t1" })]);
    const res = await request(app).patch("/api/tasks/t1/inprogress");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "inprogress");
  });

  test("TC-INP-002: sets a valid startedAt ISO timestamp on transition", async () => {
    const before = Date.now();
    resetDb([makeTodo({ id: "t1" })]);
    const res = await request(app).patch("/api/tasks/t1/inprogress");
    assert.ok(res.body.startedAt, "startedAt must be set");
    const ts = new Date(res.body.startedAt).getTime();
    assert.ok(ts >= before, "startedAt must be >= request time");
  });

  test("TC-INP-003: persists status inprogress and startedAt to database", async () => {
    resetDb([makeTodo({ id: "t1" })]);
    await request(app).patch("/api/tasks/t1/inprogress");
    const db = readDb();
    assert.equal(db.tasks[0].status, "inprogress");
    assert.ok(db.tasks[0].startedAt);
  });

  test("TC-INP-004: returns 400 when task is already inprogress", async () => {
    resetDb([makeInProgress({ id: "t1" })]);
    const res = await request(app).patch("/api/tasks/t1/inprogress");
    assert.equal(res.status, 400);
    assert.match(res.body.error, /todo/i);
  });

  test("TC-INP-005: returns 400 when task is done — backward transition blocked", async () => {
    resetDb([makeDone({ id: "t1" })]);
    const res = await request(app).patch("/api/tasks/t1/inprogress");
    assert.equal(res.status, 400);
    assert.match(res.body.error, /todo/i);
  });

  test("TC-INP-006: returns 404 when task id does not exist", async () => {
    const res = await request(app).patch("/api/tasks/ghost/inprogress");
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  test("TC-INP-007: completedAt remains null after todo→inprogress transition", async () => {
    resetDb([makeTodo({ id: "t1" })]);
    const res = await request(app).patch("/api/tasks/t1/inprogress");
    assert.equal(res.body.completedAt, null);
  });
});

// ─── TC-DONE: PATCH /api/tasks/:id/done ──────────────────────────────────────

describe("TC-DONE: PATCH /api/tasks/:id/done", () => {
  beforeEach(() => resetDb());

  test("TC-DONE-001: returns 200 and transitions inprogress task to done", async () => {
    resetDb([makeInProgress({ id: "t1" })]);
    const res = await request(app).patch("/api/tasks/t1/done");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "done");
  });

  test("TC-DONE-002: sets a valid completedAt ISO timestamp on transition", async () => {
    const before = Date.now();
    resetDb([makeInProgress({ id: "t1" })]);
    const res = await request(app).patch("/api/tasks/t1/done");
    assert.ok(res.body.completedAt, "completedAt must be set");
    const ts = new Date(res.body.completedAt).getTime();
    assert.ok(ts >= before, "completedAt must be >= request time");
  });

  test("TC-DONE-003: persists status done and completedAt to database", async () => {
    resetDb([makeInProgress({ id: "t1" })]);
    await request(app).patch("/api/tasks/t1/done");
    const db = readDb();
    assert.equal(db.tasks[0].status, "done");
    assert.ok(db.tasks[0].completedAt);
  });

  test("TC-DONE-004: returns 400 when task is todo — must go through inprogress first", async () => {
    resetDb([makeTodo({ id: "t1" })]);
    const res = await request(app).patch("/api/tasks/t1/done");
    assert.equal(res.status, 400);
    assert.match(res.body.error, /inprogress/i);
  });

  test("TC-DONE-005: returns 400 when task is already done", async () => {
    resetDb([makeDone({ id: "t1" })]);
    const res = await request(app).patch("/api/tasks/t1/done");
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test("TC-DONE-006: returns 404 when task id does not exist", async () => {
    const res = await request(app).patch("/api/tasks/ghost/done");
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  test("TC-DONE-007: startedAt value is preserved after inprogress→done transition", async () => {
    const startedAt = "2026-07-28T08:00:00.000Z";
    resetDb([makeInProgress({ id: "t1", startedAt })]);
    const res = await request(app).patch("/api/tasks/t1/done");
    assert.equal(res.body.startedAt, startedAt);
  });
});

// ─── TC-INT: Integration Scenarios ───────────────────────────────────────────

describe("TC-INT: Integration Scenarios", () => {
  beforeEach(() => resetDb());

  test("TC-INT-001: full lifecycle todo→inprogress→done — all timestamps set and preserved", async () => {
    const create = await request(app).post("/api/tasks").send({ title: "Full lifecycle" });
    assert.equal(create.status, 201);
    const id = create.body.id;

    const toInProgress = await request(app).patch(`/api/tasks/${id}/inprogress`);
    assert.equal(toInProgress.status, 200);
    assert.equal(toInProgress.body.status, "inprogress");
    assert.ok(toInProgress.body.startedAt);

    const toDone = await request(app).patch(`/api/tasks/${id}/done`);
    assert.equal(toDone.status, 200);
    assert.equal(toDone.body.status, "done");
    assert.ok(toDone.body.completedAt);
    assert.equal(toDone.body.startedAt, toInProgress.body.startedAt);

    const db = readDb();
    const saved = db.tasks.find((t) => t.id === id);
    assert.equal(saved.status, "done");
    assert.ok(saved.startedAt);
    assert.ok(saved.completedAt);
  });

  test("TC-INT-002: skipping inprogress (todo→done) is rejected and task remains todo", async () => {
    const create = await request(app).post("/api/tasks").send({ title: "Skip test" });
    const id = create.body.id;

    const res = await request(app).patch(`/api/tasks/${id}/done`);
    assert.equal(res.status, 400);

    const get = await request(app).get("/api/tasks");
    const task = get.body.find((t) => t.id === id);
    assert.equal(task.status, "todo");
  });

  test("TC-INT-003: multiple tasks coexist independently in different states", async () => {
    const t1 = (await request(app).post("/api/tasks").send({ title: "Task A" })).body;
    const t2 = (await request(app).post("/api/tasks").send({ title: "Task B" })).body;
    const t3 = (await request(app).post("/api/tasks").send({ title: "Task C" })).body;

    await request(app).patch(`/api/tasks/${t2.id}/inprogress`);
    await request(app).patch(`/api/tasks/${t3.id}/inprogress`);
    await request(app).patch(`/api/tasks/${t3.id}/done`);

    const res = await request(app).get("/api/tasks");
    const all = res.body;

    assert.equal(all.find((t) => t.id === t1.id).status, "todo");
    assert.equal(all.find((t) => t.id === t2.id).status, "inprogress");
    assert.equal(all.find((t) => t.id === t3.id).status, "done");
  });

  test("TC-INT-004: multiple created tasks are all returned by GET /api/tasks", async () => {
    await request(app).post("/api/tasks").send({ title: "Alpha" });
    await request(app).post("/api/tasks").send({ title: "Beta" });
    await request(app).post("/api/tasks").send({ title: "Gamma" });

    const res = await request(app).get("/api/tasks");
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 3);
    const titles = res.body.map((t) => t.title);
    assert.ok(titles.includes("Alpha"));
    assert.ok(titles.includes("Beta"));
    assert.ok(titles.includes("Gamma"));
  });

  test("TC-INT-005: transitioning one task does not affect sibling tasks", async () => {
    const tA = (await request(app).post("/api/tasks").send({ title: "Task A" })).body;
    const tB = (await request(app).post("/api/tasks").send({ title: "Task B" })).body;

    await request(app).patch(`/api/tasks/${tA.id}/inprogress`);

    const res = await request(app).get("/api/tasks");
    const taskB = res.body.find((t) => t.id === tB.id);
    assert.equal(taskB.status, "todo");
    assert.equal(taskB.startedAt, null);
  });

  test("TC-INT-006: error responses always include an error field with a string message", async () => {
    const badCreate  = await request(app).post("/api/tasks").send({ title: "" });
    const badPatch404 = await request(app).patch("/api/tasks/nope/inprogress");
    const badPatchState = (async () => {
      resetDb([makeDone({ id: "dx" })]);
      return request(app).patch("/api/tasks/dx/done");
    })();

    assert.ok(typeof badCreate.body.error === "string");
    assert.ok(typeof badPatch404.body.error === "string");
    assert.ok(typeof (await badPatchState).body.error === "string");
  });
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

after(() => {
  try { fs.unlinkSync(tmpDb); } catch { /* already gone */ }
});
