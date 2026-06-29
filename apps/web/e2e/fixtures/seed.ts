/**
 * Test data seeding via Supabase Admin API or SQL.
 *
 * Only usable in local mode (service-role key required).
 * All data is E2E-prefixed for safe cleanup.
 */
import { E2E, e2eName } from "./env";
import { ALL_TEST_USERS, E2E_OWNER, type TestUser } from "./users";

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

/**
 * Create a confirmed auth user via Supabase Admin API.
 * Idempotent: if user already exists, returns the existing user ID.
 *
 * NOTE on pagination: GoTrue's `/auth/v1/admin/users?page=&per_page=` returns
 * the most recent users first, capped at `per_page` per page. When the auth
 * schema has hundreds of leftover users (very common in long-running local
 * stacks), page 1 does NOT contain the user we just searched for and the
 * fallback would throw. We instead paginate until we find the email or
 * exhaust all pages. ponytail: ceiling is fine at small N; if the table ever
 * holds >5k users, switch to a GoTrue SQL helper or a server-side FILTER.
 */
export async function ensureTestUser(user: TestUser): Promise<string> {
  // Try to create user
  const res = await fetch(`${E2E.supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: SR_HEADERS,
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    }),
  });

  if (res.ok) {
    const data = await res.json();
    return data.id;
  }

  if (res.status !== 422 && res.status !== 409) {
    throw new Error(`Failed to ensure test user ${user.email}: ${res.status} ${await res.text()}`);
  }

  // Idempotency path: paginate through all admin users until we find this email.
  const PER_PAGE = 200;
  for (let page = 1; page <= 20; page++) {
    const listRes = await fetch(
      `${E2E.supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=${PER_PAGE}`,
      { headers: SR_HEADERS },
    );
    if (!listRes.ok) break;
    const listData = await listRes.json();
    const users = listData.users ?? [];
    const existing = users.find(
      (u: { email: string }) => u.email === user.email,
    );
    if (existing) return existing.id;
    if (users.length < PER_PAGE) break; // last page
  }
  throw new Error(`User ${user.email} reported as duplicate but not found via admin API.`);
}

/**
 * Seed all test users.
 */
export async function seedAllUsers(): Promise<void> {
  for (const user of ALL_TEST_USERS) {
    await ensureTestUser(user);
  }
}

/**
 * Login as a user and return the access token.
 * Uses Supabase Auth /auth/v1/token?grant_type=password.
 */
export async function loginUser(user: TestUser): Promise<string> {
  const res = await fetch(
    `${E2E.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: E2E.supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: user.email, password: user.password }),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to login ${user.email}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

/**
 * Create an organization for the owner user with completed onboarding.
 * Uses the create_organization_with_opening_balances RPC.
 * Requires user JWT (auth.uid() must be set).
 */
export async function seedOrganization(
  _userId: string,
  orgName: string = e2eName("Toko Otomatis"),
  owner: TestUser = E2E_OWNER,
): Promise<string> {
  // RPC needs auth.uid() — login as owner to get user JWT
  const userToken = await loginUser(owner);
  const userHeaders = {
    apikey: E2E.supabaseAnonKey,
    Authorization: `Bearer ${userToken}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/rpc/create_organization_with_opening_balances`,
    {
      method: "POST",
      headers: userHeaders,
      body: JSON.stringify({
        p_organization_name: orgName,
        p_business_type: "simple_trading",
        p_books_start_date: new Date().toISOString().split("T")[0],
        p_default_cash_account_name: "Kas Utama",
        p_opening_cash_balance: 10_000_000,
        p_extra_opening_balances: [],
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to seed organization: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.organization_id as string;
}

/**
 * Add staff member to organization.
 */
export async function seedStaffMember(
  orgId: string,
  staffUserId: string,
  permissions: {
    can_create_transaction?: boolean;
    can_view_reports?: boolean;
    can_manage_accounts?: boolean;
    can_void_transaction?: boolean;
    can_manage_products?: boolean;
  } = {},
): Promise<void> {
  const res = await fetch(`${E2E.supabaseUrl}/rest/v1/organization_members`, {
    method: "POST",
    headers: SR_HEADERS,
    body: JSON.stringify({
      organization_id: orgId,
      user_id: staffUserId,
      role: "staff",
      status: "active",
      can_create_transaction: permissions.can_create_transaction ?? false,
      can_view_reports: permissions.can_view_reports ?? false,
      can_manage_accounts: permissions.can_manage_accounts ?? false,
      can_void_transaction: permissions.can_void_transaction ?? false,
      can_manage_products: permissions.can_manage_products ?? false,
      can_view_audit_log: false,
      invited_by: staffUserId,
      joined_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to seed staff member: ${res.status} ${await res.text()}`);
  }
}

/**
 * Seed a cash sale transaction for the org.
 * Uses the post_transaction RPC (requires user JWT).
 */
export async function seedTransaction(
  orgId: string,
  params: {
    type?: string;
    amount?: number;
    description?: string;
    date?: string;
    paymentStatus?: string;
  } = {},
): Promise<string> {
  const userToken = await loginUser(E2E_OWNER);
  const userHeaders = {
    apikey: E2E.supabaseAnonKey,
    Authorization: `Bearer ${userToken}`,
    "Content-Type": "application/json",
  };

  // Find the cash account for this org
  const acctRes = await fetch(
    `${E2E.supabaseUrl}/rest/v1/accounts?organization_id=eq.${orgId}&is_cash_account=eq.true&select=id&limit=1`,
    { headers: { ...userHeaders, Prefer: "return=representation" } },
  );
  const accts = await acctRes.json();
  const cashAccountId = accts?.[0]?.id;

  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/rpc/post_transaction`,
    {
      method: "POST",
      headers: userHeaders,
      body: JSON.stringify({
        p_organization_id: orgId,
        p_transaction_date: params.date || new Date().toISOString().split("T")[0],
        p_transaction_type: params.type || "cash_sale",
        p_amount: params.amount || 50_000,
        p_payment_status: params.paymentStatus || "paid",
        p_partial_amount: 0,
        p_description: params.description || e2eName("Penjualan tunai test"),
        p_cash_account_id: cashAccountId,
        p_client_token: crypto.randomUUID(),
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to seed transaction: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.transaction_id as string;
}

/**
 * Full seed: users + org + staff + transaction. Returns orgId.
 */
export async function fullSeed(): Promise<string> {
  const ownerId = await ensureTestUser(E2E_OWNER);
  const staffId = await ensureTestUser(ALL_TEST_USERS[1]);
  const orgId = await seedOrganization(ownerId);
  await seedStaffMember(orgId, staffId, {
    can_create_transaction: true,
    can_view_reports: true,
    can_manage_products: true,
  });
  await seedTransaction(orgId);
  return orgId;
}
