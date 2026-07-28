const taskForm = document.getElementById("task-form");
const taskInput = document.getElementById("task-input");
const todoList = document.getElementById("todo-list");
const inprogressList = document.getElementById("inprogress-list");
const doneList = document.getElementById("done-list");
const todoEmpty = document.getElementById("todo-empty");
const inprogressEmpty = document.getElementById("inprogress-empty");
const doneEmpty = document.getElementById("done-empty");

let tasks = [];

async function fetchTasks() {
  const response = await fetch("/api/tasks");
  // E1: guard against non-200 so tasks always remains an array
  if (!response.ok) {
    throw new Error("Could not load tasks.");
  }
  tasks = await response.json();
  render();
}

async function createTask(title) {
  const response = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });

  if (!response.ok) {
    throw new Error("Could not create task.");
  }

  await fetchTasks();
}

// DRY1: shared helper — disables button, calls PATCH, re-fetches, re-enables
async function patchTask(taskId, endpoint, button) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/tasks/${taskId}/${endpoint}`, {
      method: "PATCH"
    });

    if (!response.ok) {
      throw new Error("Could not update task.");
    }

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

// DRY2: always use textContent so user-supplied titles are never interpreted as HTML
function createTitleEl(text) {
  const p = document.createElement("p");
  p.className = "task-title";
  p.textContent = text;
  return p;
}

function render() {
  todoList.innerHTML = "";
  inprogressList.innerHTML = "";
  doneList.innerHTML = "";

  const todoTasks       = tasks.filter((task) => task.status === "todo");
  const inprogressTasks = tasks.filter((task) => task.status === "inprogress");
  const doneTasks       = tasks.filter((task) => task.status === "done");

  for (const task of todoTasks) {
    const li = document.createElement("li");
    li.className = "task-item";

    const inProgressButton = document.createElement("button");
    inProgressButton.className = "mark-inprogress";
    inProgressButton.type = "button";
    inProgressButton.textContent = "Mark In Progress";
    inProgressButton.addEventListener("click", async () => {
      await markTaskInProgress(task.id, inProgressButton);
    });

    li.append(createTitleEl(task.title), inProgressButton);
    todoList.appendChild(li);
  }

  for (const task of inprogressTasks) {
    const li = document.createElement("li");
    li.className = "task-item";

    const badge = document.createElement("span");
    badge.className = "inprogress-badge";
    badge.textContent = "In Progress";

    const doneButton = document.createElement("button");
    doneButton.className = "mark-done";
    doneButton.type = "button";
    doneButton.textContent = "Mark Done";
    doneButton.addEventListener("click", async () => {
      await markTaskDone(task.id, doneButton);
    });

    li.append(createTitleEl(task.title), badge, doneButton);
    inprogressList.appendChild(li);
  }

  for (const task of doneTasks) {
    const li = document.createElement("li");
    li.className = "task-item";

    const badge = document.createElement("span");
    badge.className = "done-badge";
    badge.textContent = "Done";

    li.append(createTitleEl(task.title), badge);
    doneList.appendChild(li);
  }

  todoEmpty.style.display       = todoTasks.length       ? "none" : "block";
  inprogressEmpty.style.display = inprogressTasks.length ? "none" : "block";
  doneEmpty.style.display       = doneTasks.length       ? "none" : "block";
}

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = taskInput.value.trim();

  if (!title) {
    return;
  }

  try {
    await createTask(title);
    taskInput.value = "";
    taskInput.focus();
  } catch (error) {
    alert(error.message);
  }
});

fetchTasks().catch((error) => {
  alert(error.message);
});
