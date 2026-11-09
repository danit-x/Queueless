import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  api,
  bearer,
  closePool,
  createQueue,
  joinQueue,
  prepareDatabase,
  registerUser,
} from "./helpers.js";

before(prepareDatabase);
after(closePool);

describe("POST /api/queues (role guard)", () => {
  test("returns 403 for a customer", async () => {
    const { token } = await registerUser();

    const res = await api()
      .post("/api/queues")
      .set(bearer(token))
      .send({ name: "Not allowed" });

    assert.equal(res.status, 403);
  });

  test("returns 401 without a token", async () => {
    const res = await api().post("/api/queues").send({ name: "Anonymous" });
    assert.equal(res.status, 401);
  });

  test("returns 201 and the queue for a merchant", async () => {
    const merchant = await registerUser({ role: "merchant" });

    const res = await api()
      .post("/api/queues")
      .set(bearer(merchant.token))
      .send({ name: "Pharmacy", category: "Health", ticketPrefix: "ph", avgServiceMinutes: 5 });

    assert.equal(res.status, 201);
    assert.equal(res.body.queue.name, "Pharmacy");
    assert.equal(res.body.queue.category, "Health");
    assert.equal(res.body.queue.ticketPrefix, "PH");
    assert.equal(res.body.queue.status, "active");
    assert.equal(res.body.queue.waitingCount, 0);
    assert.equal(res.body.queue.currentServing, null);
    assert.equal(res.body.queue.ownerId, merchant.user.id);
    assert.equal(res.body.queue.isOwner, true);
  });

  test("returns 400 for an invalid ticket prefix", async () => {
    const merchant = await registerUser({ role: "merchant" });

    const res = await api()
      .post("/api/queues")
      .set(bearer(merchant.token))
      .send({ name: "Bad prefix", ticketPrefix: "TOOLONG" });

    assert.equal(res.status, 400);
  });
});

describe("POST /api/queues/:queueId/join", () => {
  test("issues sequential, unique ticket numbers", async () => {
    const merchant = await registerUser({ role: "merchant" });
    const queue = await createQueue(merchant.token, { ticketPrefix: "A" });
    const first = await registerUser();
    const second = await registerUser();

    const a = await joinQueue(first.token, queue.id);
    const b = await joinQueue(second.token, queue.id);

    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(a.body.ticket.ticketNumber, 1);
    assert.equal(b.body.ticket.ticketNumber, 2);
    assert.equal(a.body.ticket.code, "A1");
    assert.equal(b.body.ticket.code, "A2");
    assert.equal(a.body.ticket.status, "waiting");
    assert.equal(b.body.ticket.peopleAhead, 1);
  });

  test("hands out distinct numbers under concurrent joins", async () => {
    const merchant = await registerUser({ role: "merchant" });
    const queue = await createQueue(merchant.token);
    const customers = await Promise.all(Array.from({ length: 8 }, () => registerUser()));

    const responses = await Promise.all(customers.map((c) => joinQueue(c.token, queue.id)));

    for (const res of responses) assert.equal(res.status, 201);
    const numbers = responses.map((res) => res.body.ticket.ticketNumber).sort((x, y) => x - y);
    assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("returns 409 when the customer already holds an active ticket", async () => {
    const merchant = await registerUser({ role: "merchant" });
    const queue = await createQueue(merchant.token);
    const customer = await registerUser();

    const firstJoin = await joinQueue(customer.token, queue.id);
    const secondJoin = await joinQueue(customer.token, queue.id);

    assert.equal(firstJoin.status, 201);
    assert.equal(secondJoin.status, 409);
  });

  test("returns 409 for a paused queue", async () => {
    const merchant = await registerUser({ role: "merchant" });
    const queue = await createQueue(merchant.token);

    const paused = await api()
      .patch(`/api/queues/${queue.id}/status`)
      .set(bearer(merchant.token))
      .send({ status: "paused" });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.queue.status, "paused");

    const customer = await registerUser();
    const res = await joinQueue(customer.token, queue.id);

    assert.equal(res.status, 409);
    assert.match(res.body.message, /paused/i);
  });

  test("returns 404 for an unknown queue and 400 for a malformed id", async () => {
    const customer = await registerUser();

    const unknown = await joinQueue(customer.token, "00000000-0000-4000-8000-000000000000");
    const malformed = await joinQueue(customer.token, "not-a-uuid");

    assert.equal(unknown.status, 404);
    assert.equal(malformed.status, 400);
  });
});

describe("POST /api/queues/:queueId/next", () => {
  test("serves tickets in order and marks the previous one served", async () => {
    const merchant = await registerUser({ role: "merchant" });
    const queue = await createQueue(merchant.token, { ticketPrefix: "N" });
    const first = await registerUser();
    const second = await registerUser();
    const t1 = (await joinQueue(first.token, queue.id)).body.ticket;
    const t2 = (await joinQueue(second.token, queue.id)).body.ticket;

    const callNext = () =>
      api().post(`/api/queues/${queue.id}/next`).set(bearer(merchant.token));

    const step1 = await callNext();
    assert.equal(step1.status, 200);
    assert.equal(step1.body.queue.currentServing, t1.code);
    assert.equal(step1.body.queue.waitingCount, 1);

    const step2 = await callNext();
    assert.equal(step2.status, 200);
    assert.equal(step2.body.queue.currentServing, t2.code);
    assert.equal(step2.body.queue.waitingCount, 0);

    const firstTicket = await api().get(`/api/tickets/${t1.id}`).set(bearer(first.token));
    assert.equal(firstTicket.body.ticket.status, "served");

    // Completes the last serving ticket, leaving nobody at the counter.
    const step3 = await callNext();
    assert.equal(step3.status, 200);
    assert.equal(step3.body.queue.currentServing, null);

    const step4 = await callNext();
    assert.equal(step4.status, 409);
  });

  test("returns 404 for a customer or a merchant who does not own the queue", async () => {
    const owner = await registerUser({ role: "merchant" });
    const queue = await createQueue(owner.token);
    const customer = await registerUser();
    const otherMerchant = await registerUser({ role: "merchant" });
    await joinQueue(customer.token, queue.id);

    const asCustomer = await api()
      .post(`/api/queues/${queue.id}/next`)
      .set(bearer(customer.token));
    const asOtherMerchant = await api()
      .post(`/api/queues/${queue.id}/next`)
      .set(bearer(otherMerchant.token));

    assert.equal(asCustomer.status, 404);
    assert.equal(asOtherMerchant.status, 404);
  });

  test("an admin can advance any queue", async () => {
    const owner = await registerUser({ role: "merchant" });
    const queue = await createQueue(owner.token);
    const customer = await registerUser();
    const ticket = (await joinQueue(customer.token, queue.id)).body.ticket;
    const admin = await registerUser({ role: "admin" });

    const res = await api().post(`/api/queues/${queue.id}/next`).set(bearer(admin.token));

    assert.equal(res.status, 200);
    assert.equal(res.body.queue.currentServing, ticket.code);
  });
});
