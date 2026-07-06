import { describe, expect, it } from "vitest";
import type { Database, Json } from "@ledjer/database-types";

type Functions = Database["public"]["Functions"];
type RpcArgs<Name extends keyof Functions> =
  Functions[Name] extends { Args: infer Args } ? Args : never;
type UpdateStaffPermissionsArgs = Extract<
  Functions["update_staff_permissions"],
  { Args: { p_can_manage_products?: boolean } }
>["Args"];

const uuid = "00000000-0000-0000-0000-000000000000";
const isoDate = "2026-01-01";

const rpcArgsByName = {
  create_organization_with_opening_balances: {
    p_organization_name: "Typed Smoke Org",
    p_business_type: "simple_trading",
    p_books_start_date: isoDate,
    p_default_cash_account_name: "Kas",
    p_opening_cash_balance: 0,
    p_extra_opening_balances: [] satisfies Json,
  } satisfies RpcArgs<"create_organization_with_opening_balances">,

  accept_invitation: {
    p_token: "invite-token",
  } satisfies RpcArgs<"accept_invitation">,

  create_invitation: {
    p_organization_id: uuid,
    p_email: "staff@example.test",
  } satisfies RpcArgs<"create_invitation">,

  get_balance_sheet: {
    p_organization_id: uuid,
    p_as_of_date: isoDate,
  } satisfies RpcArgs<"get_balance_sheet">,

  get_dashboard_summary: {
    p_organization_id: uuid,
  } satisfies RpcArgs<"get_dashboard_summary">,

  get_general_ledger: {
    p_organization_id: uuid,
    p_account_id: uuid,
    p_from_date: isoDate,
    p_to_date: isoDate,
  } satisfies RpcArgs<"get_general_ledger">,

  get_profit_loss: {
    p_organization_id: uuid,
    p_from_date: isoDate,
    p_to_date: isoDate,
  } satisfies RpcArgs<"get_profit_loss">,

  get_trial_balance: {
    p_organization_id: uuid,
    p_as_of_date: isoDate,
  } satisfies RpcArgs<"get_trial_balance">,

  get_invitations: {
    p_organization_id: uuid,
  } satisfies RpcArgs<"get_invitations">,

  is_email_rate_limited: {
    p_email: "owner@example.test",
    p_max_attempts: 5,
    p_lockout_minutes: 15,
  } satisfies RpcArgs<"is_email_rate_limited">,

  post_transaction: {
    p_organization_id: uuid,
    p_transaction_date: isoDate,
    p_transaction_type: "cash_sale",
    p_amount: 1000,
    p_payment_status: "paid",
    p_partial_amount: 0,
    p_description: "typed smoke transaction",
    p_cash_account_id: uuid,
    p_party_name: "Pelanggan Test",
  } satisfies RpcArgs<"post_transaction">,

  record_login_attempt: {
    p_email: "owner@example.test",
    p_user_agent: "vitest",
  } satisfies RpcArgs<"record_login_attempt">,

  record_login_attempt_pre_auth: {
    p_email: "owner@example.test",
    p_user_agent: "vitest",
    p_error_message: "typed smoke failure",
  } satisfies RpcArgs<"record_login_attempt_pre_auth">,

  remove_staff: {
    p_organization_id: uuid,
    p_member_id: uuid,
  } satisfies RpcArgs<"remove_staff">,

  revoke_invitation: {
    p_organization_id: uuid,
    p_invitation_id: uuid,
  } satisfies RpcArgs<"revoke_invitation">,

  rename_account: {
    p_account_id: uuid,
    p_new_name: "Kas Operasional",
  } satisfies RpcArgs<"rename_account">,

  update_staff_permissions: {
    p_organization_id: uuid,
    p_member_id: uuid,
    p_can_create_transaction: true,
    p_can_view_reports: true,
    p_can_manage_accounts: false,
    p_can_void_transaction: true,
    p_can_manage_products: true,
    p_can_view_audit_log: false,
  } satisfies UpdateStaffPermissionsArgs,

  void_transaction: {
    p_organization_id: uuid,
    p_transaction_id: uuid,
    p_void_reason: "typed smoke void",
    p_void_date: isoDate,
  } satisfies RpcArgs<"void_transaction">,
};

describe("frontend RPC argument contracts", () => {
  it("covers every RPC called from apps/web/src", () => {
    expect(Object.keys(rpcArgsByName).sort()).toEqual([
      "accept_invitation",
      "create_invitation",
      "create_organization_with_opening_balances",
      "get_balance_sheet",
      "get_dashboard_summary",
      "get_general_ledger",
      "get_invitations",
      "get_profit_loss",
      "get_trial_balance",
      "is_email_rate_limited",
      "post_transaction",
      "record_login_attempt",
      "record_login_attempt_pre_auth",
      "remove_staff",
      "rename_account",
      "revoke_invitation",
      "update_staff_permissions",
      "void_transaction",
    ]);
  });
});
