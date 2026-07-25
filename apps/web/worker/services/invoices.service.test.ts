import { describe, it, expect } from "vitest";
import { createInvoice, updateInvoiceStatus } from "./invoices.service";

class FakeD1 {
  private counters: Map<string, number> = new Map();
  private invoices: Record<string, unknown>[] = [];
  private invoiceLines: Record<string, unknown>[] = [];

  prepare(sql: string): D1PreparedStatement {
    const s = sql.replace(/\s+/g, " ");
    const stmt = {
      bind: (...values: unknown[]) => {
        if (s.includes("organization_document_counters")) {
          this.counters.set("invoice", parseInt(values[1] as string, 10));
        }
        if (s.includes("INSERT INTO invoices")) {
          this.invoices.push({
            id: values[0], organization_id: values[1], invoice_number: values[2],
            invoice_date: values[3], due_date: values[4], party_id: values[5],
            status: "draft",
            subtotal_minor: values[6], discount_minor: values[7], tax_minor: values[8],
            total_minor: values[9], notes: values[10], terms: values[11],
            created_by: values[12], created_at: values[13], updated_at: values[14],
          });
        }
        if (s.includes("INSERT INTO invoice_lines")) {
          this.invoiceLines.push({
            id: values[0], organization_id: values[1], invoice_id: values[2],
            product_id: values[3], description: values[4],
            quantity_milli: values[5], unit_price_minor: values[6],
            amount_minor: values[7], line_order: values[8], created_at: values[9],
          });
        }
        if (s.includes("UPDATE invoices SET status = ?")) {
          // [newStatus, issuedAt, paidAt, voidedAt, voidReason, now, invoiceId]
          const invoiceId = values[6] as string;
          const newStatus = values[0] as string;
          const inv = this.invoices.find((i) => i.id === invoiceId);
          if (inv) inv.status = newStatus;
        }
        return stmt;
      },
      first: async <T>() => {
        if (s.includes("SELECT current_value FROM organization_document_counters")) {
          const val = this.counters.get("invoice");
          return (val ? { current_value: val } : null) as T;
        }
        if (s.includes("SELECT * FROM invoices WHERE id = ?")) {
          // Return by invoice ID if specified in bind params
          const lastInv = this.invoices[this.invoices.length - 1];
          return (lastInv ?? null) as T;
        }
        return null as T;
      },
      all: async <T>() => {
        if (s.includes("FROM invoice_lines WHERE invoice_id = ?")) {
          return { results: [...this.invoiceLines] as T[] };
        }
        return { results: [] as T[] };
      },
      run: async () => ({ success: true, meta: { changes: 1 } } as D1Result),
    };
    return stmt as unknown as D1PreparedStatement;
  }

  async batch(stmts: D1PreparedStatement[]) {
    for (const s of stmts) await s.run();
    return [];
  }
}

describe("Invoices Service", () => {
  describe("createInvoice", () => {
    it("creates draft invoice with lines", async () => {
      const db = new FakeD1();
      const result = await createInvoice(
        db as unknown as D1Database, "org-1", "user-1",
        {
          invoiceDate: "2026-02-01", dueDate: "2026-03-01",
          partyId: "party-1",
          lines: [
            { description: "Widget A", quantityMilli: 2000, unitPriceMinor: 50000, amountMinor: 100000 },
            { description: "Widget B", quantityMilli: 1000, unitPriceMinor: 75000, amountMinor: 75000 },
          ],
          discountMinor: 10000, taxMinor: 16500,
          notes: "Terima kasih",
        },
      );

      expect(result.status).toBe("draft");
      expect(result.invoiceNumber).toMatch(/^INV-/);
      expect(result.subtotalMinor).toBe(175000);
      expect(result.discountMinor).toBe(10000);
      expect(result.taxMinor).toBe(16500);
      expect(result.totalMinor).toBe(181500);
      expect(result.lines.length).toBe(2);
    });

    it("rejects invoice with no lines", async () => {
      const db = new FakeD1();
      await expect(
        createInvoice(db as unknown as D1Database, "org-1", "user-1", {
          invoiceDate: "2026-02-01", dueDate: "2026-03-01",
          partyId: "party-1", lines: [],
        }),
      ).rejects.toMatchObject({ code: "no_lines" });
    });
  });

  describe("updateInvoiceStatus", () => {
    it("transitions draft → issued → paid", async () => {
      const db = new FakeD1();
      const invoice = await createInvoice(
        db as unknown as D1Database, "org-1", "user-1",
        {
          invoiceDate: "2026-02-01", dueDate: "2026-03-01",
          partyId: "party-1",
          lines: [{ description: "Test", quantityMilli: 1000, unitPriceMinor: 50000, amountMinor: 50000 }],
        },
      );

      const issued = await updateInvoiceStatus(
        db as unknown as D1Database, "org-1", "user-1", invoice.id, "issued",
      );
      expect(issued.status).toBe("issued");

      const paid = await updateInvoiceStatus(
        db as unknown as D1Database, "org-1", "user-1", invoice.id, "paid",
      );
      expect(paid.status).toBe("paid");
    });

    it("rejects invalid transition draft → paid", async () => {
      const db = new FakeD1();
      const invoice = await createInvoice(
        db as unknown as D1Database, "org-1", "user-1",
        {
          invoiceDate: "2026-02-01", dueDate: "2026-03-01",
          partyId: "party-1",
          lines: [{ description: "Test", quantityMilli: 1000, unitPriceMinor: 50000, amountMinor: 50000 }],
        },
      );

      await expect(
        updateInvoiceStatus(db as unknown as D1Database, "org-1", "user-1", invoice.id, "paid"),
      ).rejects.toMatchObject({ code: "invalid_status_transition" });
    });

    it("allows void from issued", async () => {
      const db = new FakeD1();
      const invoice = await createInvoice(
        db as unknown as D1Database, "org-1", "user-1",
        {
          invoiceDate: "2026-02-01", dueDate: "2026-03-01",
          partyId: "party-1",
          lines: [{ description: "Test", quantityMilli: 1000, unitPriceMinor: 50000, amountMinor: 50000 }],
        },
      );

      await updateInvoiceStatus(db as unknown as D1Database, "org-1", "user-1", invoice.id, "issued");
      const result = await updateInvoiceStatus(
        db as unknown as D1Database, "org-1", "user-1", invoice.id, "voided", "Customer batal",
      );
      expect(result.status).toBe("voided");
    });
  });
});
