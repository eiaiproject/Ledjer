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

// ── Response helpers ──────────────────────────────────────────────────────

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function sendMalformedJson(res) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end("{not valid json");
}

// ── Invoice helpers ───────────────────────────────────────────────────────

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

/** Build a default Mayar invoice from the create-request body. */
function buildInvoiceFromBody(body, linkBase) {
  const items = body.items || [];
  const amount = body.amount ?? items.reduce((sum, i) => sum + (i.rate ?? 0), 0);
  const invoiceId = resolveInvoiceId(body) ?? generateId("mayar_inv");
  const transactionId = body.transactionId ?? generateId("mayar_txn");
  return {
    id: invoiceId,
    transactionId,
    link: linkBase || `https://checkout.mayar.test/pay/${invoiceId}`,
    paymentUrl: linkBase || `https://checkout.mayar.test/pay/${invoiceId}`,
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
    expiredAt: body.expiredAt ?? new Date(Date.now() + 86400000).toISOString(),
  };
}

// ── Override handlers ─────────────────────────────────────────────────────

async function handleCreateOverride(res, body) {
  const override = control.nextCreate;
  control.nextCreate = null;
  if (!override) return false;

  if (override.delayMs > 0) await delay(override.delayMs);
  if (override.malformedJson) { sendMalformedJson(res); return true; }
  if (override.status >= 400) {
    sendJson(res, override.status, override.body || { statusCode: override.status, message: "Simulated error" });
    return true;
  }
  if (override.checkoutUrl) {
    const invoice = buildInvoiceFromBody(body, override.checkoutUrl);
    invoices.set(invoice.id, invoice);
    sendJson(res, 200, { statusCode: 200, message: "OK", data: [invoice] });
    return true;
  }
  return false;
}

async function handleVerifyOverride(res) {
  const override = control.nextVerify;
  control.nextVerify = null;
  if (!override) return false;

  if (override.delayMs > 0) await delay(override.delayMs);
  if (override.malformedJson) { sendMalformedJson(res); return true; }
  if (override.status >= 400) {
    sendJson(res, override.status, override.body || { statusCode: override.status, message: "Simulated verify error" });
    return true;
  }
  return false;
}

// ── Route handlers ────────────────────────────────────────────────────────

function handleHealth(res) {
  sendJson(res, 200, { status: "ok", provider: "fake-mayar" });
}

async function handleControl(req, res) {
  const body = await readBody(req);
  if (body.nextCreate) control.nextCreate = body.nextCreate;
  if (body.nextVerify) control.nextVerify = body.nextVerify;
  sendJson(res, 200, { ok: true, control });
}

function handleReset(res) {
  control = { nextCreate: null, nextVerify: null };
  sendJson(res, 200, { ok: true });
}

async function handleCreateInvoice(req, res) {
  const body = await readBody(req);

  if (await handleCreateOverride(res, body)) return;

  const invoice = buildInvoiceFromBody(body);
  invoices.set(invoice.id, invoice);
  sendJson(res, 200, { statusCode: 200, message: "OK", data: [invoice] });
}

async function handleVerifyInvoice(res, invoiceId) {
  if (await handleVerifyOverride(res)) return;

  const invoice = invoices.get(invoiceId);

  if (!invoice) {
    sendJson(res, 404, { statusCode: 404, message: "Invoice not found", data: null });
    return;
  }

  sendJson(res, 200, { statusCode: 200, message: "OK", data: invoice });
}

// ── Router ────────────────────────────────────────────────────────────────

const INVOICE_PATH_RE = /^\/hl\/v1\/invoice\/(.+)$/;

async function routeRequest(req, res) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `http://${host}`);
  const method = req.method || "GET";
  const pathname = url.pathname;

  if (pathname === "/health" && method === "GET") {
    handleHealth(res);
    return;
  }

  if (pathname === "/__control" && method === "POST") {
    await handleControl(req, res);
    return;
  }

  if (pathname === "/__reset" && method === "POST") {
    handleReset(res);
    return;
  }

  if (pathname === "/hl/v1/invoice/create" && method === "POST") {
    await handleCreateInvoice(req, res);
    return;
  }

  const invoiceMatch = INVOICE_PATH_RE.exec(pathname);
  if (invoiceMatch && method === "GET") {
    await handleVerifyInvoice(res, invoiceMatch[1]);
    return;
  }

  sendJson(res, 404, { statusCode: 404, message: "Not found" });
}

const server = http.createServer(async (req, res) => {
  await routeRequest(req, res);
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
