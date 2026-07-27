# Todo Application (Node.js SPA)

A single-page todo app built with Node.js and Express, featuring a powder blue and white interface.

## Features

- Add tasks to the Todo list
- Mark tasks as Done
- Keep completed tasks in a separate Done list
- Persist tasks using a lightweight JSON file database

## Tech Stack

- Node.js
- Express
- Vanilla HTML, CSS, JavaScript
- File-based storage in `db.json`

## Project Structure

- `server.js` - Express server and REST API
- `db.json` - Lightweight JSON database
- `public/index.html` - SPA markup
- `public/styles.css` - Powder blue and white styling
- `public/script.js` - Frontend logic for fetching and updating tasks

## Setup

1. Install dependencies:

```bash
npm install
```

If your machine has npm cache permission issues, use:

```bash
npm install --cache .npm-cache
```

2. Start the app:

```bash
npm start
```

3. Open in browser:

http://localhost:3000

## API Endpoints

- `GET /api/tasks` - Get all tasks
- `POST /api/tasks` - Create a task
  - Body: `{ "title": "Your task" }`
- `PATCH /api/tasks/:id/done` - Mark a task as done

## Notes

- Data is stored in `db.json`.
- No external database is required.
