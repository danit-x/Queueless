# QueueLess - Virtual Queue Management System

QueueLess is a university DevOps project for a virtual queue management system. It provides a React frontend, an Express REST API, a PostgreSQL schema, JWT authentication, a protected dashboard, and a containerised deployment with Docker Compose and GitHub Actions.

## Technology Stack

- React, Vite, JavaScript, Tailwind CSS, React Router
- Node.js, Express.js, REST API
- PostgreSQL
- JWT and bcrypt
- npm, Git, Ubuntu on WSL 2
- Docker, Docker Compose, GitHub Actions

## Project Structure

```text
QueueLess/
  .github/
    workflows/
      ci.yml
      docker-publish.yml
      smoke.yml
  frontend/
    src/
      components/
      context/
      layouts/
      pages/
      services/
      App.jsx
    public/
    Dockerfile
    Dockerfile.dev
    nginx.conf
    vite.config.js
  backend/
    src/
      config/
        env.js          # dotenv loading and environment validation
        db.js           # pg.Pool, withTransaction, health probe
        initDb.js       # schema apply / verify on startup
      controllers/
      middleware/
        authMiddleware.js  # authenticateToken, authorizeRoles
        errorHandler.js    # notFoundHandler, errorHandler
      models/
      routes/
      utils/
      server.js
    Dockerfile
    Dockerfile.dev
  database/
    schema.sql
  docker-compose.yml
  docker-compose.prod.yml
  .env.example
  README.md
```

## Prerequisites

- Node.js 18 or newer
- npm
- PostgreSQL
- Git
- Docker and Docker Compose (for the container workflows)

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

`database/schema.sql` is fully idempotent. Running it against an existing
database upgrades it in place, so it doubles as the migration script.

### Becoming a merchant or admin

Registration always creates a `customer`. Promote an account with SQL:

```bash
psql -d queueless -c "UPDATE users SET role='merchant' WHERE email='you@example.com';"
```

Valid roles are `customer`, `merchant` and `admin`.

## Environment Variables

Create `backend/.env` from `backend/.env.example`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/queueless
JWT_SECRET=replace-with-a-long-random-secret
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
```

`JWT_SECRET` must be at least 32 characters or the API refuses to start. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`backend/.env.example` also documents the optional variables: `DATABASE_SSL`,
`DB_POOL_MAX`, `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS`, `TRUST_PROXY`, `AUTO_MIGRATE`
and `SCHEMA_PATH`.

Create `frontend/.env` from `frontend/.env.example`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_USE_MOCK_API=false
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

## API Endpoints

Every endpoint except the two auth entry points and the health checks requires
an `Authorization: Bearer <token>` header.

Errors always return `{ message }` with a non-2xx status. The frontend shows
that message to the user.

### Authentication

| Method | Path | Access | Response |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | public | `201 { message, token, user }` |
| `POST` | `/api/auth/login` | public | `200 { token, user }` |
| `GET` | `/api/auth/me` | authenticated | `200 { user }` |

`register` and `login` are rate limited per IP.

### Queues

| Method | Path | Access | Response |
| --- | --- | --- | --- |
| `GET` | `/api/queues` | authenticated | `200 { queues, count }` |
| `POST` | `/api/queues` | merchant, admin | `201 { queue }` |
| `GET` | `/api/queues/:queueId` | authenticated | `200 { queue }` |
| `PATCH` | `/api/queues/:queueId` | owner, admin | `200 { queue }` |
| `PATCH` | `/api/queues/:queueId/status` | owner, admin | `200 { queue }` |
| `DELETE` | `/api/queues/:queueId` | owner, admin | `200 { message }` |
| `POST` | `/api/queues/:queueId/join` | authenticated | `201 { ticket }` |
| `POST` | `/api/queues/:queueId/next` | owner, admin | `200 { queue }` |
| `GET` | `/api/queues/:queueId/tickets` | owner, admin | `200 { tickets, count }` |
| `GET` | `/api/queues/my-tickets` | authenticated | `200 { tickets, count }` |

`GET /api/queues` accepts `?status=active|paused|closed|all` (default `active`)
and `?mine=true`.

`GET /api/queues/my-tickets` accepts `?status=active|waiting|serving|served|cancelled|all`
(default `all`, i.e. full history) and `?limit=` between 1 and 200.

Joining returns `409` when you already hold an active ticket in that queue, or
when the queue is paused or closed. `POST /api/queues/:queueId/next` returns
`409` when nobody is waiting.

### Tickets

| Method | Path | Access | Response |
| --- | --- | --- | --- |
| `GET` | `/api/tickets/me` | authenticated | `200 { tickets, count }` |
| `GET` | `/api/tickets/:ticketId` | owner, queue owner, admin | `200 { ticket }` |
| `DELETE` | `/api/tickets/:ticketId` | owner, queue owner, admin | `200 { message, ticket }` |
| `PATCH` | `/api/tickets/:ticketId/complete` | owner, queue owner, admin | `200 { ticket }` |

`GET /api/tickets/me` is an alias of `GET /api/queues/my-tickets`.

Another customer's ticket returns `404` rather than `403`, so the API never
confirms that a ticket exists.

### Health

`GET /health` and `GET /api/health` return `200` when PostgreSQL is reachable
and `503` when it is not, so a load balancer stops routing to a broken instance.

```js
Queue = {
  id, name, category, description,
  status,                    // "active" | "paused" | "closed"
  ticketPrefix,              // "C"
  avgServiceMinutes,         // number
  currentServing,            // "C23", or null if nobody is being served
  waitingCount,              // number
  estimatedWaitMinutes,      // waitingCount * avgServiceMinutes
  ownerId,
  isOwner,                   // true when the caller owns the queue
  createdAt, updatedAt,
}

Ticket = {
  id, queueId, userId,
  queueName, category,
  code,                      // "C27"
  ticketNumber,              // 27
  status,                    // "waiting" | "serving" | "served" | "cancelled"
  currentServing,            // "C23"
  peopleAhead,               // 0 when serving, served or cancelled
  estimatedWaitMinutes,      // peopleAhead * avgServiceMinutes
  createdAt, updatedAt,
}
```

### How ticket numbers stay unique

`queues.next_ticket_number` is a monotonic counter advanced by a single atomic
statement inside a transaction that also holds a row lock on the queue:

```sql
UPDATE queues SET next_ticket_number = next_ticket_number + 1
 WHERE id = $1
RETURNING next_ticket_number - 1 AS ticket_number;
```

The `idx_tickets_queue_number` unique index is a final backstop. Concurrent joins
receive distinct, gapless numbers.

## Queue Frontend

The frontend includes the virtual queue screens:

- `/dashboard` lists your active tickets and the queues you can join
- `/tickets/:ticketId` shows your number, who is being served now, how many people are ahead, and the estimated wait. It shows a "🔔 Your turn is coming soon" alert when 2 or fewer people are ahead, and can also send a browser notification.
- `/queues/:queueId/manage` is a staff console with a "Call next customer" button

Pages refresh every 4 seconds. Set `VITE_USE_MOCK_API=false` in `frontend/.env`
to use the real API instead of the in-browser mock
(`src/services/mockQueueApi.js`), which stores queues in `localStorage` and
moves each queue forward every 20 seconds.

`frontend/src/pages/Dashboard.jsx` is still a self-contained demo page with
hardcoded services; it does not call the API yet.

## Current Project Status

Implemented:

- User registration with validation, duplicate email checks, and bcrypt password hashing
- User login with bcrypt comparison and JWT generation
- Role-based authorization for merchant and admin routes
- Queue CRUD with active, paused and closed status management
- Atomic, race-free ticket issuance
- Queue advancement with transactional now-serving promotion
- Ticket history, cancellation and completion
- Protected dashboard route and logout
- PostgreSQL schema with an idempotent, migration-safe upgrade path
- Frontend API service layer and authentication context
- User-friendly error handling with a single global error handler

Still pending: automated testing, cloud deployment, monitoring and logging.
`frontend/src/pages/Dashboard.jsx` is still a self-contained demo page.

## Run with Docker Compose

Copy the root env file and start the full stack:

```bash
cp .env.example .env
docker compose up -d --build
```

- Frontend (Vite dev server): http://localhost:5173
- Backend API: http://localhost:5000
- PostgreSQL: `localhost:5432`

`database/schema.sql` is mounted into the database container, so the schema is
created automatically the first time the `db_data` volume is initialized. The
backend container also mounts it and runs with `AUTO_MIGRATE=true`, so local
schema edits are applied on restart. To start over, remove the volume with
`docker compose down -v`.

`docker-compose.prod.yml` instead sets `AUTO_MIGRATE=false`: the schema is
applied once by the database container, and the API only verifies it at boot and
refuses to start if it is out of date.

Override the `VITE_API_URL` in `.env` to `http://localhost:5000/api`; the Vite
dev server also proxies `/api` to the backend container.

Stop the stack with `docker compose down`.

## Production Image Verification

`docker-compose.prod.yml` builds the multi-stage images and serves the built
frontend through nginx. It only publishes the frontend port, so the API and the
database stay on the internal network.

```bash
cp .env.example .env
# set a real JWT_SECRET and POSTGRES_PASSWORD in .env
docker compose -f docker-compose.prod.yml up -d --build
```

The app is served at http://localhost:8080 (override with `FRONTEND_PORT`).
nginx proxies `/api` to the backend container, so the browser only talks to one
origin and CORS is not an issue. Verify it responds:

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/api/health
```

## CI/CD

GitHub Actions workflows live in `.github/workflows/`:

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `ci.yml` | push / PR to `main` | Installs dependencies, builds both apps, builds both Docker images, validates both Compose files |
| `smoke.yml` | push / PR to `main` | Boots the production Compose stack and checks `/healthz` and `/api/health` |
| `docker-publish.yml` | tag `v*.*.*` or manual | Publishes both images to GitHub Container Registry |

Images published by `docker-publish.yml` are tagged
`ghcr.io/<owner>/queueless-backend` and `ghcr.io/<owner>/queueless-frontend`.

## Future DevOps Phases

Later phases will add automated testing, cloud deployment, monitoring, and
logging.

