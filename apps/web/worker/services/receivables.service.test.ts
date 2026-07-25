import { describe, it, expect } from "vitest";
import { recordPayment, getAgingReport, getPartyStatement } from "./receivables.service";

class FakeD1 {
  private allocations: Record<string, unknown>[] = [];
  private invoices: Record<string, unknown>[] = [];
  private parties: Record<string, unknown>[] = [];

  setInvoice(row: Record<string, unknown>) { this.invoices.push(row); }
  setParty(row: Record<string, unknown>) { this.parties.push(row); }

  prepare(sql: string): D1PreparedStatement {
    const s = sql.replace(/\s+/g, " ");
    const stmt = {
      bind: (...values: unknown[]) => {
        if (s.includes("INSERT INTO payment_allocations")) {
          this.allocations.push({
            id: values[0], organization_id: values[1], invoice_id: values[2],
            transaction_id: values[3], amount_minor: values[4],
            allocation_date: values[5], notes: values[6],
            created_by: values[7], created_at: values[8],
          });
        }
        if (s.includes("UPDATE invoices SET paid_minor")) {
          const inv = this.invoices.find((i) => i.id === values[3]);
          if (inv) {
            inv.paid_minor = values[0];
            inv.status = values[1];
            inv.updated_at = values[2];
          }
        }
        return stmt;
      },
      first: async <T>() => {
        if (s.includes("SELECT total_minor FROM invoices WHERE id = ?")) {
          return (this.invoices[0] ?? null) as T;
        }
        if (s.includes("SELECT total_minor, status FROM invoices WHERE id = ?") && !s.includes("SELECT total_minor FROM")) {
          const inv = this.invoices[0];
          if (inv) return { total_minor: inv.total_minor, status: inv.status } as T;
          return null as T;
        }
        if (s.includes("COALESCE(SUM(amount_minor), 0) as paid FROM payment_allocations")) {
          const total = this.allocations.reduce((s, a) => s + (a.amount_minor as number), 0);
          return { paid: total } as T;
        }
        if (s.includes("SELECT name FROM parties WHERE id = ?")) {
          return (this.parties[0] ?? null) as T;
        }
        return null as T;
      },
      all: async <T>() => {
        if (s.includes("FROM invoices i WHERE i.organization_id = ? AND i.status IN")) {
          return { results: this.invoices as T[] };
        }
        if (s.includes("FROM invoices WHERE organization_id = ? AND party_id = ?")) {
          return { results: this.invoices as T[] };
        }
        return { results: [] as T[] };
      },
      run: async () => ({ success: true, meta: { changes: 1 } } as D1Result),
    };
    return stmt as unknown as D1PreparedStatement;
  }

  async batch() { return []; }
}

describe("Receivables Service", () => {
  describe("recordPayment", () => {
    it("records payment and updates invoice status to partially_paid", async () => {
      const db = new FakeD1();
      db.setInvoice({ id: "inv-1", total_minor: 100000, status: "issued", paid_minor: 0 });

      await recordPayment(
        db as unknown as D1Database, "org-1", "user-1",
        "inv-1", 30000, "2026-02-15",
      );

      // Check invoice was updated
      expect(db["invoices"][0].paid_minor).toBe(30000);
      expect(db["invoices"][0].status).toBe("partially_paid");
    });

    it("sets invoice to paid when fully settled", async () => {
      const db = new FakeD1();
      db.setInvoice({ id: "inv-1", total_minor: 100000, status: "issued", paid_minor: 0 });

      await recordPayment(
        db as unknown as D1Database, "org-1", "user-1",
        "inv-1", 100000, "2026-02-15",
      );

      expect(db["invoices"][0].status).toBe("paid");
    });

    it("rejects overpayment", async () => {
      const db = new FakeD1();
      db.setInvoice({ id: "inv-1", total_minor: 100000, status: "issued", paid_minor: 0 });

      await expect(
        recordPayment(db as unknown as D1Database, "org-1", "user-1", "inv-1", 200000, "2026-02-15"),
      ).rejects.toMatchObject({ code: "overpayment" });
    });
  });

  describe("getAgingReport", () => {
    it("returns aging buckets for overdue invoices", async () => {
      const db = new FakeD1();
      db.setParty({ id: "party-1", name: "PT Customer" });
      db.setInvoice({
        id: "inv-1", party_id: "party-1", due_date: "2026-01-01",
        total_minor: 500000, invoice_number: "INV-000001", status: "issued",
      });

      const report = await getAgingReport(
        db as unknown as D1Database, "org-1", undefined, "2026-02-15",
      );

      expect(report.length).toBeGreaterThanOrEqual(1);
      // Invoice due 2026-01-01, asOf 2026-02-15 = 45 days overdue = 31-60 bucket
      const p = report[0];
      expect(p.partyName).toBe("PT Customer");
    });
  });

  describe("getPartyStatement", () => {
    it("returns invoice list for a party", async () => {
      const db = new FakeD1();
      db.setParty({ id: "party-1", name: "PT Customer" });
      db.setInvoice({
        id: "inv-1", invoice_number: "INV-000001",
        invoice_date: "2026-02-01", due_date: "2026-03-01",
        total_minor: 500000, status: "issued",
      });

      const stmt = await getPartyStatement(
        db as unknown as D1Database, "org-1", "party-1",
      );

      expect(stmt.partyName).toBe("PT Customer");
      expect(stmt.invoices.length).toBe(1);
      expect(stmt.totalOutstanding).toBe(500000);
    });
  });
});
