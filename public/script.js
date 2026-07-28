const taskForm = document.getElementById("task-form");
const taskInput = document.getElementById("task-input");
const todoList = document.getElementById("todo-list");
const doneList = document.getElementById("done-list");
const todoEmpty = document.getElementById("todo-empty");
const doneEmpty = document.getElementById("done-empty");

let tasks = [];

async function fetchTasks() {
  const response = await fetch("/api/tasks");
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

async function markTaskDone(taskId) {
  const response = await fetch(`/api/tasks/${taskId}/done`, {
    method: "PATCH"
  });

  if (!response.ok) {
    throw new Error("Could not update task.");
  }

  await fetchTasks();
}

function render() {
  todoList.innerHTML = "";
  doneList.innerHTML = "";

  const todoTasks = tasks.filter((task) => task.status === "todo");
  const doneTasks = tasks.filter((task) => task.status === "done");

  for (const task of todoTasks) {
    const li = document.createElement("li");
    li.className = "task-item";

    const title = document.createElement("p");
    title.className = "task-title";
    title.textContent = task.title;

    const doneButton = document.createElement("button");
    doneButton.className = "mark-done";
    doneButton.type = "button";
    doneButton.textContent = "Mark Done";
    doneButton.addEventListener("click", async () => {
      try {
        await markTaskDone(task.id);
      } catch (error) {
        alert(error.message);
      }
    });

    li.append(title, doneButton);
    todoList.appendChild(li);
  }

  for (const task of doneTasks) {
    const li = document.createElement("li");
    li.className = "task-item";

    const title = document.createElement("p");
    title.className = "task-title";
    title.textContent = task.title;

    const badge = document.createElement("span");
    badge.className = "done-badge";
    badge.textContent = "Done";

    li.append(title, badge);
    doneList.appendChild(li);
  }

  todoEmpty.style.display = todoTasks.length ? "none" : "block";
  doneEmpty.style.display = doneTasks.length ? "none" : "block";
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
