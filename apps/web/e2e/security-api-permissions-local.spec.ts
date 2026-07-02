import { test, expect } from "@playwright/test";
import { E2E, e2eName } from "./fixtures/env";
import { E2E_OWNER, E2E_STAFF, E2E_OWNER2 } from "./fixtures/users";
import {
  ensureTestUser,
  seedOrganization,
  seedStaffMember,
  loginUser,
} from "./fixtures/seed";
import { cleanupE2EOrganizations, cleanupE2EUsers } from "./fixtures/cleanup";

// ── Types ────────────────────────────────────────────────────────────────

interface AccountRow {
  id: string;
  organization_id: string;
  code: number;
  name: string;
  is_cash_account: boolean;
}

interface ProductRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface TransactionRow {
  id: string;
  organization_id: string;
  description: string | null;
  amount: number;
}

interface MemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  can_create_transaction: boolean;
  can_view_reports: boolean;
  can_manage_accounts: boolean;
  can_void_transaction: boolean;
  can_manage_products: boolean;
}

interface InvitationRow {
  id: string;
  email: string;
  status: string | null;
}

// ── Headers ──────────────────────────────────────────────────────────────

const anonHeaders = {
  apikey: E2E.supabaseAnonKey,
  "Content-Type": "application/json",
};

const srHeaders = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

function userHeaders(token: string) {
  return {
    apikey: E2E.supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function expectAuthErrorBody(body: unknown) {
  const text = JSON.stringify(body ?? "").toLowerCase();
  expect(text).toMatch(
    /permission|denied|forbidden|unauthorized|not authorized|auth|jwt|row-level|rls|izin|akses|owner|pemilik/,
  );
}

async function expectRpcForbidden(res: Response) {
  const body = await readBody(res);
  expect([400, 401, 403]).toContain(res.status);
  expectAuthErrorBody(body);
  return body;
}

/**
 * PostgREST writes blocked by GRANT/RLS can surface as:
 * - 401 / 403 / 405 with error body
 * - 200 / 201 with empty [] (RLS filtered/no-op with return=representation)
 * - 204 with no content
 */
async function expectRestMutationBlocked(res: Response) {
  const body = await readBody(res);
  expect([200, 201, 204, 401, 403, 405]).toContain(res.status);

  if (res.status === 200 || res.status === 201) {
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
    return body;
  }

  if (res.status === 204) {
    return body;
  }

  expectAuthErrorBody(body);
  return body;
}

async function deleteOrg(orgId: string) {
  await fetch(`${E2E.supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`, {
    method: "DELETE",
    headers: srHeaders,
  }).catch(() => {});
}

async function getCashAccount(orgId: string): Promise<AccountRow> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/accounts?organization_id=eq.${orgId}&is_cash_account=eq.true&select=id,organization_id,code,name,is_cash_account&limit=1`,
    { headers: srHeaders },
  );
  expect(res.ok).toBe(true);
  const rows = (await res.json()) as AccountRow[];
  expect(rows.length).toBeGreaterThan(0);
  return rows[0];
}

async function getAccountById(
  accountId: string,
): Promise<AccountRow | null> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/accounts?id=eq.${accountId}&select=id,organization_id,code,name,is_cash_account`,
    { headers: srHeaders },
  );
  expect(res.ok).toBe(true);
  const rows = (await res.json()) as AccountRow[];
  return rows[0] ?? null;
}

async function createProductAsServiceRole(
  orgId: string,
  suffix: string,
): Promise<ProductRow> {
  const res = await fetch(`${E2E.supabaseUrl}/rest/v1/products`, {
    method: "POST",
    headers: { ...srHeaders, Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: orgId,
      code: `E2E-API-${suffix}-${Date.now()}`,
      name: e2eName(`Produk API ${suffix}`),
      unit: "pcs",
      purchase_price: 10000,
      selling_price: 15000,
      current_stock: 0,
      is_active: true,
    }),
  });
  expect(res.ok).toBe(true);
  const rows = (await res.json()) as ProductRow[];
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function getProductById(
  productId: string,
): Promise<ProductRow | null> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/products?id=eq.${productId}&select=id,organization_id,code,name,is_active`,
    { headers: srHeaders },
  );
  expect(res.ok).toBe(true);
  const rows = (await res.json()) as ProductRow[];
  return rows[0] ?? null;
}

async function getProductByCode(
  orgId: string,
  code: string,
): Promise<ProductRow | null> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/products?organization_id=eq.${orgId}&code=eq.${encodeURIComponent(code)}&select=id,organization_id,code,name,is_active`,
    { headers: srHeaders },
  );
  expect(res.ok).toBe(true);
  const rows = (await res.json()) as ProductRow[];
  return rows[0] ?? null;
}

async function countTransactions(orgId: string): Promise<number> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/transactions?organization_id=eq.${orgId}&select=id`,
    { headers: srHeaders },
  );
  expect(res.ok).toBe(true);
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows.length;
}

async function getTransactionById(
  txId: string,
): Promise<TransactionRow | null> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/transactions?id=eq.${txId}&select=id,organization_id,description,amount`,
    { headers: srHeaders },
  );
  expect(res.ok).toBe(true);
  const rows = (await res.json()) as TransactionRow[];
  return rows[0] ?? null;
}

async function createTransactionAsUser(
  token: string,
  orgId: string,
  cashAccountId: string,
  description: string,
): Promise<string> {
  const res = await fetch(`${E2E.supabaseUrl}/rest/v1/rpc/post_transaction`, {
    method: "POST",
    headers: userHeaders(token),
    body: JSON.stringify({
      p_organization_id: orgId,
      p_transaction_date: new Date().toISOString().split("T")[0],
      p_transaction_type: "cash_sale",
      p_amount: 50000,
      p_payment_status: "paid",
      p_partial_amount: 0,
      p_description: description,
      p_cash_account_id: cashAccountId,
      p_client_token: crypto.randomUUID(),
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Failed to create transaction fixture: ${res.status} ${await res.text()}`,
    );
  }

  const data = (await res.json()) as { transaction_id: string };
  expect(data.transaction_id).toBeTruthy();
  return data.transaction_id;
}

async function getMember(
  orgId: string,
  userId: string,
): Promise<MemberRow> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organization_members?organization_id=eq.${orgId}&user_id=eq.${userId}&select=id,organization_id,user_id,role,can_create_transaction,can_view_reports,can_manage_accounts,can_void_transaction,can_manage_products&limit=1`,
    { headers: srHeaders },
  );
  expect(res.ok).toBe(true);
  const rows = (await res.json()) as MemberRow[];
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function getInvitationsAsOwner(
  token: string,
  orgId: string,
): Promise<InvitationRow[]> {
  const res = await fetch(`${E2E.supabaseUrl}/rest/v1/rpc/get_invitations`, {
    method: "POST",
    headers: userHeaders(token),
    body: JSON.stringify({ p_organization_id: orgId }),
  });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch invitations: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as InvitationRow[];
}

async function createInvitationFixture(
  orgId: string,
  email: string,
  invitedBy: string,
) {
  const res = await fetch(`${E2E.supabaseUrl}/rest/v1/organization_invitations`, {
    method: "POST",
    headers: { ...srHeaders, Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: orgId,
      email: email.toLowerCase(),
      token: `e2e-${crypto.randomUUID()}`,
      role: "staff",
      invited_by: invitedBy,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Failed to create invitation fixture: ${res.status} ${await res.text()}`,
    );
  }
  return readBody(res);
}

// ── Tests ────────────────────────────────────────────────────────────────

test.describe("Security: API permissions", () => {
  test.skip(!E2E.isFullLocal, "Butuh local Supabase + service role key");
  test.describe.configure({ mode: "serial" });

  let ownerId: string;
  let owner2Id: string;
  let staffId: string;
  let ownerToken: string;
  let owner2Token: string;
  let staffToken: string;

  test.beforeAll(async () => {
    ownerId = await ensureTestUser(E2E_OWNER);
    owner2Id = await ensureTestUser(E2E_OWNER2);
    staffId = await ensureTestUser(E2E_STAFF);

    ownerToken = await loginUser(E2E_OWNER);
    owner2Token = await loginUser(E2E_OWNER2);
    staffToken = await loginUser(E2E_STAFF);
  });

  test.afterAll(async () => {
    await cleanupE2EOrganizations();
    await cleanupE2EUsers();
  });

  // ── RPC: staff tanpa permission tidak bisa call RPC langsung ──────────

  test.describe("RPC langsung tetap diblokir oleh permission check", () => {
    let orgId: string;
    let cashAccount: AccountRow;

    test.beforeAll(async () => {
      orgId = await seedOrganization(
        ownerId,
        e2eName("API Security RPC"),
        E2E_OWNER,
      );
      await seedStaffMember(orgId, staffId, {
        can_create_transaction: false,
        can_view_reports: false,
        can_manage_accounts: false,
        can_void_transaction: false,
        can_manage_products: false,
      });
      cashAccount = await getCashAccount(orgId);
    });

    test.afterAll(async () => {
      await deleteOrg(orgId);
    });

    test("staff tanpa can_create_transaction tidak bisa memanggil RPC post_transaction", async () => {
      const beforeCount = await countTransactions(orgId);

      const res = await fetch(
        `${E2E.supabaseUrl}/rest/v1/rpc/post_transaction`,
        {
          method: "POST",
          headers: userHeaders(staffToken),
          body: JSON.stringify({
            p_organization_id: orgId,
            p_transaction_date: new Date().toISOString().split("T")[0],
            p_transaction_type: "cash_sale",
            p_amount: 75000,
            p_payment_status: "paid",
            p_partial_amount: 0,
            p_description: e2eName("Bypass RPC staff"),
            p_cash_account_id: cashAccount.id,
            p_client_token: crypto.randomUUID(),
          }),
        },
      );

      const body = await expectRpcForbidden(res);
      expect(JSON.stringify(body)).not.toContain("transaction_id");

      const afterCount = await countTransactions(orgId);
      expect(afterCount).toBe(beforeCount);
    });
  });

  // ── REST: staff tanpa permission tidak bisa mutate ────────────────────

  test.describe("REST mutation diblokir untuk staff tanpa izin", () => {
    let orgId: string;
    let cashAccount: AccountRow;
    let product: ProductRow;
    let transactionId: string;

    test.beforeAll(async () => {
      orgId = await seedOrganization(
        ownerId,
        e2eName("API Security REST"),
        E2E_OWNER,
      );
      await seedStaffMember(orgId, staffId, {
        can_create_transaction: false,
        can_view_reports: false,
        can_manage_accounts: false,
        can_void_transaction: false,
        can_manage_products: false,
      });

      cashAccount = await getCashAccount(orgId);
      product = await createProductAsServiceRole(orgId, "rest-blocked");
      transactionId = await createTransactionAsUser(
        ownerToken,
        orgId,
        cashAccount.id,
        e2eName("Fixture transaksi REST"),
      );
    });

    test.afterAll(async () => {
      await deleteOrg(orgId);
    });

    test("staff tanpa izin tidak bisa INSERT ke products via REST", async () => {
      const blockedCode = `E2E-BLOCKED-${Date.now()}`;

      const res = await fetch(`${E2E.supabaseUrl}/rest/v1/products`, {
        method: "POST",
        headers: {
          ...userHeaders(staffToken),
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          organization_id: orgId,
          code: blockedCode,
          name: e2eName("Produk terlarang staff"),
          unit: "pcs",
          purchase_price: 1000,
          selling_price: 2000,
          current_stock: 0,
          is_active: true,
        }),
      });

      await expectRestMutationBlocked(res);

      const inserted = await getProductByCode(orgId, blockedCode);
      expect(inserted).toBeNull();
    });

    test("staff tanpa izin tidak bisa UPDATE products via REST", async () => {
      const before = await getProductById(product.id);
      expect(before).not.toBeNull();

      const res = await fetch(
        `${E2E.supabaseUrl}/rest/v1/products?id=eq.${product.id}`,
        {
          method: "PATCH",
          headers: {
            ...userHeaders(staffToken),
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            name: e2eName("Produk dibajak"),
          }),
        },
      );

      await expectRestMutationBlocked(res);

      const after = await getProductById(product.id);
      expect(after).not.toBeNull();
      expect(after?.name).toBe(before?.name);
    });

    test("staff tanpa izin tidak bisa DELETE products via REST", async () => {
      const before = await getProductById(product.id);
      expect(before).not.toBeNull();

      const res = await fetch(
        `${E2E.supabaseUrl}/rest/v1/products?id=eq.${product.id}`,
        {
          method: "DELETE",
          headers: {
            ...userHeaders(staffToken),
            Prefer: "return=representation",
          },
        },
      );

      await expectRestMutationBlocked(res);

      const after = await getProductById(product.id);
      expect(after).not.toBeNull();
      expect(after?.id).toBe(product.id);
    });

    test("staff tanpa izin tidak bisa UPDATE accounts via REST", async () => {
      const before = await getAccountById(cashAccount.id);
      expect(before).not.toBeNull();

      const res = await fetch(
        `${E2E.supabaseUrl}/rest/v1/accounts?id=eq.${cashAccount.id}`,
        {
          method: "PATCH",
          headers: {
            ...userHeaders(staffToken),
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            name: e2eName("Kas dibajak"),
          }),
        },
      );

      await expectRestMutationBlocked(res);

      const after = await getAccountById(cashAccount.id);
      expect(after).not.toBeNull();
      expect(after?.name).toBe(before?.name);
    });

    test("staff tanpa izin tidak bisa DELETE transactions via REST", async () => {
      const before = await getTransactionById(transactionId);
      expect(before).not.toBeNull();

      const res = await fetch(
        `${E2E.supabaseUrl}/rest/v1/transactions?id=eq.${transactionId}`,
        {
          method: "DELETE",
          headers: {
            ...userHeaders(staffToken),
            Prefer: "return=representation",
          },
        },
      );

      await expectRestMutationBlocked(res);

      const after = await getTransactionById(transactionId);
      expect(after).not.toBeNull();
      expect(after?.id).toBe(transactionId);
    });
  });

  // ── Staff non-owner tidak bisa kelola invitation/member/permission ────

  test.describe("Staff non-owner tidak bisa kelola invitation/member/permission", () => {
    let orgId: string;

    test.beforeAll(async () => {
      orgId = await seedOrganization(
        ownerId,
        e2eName("API Security Team"),
        E2E_OWNER,
      );
      const planRes = await fetch(
        `${E2E.supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`,
        {
          method: "PATCH",
          headers: srHeaders,
          body: JSON.stringify({
            current_plan: "business",
            subscription_status: "active",
          }),
        },
      );
      expect(planRes.ok).toBe(true);
      await seedStaffMember(orgId, staffId, {
        can_create_transaction: false,
        can_view_reports: false,
        can_manage_accounts: false,
        can_void_transaction: false,
        can_manage_products: false,
      });
    });

    test.afterAll(async () => {
      await deleteOrg(orgId);
    });

    test("staff tidak bisa memanggil RPC create_invitation", async () => {
      const inviteEmail = `e2e-invite-${Date.now()}@ledjer.test`;
      const before = await getInvitationsAsOwner(ownerToken, orgId);

      const res = await fetch(
        `${E2E.supabaseUrl}/rest/v1/rpc/create_invitation`,
        {
          method: "POST",
          headers: userHeaders(staffToken),
          body: JSON.stringify({
            p_organization_id: orgId,
            p_email: inviteEmail,
          }),
        },
      );

      await expectRpcForbidden(res);

      const after = await getInvitationsAsOwner(ownerToken, orgId);
      expect(after).toHaveLength(before.length);
      expect(after.some((row) => row.email === inviteEmail)).toBe(false);
    });

    test("staff tidak bisa memanggil RPC revoke_invitation", async () => {
      const inviteEmail = `e2e-revoke-${Date.now()}@ledjer.test`;
      await createInvitationFixture(orgId, inviteEmail, ownerId);

      const created = await getInvitationsAsOwner(ownerToken, orgId);
      const invitation = created.find((row) => row.email === inviteEmail);
      expect(invitation).toBeTruthy();

      const res = await fetch(
        `${E2E.supabaseUrl}/rest/v1/rpc/revoke_invitation`,
        {
          method: "POST",
          headers: userHeaders(staffToken),
          body: JSON.stringify({
            p_organization_id: orgId,
            p_invitation_id: invitation?.id,
          }),
        },
      );

      await expectRpcForbidden(res);

      const after = await getInvitationsAsOwner(ownerToken, orgId);
      const stillThere = after.find((row) => row.id === invitation?.id);
      expect(stillThere).toBeTruthy();
      expect(stillThere?.status).not.toBe("revoked");
    });

    test("staff tidak bisa mengubah role atau permission organization_members via REST", async () => {
      const before = await getMember(orgId, staffId);

      const res = await fetch(
        `${E2E.supabaseUrl}/rest/v1/organization_members?organization_id=eq.${orgId}&user_id=eq.${staffId}`,
        {
          method: "PATCH",
          headers: {
            ...userHeaders(staffToken),
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            role: "owner",
            can_manage_products: true,
            can_manage_accounts: true,
            can_view_reports: true,
            can_create_transaction: true,
          }),
        },
      );

      await expectRestMutationBlocked(res);

      const after = await getMember(orgId, staffId);
      expect(after.role).toBe(before.role);
      expect(after.can_manage_products).toBe(before.can_manage_products);
      expect(after.can_manage_accounts).toBe(before.can_manage_accounts);
      expect(after.can_view_reports).toBe(before.can_view_reports);
      expect(after.can_create_transaction).toBe(
        before.can_create_transaction,
      );
    });
  });

  // ── Cross-org: owner org A tidak bisa read/mutate org B ──────────────

  test.describe("Owner org A tidak bisa baca atau mutate org B", () => {
    let orgA: string;
    let orgB: string;
    let accountB: AccountRow;
    let productB: ProductRow;
    let transactionB: string;

    test.beforeAll(async () => {
      orgA = await seedOrganization(
        ownerId,
        e2eName("API Security Org A"),
        E2E_OWNER,
      );
      orgB = await seedOrganization(
        owner2Id,
        e2eName("API Security Org B"),
        E2E_OWNER2,
      );

      accountB = await getCashAccount(orgB);
      productB = await createProductAsServiceRole(orgB, "org-b");
      transactionB = await createTransactionAsUser(
        owner2Token,
        orgB,
        accountB.id,
        e2eName("Fixture transaksi org B"),
      );
    });

    test.afterAll(async () => {
      await deleteOrg(orgA);
      await deleteOrg(orgB);
    });

    test("owner org A tidak bisa SELECT accounts/products/transactions milik org B", async () => {
      const [accountsRes, productsRes, txRes] = await Promise.all([
        fetch(
          `${E2E.supabaseUrl}/rest/v1/accounts?organization_id=eq.${orgB}&select=id,name,organization_id`,
          { headers: userHeaders(ownerToken) },
        ),
        fetch(
          `${E2E.supabaseUrl}/rest/v1/products?organization_id=eq.${orgB}&select=id,name,organization_id`,
          { headers: userHeaders(ownerToken) },
        ),
        fetch(
          `${E2E.supabaseUrl}/rest/v1/transactions?organization_id=eq.${orgB}&select=id,description,organization_id`,
          { headers: userHeaders(ownerToken) },
        ),
      ]);

      expect(accountsRes.status).toBe(200);
      expect(productsRes.status).toBe(200);
      expect(txRes.status).toBe(200);

      const accountsBody = await accountsRes.json();
      const productsBody = await productsRes.json();
      const txBody = await txRes.json();

      expect(accountsBody).toEqual([]);
      expect(productsBody).toEqual([]);
      expect(txBody).toEqual([]);
    });

    test("owner org A tidak bisa UPDATE product org B via REST", async () => {
      const before = await getProductById(productB.id);
      expect(before).not.toBeNull();

      const res = await fetch(
        `${E2E.supabaseUrl}/rest/v1/products?id=eq.${productB.id}`,
        {
          method: "PATCH",
          headers: {
            ...userHeaders(ownerToken),
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            name: e2eName("Diambil owner A"),
          }),
        },
      );

      await expectRestMutationBlocked(res);

      const after = await getProductById(productB.id);
      expect(after).not.toBeNull();
      expect(after?.name).toBe(before?.name);
    });

    test("owner org A tidak bisa UPDATE account org B via REST", async () => {
      const before = await getAccountById(accountB.id);
      expect(before).not.toBeNull();

      const res = await fetch(
        `${E2E.supabaseUrl}/rest/v1/accounts?id=eq.${accountB.id}`,
        {
          method: "PATCH",
          headers: {
            ...userHeaders(ownerToken),
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            name: e2eName("Kas org B dibajak"),
          }),
        },
      );

      await expectRestMutationBlocked(res);

      const after = await getAccountById(accountB.id);
      expect(after).not.toBeNull();
      expect(after?.name).toBe(before?.name);
    });

    test("owner org A tidak bisa DELETE transaction org B via REST", async () => {
      const before = await getTransactionById(transactionB);
      expect(before).not.toBeNull();

      const res = await fetch(
        `${E2E.supabaseUrl}/rest/v1/transactions?id=eq.${transactionB}`,
        {
          method: "DELETE",
          headers: {
            ...userHeaders(ownerToken),
            Prefer: "return=representation",
          },
        },
      );

      await expectRestMutationBlocked(res);

      const after = await getTransactionById(transactionB);
      expect(after).not.toBeNull();
      expect(after?.id).toBe(transactionB);
    });
  });

  // ── Anon tidak bisa akses RPC atau report sensitif ────────────────────

  test.describe("Anon tidak bisa akses RPC atau report sensitif", () => {
    let orgId: string;
    let cashAccount: AccountRow;

    test.beforeAll(async () => {
      orgId = await seedOrganization(
        ownerId,
        e2eName("API Security Anon"),
        E2E_OWNER,
      );
      cashAccount = await getCashAccount(orgId);
    });

    test.afterAll(async () => {
      await deleteOrg(orgId);
    });

    test("anon tidak bisa memanggil export_trial_balance_csv", async () => {
      const res = await fetch(
        `${E2E.supabaseUrl}/rest/v1/rpc/export_trial_balance_csv`,
        {
          method: "POST",
          headers: anonHeaders,
          body: JSON.stringify({
            p_organization_id: orgId,
            p_as_of_date: new Date().toISOString().split("T")[0],
          }),
        },
      );

      const body = await expectRpcForbidden(res);
      expect(
        typeof body === "string" ? body : JSON.stringify(body),
      ).not.toContain("Kode Akun");
    });

    test("anon tidak bisa memanggil post_transaction", async () => {
      const beforeCount = await countTransactions(orgId);

      const res = await fetch(
        `${E2E.supabaseUrl}/rest/v1/rpc/post_transaction`,
        {
          method: "POST",
          headers: anonHeaders,
          body: JSON.stringify({
            p_organization_id: orgId,
            p_transaction_date: new Date().toISOString().split("T")[0],
            p_transaction_type: "cash_sale",
            p_amount: 99000,
            p_payment_status: "paid",
            p_partial_amount: 0,
            p_description: e2eName("Anon bypass transaction"),
            p_cash_account_id: cashAccount.id,
            p_client_token: crypto.randomUUID(),
          }),
        },
      );

      await expectRpcForbidden(res);

      const afterCount = await countTransactions(orgId);
      expect(afterCount).toBe(beforeCount);
    });

    test("anon tidak bisa memanggil get_account_balance", async () => {
      const res = await fetch(
        `${E2E.supabaseUrl}/rest/v1/rpc/get_account_balance`,
        {
          method: "POST",
          headers: anonHeaders,
          body: JSON.stringify({
            p_account_id: cashAccount.id,
            p_as_of_date: new Date().toISOString().split("T")[0],
          }),
        },
      );

      await expectRpcForbidden(res);
    });
  });
});
