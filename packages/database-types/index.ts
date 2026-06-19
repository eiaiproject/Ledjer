// Database types generated from Ledjer MVP schema
// Run `supabase gen types typescript --project-id cwuxalmxxbniethflxuz` to regenerate

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type business_type = "service" | "simple_trading";
export type account_type = "asset" | "liability" | "equity" | "revenue" | "cogs" | "expense" | "other_income" | "other_expense";
export type normal_balance = "debit" | "credit";
export type org_plan = "free" | "solo" | "business";
export type onboarding_status = "not_started" | "in_progress" | "completed";
export type member_role = "owner" | "staff";
export type member_status = "invited" | "active" | "removed";
export type payment_status = "paid" | "unpaid" | "partial";
export type transaction_status = "draft" | "posted" | "voided" | "reversed";
export type journal_entry_type = "normal" | "opening_balance" | "adjustment" | "reversal";
export type journal_entry_status = "posted" | "voided" | "reversed";
export type party_type = "customer" | "supplier" | "employee" | "owner" | "other";
export type reporting_period = "monthly";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string;
          email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name?: string;
          email?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          full_name?: string;
          email?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          business_type: business_type;
          base_currency: string;
          books_start_date: string;
          default_reporting_period: reporting_period;
          onboarding_status: onboarding_status;
          current_plan: org_plan;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          business_type: business_type;
          base_currency?: string;
          books_start_date: string;
          default_reporting_period?: reporting_period;
          onboarding_status?: onboarding_status;
          current_plan?: org_plan;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          business_type?: business_type;
          base_currency?: string;
          books_start_date?: string;
          onboarding_status?: onboarding_status;
          current_plan?: org_plan;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: member_role;
          status: member_status;
          can_create_transaction: boolean;
          can_view_reports: boolean;
          can_manage_accounts: boolean;
          can_void_transaction: boolean;
          can_view_audit_log: boolean;
          can_manage_products: boolean;
          invited_by: string | null;
          joined_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: member_role;
          status?: member_status;
          can_create_transaction?: boolean;
          can_view_reports?: boolean;
          can_manage_accounts?: boolean;
          can_void_transaction?: boolean;
          can_view_audit_log?: boolean;
          can_manage_products?: boolean;
          invited_by?: string | null;
          joined_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          user_id?: string;
          role?: member_role;
          status?: member_status;
          can_create_transaction?: boolean;
          can_view_reports?: boolean;
          can_manage_accounts?: boolean;
          can_void_transaction?: boolean;
          can_view_audit_log?: boolean;
          can_manage_products?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          organization_id: string;
          code: number;
          name: string;
          account_type: account_type;
          normal_balance: normal_balance;
          parent_account_id: string | null;
          is_system: boolean;
          is_locked: boolean;
          is_cash_account: boolean;
          is_active: boolean;
          report_group: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          code: number;
          name: string;
          account_type: account_type;
          normal_balance: normal_balance;
          parent_account_id?: string | null;
          is_system?: boolean;
          is_locked?: boolean;
          is_cash_account?: boolean;
          is_active?: boolean;
          report_group?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          code?: number;
          name?: string;
          account_type?: account_type;
          normal_balance?: normal_balance;
          is_cash_account?: boolean;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      account_mappings: {
        Row: {
          id: string;
          organization_id: string;
          business_type: business_type;
          transaction_type: string;
          category_name: string;
          debit_account_id: string;
          credit_account_id: string;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          business_type: business_type;
          transaction_type: string;
          category_name: string;
          debit_account_id: string;
          credit_account_id: string;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          category_name?: string;
          debit_account_id?: string;
          credit_account_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      parties: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          party_type: party_type;
          email: string | null;
          phone: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          party_type?: party_type;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          party_type?: party_type;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          organization_id: string;
          transaction_number: string;
          transaction_date: string;
          transaction_type: string;
          amount: number;
          party_id: string | null;
          category_name: string | null;
          cash_account_id: string | null;
          destination_cash_account_id: string | null;
          payment_status: payment_status;
          due_date: string | null;
          description: string;
          notes: string | null;
          product_id: string | null;
          quantity: number | null;
          unit_price: number | null;
          status: transaction_status;
          posted_at: string | null;
          posted_by: string | null;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
          original_transaction_id: string | null;
          reversal_transaction_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          transaction_number: string;
          transaction_date: string;
          transaction_type: string;
          amount: number;
          party_id?: string | null;
          category_name?: string | null;
          cash_account_id?: string | null;
          destination_cash_account_id?: string | null;
          payment_status?: payment_status;
          due_date?: string | null;
          description?: string;
          notes?: string | null;
          product_id?: string | null;
          quantity?: number | null;
          unit_price?: number | null;
          status?: transaction_status;
          posted_at?: string | null;
          posted_by?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          original_transaction_id?: string | null;
          reversal_transaction_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          transaction_date?: string;
          transaction_type?: string;
          amount?: number;
          party_id?: string | null;
          category_name?: string | null;
          cash_account_id?: string | null;
          destination_cash_account_id?: string | null;
          payment_status?: payment_status;
          due_date?: string | null;
          description?: string;
          notes?: string | null;
          product_id?: string | null;
          quantity?: number | null;
          unit_price?: number | null;
          status?: transaction_status;
          posted_at?: string | null;
          posted_by?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          original_transaction_id?: string | null;
          reversal_transaction_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      journal_entries: {
        Row: {
          id: string;
          organization_id: string;
          entry_number: string;
          entry_date: string;
          entry_type: journal_entry_type;
          transaction_id: string | null;
          description: string;
          status: journal_entry_status;
          reversed_entry_id: string | null;
          reversal_reason: string | null;
          posted_at: string | null;
          posted_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          entry_number: string;
          entry_date: string;
          entry_type?: journal_entry_type;
          transaction_id?: string | null;
          description?: string;
          status?: journal_entry_status;
          reversed_entry_id?: string | null;
          reversal_reason?: string | null;
          posted_at?: string | null;
          posted_by?: string | null;
          created_at?: string;
        };
        Update: {
          entry_number?: string;
          entry_date?: string;
          entry_type?: journal_entry_type;
          transaction_id?: string | null;
          description?: string;
          status?: journal_entry_status;
          reversed_entry_id?: string | null;
          reversal_reason?: string | null;
          posted_at?: string | null;
          posted_by?: string | null;
        };
        Relationships: [];
      };
      journal_lines: {
        Row: {
          id: string;
          organization_id: string;
          journal_entry_id: string;
          account_id: string;
          party_id: string | null;
          debit: number;
          credit: number;
          description: string;
          line_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          journal_entry_id: string;
          account_id: string;
          party_id?: string | null;
          debit?: number;
          credit?: number;
          description?: string;
          line_order?: number;
          created_at?: string;
        };
        Update: {
          journal_entry_id?: string;
          account_id?: string;
          party_id?: string | null;
          debit?: number;
          credit?: number;
          description?: string;
          line_order?: number;
        };
        Relationships: [];
      };
      attachments: {
        Row: {
          id: string;
          organization_id: string;
          transaction_id: string;
          file_path: string;
          file_name: string;
          file_type: string;
          file_size: number;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          transaction_id: string;
          file_path: string;
          file_name: string;
          file_type: string;
          file_size: number;
          uploaded_by: string;
          created_at?: string;
        };
        Update: {
          file_path?: string;
          file_name?: string;
          file_type?: string;
          file_size?: number;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          organization_id: string;
          actor_user_id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          before_data: Json | null;
          after_data: Json | null;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          actor_user_id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          before_data?: Json | null;
          after_data?: Json | null;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          before_data?: Json | null;
          after_data?: Json | null;
          reason?: string | null;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          name: string;
          description: string | null;
          unit: string;
          purchase_price: number;
          selling_price: number;
          current_stock: number;
          min_stock: number;
          inventory_account_id: string | null;
          cogs_account_id: string | null;
          revenue_account_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          code: string;
          name: string;
          description?: string | null;
          unit?: string;
          purchase_price?: number;
          selling_price?: number;
          current_stock?: number;
          min_stock?: number;
          inventory_account_id?: string | null;
          cogs_account_id?: string | null;
          revenue_account_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          organization_id?: string;
          code?: string;
          name?: string;
          description?: string | null;
          unit?: string;
          purchase_price?: number;
          selling_price?: number;
          current_stock?: number;
          min_stock?: number;
          inventory_account_id?: string | null;
          cogs_account_id?: string | null;
          revenue_account_id?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          id: string;
          organization_id: string;
          product_id: string;
          movement_date: string;
          movement_type: string;
          quantity: number;
          unit_cost: number | null;
          transaction_id: string | null;
          stock_after: number;
          notes: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          product_id: string;
          movement_date: string;
          movement_type: string;
          quantity: number;
          unit_cost?: number | null;
          transaction_id?: string | null;
          stock_after: number;
          notes?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          movement_date?: string;
          movement_type?: string;
          quantity?: number;
          unit_cost?: number | null;
          transaction_id?: string | null;
          stock_after?: number;
          notes?: string | null;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          id: string;
          organization_id: string | null;
          identifier: string;
          action: string;
          attempts: number;
          window_start: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          identifier: string;
          action: string;
          attempts?: number;
          window_start?: string;
          created_at?: string;
        };
        Update: {
          organization_id?: string | null;
          identifier?: string;
          action?: string;
          attempts?: number;
          window_start?: string;
        };
        Relationships: [];
      };
      login_attempts: {
        Row: {
          id: string;
          email: string;
          success: boolean;
          ip_address: string | null;
          user_agent: string | null;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          success?: boolean;
          ip_address?: string | null;
          user_agent?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          email?: string;
          success?: boolean;
          ip_address?: string | null;
          user_agent?: string | null;
          error_message?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_organization_with_template: {
        Args: {
          p_organization_name: string;
          p_business_type: business_type;
          p_books_start_date: string;
          p_default_cash_account_name?: string;
          p_opening_cash_balance?: number;
        };
        Returns: Json;
      };
      post_transaction: {
        Args: {
          p_organization_id: string;
          p_transaction_date: string;
          p_transaction_type: string;
          p_amount: number;
          p_party_id?: string | null;
          p_category_name?: string | null;
          p_cash_account_id?: string | null;
          p_destination_cash_account_id?: string | null;
          p_payment_status?: string;
          p_partial_amount?: number | null;
          p_due_date?: string | null;
          p_description?: string;
          p_notes?: string | null;
          p_product_id?: string | null;
          p_quantity?: number | null;
          p_unit_price?: number | null;
        };
        Returns: Json;
      };
      void_transaction: {
        Args: {
          p_organization_id: string;
          p_transaction_id: string;
          p_void_reason: string;
          p_void_date?: string | null;
        };
        Returns: Json;
      };
      invite_staff: {
        Args: {
          p_organization_id: string;
          p_email: string;
        };
        Returns: Json;
      };
      update_staff_permissions: {
        Args: {
          p_organization_id: string;
          p_member_id: string;
          p_can_create_transaction?: boolean | null;
          p_can_view_reports?: boolean | null;
          p_can_manage_accounts?: boolean | null;
          p_can_void_transaction?: boolean | null;
          p_can_view_audit_log?: boolean | null;
        };
        Returns: Json;
      };
      remove_staff: {
        Args: {
          p_organization_id: string;
          p_member_id: string;
        };
        Returns: Json;
      };
      check_rate_limit: {
        Args: {
          p_identifier: string;
          p_action: string;
          p_max_attempts?: number;
          p_window_seconds?: number;
        };
        Returns: boolean;
      };
      record_login_attempt: {
        Args: {
          p_email: string;
          p_success: boolean;
          p_ip_address?: string | null;
          p_user_agent?: string | null;
          p_error_message?: string | null;
        };
        Returns: undefined;
      };
      is_email_rate_limited: {
        Args: {
          p_email: string;
          p_max_attempts?: number;
          p_lockout_minutes?: number;
        };
        Returns: boolean;
      };
      log_security_event: {
        Args: {
          p_organization_id: string;
          p_user_id: string;
          p_action: string;
          p_resource_type?: string | null;
          p_resource_id?: string | null;
          p_details?: Json | null;
          p_ip_address?: string | null;
          p_user_agent?: string | null;
        };
        Returns: string;
      };
      get_general_ledger: {
        Args: {
          p_organization_id: string;
          p_account_id?: string | null;
          p_from_date?: string | null;
          p_to_date?: string | null;
        };
        Returns: {
          account_id: string;
          account_code: number;
          account_name: string;
          entry_date: string;
          journal_entry_id: string;
          entry_number: string;
          transaction_id: string;
          transaction_number: string;
          description: string;
          party_name: string;
          debit: number;
          credit: number;
          running_balance: number;
        }[];
      };
      get_trial_balance: {
        Args: {
          p_organization_id: string;
          p_as_of_date?: string | null;
        };
        Returns: {
          account_id: string;
          account_code: number;
          account_name: string;
          account_type: string;
          normal_balance: string;
          debit_total: number;
          credit_total: number;
          ending_debit: number;
          ending_credit: number;
        }[];
      };
      get_profit_loss: {
        Args: {
          p_organization_id: string;
          p_from_date: string;
          p_to_date: string;
        };
        Returns: {
          section: string;
          account_code: number;
          account_name: string;
          amount: number;
        }[];
      };
      get_balance_sheet: {
        Args: {
          p_organization_id: string;
          p_as_of_date: string;
        };
        Returns: {
          section: string;
          account_code: number;
          account_name: string;
          amount: number;
        }[];
      };
      get_dashboard_summary: {
        Args: {
          p_organization_id: string;
          p_from_date?: string | null;
          p_to_date?: string | null;
        };
        Returns: Json;
      };
      is_org_member: {
        Args: { org_id: string };
        Returns: boolean;
      };
      get_org_role: {
        Args: { org_id: string };
        Returns: string;
      };
      has_permission: {
        Args: { p_org_id: string; p_permission: string };
        Returns: boolean;
      };
      get_account_balance: {
        Args: { p_account_id: string; p_as_of_date?: string | null };
        Returns: number;
      };
      get_monthly_transaction_count: {
        Args: { p_org_id: string };
        Returns: number;
      };
      generate_transaction_number: {
        Args: { p_org_id: string };
        Returns: string;
      };
      generate_entry_number: {
        Args: { p_org_id: string };
        Returns: string;
      };
      create_default_accounts: {
        Args: { p_org_id: string; p_org_name: string };
        Returns: number;
      };
    };
    Enums: {
      business_type: business_type;
      account_type: account_type;
      normal_balance: normal_balance;
      org_plan: org_plan;
      onboarding_status: onboarding_status;
      member_role: member_role;
      member_status: member_status;
      payment_status: payment_status;
      transaction_status: transaction_status;
      journal_entry_type: journal_entry_type;
      journal_entry_status: journal_entry_status;
      party_type: party_type;
      reporting_period: reporting_period;
    };
  };
}
