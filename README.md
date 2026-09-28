# QueueLess - Virtual Queue Management System

QueueLess is a university DevOps project for a virtual queue management system. In this first phase, the project provides a clean React frontend, Express REST API, PostgreSQL schema, JWT authentication, and a protected dashboard.

Queue features are intentionally not implemented yet.

## Technology Stack

- React, Vite, JavaScript, Tailwind CSS, React Router
- Node.js, Express.js, REST API
- PostgreSQL
- JWT and bcrypt
- npm, Git, Ubuntu on WSL 2

## Project Structure

```text
QueueLess/
  frontend/
    src/
      components/
      context/
      layouts/
      pages/
      services/
      App.jsx
  backend/
    src/
      config/
      controllers/
      middleware/
      models/
      routes/
      server.js
  database/
    schema.sql
  .env.example
  README.md
```

## Prerequisites

- Node.js 18 or newer
- npm
- PostgreSQL
- Git

## Install Dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

## Configure PostgreSQL

Create a database, then run the schema:

```bash
createdb queueless
psql -d queueless -f database/schema.sql
```

If you run the command from inside the `database` folder, use:

```bash
psql -d queueless -f schema.sql
```

## Environment Variables

Create `backend/.env` from `backend/.env.example`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/queueless
JWT_SECRET=replace-with-a-long-random-secret
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
```

Create `frontend/.env` from `frontend/.env.example`:

```env
VITE_API_URL=http://localhost:5000/api
```

The actual `.env` files are ignored by Git.

## Run Backend

```bash
cd backend
npm run dev
```

The API runs at `http://localhost:5000`.

## Run Frontend

```bash
cd frontend
npm run dev
```

The app runs at `http://localhost:5173`.

## Authentication API Endpoints

- `POST /api/auth/register` - register with name, email, password, and confirm password
- `POST /api/auth/login` - log in and receive a JWT
- `GET /api/auth/me` - return the authenticated user using a Bearer token

## Queue Frontend

The frontend includes the virtual queue screens:

- `/dashboard` lists your active tickets and the queues you can join
- `/tickets/:ticketId` shows your number, who is being served now, how many people are ahead, and the estimated wait. It shows a "🔔 Your turn is coming soon" alert when 2 or fewer people are ahead, and can also send a browser notification.
- `/queues/:queueId/manage` is a staff console with a "Call next customer" button

Pages refresh every 4 seconds. The backend does not have queue endpoints yet, so by default the frontend uses an in-browser mock (`src/services/mockQueueApi.js`) that stores queues in `localStorage` and moves each queue forward every 20 seconds. Once the backend endpoints below exist, set `VITE_USE_MOCK_API=false` in `frontend/.env`.

### Queue API Contract (for the backend)

All endpoints require the `Authorization: Bearer <token>` header.

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/api/queues` | `{ queues: Queue[] }` |
| `GET` | `/api/queues/:queueId` | `{ queue: Queue }` |
| `POST` | `/api/queues/:queueId/join` | `{ ticket: Ticket }`. Returns 409 if the user already has an active ticket in this queue |
| `POST` | `/api/queues/:queueId/next` | `{ queue: Queue }`. Staff or admin only; advances "now serving" |
| `GET` | `/api/tickets/me` | `{ tickets: Ticket[] }`. Only tickets with status `waiting` or `serving` |
| `GET` | `/api/tickets/:ticketId` | `{ ticket: Ticket }`. Only the ticket's owner can read it |
| `DELETE` | `/api/tickets/:ticketId` | `{ message }`. Leaves the queue (status becomes `cancelled`) |

```js
Queue = {
  id, name, category,          // e.g. "Clinic"
  avgServiceMinutes,           // number
  currentServing,              // "C23", or null if nobody is being served
  waitingCount,                // number
  estimatedWaitMinutes,        // for someone joining now
}

Ticket = {
  id, queueId, queueName, category,
  code,                        // "C27"
  status,                      // "waiting" | "serving" | "served" | "cancelled"
  currentServing,              // "C23"
  peopleAhead,                 // 0 when serving/served
  estimatedWaitMinutes,
  createdAt,
}
```

Errors should return `{ message }` with a non-2xx status. The frontend shows that message to the user.

## Current Project Status

Implemented:

- User registration with validation, duplicate email checks, and bcrypt password hashing
- User login with bcrypt comparison and JWT generation
- Protected dashboard route
- Logout
- PostgreSQL `users` table schema
- Frontend API service layer and authentication context
- Basic user-friendly error handling

Not implemented yet:

- Queue creation
- Join queue
- Queue position tracking
- Notifications
- WebSockets

## Future DevOps Phases

Later phases will add Docker, Docker Compose, CI/CD, automated testing, cloud deployment, monitoring, and logging. These are not included in the first phase.

