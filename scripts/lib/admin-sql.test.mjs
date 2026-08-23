import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAdminUpsertSql, sqlEscape } from "./admin-sql.mjs";

describe("admin-sql", () => {
  it("escapes email with apostrophe", () => {
    const sql = buildAdminUpsertSql({ id: "id1", email: "o'brien@example.com", fullName: "Test", hash: "abc", now: 1 });
    assert.match(sql, /o''brien@example\.com/);
    // ensure single-quote version not present unescaped
    // the escaped form contains doubled quotes, so check raw segment not isolated
    assert.doesNotMatch(sql, /'o'brien@/);
  });
  it("escapes fullName with apostrophe", () => {
    const sql = buildAdminUpsertSql({ id: "id1", email: "a@b.com", fullName: "O'Neil", hash: "abc", now: 1 });
    assert.match(sql, /O''Neil/);
  });
  it("escapes id and hash", () => {
    const sql = buildAdminUpsertSql({ id: "a'b", email: "a@b.com", fullName: "X", hash: "h'sh", now: 1 });
    assert.match(sql, /a''b/);
    assert.match(sql, /h''sh/);
  });
  it("sqlEscape doubles single quotes", () => {
    assert.equal(sqlEscape("a'b''c"), "a''b''''c");
  });
  it("generates valid upsert structure", () => {
    const sql = buildAdminUpsertSql({ id: "id1", email: "test@example.com", fullName: "Test User", hash: "hash123", now: 123456 });
    assert.match(sql, /INSERT INTO admin_users/);
    assert.match(sql, /ON CONFLICT\(email\) DO UPDATE SET/);
    assert.match(sql, /123456/);
  });
});
