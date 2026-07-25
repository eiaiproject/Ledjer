import { describe, it, expect } from "vitest";
import { uploadAttachment, deleteAttachment, listAttachments } from "./attachments.service";

class FakeR2 {
  private store = new Map<string, { body: Uint8Array; metadata?: Record<string, string> }>();

  async put(key: string, data: Uint8Array, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) {
    this.store.set(key, { body: data, metadata: options?.customMetadata });
  }

  async get(key: string): Promise<{ body: ReadableStream } | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    return { body: new ReadableStream({ start(ctrl) { ctrl.enqueue(entry.body); ctrl.close(); } }) };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class FakeD1 {
  private rows: Record<string, unknown[]> = {};
  private insertLog: string[] = [];

  constructor(initialRows?: Record<string, unknown[]>) {
    this.rows = initialRows ?? {};
  }

  prepare(sql: string): D1PreparedStatement {
    const s = sql.replace(/\s+/g, " ");
    const stmt = {
      bind: (...values: unknown[]) => {
        this.insertLog.push(`${s} | ${values.join(",")}`);
        return stmt;
      },
      first: async <T>() => {
        if (s.includes("FROM attachments WHERE id = ?")) {
          const found = this.rows["attachments"]?.[0] as Record<string, unknown> | undefined;
          return (found ?? null) as T | null;
        }
        return null as T | null;
      },
      all: async <T>() => {
        if (s.includes("FROM attachments WHERE organization_id = ? AND entity_type")) {
          return { results: (this.rows["attachments"] ?? []) as T[] };
        }
        return { results: [] as T[] };
      },
      run: async () => ({ success: true, meta: { changes: 1 } } as D1Result),
    };
    return stmt as unknown as D1PreparedStatement;
  }

  async batch() { return []; }
}

function makeUint8(data: number[]): Uint8Array {
  return new Uint8Array(data);
}

describe("Attachments Service", () => {
  describe("uploadAttachment", () => {
    it("accepts valid PDF", async () => {
      const db = new FakeD1();
      const bucket = new FakeR2();
      const pdfBytes = makeUint8([0x25, 0x50, 0x44, 0x46, 0x00, 0x00]); // PDF magic

      const result = await uploadAttachment(
        db as unknown as D1Database,
        bucket as unknown as R2Bucket,
        "org-1", "user-1", "transaction", "txn-1", null,
        "receipt.pdf", pdfBytes,
      );

      expect(result.fileName).toBe("receipt.pdf");
      expect(result.mimeType).toBe("application/pdf");
      expect(result.fileSize).toBe(6);
    });

    it("accepts valid JPEG", async () => {
      const db = new FakeD1();
      const bucket = new FakeR2();
      const jpegBytes = makeUint8([0xFF, 0xD8, 0xFF, 0xE0, 0x00]); // JPEG magic

      const result = await uploadAttachment(
        db as unknown as D1Database,
        bucket as unknown as R2Bucket,
        "org-1", "user-1", "transaction", "txn-1", null,
        "photo.jpg", jpegBytes,
      );

      expect(result.mimeType).toBe("image/jpeg");
    });

    it("rejects unknown file type", async () => {
      const db = new FakeD1();
      const bucket = new FakeR2();
      const badBytes = makeUint8([0x00, 0x00, 0x00, 0x00]);

      await expect(
        uploadAttachment(
          db as unknown as D1Database,
          bucket as unknown as R2Bucket,
          "org-1", "user-1", "transaction", "txn-1", null,
          "malware.exe", badBytes,
        ),
      ).rejects.toMatchObject({ code: "invalid_file_type" });
    });

    it("rejects oversized file", async () => {
      const db = new FakeD1();
      const bucket = new FakeR2();
      // 11 MB
      const bigBytes = new Uint8Array(11 * 1024 * 1024);

      await expect(
        uploadAttachment(
          db as unknown as D1Database,
          bucket as unknown as R2Bucket,
          "org-1", "user-1", "transaction", "txn-1", null,
          "big.pdf", bigBytes,
        ),
      ).rejects.toMatchObject({ code: "file_too_large" });
    });
  });

  describe("listAttachments", () => {
    it("returns attachments for entity", async () => {
      const db = new FakeD1({
        attachments: [{
          id: "att-1", organization_id: "org-1",
          transaction_id: null, entity_type: "transaction",
          entity_id: "txn-1", file_name: "receipt.pdf",
          file_size: 100, mime_type: "application/pdf",
          storage_key: "attachments/org-1/att-1.pdf",
          uploaded_by: "user-1", created_at: Date.now(),
        }],
      });

      const result = await listAttachments(
        db as unknown as D1Database, "org-1", "transaction", "txn-1",
      );
      expect(result.length).toBe(1);
      expect(result[0].fileName).toBe("receipt.pdf");
    });

    it("returns empty for entity with no attachments", async () => {
      const db = new FakeD1({ attachments: [] });

      const result = await listAttachments(
        db as unknown as D1Database, "org-1", "transaction", "txn-999",
      );
      expect(result).toEqual([]);
    });
  });

  describe("deleteAttachment", () => {
    it("deletes attachment and removes from R2", async () => {
      const db = new FakeD1({
        attachments: [{
          id: "att-1", organization_id: "org-1",
          transaction_id: null, entity_type: "transaction",
          entity_id: "txn-1", file_name: "receipt.pdf",
          file_size: 100, mime_type: "application/pdf",
          storage_key: "attachments/org-1/att-1.pdf",
          uploaded_by: "user-1", created_at: Date.now(),
        }],
      });
      const bucket = new FakeR2();
      // Pre-populate R2
      await bucket.put("attachments/org-1/att-1.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46]));

      await deleteAttachment(
        db as unknown as D1Database,
        bucket as unknown as R2Bucket,
        "org-1", "user-1", "att-1",
      );

      const r2obj = await bucket.get("attachments/org-1/att-1.pdf");
      expect(r2obj).toBeNull();
    });
  });
});
