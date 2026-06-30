#!/usr/bin/env bash
# =============================================================================
# fake-mayar-server.ts
# -----------------------------------------------------------------------------
# A lightweight fake Mayar API server for deterministic CI testing.
# Does NOT require real Mayar credentials.
#
# Usage:
#   deno run --allow-net --allow-env supabase/functions/_shared/fake-mayar-server.ts
#
# Endpoints:
#   POST /hl/v1/invoice/create  — returns deterministic invoice + checkout URL
#   GET  /hl/v1/invoice/:id     — returns configurable invoice status
#
# Env overrides:
#   FAKE_MAYAR_PORT     (default: 4567)
#   FAKE_MAYAR_STATUS   (default: paid) — invoice status to return
#   FAKE_MAYAR_AMOUNT   (default: matches create request)
# =============================================================================

const PORT = parseInt(Deno.env.get("FAKE_MAYAR_PORT") || "4567", 10);
let defaultStatus = Deno.env.get("FAKE_MAYAR_STATUS") || "paid";

// In-memory store of created invoices (keyed by ID)
const invoices = new Map<string, Record<string, unknown>>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function generateId(prefix = "inv"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Accept an invoice from the POST body to allow tests to control IDs.
 * If the body has an explicit "id" or "invoiceId" field, use that.
 */
function resolveInvoiceId(body: Record<string, unknown>): string | null {
  const explicit = body.id || body.invoiceId;
  if (typeof explicit === "string" && explicit.length > 0) return explicit;
  return null;
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;
  const path = url.pathname;

  // ── Health check ──────────────────────────────────────────────────────────
  if (path === "/health" && method === "GET") {
    return json({ status: "ok", provider: "fake-mayar" });
  }

  // ── POST /hl/v1/invoice/create ────────────────────────────────────────────
  if (path === "/hl/v1/invoice/create" && method === "POST") {
    const body = await req.json().catch(() => ({}));
    const items = (body.items || []) as Array<{ rate?: number }>;
    const amount = body.amount ?? items.reduce((sum: number, i: { rate?: number }) => sum + (i.rate ?? 0), 0);

    const explicitId = resolveInvoiceId(body);
    const invoiceId = explicitId ?? generateId("mayar_inv");
    const transactionId = (body.transactionId as string) ?? generateId("mayar_txn");

    const invoice = {
      id: invoiceId,
      transactionId,
      link: `https://checkout.mayar.test/pay/${invoiceId}`,
      paymentUrl: `https://checkout.mayar.test/pay/${invoiceId}`,
      amount,
      status: defaultStatus,
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

    invoices.set(invoiceId, invoice);

    return json({
      statusCode: 200,
      message: "OK",
      data: [invoice],
    });
  }

  // ── GET /hl/v1/invoice/:invoiceId ─────────────────────────────────────────
  const invoiceMatch = path.match(/^\/hl\/v1\/invoice\/(.+)$/);
  if (invoiceMatch && method === "GET") {
    const invoiceId = invoiceMatch[1];
    const invoice = invoices.get(invoiceId);

    if (!invoice) {
      return json({
        statusCode: 404,
        message: "Invoice not found",
        data: null,
      }, 404);
    }

    return json({
      statusCode: 200,
      message: "OK",
      data: invoice,
    });
  }

  // ── Catch-all ────────────────────────────────────────────────────────────
  return json({ statusCode: 404, message: "Not found" }, 404);
}

console.log(`Fake Mayar server listening on http://127.0.0.1:${PORT}`);
console.log(`  Default invoice status: ${defaultStatus}`);
console.log(`  Available endpoints:`);
console.log(`    POST http://127.0.0.1:${PORT}/hl/v1/invoice/create`);
console.log(`    GET  http://127.0.0.1:${PORT}/hl/v1/invoice/:id`);

Deno.serve({ port: PORT, hostname: "127.0.0.1" }, handler);
