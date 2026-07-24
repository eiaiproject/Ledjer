import { generateId } from "../auth/tokens";
import {
  type ImportValidator,
  type ImportWriter,
  validateRequiredField,
  validateOptionalField,
} from "./import.service";

export interface PartyImportRow {
  name: string;
  partyType: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

const PARTY_TYPE_MAP: Record<string, string> = {
  "customer": "customer",
  "pelanggan": "customer",
  "konsumen": "customer",
  "supplier": "supplier",
  "pemasok": "supplier",
  "vendor": "supplier",
  "employee": "employee",
  "karyawan": "employee",
  "pegawai": "employee",
  "owner": "owner",
  "pemilik": "owner",
  "other": "other",
  "lainnya": "other",
};

export const partyImportValidator: ImportValidator<PartyImportRow> = {
  name: "parties",
  requiredHeaders: ["nama"],
  validateRow(row: Record<string, string>, index: number) {
    void index;
    const errors: { field: string; message: string }[] = [];

    const name = validateRequiredField(row, "nama", errors);
    const rawType = row["tipe"]?.trim().toLowerCase();
    const partyType = rawType ? (PARTY_TYPE_MAP[rawType] ?? null) : "other";
    if (rawType && !partyType) {
      errors.push({ field: "tipe", message: `Tipe "${rawType}" tidak dikenal. Gunakan: customer, supplier, employee, owner, other` });
    }
    const email = validateOptionalField(row, "email");
    const phone = validateOptionalField(row, "telepon");
    const notes = validateOptionalField(row, "catatan");

    if (!name) {
      return { parsed: null, errors };
    }

    return {
      parsed: { name, partyType: partyType ?? "other", email, phone, notes },
      errors,
    };
  },
};

export const partyImportWriter: ImportWriter<PartyImportRow> = {
  async insert(db, organizationId, createdBy, rows) {
    void createdBy;
    const errors: { row: number; field: string; message: string }[] = [];
    let inserted = 0;
    const now = Date.now();

    for (const row of rows) {
      try {
        await db.prepare(
          `INSERT INTO parties (id, organization_id, name, party_type, email, phone, notes, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).bind(
          generateId(), organizationId, row.parsed.name,
          row.parsed.partyType, row.parsed.email, row.parsed.phone,
          row.parsed.notes, now, now,
        ).run();
        inserted++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        errors.push({ row: row.index + 1, field: "_db", message: `Gagal menyimpan: ${msg}` });
      }
    }

    return { inserted, errors };
  },
};
