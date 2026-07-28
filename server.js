const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// Allow tests to inject a different DB path via environment variable
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "db.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function readDb() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const data = JSON.parse(raw);

    if (!Array.isArray(data.tasks)) {
      return { tasks: [] };
    }

    // Spread puts the null default first so a real startedAt value on the task overwrites it
    data.tasks = data.tasks.map((task) => ({
      startedAt: null,
      ...task
    }));

    return data;
  } catch (error) {
    return { tasks: [] };
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

app.get("/api/tasks", (req, res) => {
  const db = readDb();
  res.json(db.tasks);
});

app.post("/api/tasks", (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";

  // S1: enforce length cap server-side — matches the HTML maxlength="120" attribute
  if (!title || title.length > 120) {
    return res.status(400).json({ error: "Task title is required and must be 120 characters or fewer." });
  }

  const db = readDb();
  const task = {
    id: crypto.randomUUID(),
    title,
    status: "todo",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null
  };

  db.tasks.push(task);

  try {
    writeDb(db);
  } catch (err) {
    console.error("writeDb failed:", err);
    return res.status(500).json({ error: "Storage error." });
  }

  return res.status(201).json(task);
});

// Transition todo → inprogress
app.patch("/api/tasks/:id/inprogress", (req, res) => {
  const db = readDb();
  const task = db.tasks.find((item) => item.id === req.params.id);

  if (!task) {
    return res.status(404).json({ error: "Task not found." });
  }

  if (task.status !== "todo") {
    return res.status(400).json({ error: "Task must be in 'todo' status." });
  }

  task.status = "inprogress";
  task.startedAt = new Date().toISOString();

  try {
    writeDb(db);
  } catch (err) {
    console.error("writeDb failed:", err);
    return res.status(500).json({ error: "Storage error." });
  }

  return res.json(task);
});

// Transition inprogress → done; enforces source status so todo → done is blocked
app.patch("/api/tasks/:id/done", (req, res) => {
  const db = readDb();
  const task = db.tasks.find((item) => item.id === req.params.id);

  if (!task) {
    return res.status(404).json({ error: "Task not found." });
  }

  if (task.status !== "inprogress") {
    return res.status(400).json({ error: "Task must be in 'inprogress' status." });
  }

  task.status = "done";
  task.completedAt = new Date().toISOString();

  try {
    writeDb(db);
  } catch (err) {
    console.error("writeDb failed:", err);
    return res.status(500).json({ error: "Storage error." });
  }

  return res.json(task);
});

// Only start listening when run directly — allows tests to import app without binding a port
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Todo app running at http://localhost:${PORT}`);
  });
}

module.exports = app;
