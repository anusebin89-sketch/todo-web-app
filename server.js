const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "db.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function readDb() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const data = JSON.parse(raw);

    if (!Array.isArray(data.tasks)) {
      return { tasks: [] };
    }

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

  if (!title) {
    return res.status(400).json({ error: "Task title is required." });
  }

  const db = readDb();
  const task = {
    id: crypto.randomUUID(),
    title,
    status: "todo",
    createdAt: new Date().toISOString(),
    completedAt: null
  };

  db.tasks.push(task);
  writeDb(db);

  return res.status(201).json(task);
});

app.patch("/api/tasks/:id/done", (req, res) => {
  const db = readDb();
  const task = db.tasks.find((item) => item.id === req.params.id);

  if (!task) {
    return res.status(404).json({ error: "Task not found." });
  }

  if (task.status === "done") {
    return res.json(task);
  }

  task.status = "done";
  task.completedAt = new Date().toISOString();
  writeDb(db);

  return res.json(task);
});

app.listen(PORT, () => {
  console.log(`Todo app running at http://localhost:${PORT}`);
});
