import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { FakeD1Database } from "../test/fake-d1";
import {
  exportBalanceSheetPdf,
  exportGeneralLedgerPdf,
  exportProfitLossPdf,
  exportTrialBalancePdf,
  pdfHeaders,
} from "./pdf-export.service";

const ORG = { id: "org-1", name: "Toko Bahagia" };

function dbWithRows(rows: unknown[]): D1Database {
  const db = new FakeD1Database({
    first: (sql) =>
      sql.includes("books_start_date") ? { books_start_date: "2024-01-01" } : null,
    all: () => rows,
  });
  return db as unknown as D1Database;
}

/**
 * pdf-lib encodes standard-font text as uppercase PDFHexString using WinAnsi
 * (cp1252) code points inside the (Flate-compressed) content stream. These
 * helpers decompress the streams and re-encode the expected string the same
 * way, so tests assert on actual rendered content.
 */
const WIN_ANSI: Record<number, number> = {
  0x2013: 0x96, // – en dash
  0x2014: 0x97, // - em dash
  0x2018: 0x91, // ' left single quote
  0x2019: 0x92, // ' right single quote
  0x201c: 0x93, // " left double quote
  0x201d: 0x94, // " right double quote
  0x2022: 0x95, // • bullet
  0x2026: 0x85, // … ellipsis
  0x00a0: 0xa0, // nbsp
};

function winAnsiByte(char: string): number {
  const code = char.charCodeAt(0);
  if (code <= 0x7f) return code;
  return WIN_ANSI[code] ?? code;
}

function toHex(text: string): string {
  return Array.from(text)
    .map((char) => winAnsiByte(char).toString(16).padStart(2, "0").toUpperCase())
    .join("");
}

async function pageContentLatin1(pdfBytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(pdfBytes);
  const context = (doc as unknown as { context: { lookup: (ref: unknown) => unknown } }).context;
  let out = "";
  for (const page of doc.getPages()) {
    const leaf = (page as unknown as { node: { Contents?: () => unknown } }).node;
    const contents = leaf.Contents?.();
    if (!contents) continue;
    const array = (contents as unknown as { asArray: () => unknown[] }).asArray();
    for (const ref of array) {
      const stream = context.lookup(ref) as { getContents?: () => Uint8Array; contents?: Uint8Array };
      const raw = typeof stream.getContents === "function"
        ? stream.getContents()
        : (stream.contents ?? new Uint8Array());
      let data: Uint8Array;
      try {
        data = inflateSync(raw);
      } catch {
        data = raw;
      }
      out += Buffer.from(data).toString("latin1");
    }
  }
  return out;
}

async function expectPdfContains(pdfBytes: Uint8Array, texts: string[]): Promise<void> {
  const content = await pageContentLatin1(pdfBytes);
  for (const text of texts) {
    expect(content, `expected PDF content to contain "${text}"`).toContain(toHex(text));
  }
}

describe("pdf export headers", () => {
  it("sets PDF content type and attachment disposition", () => {
    const headers = pdfHeaders("neraca_saldo_20260817.pdf");
    expect(headers.get("Content-Type")).toBe("application/pdf");
    expect(headers.get("Content-Disposition"))
      .toBe('attachment; filename="neraca_saldo_20260817.pdf"');
    expect(headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("exportTrialBalancePdf", () => {
  it("renders account names, totals, and balance status", async () => {
    const db = dbWithRows([
      {
        account_id: "a1", account_code: 1110, account_name: "Kas",
        account_type: "asset", normal_balance: "debit",
        debit_total: 100000, credit_total: 0, ending_debit: 100000, ending_credit: 0,
      },
      {
        account_id: "a2", account_code: 4100, account_name: "Pendapatan Penjualan Barang",
        account_type: "revenue", normal_balance: "credit",
        debit_total: 0, credit_total: 100000, ending_debit: 0, ending_credit: 100000,
      },
    ]);
    const result = await exportTrialBalancePdf(db, ORG, "2026-08-17");

    expect(result.filename).toMatch(/^neraca_saldo_\d{8}\.pdf$/);
    expect(String.fromCharCode(...result.pdf.slice(0, 5))).toBe("%PDF-");
    await expect(PDFDocument.load(result.pdf)).resolves.toBeDefined();

    await expectPdfContains(result.pdf, [
      "Toko Bahagia",
      "Neraca Saldo",
      "Kas",
      "Pendapatan Penjualan Barang",
      "100.000",
      "Total",
      "Neraca saldo seimbang.",
    ]);
  });
});

describe("exportProfitLossPdf", () => {
  it("renders sections and net result", async () => {
    const db = dbWithRows([
      { section: "revenue", account_code: 4100, account_name: "Pendapatan Penjualan Barang", amount: 250000 },
      { section: "cogs", account_code: 5100, account_name: "HPP / Beban Langsung", amount: 50000 },
      { section: "expense", account_code: 6110, account_name: "Beban Gaji", amount: 100000 },
    ]);
    const result = await exportProfitLossPdf(db, ORG, "2026-01-01", "2026-08-17");

    expect(result.filename).toMatch(/^laba_rugi_\d{8}\.pdf$/);
    await expectPdfContains(result.pdf, [
      "Laporan Laba Rugi",
      "Pendapatan",
      "Harga Pokok Penjualan",
      "Beban Operasional",
      "Beban Gaji",
      "Laba Kotor",
      "Laba Bersih",
      "200.000",
      "100.000",
    ]);
  });
});

describe("exportBalanceSheetPdf", () => {
  it("renders sections, accounting equation, and balance status", async () => {
    const db = dbWithRows([
      { section: "asset", account_code: 1110, account_name: "Kas", amount: 500000 },
      { section: "liability", account_code: 2100, account_name: "Utang Usaha", amount: 200000 },
      { section: "equity", account_code: 3100, account_name: "Modal Pemilik", amount: 300000 },
    ]);
    const result = await exportBalanceSheetPdf(db, ORG, "2026-08-17");

    expect(result.filename).toMatch(/^neraca_\d{8}\.pdf$/);
    await expectPdfContains(result.pdf, [
      "Neraca",
      "Aset",
      "Kewajiban",
      "Ekuitas",
      "Utang Usaha",
      "500.000",
      "Kewajiban + Ekuitas",
      "Neraca seimbang.",
    ]);
  });
});

describe("exportGeneralLedgerPdf", () => {
  it("renders entries grouped by account with subtotals", async () => {
    const db = dbWithRows([
      {
        account_id: "a1", account_code: 1110, account_name: "Kas",
        entry_date: "2026-01-05", journal_entry_id: "je1", entry_number: "JE-000001",
        transaction_id: "t1", transaction_number: "TRX-202601-000001",
        description: "Penjualan tunai", party_name: null,
        debit: 50000, credit: 0, running_balance: 50000,
      },
      {
        account_id: "a1", account_code: 1110, account_name: "Kas",
        entry_date: "2026-01-06", journal_entry_id: "je2", entry_number: "JE-000002",
        transaction_id: "t2", transaction_number: "TRX-202601-000002",
        description: "Bayar sewa", party_name: null,
        debit: 0, credit: 20000, running_balance: 30000,
      },
    ]);
    const result = await exportGeneralLedgerPdf(db, ORG, {
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
    });

    expect(result.filename).toMatch(/^buku_besar_\d{8}\.pdf$/);
    await expectPdfContains(result.pdf, [
      "Buku Besar",
      "1110 - Kas",
      "TRX-202601-000001",
      "Penjualan tunai",
      "Subtotal 1110",
      "50.000",
      "30.000",
    ]);
  });

  it("renders an empty-state row when there are no entries", async () => {
    const db = dbWithRows([]);
    const result = await exportGeneralLedgerPdf(db, ORG, {
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
    });
    await expectPdfContains(result.pdf, ["Tidak ada transaksi pada periode ini."]);
  });
});
