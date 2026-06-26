export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      account_mappings: {
        Row: {
          business_type: Database["public"]["Enums"]["business_type"]
          category_name: string
          created_at: string
          credit_account_id: string
          debit_account_id: string
          id: string
          is_system: boolean
          organization_id: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          business_type: Database["public"]["Enums"]["business_type"]
          category_name: string
          created_at?: string
          credit_account_id: string
          debit_account_id: string
          id?: string
          is_system?: boolean
          organization_id: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          business_type?: Database["public"]["Enums"]["business_type"]
          category_name?: string
          created_at?: string
          credit_account_id?: string
          debit_account_id?: string
          id?: string
          is_system?: boolean
          organization_id?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_mappings_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_mappings_credit_account_same_org_fkey"
            columns: ["organization_id", "credit_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "account_mappings_debit_account_id_fkey"
            columns: ["debit_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_mappings_debit_account_same_org_fkey"
            columns: ["organization_id", "debit_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "account_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          code: number
          created_at: string
          id: string
          is_active: boolean
          is_cash_account: boolean
          is_locked: boolean
          is_system: boolean
          name: string
          normal_balance: Database["public"]["Enums"]["normal_balance"]
          organization_id: string
          parent_account_id: string | null
          report_group: string | null
          updated_at: string
        }
        Insert: {
          account_type: Database["public"]["Enums"]["account_type"]
          code: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_cash_account?: boolean
          is_locked?: boolean
          is_system?: boolean
          name: string
          normal_balance: Database["public"]["Enums"]["normal_balance"]
          organization_id: string
          parent_account_id?: string | null
          report_group?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          code?: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_cash_account?: boolean
          is_locked?: boolean
          is_system?: boolean
          name?: string
          normal_balance?: Database["public"]["Enums"]["normal_balance"]
          organization_id?: string
          parent_account_id?: string | null
          report_group?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          organization_id: string
          transaction_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          organization_id: string
          transaction_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          organization_id?: string
          transaction_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "general_ledger"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "attachments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_transaction_same_org_fkey"
            columns: ["organization_id", "transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          organization_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          organization_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          organization_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          from_plan: string | null
          from_status: string | null
          id: string
          metadata: Json | null
          organization_id: string
          payment_provider: string | null
          provider_event_id: string | null
          to_plan: string | null
          to_status: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          from_plan?: string | null
          from_status?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          payment_provider?: string | null
          provider_event_id?: string | null
          to_plan?: string | null
          to_status?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          from_plan?: string | null
          from_status?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          payment_provider?: string | null
          provider_event_id?: string | null
          to_plan?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          description: string
          entry_date: string
          entry_number: string
          entry_type: Database["public"]["Enums"]["journal_entry_type"]
          id: string
          organization_id: string
          posted_at: string | null
          posted_by: string | null
          reversal_reason: string | null
          reversed_entry_id: string | null
          status: Database["public"]["Enums"]["journal_entry_status"]
          transaction_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string
          entry_date: string
          entry_number: string
          entry_type?: Database["public"]["Enums"]["journal_entry_type"]
          id?: string
          organization_id: string
          posted_at?: string | null
          posted_by?: string | null
          reversal_reason?: string | null
          reversed_entry_id?: string | null
          status?: Database["public"]["Enums"]["journal_entry_status"]
          transaction_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          entry_date?: string
          entry_number?: string
          entry_type?: Database["public"]["Enums"]["journal_entry_type"]
          id?: string
          organization_id?: string
          posted_at?: string | null
          posted_by?: string | null
          reversal_reason?: string | null
          reversed_entry_id?: string | null
          status?: Database["public"]["Enums"]["journal_entry_status"]
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_entry_id_fkey"
            columns: ["reversed_entry_id"]
            isOneToOne: false
            referencedRelation: "general_ledger"
            referencedColumns: ["journal_entry_id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_entry_id_fkey"
            columns: ["reversed_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "general_ledger"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "journal_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_transaction_same_org_fkey"
            columns: ["organization_id", "transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          description: string
          id: string
          journal_entry_id: string
          line_order: number
          organization_id: string
          party_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string
          id?: string
          journal_entry_id: string
          line_order?: number
          organization_id: string
          party_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string
          id?: string
          journal_entry_id?: string
          line_order?: number
          organization_id?: string
          party_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_account_same_org_fkey"
            columns: ["organization_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "journal_lines_entry_same_org_fkey"
            columns: ["organization_id", "journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "general_ledger"
            referencedColumns: ["journal_entry_id"]
          },
          {
            foreignKeyName: "journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_party_same_org_fkey"
            columns: ["organization_id", "party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          created_at: string | null
          email: string
          error_message: string | null
          id: string
          ip_address: unknown
          success: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      organization_document_counters: {
        Row: {
          counter_name: string
          current_value: number
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          counter_name: string
          current_value?: number
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          counter_name?: string
          current_value?: number
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_document_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          role: string
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          organization_id: string
          role?: string
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          role?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          can_create_transaction: boolean
          can_manage_accounts: boolean
          can_manage_products: boolean | null
          can_view_audit_log: boolean
          can_view_reports: boolean
          can_void_transaction: boolean
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          can_create_transaction?: boolean
          can_manage_accounts?: boolean
          can_manage_products?: boolean | null
          can_view_audit_log?: boolean
          can_view_reports?: boolean
          can_void_transaction?: boolean
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          can_create_transaction?: boolean
          can_manage_accounts?: boolean
          can_manage_products?: boolean | null
          can_view_audit_log?: boolean
          can_view_reports?: boolean
          can_void_transaction?: boolean
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          base_currency: string
          books_start_date: string
          business_type: Database["public"]["Enums"]["business_type"]
          cancel_at: string | null
          canceled_at: string | null
          created_at: string
          created_by: string
          current_period_end: string | null
          current_period_start: string | null
          current_plan: Database["public"]["Enums"]["org_plan"]
          default_reporting_period: Database["public"]["Enums"]["reporting_period"]
          id: string
          locked_through_date: string | null
          name: string
          onboarding_status: Database["public"]["Enums"]["onboarding_status"]
          payment_provider: string | null
          payment_provider_customer_id: string | null
          payment_provider_subscription_id: string | null
          subscription_status: string | null
          suspended_at: string | null
          suspension_reason: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          base_currency?: string
          books_start_date?: string
          business_type: Database["public"]["Enums"]["business_type"]
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          created_by: string
          current_period_end?: string | null
          current_period_start?: string | null
          current_plan?: Database["public"]["Enums"]["org_plan"]
          default_reporting_period?: Database["public"]["Enums"]["reporting_period"]
          id?: string
          locked_through_date?: string | null
          name: string
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"]
          payment_provider?: string | null
          payment_provider_customer_id?: string | null
          payment_provider_subscription_id?: string | null
          subscription_status?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          base_currency?: string
          books_start_date?: string
          business_type?: Database["public"]["Enums"]["business_type"]
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          created_by?: string
          current_period_end?: string | null
          current_period_start?: string | null
          current_plan?: Database["public"]["Enums"]["org_plan"]
          default_reporting_period?: Database["public"]["Enums"]["reporting_period"]
          id?: string
          locked_through_date?: string | null
          name?: string
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"]
          payment_provider?: string | null
          payment_provider_customer_id?: string | null
          payment_provider_subscription_id?: string | null
          subscription_status?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      parties: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          organization_id: string
          party_type: Database["public"]["Enums"]["party_type"]
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          organization_id: string
          party_type?: Database["public"]["Enums"]["party_type"]
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          organization_id?: string
          party_type?: Database["public"]["Enums"]["party_type"]
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          code: string
          cogs_account_id: string | null
          created_at: string | null
          created_by: string | null
          current_stock: number | null
          description: string | null
          id: string
          inventory_account_id: string | null
          is_active: boolean | null
          min_stock: number | null
          name: string
          organization_id: string
          purchase_price: number | null
          revenue_account_id: string | null
          selling_price: number | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          cogs_account_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_stock?: number | null
          description?: string | null
          id?: string
          inventory_account_id?: string | null
          is_active?: boolean | null
          min_stock?: number | null
          name: string
          organization_id: string
          purchase_price?: number | null
          revenue_account_id?: string | null
          selling_price?: number | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          cogs_account_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_stock?: number | null
          description?: string | null
          id?: string
          inventory_account_id?: string | null
          is_active?: boolean | null
          min_stock?: number | null
          name?: string
          organization_id?: string
          purchase_price?: number | null
          revenue_account_id?: string | null
          selling_price?: number | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_cogs_account_id_fkey"
            columns: ["cogs_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_cogs_account_same_org_fkey"
            columns: ["organization_id", "cogs_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "products_inventory_account_id_fkey"
            columns: ["inventory_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_inventory_account_same_org_fkey"
            columns: ["organization_id", "inventory_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_revenue_account_id_fkey"
            columns: ["revenue_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_revenue_account_same_org_fkey"
            columns: ["organization_id", "revenue_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action: string
          attempts: number | null
          created_at: string | null
          id: string
          identifier: string
          organization_id: string | null
          window_start: string | null
        }
        Insert: {
          action: string
          attempts?: number | null
          created_at?: string | null
          id?: string
          identifier: string
          organization_id?: string | null
          window_start?: string | null
        }
        Update: {
          action?: string
          attempts?: number | null
          created_at?: string | null
          id?: string
          identifier?: string
          organization_id?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_limits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          movement_date: string
          movement_type: string
          notes: string | null
          organization_id: string
          product_id: string
          quantity: number
          stock_after: number
          transaction_id: string | null
          unit_cost: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          movement_date: string
          movement_type: string
          notes?: string | null
          organization_id: string
          product_id: string
          quantity: number
          stock_after: number
          transaction_id?: string | null
          unit_cost?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          movement_date?: string
          movement_type?: string
          notes?: string | null
          organization_id?: string
          product_id?: string
          quantity?: number
          stock_after?: number
          transaction_id?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_same_org_fkey"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "stock_movements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "general_ledger"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "stock_movements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_transaction_same_org_fkey"
            columns: ["organization_id", "transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          cash_account_id: string | null
          category_name: string | null
          client_token: string | null
          created_at: string
          created_by: string
          description: string
          destination_cash_account_id: string | null
          due_date: string | null
          id: string
          notes: string | null
          organization_id: string
          original_transaction_id: string | null
          party_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          posted_at: string | null
          posted_by: string | null
          product_id: string | null
          quantity: number | null
          reversal_transaction_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          transaction_date: string
          transaction_number: string
          transaction_type: string
          unit_price: number | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          cash_account_id?: string | null
          category_name?: string | null
          client_token?: string | null
          created_at?: string
          created_by: string
          description?: string
          destination_cash_account_id?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          original_transaction_id?: string | null
          party_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          posted_at?: string | null
          posted_by?: string | null
          product_id?: string | null
          quantity?: number | null
          reversal_transaction_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_date: string
          transaction_number: string
          transaction_type: string
          unit_price?: number | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          cash_account_id?: string | null
          category_name?: string | null
          client_token?: string | null
          created_at?: string
          created_by?: string
          description?: string
          destination_cash_account_id?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          original_transaction_id?: string | null
          party_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          posted_at?: string | null
          posted_by?: string | null
          product_id?: string | null
          quantity?: number | null
          reversal_transaction_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_date?: string
          transaction_number?: string
          transaction_type?: string
          unit_price?: number | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cash_account_same_org_fkey"
            columns: ["organization_id", "cash_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "transactions_destination_cash_account_id_fkey"
            columns: ["destination_cash_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_destination_cash_account_same_org_fkey"
            columns: ["organization_id", "destination_cash_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_original_transaction_id_fkey"
            columns: ["original_transaction_id"]
            isOneToOne: false
            referencedRelation: "general_ledger"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transactions_original_transaction_id_fkey"
            columns: ["original_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_party_same_org_fkey"
            columns: ["organization_id", "party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_product_same_org_fkey"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "transactions_reversal_transaction_id_fkey"
            columns: ["reversal_transaction_id"]
            isOneToOne: false
            referencedRelation: "general_ledger"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transactions_reversal_transaction_id_fkey"
            columns: ["reversal_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      general_ledger: {
        Row: {
          account_code: number | null
          account_id: string | null
          account_name: string | null
          account_type: Database["public"]["Enums"]["account_type"] | null
          credit: number | null
          debit: number | null
          description: string | null
          entry_date: string | null
          entry_number: string | null
          journal_entry_id: string | null
          normal_balance: Database["public"]["Enums"]["normal_balance"] | null
          organization_id: string | null
          party_name: string | null
          running_balance: number | null
          signed_amount: number | null
          transaction_id: string | null
          transaction_number: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_account_same_org_fkey"
            columns: ["organization_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "journal_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: Json }
      admin_get_organization: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      admin_list_organizations: { Args: { p_search?: string }; Returns: Json }
      admin_set_suspension: {
        Args: {
          p_organization_id: string
          p_reason?: string
          p_suspended: boolean
        }
        Returns: Json
      }
      admin_update_plan: {
        Args: { p_new_plan: string; p_organization_id: string }
        Returns: Json
      }
      check_rate_limit: {
        Args: {
          p_action: string
          p_identifier: string
          p_max_attempts?: number
          p_window_seconds?: number
        }
        Returns: boolean
      }
      create_default_accounts: {
        Args: { p_org_id: string; p_org_name: string }
        Returns: number
      }
      create_invitation: {
        Args: { p_email: string; p_organization_id: string }
        Returns: Json
      }
      create_organization_with_opening_balances: {
        Args: {
          p_books_start_date: string
          p_business_type: Database["public"]["Enums"]["business_type"]
          p_default_cash_account_name?: string
          p_extra_opening_balances?: Json
          p_opening_cash_balance?: number
          p_organization_name: string
        }
        Returns: Json
      }
      create_organization_with_template: {
        Args: {
          p_books_start_date: string
          p_business_type: Database["public"]["Enums"]["business_type"]
          p_default_cash_account_name?: string
          p_opening_cash_balance?: number
          p_organization_name: string
        }
        Returns: Json
      }
      export_accounts_csv: {
        Args: { p_organization_id: string }
        Returns: string
      }
      export_balance_sheet_csv: {
        Args: { p_as_of_date?: string; p_organization_id: string }
        Returns: string
      }
      export_general_ledger_csv: {
        Args: {
          p_account_id?: string
          p_from_date?: string
          p_organization_id: string
          p_to_date?: string
        }
        Returns: string
      }
      export_products_csv: {
        Args: { p_organization_id: string }
        Returns: string
      }
      export_profit_loss_csv: {
        Args: {
          p_from_date?: string
          p_organization_id: string
          p_to_date?: string
        }
        Returns: string
      }
      export_transactions_csv: {
        Args: {
          p_from_date?: string
          p_organization_id: string
          p_to_date?: string
        }
        Returns: string
      }
      export_trial_balance_csv: {
        Args: { p_as_of_date?: string; p_organization_id: string }
        Returns: string
      }
      generate_entry_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_transaction_number:
        | { Args: { p_organization_id: string }; Returns: string }
        | {
            Args: { p_organization_id: string; p_transaction_date: string }
            Returns: string
          }
      get_account_balance: {
        Args: { p_account_id: string; p_as_of_date?: string }
        Returns: number
      }
      get_account_by_code: {
        Args: { p_code: number; p_org_id: string }
        Returns: string
      }
      get_balance_sheet: {
        Args: { p_as_of_date: string; p_organization_id: string }
        Returns: {
          account_code: number
          account_name: string
          amount: number
          section: string
        }[]
      }
      get_dashboard_summary: {
        Args: {
          p_from_date?: string
          p_organization_id: string
          p_to_date?: string
        }
        Returns: Json
      }
      get_general_ledger: {
        Args: {
          p_account_id?: string
          p_from_date?: string
          p_organization_id: string
          p_to_date?: string
        }
        Returns: {
          account_code: number
          account_id: string
          account_name: string
          credit: number
          debit: number
          description: string
          entry_date: string
          entry_number: string
          journal_entry_id: string
          party_name: string
          running_balance: number
          transaction_id: string
          transaction_number: string
        }[]
      }
      get_invitations: { Args: { p_organization_id: string }; Returns: Json }
      get_monthly_summary: {
        Args: { p_month?: string; p_organization_id: string }
        Returns: Json
      }
      get_monthly_transaction_count: {
        Args: { p_org_id: string }
        Returns: number
      }
      get_monthly_usage: { Args: { p_org_id: string }; Returns: Json }
      get_next_counter: {
        Args: { p_counter_name: string; p_organization_id: string }
        Returns: number
      }
      get_org_role: { Args: { org_id: string }; Returns: string }
      get_product_info: { Args: { p_product_id: string }; Returns: Json }
      get_profit_loss: {
        Args: {
          p_from_date: string
          p_organization_id: string
          p_to_date: string
        }
        Returns: {
          account_code: number
          account_name: string
          amount: number
          section: string
        }[]
      }
      get_trial_balance: {
        Args: { p_as_of_date?: string; p_organization_id: string }
        Returns: {
          account_code: number
          account_id: string
          account_name: string
          account_type: string
          credit_total: number
          debit_total: number
          ending_credit: number
          ending_debit: number
          normal_balance: string
        }[]
      }
      has_permission: {
        Args: { p_org_id: string; p_permission: string }
        Returns: boolean
      }
      invite_staff: {
        Args: { p_email: string; p_organization_id: string }
        Returns: Json
      }
      is_email_rate_limited: {
        Args: {
          p_email: string
          p_lockout_minutes?: number
          p_max_attempts?: number
        }
        Returns: boolean
      }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      log_security_event: {
        Args: {
          p_action: string
          p_details?: Json
          p_ip_address?: unknown
          p_organization_id: string
          p_resource_id?: string
          p_resource_type?: string
          p_user_agent?: string
          p_user_id: string
        }
        Returns: string
      }
      post_opening_balance: {
        Args: {
          p_account_id: string
          p_amount: number
          p_description: string
          p_entry_date: string
          p_organization_id: string
        }
        Returns: Json
      }
      post_transaction: {
        Args: {
          p_amount: number
          p_cash_account_id?: string
          p_category_name?: string
          p_client_token?: string
          p_debit_account_id?: string
          p_description?: string
          p_destination_cash_account_id?: string
          p_due_date?: string
          p_notes?: string
          p_organization_id: string
          p_partial_amount?: number
          p_party_id?: string
          p_party_name?: string
          p_payment_status?: string
          p_product_id?: string
          p_quantity?: number
          p_transaction_date: string
          p_transaction_type: string
          p_unit_price?: number
        }
        Returns: Json
      }
      recalculate_product_average_cost: {
        Args: { p_product_id: string }
        Returns: number
      }
      record_login_attempt: {
        Args: {
          p_email: string
          p_error_message?: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      record_login_attempt_pre_auth: {
        Args: {
          p_email: string
          p_error_message?: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      record_stock_movement: {
        Args: {
          p_movement_date: string
          p_movement_type: string
          p_notes?: string
          p_organization_id: string
          p_product_id: string
          p_quantity: number
          p_transaction_id?: string
          p_unit_cost?: number
        }
        Returns: string
      }
      remove_staff: {
        Args: { p_member_id: string; p_organization_id: string }
        Returns: Json
      }
      rename_account: {
        Args: { p_account_id: string; p_new_name: string }
        Returns: Json
      }
      revoke_invitation: {
        Args: { p_invitation_id: string; p_organization_id: string }
        Returns: Json
      }
      set_period_lock: {
        Args: { p_locked_through_date: string; p_organization_id: string }
        Returns: Json
      }
      unlock_period_lock: { Args: { p_organization_id: string }; Returns: Json }
      update_organization_settings: {
        Args: {
          p_books_start_date?: string
          p_business_type?: Database["public"]["Enums"]["business_type"]
          p_default_reporting_period?: string
          p_name?: string
          p_organization_id: string
        }
        Returns: Json
      }
      update_product_stock: {
        Args: { p_product_id: string; p_quantity_delta: number }
        Returns: number
      }
      update_staff_permissions: {
        Args: {
          p_can_create_transaction?: boolean
          p_can_manage_accounts?: boolean
          p_can_manage_products?: boolean
          p_can_view_audit_log?: boolean
          p_can_view_reports?: boolean
          p_can_void_transaction?: boolean
          p_member_id: string
          p_organization_id: string
        }
        Returns: Json
      }
      validate_product_sale_accounts: {
        Args: { p_organization_id: string; p_product_id: string }
        Returns: undefined
      }
      void_transaction: {
        Args: {
          p_client_token?: string
          p_organization_id: string
          p_transaction_id: string
          p_void_date?: string
          p_void_reason: string
        }
        Returns: Json
      }
    }
    Enums: {
      account_type:
        | "asset"
        | "liability"
        | "equity"
        | "revenue"
        | "cogs"
        | "expense"
        | "other_income"
        | "other_expense"
      business_type: "service" | "simple_trading"
      journal_entry_status: "posted" | "voided" | "reversed"
      journal_entry_type:
        | "normal"
        | "opening_balance"
        | "adjustment"
        | "reversal"
      member_role: "owner" | "staff"
      member_status: "invited" | "active" | "removed"
      normal_balance: "debit" | "credit"
      onboarding_status: "not_started" | "in_progress" | "completed"
      org_plan:
        | "free"
        | "solo"
        | "business"
        | "trial"
        | "past_due"
        | "canceled"
        | "expired"
      party_type: "customer" | "supplier" | "employee" | "owner" | "other"
      payment_status: "paid" | "unpaid" | "partial"
      reporting_period: "monthly"
      transaction_status: "draft" | "posted" | "voided" | "reversed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: [
        "asset",
        "liability",
        "equity",
        "revenue",
        "cogs",
        "expense",
        "other_income",
        "other_expense",
      ],
      business_type: ["service", "simple_trading"],
      journal_entry_status: ["posted", "voided", "reversed"],
      journal_entry_type: [
        "normal",
        "opening_balance",
        "adjustment",
        "reversal",
      ],
      member_role: ["owner", "staff"],
      member_status: ["invited", "active", "removed"],
      normal_balance: ["debit", "credit"],
      onboarding_status: ["not_started", "in_progress", "completed"],
      org_plan: [
        "free",
        "solo",
        "business",
        "trial",
        "past_due",
        "canceled",
        "expired",
      ],
      party_type: ["customer", "supplier", "employee", "owner", "other"],
      payment_status: ["paid", "unpaid", "partial"],
      reporting_period: ["monthly"],
      transaction_status: ["draft", "posted", "voided", "reversed"],
    },
  },
} as const

