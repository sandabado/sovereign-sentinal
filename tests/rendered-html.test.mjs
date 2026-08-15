import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test, { after, before } from "node:test";

const origin = "http://127.0.0.1:4173";
let server;
let serverOutput = "";

before(async () => {
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4173"],
    { cwd: new URL("..", import.meta.url), env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next server exited before tests started.\n${serverOutput}`);
    try {
      const response = await fetch(`${origin}/auth/login`);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Next server did not start in time.\n${serverOutput}`);
});

after(async () => {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 3000))]);
});

async function render(path = "/", init = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    redirect: "manual",
    headers: { accept: "text/html", ...(init.headers ?? {}) },
  });
}

test("renders the public Sovereign sign-in gate", async () => {
  const response = await render("/auth/login");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /SOVEREIGN/);
  assert.match(html, /Welcome back/);
  assert.match(html, /Send me a magic link/);
  assert.doesNotMatch(html, /End-to-end encrypted|data never leaves your control/i);
});

test("keeps protected pages behind the authentication or configuration gate", async () => {
  let expectedConfigurationError;
  for (const path of ["/", "/debt", "/subscriptions", "/calendar", "/settings"]) {
    const response = await render(path);
    assert.equal(response.status, 307, path);
    const location = new URL(response.headers.get("location"), "http://localhost");
    assert.equal(location.pathname, "/auth/login");
    assert.equal(location.searchParams.get("next"), path);
    const configurationError = location.searchParams.get("error");
    assert.ok(configurationError === null || configurationError === "not_configured");
    expectedConfigurationError ??= configurationError;
    assert.equal(configurationError, expectedConfigurationError);
  }
});

test("preserves a safe protected return path including its query", async () => {
  const response = await render("/calendar?view=year");
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location"), "http://localhost");
  assert.equal(location.searchParams.get("next"), "/calendar?view=year");
});

test("rejects an external callback redirect", async () => {
  const response = await render("/auth/callback?next=https://attacker.example");
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location"), "http://localhost");
  assert.equal(location.pathname, "/auth/login");
  assert.equal(location.searchParams.get("next"), "/");
});

test("does not issue Plaid Link tokens without authentication", async () => {
  const response = await render("/api/plaid/create-link-token", {
    method: "POST",
    headers: { accept: "application/json", origin },
  });
  assert.ok(response.status === 401 || response.status === 503);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  const payload = await response.json();
  assert.match(payload.error, /Unauthorized|Authentication is not configured/);
});

test("keeps the signed Plaid webhook public and rejects unsigned requests", async () => {
  const response = await render("/api/plaid/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: "test-item",
    }),
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Invalid Plaid signature" });
});
