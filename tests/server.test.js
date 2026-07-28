const { test, describe, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");

// ─── Temp DB setup ────────────────────────────────────────────────────────────
// Each test run gets its own isolated db file so tests never share state.

let tmpDb;

function resetDb(tasks = []) {
  fs.writeFileSync(tmpDb, JSON.stringify({ tasks }, null, 2), "utf8");
}

function readDb() {
  return JSON.parse(fs.readFileSync(tmpDb, "utf8"));
}

// Create the temp file before requiring the app so DB_PATH is set first
tmpDb = path.join(os.tmpdir(), `todo-test-${process.pid}.json`);
resetDb();
process.env.DB_PATH = tmpDb;

const app = require("../server");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTodoTask(overrides = {}) {
  return {
    id: "task-001",
    title: "Test task",
    status: "todo",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    ...overrides
  };
}

// ─── GET /api/tasks ───────────────────────────────────────────────────────────

describe("GET /api/tasks", () => {
  beforeEach(() => resetDb());

  test("returns empty array when no tasks exist", async () => {
    const res = await request(app).get("/api/tasks");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  test("returns all tasks", async () => {
    const task = makeTodoTask();
    resetDb([task]);

    const res = await request(app).get("/api/tasks");
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].title, "Test task");
  });

  test("normalizes legacy tasks that lack startedAt — injects null", async () => {
    // Simulate a task created before the startedAt field existed
    const legacy = {
      id: "legacy-001",
      title: "Legacy task",
      status: "done",
      createdAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-02T00:00:00.000Z"
      // deliberately no startedAt field
    };
    resetDb([legacy]);

    const res = await request(app).get("/api/tasks");
    assert.equal(res.status, 200);
    assert.equal(res.body[0].startedAt, null);
  });

  // T2: covers the readDb() silent-fallback path for malformed JSON
  test("returns empty array when db.json contains invalid JSON", async () => {
    fs.writeFileSync(tmpDb, "NOT VALID JSON", "utf8");

    const res = await request(app).get("/api/tasks");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });
});

// ─── POST /api/tasks ──────────────────────────────────────────────────────────

describe("POST /api/tasks", () => {
  beforeEach(() => resetDb());

  test("creates a task with status 'todo' and all required fields", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "Buy groceries" });

    assert.equal(res.status, 201);
    assert.equal(res.body.title, "Buy groceries");
    assert.equal(res.body.status, "todo");
    assert.equal(res.body.startedAt, null);
    assert.equal(res.body.completedAt, null);
    assert.ok(res.body.id, "id should be present");
    assert.ok(res.body.createdAt, "createdAt should be present");
  });

  test("trims whitespace from title", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "  Trimmed  " });

    assert.equal(res.status, 201);
    assert.equal(res.body.title, "Trimmed");
  });

  test("persists the task to db", async () => {
    await request(app).post("/api/tasks").send({ title: "Persisted task" });

    const db = readDb();
    assert.equal(db.tasks.length, 1);
    assert.equal(db.tasks[0].title, "Persisted task");
  });

  test("returns 400 when title is empty string", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "" });

    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test("returns 400 when title is only whitespace", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "   " });

    assert.equal(res.status, 400);
  });

  test("returns 400 when title field is missing", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({});

    assert.equal(res.status, 400);
  });

  test("returns 400 when title is not a string", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ title: 42 });

    assert.equal(res.status, 400);
  });

  // S1: server-side length cap — mirrors HTML maxlength="120"
  test("returns 400 when title exceeds 120 characters", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "a".repeat(121) });

    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test("accepts a title of exactly 120 characters", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "a".repeat(120) });

    assert.equal(res.status, 201);
    assert.equal(res.body.title.length, 120);
  });
});

// ─── PATCH /api/tasks/:id/inprogress ─────────────────────────────────────────

describe("PATCH /api/tasks/:id/inprogress", () => {
  beforeEach(() => resetDb());

  test("transitions a 'todo' task to 'inprogress' and records startedAt", async () => {
    const before = Date.now();
    resetDb([makeTodoTask({ id: "t1" })]);

    const res = await request(app).patch("/api/tasks/t1/inprogress");

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "inprogress");
    assert.ok(res.body.startedAt, "startedAt should be set");

    const startedAt = new Date(res.body.startedAt).getTime();
    assert.ok(startedAt >= before, "startedAt should be >= request start time");
  });

  test("persists status change and startedAt to db", async () => {
    resetDb([makeTodoTask({ id: "t1" })]);
    await request(app).patch("/api/tasks/t1/inprogress");

    const db = readDb();
    assert.equal(db.tasks[0].status, "inprogress");
    assert.ok(db.tasks[0].startedAt);
  });

  test("returns 400 when task is already 'inprogress' (no backward move)", async () => {
    resetDb([makeTodoTask({ id: "t1", status: "inprogress", startedAt: new Date().toISOString() })]);

    const res = await request(app).patch("/api/tasks/t1/inprogress");
    assert.equal(res.status, 400);
    assert.match(res.body.error, /todo/i);
  });

  test("returns 400 when task is 'done' — backward transition blocked", async () => {
    resetDb([makeTodoTask({
      id: "t1",
      status: "done",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    })]);

    const res = await request(app).patch("/api/tasks/t1/inprogress");
    assert.equal(res.status, 400);
    assert.match(res.body.error, /todo/i);
  });

  test("returns 404 for unknown task id", async () => {
    const res = await request(app).patch("/api/tasks/nonexistent/inprogress");
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  test("completedAt remains null after todo→inprogress", async () => {
    resetDb([makeTodoTask({ id: "t1" })]);
    const res = await request(app).patch("/api/tasks/t1/inprogress");

    assert.equal(res.body.completedAt, null);
  });
});

// ─── PATCH /api/tasks/:id/done ────────────────────────────────────────────────

describe("PATCH /api/tasks/:id/done", () => {
  beforeEach(() => resetDb());

  test("transitions an 'inprogress' task to 'done' and records completedAt", async () => {
    const before = Date.now();
    resetDb([makeTodoTask({ id: "t1", status: "inprogress", startedAt: new Date().toISOString() })]);

    const res = await request(app).patch("/api/tasks/t1/done");

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "done");
    assert.ok(res.body.completedAt, "completedAt should be set");

    const completedAt = new Date(res.body.completedAt).getTime();
    assert.ok(completedAt >= before, "completedAt should be >= request start time");
  });

  test("persists status change and completedAt to db", async () => {
    resetDb([makeTodoTask({ id: "t1", status: "inprogress", startedAt: new Date().toISOString() })]);
    await request(app).patch("/api/tasks/t1/done");

    const db = readDb();
    assert.equal(db.tasks[0].status, "done");
    assert.ok(db.tasks[0].completedAt);
  });

  test("returns 400 when task is 'todo' — must go through inprogress first", async () => {
    resetDb([makeTodoTask({ id: "t1", status: "todo" })]);

    const res = await request(app).patch("/api/tasks/t1/done");
    assert.equal(res.status, 400);
    assert.match(res.body.error, /inprogress/i);
  });

  test("returns 400 when task is already 'done'", async () => {
    resetDb([makeTodoTask({
      id: "t1",
      status: "done",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    })]);

    const res = await request(app).patch("/api/tasks/t1/done");
    assert.equal(res.status, 400);
  });

  test("returns 404 for unknown task id", async () => {
    const res = await request(app).patch("/api/tasks/nonexistent/done");
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  test("startedAt is preserved after inprogress→done", async () => {
    const startedAt = "2026-07-28T06:00:00.000Z";
    resetDb([makeTodoTask({ id: "t1", status: "inprogress", startedAt })]);

    const res = await request(app).patch("/api/tasks/t1/done");
    assert.equal(res.body.startedAt, startedAt);
  });
});

// ─── Full lifecycle ───────────────────────────────────────────────────────────

describe("Full task lifecycle: todo → inprogress → done", () => {
  beforeEach(() => resetDb());

  test("a task travels the complete lifecycle in sequence", async () => {
    // Create
    const create = await request(app)
      .post("/api/tasks")
      .send({ title: "End-to-end task" });

    assert.equal(create.status, 201);
    assert.equal(create.body.status, "todo");
    const id = create.body.id;

    // todo → inprogress
    const start = await request(app).patch(`/api/tasks/${id}/inprogress`);
    assert.equal(start.status, 200);
    assert.equal(start.body.status, "inprogress");
    assert.ok(start.body.startedAt);

    // inprogress → done
    const done = await request(app).patch(`/api/tasks/${id}/done`);
    assert.equal(done.status, 200);
    assert.equal(done.body.status, "done");
    assert.ok(done.body.completedAt);
    assert.equal(done.body.startedAt, start.body.startedAt);

    // Verify final state in db
    const db = readDb();
    const saved = db.tasks.find((t) => t.id === id);
    assert.equal(saved.status, "done");
    assert.ok(saved.startedAt);
    assert.ok(saved.completedAt);
  });

  test("skipping inprogress — todo→done directly — is rejected", async () => {
    const create = await request(app)
      .post("/api/tasks")
      .send({ title: "Skip test" });
    const id = create.body.id;

    const res = await request(app).patch(`/api/tasks/${id}/done`);
    assert.equal(res.status, 400);

    // Task must still be in todo state
    const get = await request(app).get("/api/tasks");
    const task = get.body.find((t) => t.id === id);
    assert.equal(task.status, "todo");
  });
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

after(() => {
  try { fs.unlinkSync(tmpDb); } catch { /* already gone */ }
});
