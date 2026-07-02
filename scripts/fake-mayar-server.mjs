#!/usr/bin/env node
// =============================================================================
// fake-mayar-server.mjs
// -----------------------------------------------------------------------------
// A lightweight fake Mayar API server for deterministic CI/E2E testing.
// Does NOT require real Mayar credentials.
// Node.js version — replaces the earlier Deno-based server so CI doesn't
// need an additional runtime.
//
// Usage:
//   node scripts/fake-mayar-server.mjs
//
// Endpoints:
//   POST /hl/v1/invoice/create  — returns deterministic invoice + checkout URL
//   GET  /hl/v1/invoice/:id     — returns configurable invoice status
//   GET  /health                — health check
//
// Env overrides:
//   FAKE_MAYAR_PORT     (default: 4567)
//   FAKE_MAYAR_STATUS   (default: paid) — invoice status to return
//   FAKE_MAYAR_AMOUNT   (default: matches create request)
// =============================================================================

import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number.parseInt(process.env.FAKE_MAYAR_PORT || "4567", 10);
const defaultStatus = process.env.FAKE_MAYAR_STATUS || "paid";

// In-memory store of created invoices (keyed by ID)
const invoices = new Map();

// Per-test scenario overrides (set via POST /__control, reset via POST /__reset)
let control = {
  nextCreate: null, // { delayMs?, status?, checkoutUrl?, malformedJson? }
  nextVerify: null,  // { delayMs?, status?, malformedJson? }
};

function jsonResponse(body, status = 200) {
  return {
    body: JSON.stringify(body),
    status,
    headers: { "Content-Type": "application/json" },
  };
}

function generateId(prefix = "inv") {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

/**
 * Accept an invoice from the POST body to allow tests to control IDs.
 * If the body has an explicit "id" or "invoiceId" field, use that.
 */
function resolveInvoiceId(body) {
  const explicit = body.id || body.invoiceId;
  if (typeof explicit === "string" && explicit.length > 0) return explicit;
  return null;
}

/** Read the full request body and parse as JSON. */
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `http://${host}`);
  const method = req.method;
  const path = url.pathname;

  // ── Health check ──────────────────────────────────────────────────────────
  if (path === "/health" && method === "GET") {
    const { body, status, headers } = jsonResponse({
      status: "ok",
      provider: "fake-mayar",
    });
    res.writeHead(status, headers);
    res.end(body);
    return;
  }

  // ── POST /__control — set per-test scenario overrides ────────────────────
  if (path === "/__control" && method === "POST") {
    const body = await readBody(req);
    if (body.nextCreate) control.nextCreate = body.nextCreate;
    if (body.nextVerify) control.nextVerify = body.nextVerify;
    const { body: respBody, status, headers } = jsonResponse({ ok: true, control });
    res.writeHead(status, headers);
    res.end(respBody);
    return;
  }

  // ── POST /__reset — clear all scenario overrides ────────────────────────
  if (path === "/__reset" && method === "POST") {
    control = { nextCreate: null, nextVerify: null };
    const { body: respBody, status, headers } = jsonResponse({ ok: true });
    res.writeHead(status, headers);
    res.end(respBody);
    return;
  }

  // ── POST /hl/v1/invoice/create ────────────────────────────────────────────
  if (path === "/hl/v1/invoice/create" && method === "POST") {
    const body = await readBody(req);

    // Apply per-test override for create endpoint
    const createOverride = control.nextCreate;
    control.nextCreate = null; // consume once

    if (createOverride) {
      // Delay simulation (for timeout tests)
      if (createOverride.delayMs && createOverride.delayMs > 0) {
        await new Promise((r) => setTimeout(r, createOverride.delayMs));
      }

      // Malformed JSON simulation
      if (createOverride.malformedJson) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{not valid json");
        return;
      }

      // Custom status code simulation (for 500 tests)
      if (createOverride.status && createOverride.status >= 400) {
        const { body: respBody, status, headers } = jsonResponse(
          createOverride.body || { statusCode: createOverride.status, message: "Simulated error" },
          createOverride.status,
        );
        res.writeHead(status, headers);
        res.end(respBody);
        return;
      }

      // Custom checkout URL simulation (for malicious URL tests)
      if (createOverride.checkoutUrl) {
        const explicitId = resolveInvoiceId(body);
        const invoiceId = explicitId ?? generateId("mayar_inv");
        const transactionId = body.transactionId ?? generateId("mayar_txn");
        const items = body.items || [];
        const amount = body.amount ?? items.reduce((sum, i) => sum + (i.rate ?? 0), 0);

        const invoice = {
          id: invoiceId,
          transactionId,
          link: createOverride.checkoutUrl,
          paymentUrl: createOverride.checkoutUrl,
          amount,
          status: body.status || defaultStatus,
          customerId: "fake_customer_001",
          customer: { id: "fake_customer_001", name: body.name ?? "Test Customer", email: body.email ?? "test@example.com", mobile: body.mobile ?? "6281234567890" },
          description: body.description ?? "",
          createdAt: new Date().toISOString(),
          expiredAt: body.expiredAt ?? new Date(Date.now() + 86400000).toISOString(),
        };
        invoices.set(invoiceId, invoice);

        const { body: respBody, status, headers } = jsonResponse({ statusCode: 200, message: "OK", data: [invoice] });
        res.writeHead(status, headers);
        res.end(respBody);
        return;
      }
    }

    // Default happy-path behavior
    const items = body.items || [];
    const amount =
      body.amount ??
      items.reduce((sum, i) => sum + (i.rate ?? 0), 0);

    const explicitId = resolveInvoiceId(body);
    const invoiceId = explicitId ?? generateId("mayar_inv");
    const transactionId =
      body.transactionId ?? generateId("mayar_txn");

    const invoice = {
      id: invoiceId,
      transactionId,
      link: `https://checkout.mayar.test/pay/${invoiceId}`,
      paymentUrl: `https://checkout.mayar.test/pay/${invoiceId}`,
      amount,
      status: body.status || defaultStatus,
      customerId: "fake_customer_001",
      customer: {
        id: "fake_customer_001",
        name: body.name ?? "Test Customer",
        email: body.email ?? "test@example.com",
        mobile: body.mobile ?? "6281234567890",
      },
      description: body.description ?? "",
      createdAt: new Date().toISOString(),
      expiredAt:
        body.expiredAt ??
        new Date(Date.now() + 86400000).toISOString(),
    };

    invoices.set(invoiceId, invoice);

    const { body: respBody, status, headers } = jsonResponse({
      statusCode: 200,
      message: "OK",
      data: [invoice],
    });
    res.writeHead(status, headers);
    res.end(respBody);
    return;
  }

  // ── GET /hl/v1/invoice/:invoiceId ─────────────────────────────────────────
  const invoiceMatch = /^\/hl\/v1\/invoice\/(.+)$/.exec(path);
  if (invoiceMatch && method === "GET") {
    // Apply per-test override for verify endpoint
    const verifyOverride = control.nextVerify;
    control.nextVerify = null; // consume once

    if (verifyOverride) {
      if (verifyOverride.delayMs && verifyOverride.delayMs > 0) {
        await new Promise((r) => setTimeout(r, verifyOverride.delayMs));
      }
      if (verifyOverride.malformedJson) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{not valid json");
        return;
      }
      if (verifyOverride.status && verifyOverride.status >= 400) {
        const { body: respBody, status, headers } = jsonResponse(
          verifyOverride.body || { statusCode: verifyOverride.status, message: "Simulated verify error" },
          verifyOverride.status,
        );
        res.writeHead(status, headers);
        res.end(respBody);
        return;
      }
    }

    const invoiceId = invoiceMatch[1];
    const invoice = invoices.get(invoiceId);

    if (!invoice) {
      const { body, status, headers } = jsonResponse(
        { statusCode: 404, message: "Invoice not found", data: null },
        404,
      );
      res.writeHead(status, headers);
      res.end(body);
      return;
    }

    const { body, status, headers } = jsonResponse({
      statusCode: 200,
      message: "OK",
      data: invoice,
    });
    res.writeHead(status, headers);
    res.end(body);
    return;
  }

  // ── Catch-all ────────────────────────────────────────────────────────────
  const { body, status, headers } = jsonResponse(
    { statusCode: 404, message: "Not found" },
    404,
  );
  res.writeHead(status, headers);
  res.end(body);
});

// Graceful shutdown: close the server on SIGTERM/SIGINT so Playwright can
// stop the webServer cleanly without dropping in-flight requests.
const sockets = new Set();
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
});

function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down...`);
  server.close(() => {
    for (const socket of sockets) {
      socket.destroy();
    }
    process.exit(0);
  });
  // Force close remaining connections after 3 seconds
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(0);
  }, 3000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Fake Mayar server listening on http://0.0.0.0:${PORT}`);
  console.log(`  Default invoice status: ${defaultStatus}`);
  console.log(`  Available endpoints:`);
  console.log(`    POST http://0.0.0.0:${PORT}/hl/v1/invoice/create`);
  console.log(`    GET  http://0.0.0.0:${PORT}/hl/v1/invoice/:id`);
  console.log(`    POST http://0.0.0.0:${PORT}/__control  (test scenario override)`);
  console.log(`    POST http://0.0.0.0:${PORT}/__reset   (clear overrides)`);
});
