import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import jwt from "jsonwebtoken";

import {
  TEST_PASSWORD,
  api,
  bearer,
  closePool,
  prepareDatabase,
  registerUser,
  uniqueEmail,
} from "./helpers.js";

before(prepareDatabase);
after(closePool);

describe("POST /api/auth/register", () => {
  test("creates a customer, returns a token and never exposes the hash", async () => {
    const email = uniqueEmail("MixedCase");

    const res = await api()
      .post("/api/auth/register")
      .send({ name: "  Ada  ", email, password: TEST_PASSWORD });

    assert.equal(res.status, 201);
    assert.equal(typeof res.body.token, "string");
    assert.equal(res.body.user.name, "Ada");
    assert.equal(res.body.user.email, email.toLowerCase());
    assert.equal(res.body.user.role, "customer");
    assert.equal("password_hash" in res.body.user, false);
    assert.equal("passwordHash" in res.body.user, false);
  });

  test("rejects a duplicate email with 409", async () => {
    const { email } = await registerUser();

    const res = await api()
      .post("/api/auth/register")
      .send({ name: "Dup", email: email.toUpperCase(), password: TEST_PASSWORD });

    assert.equal(res.status, 409);
  });

  test("rejects a short password with 400", async () => {
    const res = await api()
      .post("/api/auth/register")
      .send({ name: "Short", email: uniqueEmail(), password: "short" });

    assert.equal(res.status, 400);
  });
});

describe("POST /api/auth/login", () => {
  test("returns a token for valid credentials", async () => {
    const { email, user } = await registerUser();

    const res = await api().post("/api/auth/login").send({ email, password: TEST_PASSWORD });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, user.id);
    assert.equal(typeof res.body.token, "string");
  });

  test("returns 401 for a wrong password and for an unknown email", async () => {
    const { email } = await registerUser();

    const wrongPassword = await api()
      .post("/api/auth/login")
      .send({ email, password: "not-the-password" });
    const unknownEmail = await api()
      .post("/api/auth/login")
      .send({ email: uniqueEmail("nobody"), password: TEST_PASSWORD });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.equal(wrongPassword.body.message, unknownEmail.body.message);
  });
});

describe("GET /api/auth/me", () => {
  test("returns the current user for a valid token", async () => {
    const { token, user } = await registerUser();

    const res = await api().get("/api/auth/me").set(bearer(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, user.id);
    assert.equal(res.body.user.email, user.email);
  });

  test("returns 401 without a token", async () => {
    const res = await api().get("/api/auth/me");
    assert.equal(res.status, 401);
  });

  test("returns 401 for a malformed token", async () => {
    const res = await api().get("/api/auth/me").set(bearer("not.a.jwt"));
    assert.equal(res.status, 401);
  });

  // Same secret, wrong claims: proves issuer and audience are actually verified.
  const forgedClaims = {
    "a wrong issuer": { issuer: "some-other-service", audience: "queueless-app" },
    "a wrong audience": { issuer: "queueless-api", audience: "some-other-app" },
    "no issuer or audience": {},
  };

  for (const [label, claims] of Object.entries(forgedClaims)) {
    test(`returns 401 for a token with ${label}`, async () => {
      const { user } = await registerUser();
      const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: "5m",
        ...claims,
      });

      const res = await api().get("/api/auth/me").set(bearer(token));

      assert.equal(res.status, 401);
    });
  }

  test("returns 401 for an expired token", async () => {
    const { user } = await registerUser();
    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
      issuer: "queueless-api",
      audience: "queueless-app",
      expiresIn: -10,
    });

    const res = await api().get("/api/auth/me").set(bearer(token));

    assert.equal(res.status, 401);
    assert.match(res.body.message, /expired/i);
  });
});

describe("PATCH /api/auth/me", () => {
  test("lowercases and trims the email so the user can still log in", async () => {
    const { token } = await registerUser();
    const fresh = uniqueEmail("renamed");
    const mixedCase = `  ${fresh.replace("renamed", "ReNaMeD").toUpperCase()}  `;

    const res = await api()
      .patch("/api/auth/me")
      .set(bearer(token))
      .send({ name: "Renamed", email: mixedCase, phoneNumber: " 0771234567 " });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, fresh.toLowerCase());
    assert.equal(res.body.user.name, "Renamed");
    assert.equal(res.body.user.phoneNumber, "0771234567");

    const login = await api()
      .post("/api/auth/login")
      .send({ email: fresh, password: TEST_PASSWORD });
    assert.equal(login.status, 200);
  });

  test("returns 409 when the email belongs to another account", async () => {
    const { token } = await registerUser();
    const other = await registerUser();

    const res = await api()
      .patch("/api/auth/me")
      .set(bearer(token))
      .send({ name: "Clash", email: other.email.toUpperCase() });

    assert.equal(res.status, 409);
  });
});
