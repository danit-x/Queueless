import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  api,
  arriveTicket,
  bearer,
  closePool,
  createQueue,
  joinQueue,
  pool,
  prepareDatabase,
  registerUser,
} from "./helpers.js";
import { expireNoShowTickets } from "../src/models/ticketModel.js";

before(prepareDatabase);
after(closePool);

const TICKET_KEYS = [
  "id",
  "queueId",
  "userId",
  "queueName",
  "category",
  "code",
  "status",
  "calledAt",
  "arrivedAt",
  "completedAt",
  "ticketNumber",
  "currentServing",
  "peopleAhead",
  "estimatedWaitMinutes",
  "createdAt",
  "updatedAt",
];

async function queueWithTwoCustomers() {
  const merchant = await registerUser({ role: "merchant" });
  const queue = await createQueue(merchant.token, {
    name: "Post Office",
    category: "Government",
    ticketPrefix: "P",
    avgServiceMinutes: 7,
  });
  const first = await registerUser();
  const second = await registerUser();
  const t1 = (await joinQueue(first.token, queue.id)).body.ticket;
  const t2 = (await joinQueue(second.token, queue.id)).body.ticket;
  return { merchant, queue, first, second, t1, t2 };
}

describe("GET /api/tickets/:ticketId", () => {
  test("returns the camelCase ticket shape to its owner", async () => {
    const { queue, second, t2 } = await queueWithTwoCustomers();

    const res = await api().get(`/api/tickets/${t2.id}`).set(bearer(second.token));

    assert.equal(res.status, 200);
    const { ticket } = res.body;
    assert.deepEqual(Object.keys(ticket).sort(), [...TICKET_KEYS].sort());
    assert.equal(ticket.id, t2.id);
    assert.equal(ticket.queueId, queue.id);
    assert.equal(ticket.userId, second.user.id);
    assert.equal(ticket.queueName, "Post Office");
    assert.equal(ticket.category, "Government");
    assert.equal(ticket.code, "P2");
    assert.equal(ticket.ticketNumber, 2);
    assert.equal(ticket.status, "waiting");
    assert.equal(ticket.calledAt, null);
    assert.equal(ticket.arrivedAt, null);
    assert.equal(ticket.completedAt, null);
    assert.equal(ticket.peopleAhead, 1);
    assert.equal(ticket.estimatedWaitMinutes, 7);
    assert.equal(ticket.currentServing, null);
  });

  test("reflects queue progress after the merchant calls next", async () => {
    const { merchant, first, queue, second, t1, t2 } = await queueWithTwoCustomers();

    await api().post(`/api/queues/${queue.id}/next`).set(bearer(merchant.token)).expect(200);

    const res = await api().get(`/api/tickets/${t2.id}`).set(bearer(second.token));

    assert.equal(res.status, 200);
    assert.equal(res.body.ticket.currentServing, t1.code);
    assert.equal(res.body.ticket.peopleAhead, 0);
    assert.equal(res.body.ticket.estimatedWaitMinutes, 0);
  });

  test("lets only the ticket owner confirm arrival, idempotently", async () => {
    const { merchant, first, queue, t1 } = await queueWithTwoCustomers();
    const otherCustomer = await registerUser();

    await api().post(`/api/queues/${queue.id}/next`).set(bearer(merchant.token)).expect(200);

    const forbidden = await arriveTicket(otherCustomer.token, t1.id);
    assert.equal(forbidden.status, 404);

    const arrived = await arriveTicket(first.token, t1.id);
    assert.equal(arrived.status, 200);
    assert.ok(arrived.body.ticket.arrivedAt);

    const repeated = await arriveTicket(first.token, t1.id);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.ticket.arrivedAt, arrived.body.ticket.arrivedAt);

    const notFound = await arriveTicket(first.token, "00000000-0000-4000-8000-000000000000");
    assert.equal(notFound.status, 404);
  });

  test("arrival after the database deadline loses the race and records no-show", async () => {
    const { merchant, first, queue, t1 } = await queueWithTwoCustomers();
    await api().post(`/api/queues/${queue.id}/next`).set(bearer(merchant.token)).expect(200);
    await pool.query(
      "UPDATE tickets SET called_at = NOW() - INTERVAL '11 minutes' WHERE id = $1",
      [t1.id]
    );

    const lateArrival = await arriveTicket(first.token, t1.id);
    assert.equal(lateArrival.status, 200);
    assert.equal(lateArrival.body.ticket.status, "no_show");
  });

  test("expired called tickets become no-show and the queue calls the next ticket", async () => {
    const { merchant, first, second, queue, t1, t2 } = await queueWithTwoCustomers();
    await api().post(`/api/queues/${queue.id}/next`).set(bearer(merchant.token)).expect(200);
    await pool.query(
      "UPDATE tickets SET called_at = NOW() - INTERVAL '11 minutes' WHERE id = $1",
      [t1.id]
    );

    assert.equal(await expireNoShowTickets(), 1);
    const firstTicket = await api().get(`/api/tickets/${t1.id}`).set(bearer(first.token));
    const secondTicket = await api().get(`/api/tickets/${t2.id}`).set(bearer(second.token));
    assert.equal(firstTicket.body.ticket.status, "no_show");
    assert.equal(secondTicket.body.ticket.status, "serving");
    assert.ok(secondTicket.body.ticket.calledAt);
  });

  test("returns 404 for another customer's ticket", async () => {
    const { first, t2 } = await queueWithTwoCustomers();
    const stranger = await registerUser();

    const otherCustomerInQueue = await api()
      .get(`/api/tickets/${t2.id}`)
      .set(bearer(first.token));
    const unrelatedCustomer = await api()
      .get(`/api/tickets/${t2.id}`)
      .set(bearer(stranger.token));

    assert.equal(otherCustomerInQueue.status, 404);
    assert.equal(unrelatedCustomer.status, 404);
  });

  test("is visible to the queue owner", async () => {
    const { merchant, t1 } = await queueWithTwoCustomers();

    const res = await api().get(`/api/tickets/${t1.id}`).set(bearer(merchant.token));

    assert.equal(res.status, 200);
    assert.equal(res.body.ticket.queueName, "Post Office");
  });

  test("returns 400 for a malformed id and 404 for an unknown one", async () => {
    const customer = await registerUser();

    const malformed = await api().get("/api/tickets/123").set(bearer(customer.token));
    const unknown = await api()
      .get("/api/tickets/00000000-0000-4000-8000-000000000000")
      .set(bearer(customer.token));

    assert.equal(malformed.status, 400);
    assert.equal(unknown.status, 404);
  });
});

describe("DELETE /api/tickets/:ticketId", () => {
  test("lets the customer leave and returns the mapped ticket", async () => {
    const { first, t1 } = await queueWithTwoCustomers();

    const res = await api().delete(`/api/tickets/${t1.id}`).set(bearer(first.token));

    assert.equal(res.status, 200);
    assert.equal(res.body.ticket.status, "cancelled");
    assert.equal(res.body.ticket.queueName, "Post Office");
  });
});
