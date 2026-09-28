// In-browser stand-in for the queue endpoints until the backend implements them.
// Queue state lives in localStorage and advances on its own so the UI can be demoed.

const STORAGE_KEY = "queueless_mock_queues";
const ADVANCE_EVERY_MS = 20000;
const MAX_CATCH_UP_STEPS = 50;
const MIN_WALK_INS_WAITING = 3;

const seedQueues = [
  { id: "barber", name: "Fresh Cuts Barber", category: "Barber", prefix: "B", avgServiceMinutes: 15, current: 12, waiting: 4 },
  { id: "restaurant", name: "Spice Garden Restaurant", category: "Restaurant", prefix: "R", avgServiceMinutes: 10, current: 41, waiting: 6 },
  { id: "clinic", name: "City Care Clinic", category: "Clinic", prefix: "C", avgServiceMinutes: 12, current: 23, waiting: 5 },
  { id: "government", name: "Central Records Office", category: "Government office", prefix: "G", avgServiceMinutes: 8, current: 57, waiting: 7 },
  { id: "repair", name: "FixIt Phone Repair", category: "Repair shop", prefix: "F", avgServiceMinutes: 20, current: 8, waiting: 3 },
];

function createSeedState() {
  const now = Date.now();
  return {
    queues: seedQueues.map(({ current, waiting, ...queue }) => ({
      ...queue,
      currentNumber: current,
      lastNumber: current + waiting,
      lastAdvancedAt: now,
    })),
    tickets: [],
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.queues && saved?.tickets) {
      return saved;
    }
  } catch {
    // Fall through to a fresh seed.
  }
  return createSeedState();
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function currentUserId() {
  const savedUser = localStorage.getItem("queueless_user");
  const user = savedUser ? JSON.parse(savedUser) : null;

  if (!user) {
    throw new Error("Please log in again.");
  }
  return user.id;
}

function isCancelled(state, queueId, number) {
  return state.tickets.some(
    (ticket) => ticket.queueId === queueId && ticket.number === number && ticket.status === "cancelled"
  );
}

function advance(state, queue) {
  if (queue.currentNumber >= queue.lastNumber) {
    return;
  }

  queue.currentNumber += 1;
  while (queue.currentNumber < queue.lastNumber && isCancelled(state, queue.id, queue.currentNumber)) {
    queue.currentNumber += 1;
  }
}

// Simulates staff serving customers and walk-ins arriving while the page was idle.
function catchUp(state) {
  const now = Date.now();

  for (const queue of state.queues) {
    const steps = Math.floor((now - queue.lastAdvancedAt) / ADVANCE_EVERY_MS);
    if (steps <= 0) continue;

    for (let i = 0; i < Math.min(steps, MAX_CATCH_UP_STEPS); i += 1) {
      advance(state, queue);
      if (queue.lastNumber - queue.currentNumber < MIN_WALK_INS_WAITING) {
        queue.lastNumber += 1;
      }
    }
    queue.lastAdvancedAt += steps * ADVANCE_EVERY_MS;
  }
}

function countCancelledBetween(state, queueId, from, to) {
  return state.tickets.filter(
    (ticket) =>
      ticket.queueId === queueId &&
      ticket.status === "cancelled" &&
      ticket.number > from &&
      ticket.number < to
  ).length;
}

function formatCode(queue, number) {
  return `${queue.prefix}${number}`;
}

function toQueueSummary(state, queue) {
  const waitingCount =
    queue.lastNumber -
    queue.currentNumber -
    countCancelledBetween(state, queue.id, queue.currentNumber, queue.lastNumber + 1);

  return {
    id: queue.id,
    name: queue.name,
    category: queue.category,
    avgServiceMinutes: queue.avgServiceMinutes,
    currentServing: formatCode(queue, queue.currentNumber),
    waitingCount,
    estimatedWaitMinutes: waitingCount * queue.avgServiceMinutes,
  };
}

function ticketStatus(ticket, queue) {
  if (ticket.status === "cancelled") return "cancelled";
  if (ticket.number < queue.currentNumber) return "served";
  if (ticket.number === queue.currentNumber) return "serving";
  return "waiting";
}

function toTicketView(state, ticket) {
  const queue = state.queues.find((item) => item.id === ticket.queueId);
  const status = ticketStatus(ticket, queue);
  const peopleAhead =
    status === "waiting"
      ? ticket.number -
        queue.currentNumber -
        1 -
        countCancelledBetween(state, queue.id, queue.currentNumber, ticket.number)
      : 0;

  return {
    id: ticket.id,
    queueId: queue.id,
    queueName: queue.name,
    category: queue.category,
    code: formatCode(queue, ticket.number),
    status,
    currentServing: formatCode(queue, queue.currentNumber),
    peopleAhead,
    estimatedWaitMinutes: peopleAhead * queue.avgServiceMinutes,
    createdAt: ticket.createdAt,
  };
}

function findOwnTicket(state, ticketId) {
  const userId = currentUserId();
  const ticket = state.tickets.find((item) => item.id === ticketId && item.userId === userId);

  if (!ticket) {
    throw new Error("Ticket not found.");
  }
  return ticket;
}

function findQueue(state, queueId) {
  const queue = state.queues.find((item) => item.id === queueId);

  if (!queue) {
    throw new Error("Queue not found.");
  }
  return queue;
}

// Runs an operation against fresh state, persists it, and mimics network latency.
function withState(operation) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        const state = loadState();
        catchUp(state);
        const result = operation(state);
        saveState(state);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }, 150);
  });
}

export const mockQueueApi = {
  listQueues() {
    return withState((state) => ({
      queues: state.queues.map((queue) => toQueueSummary(state, queue)),
    }));
  },
  getQueue(queueId) {
    return withState((state) => ({ queue: toQueueSummary(state, findQueue(state, queueId)) }));
  },
  joinQueue(queueId) {
    return withState((state) => {
      const userId = currentUserId();
      const queue = findQueue(state, queueId);
      const alreadyQueued = state.tickets.some(
        (ticket) =>
          ticket.queueId === queueId &&
          ticket.userId === userId &&
          ["waiting", "serving"].includes(ticketStatus(ticket, queue))
      );

      if (alreadyQueued) {
        throw new Error("You already have an active ticket for this queue.");
      }

      queue.lastNumber += 1;
      const ticket = {
        id: crypto.randomUUID(),
        queueId,
        userId,
        number: queue.lastNumber,
        status: "active",
        createdAt: new Date().toISOString(),
      };
      state.tickets.push(ticket);

      return { ticket: toTicketView(state, ticket) };
    });
  },
  myTickets() {
    return withState((state) => {
      const userId = currentUserId();
      const tickets = state.tickets
        .filter((ticket) => ticket.userId === userId)
        .map((ticket) => toTicketView(state, ticket))
        .filter((ticket) => ["waiting", "serving"].includes(ticket.status));

      return { tickets };
    });
  },
  getTicket(ticketId) {
    return withState((state) => ({ ticket: toTicketView(state, findOwnTicket(state, ticketId)) }));
  },
  leaveTicket(ticketId) {
    return withState((state) => {
      const ticket = findOwnTicket(state, ticketId);
      ticket.status = "cancelled";
      return { message: "You left the queue." };
    });
  },
  serveNext(queueId) {
    return withState((state) => {
      const queue = findQueue(state, queueId);

      if (queue.currentNumber >= queue.lastNumber) {
        throw new Error("Nobody is waiting in this queue.");
      }

      advance(state, queue);
      queue.lastAdvancedAt = Date.now();
      return { queue: toQueueSummary(state, queue) };
    });
  },
};
