-- QueueLess schema
-- Idempotent: safe to run against a fresh database or an existing one.
-- Every new column is added with ADD COLUMN IF NOT EXISTS and every constraint
-- is guarded, so re-running this file upgrades older databases in place.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Queues
-- next_ticket_number is the monotonic counter used to hand out ticket numbers.
-- It is only ever advanced by `UPDATE ... SET next_ticket_number =
-- next_ticket_number + 1 RETURNING`, which takes a row-level lock, so numbers
-- are unique per queue even under concurrent joins.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  category VARCHAR(60) NOT NULL DEFAULT 'General',
  description TEXT,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  ticket_prefix VARCHAR(3) NOT NULL DEFAULT 'Q',
  avg_service_minutes INT NOT NULL DEFAULT 10,
  next_ticket_number INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Tickets
-- `code` is the customer-facing label, for example "C27" = prefix "C" + 27.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_number INT NOT NULL,
  code VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Column back-fill for databases created before these fields existed.
-- ---------------------------------------------------------------------------
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'customer';

ALTER TABLE queues ADD COLUMN IF NOT EXISTS category VARCHAR(60) NOT NULL DEFAULT 'General';
ALTER TABLE queues ADD COLUMN IF NOT EXISTS ticket_prefix VARCHAR(3) NOT NULL DEFAULT 'Q';
ALTER TABLE queues ADD COLUMN IF NOT EXISTS avg_service_minutes INT NOT NULL DEFAULT 10;
ALTER TABLE queues ADD COLUMN IF NOT EXISTS next_ticket_number INT NOT NULL DEFAULT 1;
ALTER TABLE queues ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS code VARCHAR(10) NOT NULL DEFAULT '';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Historical rows predate `code`; derive it from the queue prefix.
UPDATE tickets t
   SET code = COALESCE(q.ticket_prefix, 'Q') || t.ticket_number
  FROM queues q
 WHERE q.id = t.queue_id
   AND t.code = '';

-- Existing counters must never be behind the highest issued number.
-- Aggregates cannot appear in WHERE, so the max is pre-aggregated per queue.
UPDATE queues q
   SET next_ticket_number = agg.max_number + 1
  FROM (
    SELECT queue_id, MAX(ticket_number) AS max_number
      FROM tickets
     GROUP BY queue_id
  ) agg
 WHERE agg.queue_id = q.id
   AND agg.max_number >= q.next_ticket_number;

-- ---------------------------------------------------------------------------
-- Nullable legacy columns become NOT NULL now that the app always populates them.
-- ---------------------------------------------------------------------------
ALTER TABLE queues ALTER COLUMN category SET NOT NULL;
ALTER TABLE queues ALTER COLUMN ticket_prefix SET NOT NULL;
ALTER TABLE queues ALTER COLUMN avg_service_minutes SET NOT NULL;
ALTER TABLE queues ALTER COLUMN next_ticket_number SET NOT NULL;
ALTER TABLE queues ALTER COLUMN status SET NOT NULL;

ALTER TABLE tickets ALTER COLUMN status SET NOT NULL;
ALTER TABLE tickets ALTER COLUMN code SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE tickets ALTER COLUMN queue_id SET NOT NULL;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'tickets.queue_id left nullable: orphan rows must be deleted first';
END $$;

DO $$
BEGIN
  ALTER TABLE tickets ALTER COLUMN user_id SET NOT NULL;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'tickets.user_id left nullable: orphan rows must be deleted first';
END $$;

-- Older databases used 'completed'; the API contract uses 'served'. This must run
-- before tickets_status_check is added below, otherwise the constraint rejects
-- the rows that are still marked 'completed'.
UPDATE tickets SET status = 'served' WHERE status = 'completed';

-- ---------------------------------------------------------------------------
-- Value constraints, added only when missing so re-runs stay idempotent.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('customer', 'merchant', 'admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'queues_status_check') THEN
    ALTER TABLE queues ADD CONSTRAINT queues_status_check
      CHECK (status IN ('active', 'paused', 'closed'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'queues_prefix_check') THEN
    ALTER TABLE queues ADD CONSTRAINT queues_prefix_check
      CHECK (ticket_prefix ~ '^[A-Za-z]{1,3}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'queues_avg_service_check') THEN
    ALTER TABLE queues ADD CONSTRAINT queues_avg_service_check
      CHECK (avg_service_minutes > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'queues_next_number_check') THEN
    ALTER TABLE queues ADD CONSTRAINT queues_next_number_check
      CHECK (next_ticket_number > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_status_check') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
      CHECK (status IN ('waiting', 'serving', 'served', 'cancelled'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_number_check') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_number_check
      CHECK (ticket_number > 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE INDEX IF NOT EXISTS idx_tickets_queue ON tickets (queue_id);
CREATE INDEX IF NOT EXISTS idx_tickets_queue_status ON tickets (queue_id, status, ticket_number);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_queues_owner ON queues (owner_id);
CREATE INDEX IF NOT EXISTS idx_queues_status ON queues (status);

-- Backstop for the atomic counter: the database itself refuses duplicate numbers.
-- Legacy data predates the counter and can already contain duplicates, so this is
-- skipped with a warning rather than blocking the migration.
DO $$
DECLARE
  duplicates INT;
BEGIN
  SELECT COUNT(*) INTO duplicates FROM (
    SELECT queue_id, ticket_number
      FROM tickets
     GROUP BY queue_id, ticket_number
    HAVING COUNT(*) > 1
  ) dupes;

  IF duplicates > 0 THEN
    RAISE NOTICE
      'idx_tickets_queue_number skipped: % duplicate (queue_id, ticket_number) pair(s) exist. Deduplicate tickets, then create the index manually.',
      duplicates;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_queue_number
      ON tickets (queue_id, ticket_number);
  END IF;
END $$;

-- One waiting or serving ticket per user per queue; backs the 409 on rejoin.
-- issueTicket already enforces this inside a row-locked transaction, so a legacy
-- violation is downgraded to a warning instead of failing the migration.
DO $$
DECLARE
  violations INT;
BEGIN
  SELECT COUNT(*) INTO violations FROM (
    SELECT queue_id, user_id
      FROM tickets
     WHERE status IN ('waiting', 'serving')
     GROUP BY queue_id, user_id
    HAVING COUNT(*) > 1
  ) dupes;

  IF violations > 0 THEN
    RAISE NOTICE
      'idx_tickets_one_active_per_user skipped: % user/queue pair(s) hold several active tickets. Keep the oldest and cancel the rest, then create the index manually.',
      violations;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_one_active_per_user
      ON tickets (queue_id, user_id)
      WHERE status IN ('waiting', 'serving');
  END IF;
END $$;

-- At most one customer is being served per queue at any moment.
DO $$
DECLARE
  violations INT;
BEGIN
  SELECT COUNT(*) INTO violations FROM (
    SELECT queue_id
      FROM tickets
     WHERE status = 'serving'
     GROUP BY queue_id
    HAVING COUNT(*) > 1
  ) dupes;

  IF violations > 0 THEN
    RAISE NOTICE
      'idx_tickets_one_serving_per_queue skipped: % queue(s) have more than one serving ticket.',
      violations;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_one_serving_per_queue
      ON tickets (queue_id)
      WHERE status = 'serving';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_queues_updated_at ON queues;
CREATE TRIGGER trg_queues_updated_at
  BEFORE UPDATE ON queues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();