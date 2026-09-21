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

