export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounting_account_balances: {
        Row: {
          account_id: string
          balance: number
          last_ledger_seq: number | null
          updated_at: string
          version: number
        }
        Insert: {
          account_id: string
          balance?: number
          last_ledger_seq?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          account_id?: string
          balance?: number
          last_ledger_seq?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "accounting_account_balances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounting_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_account_balances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "v_accounting_account_activity"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "accounting_account_balances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "v_accounting_balance_reconstruction"
            referencedColumns: ["account_id"]
          },
        ]
      }
      accounting_accounts: {
        Row: {
          account_code: string
          account_type: Database["public"]["Enums"]["acct_account_type"]
          closed_at: string | null
          created_at: string
          currency_or_unit: string
          environment: Database["public"]["Enums"]["acct_environment"]
          id: string
          metadata: Json
          normal_balance: Database["public"]["Enums"]["acct_normal_balance"]
          product: string | null
          status: Database["public"]["Enums"]["acct_account_status"]
          user_id: string | null
        }
        Insert: {
          account_code: string
          account_type: Database["public"]["Enums"]["acct_account_type"]
          closed_at?: string | null
          created_at?: string
          currency_or_unit?: string
          environment?: Database["public"]["Enums"]["acct_environment"]
          id?: string
          metadata?: Json
          normal_balance: Database["public"]["Enums"]["acct_normal_balance"]
          product?: string | null
          status?: Database["public"]["Enums"]["acct_account_status"]
          user_id?: string | null
        }
        Update: {
          account_code?: string
          account_type?: Database["public"]["Enums"]["acct_account_type"]
          closed_at?: string | null
          created_at?: string
          currency_or_unit?: string
          environment?: Database["public"]["Enums"]["acct_environment"]
          id?: string
          metadata?: Json
          normal_balance?: Database["public"]["Enums"]["acct_normal_balance"]
          product?: string | null
          status?: Database["public"]["Enums"]["acct_account_status"]
          user_id?: string | null
        }
        Relationships: []
      }
      accounting_correction_proposals: {
        Row: {
          amount: number
          applied_at: string | null
          applied_result: Json | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          direction: string
          id: string
          proposed_by: string | null
          proposed_txn_type:
            | Database["public"]["Enums"]["platform_txn_type"]
            | null
          rationale: string
          reconciliation_item_id: string | null
          scope: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          applied_at?: string | null
          applied_result?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          direction: string
          id?: string
          proposed_by?: string | null
          proposed_txn_type?:
            | Database["public"]["Enums"]["platform_txn_type"]
            | null
          rationale: string
          reconciliation_item_id?: string | null
          scope?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          applied_at?: string | null
          applied_result?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          direction?: string
          id?: string
          proposed_by?: string | null
          proposed_txn_type?:
            | Database["public"]["Enums"]["platform_txn_type"]
            | null
          rationale?: string
          reconciliation_item_id?: string | null
          scope?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_correction_proposals_reconciliation_item_id_fkey"
            columns: ["reconciliation_item_id"]
            isOneToOne: false
            referencedRelation: "accounting_reconciliation_items"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_cutover_batches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          cutover_timestamp: string
          environment: Database["public"]["Enums"]["acct_environment"]
          id: string
          legacy_ledger_last_sequence: number | null
          live_bankroll_balance: number
          metadata: Json
          open_arcade_stakes: number
          open_gross_payout_exposure: number
          open_reserved_liability: number
          open_sports_stakes: number
          pending_correction_amount: number
          pending_correction_reference: string | null
          reconstructed_bankroll_balance: number | null
          snapshot: Json
          snapshot_hash: string | null
          status: Database["public"]["Enums"]["acct_cutover_status"]
          supersede_reason: string | null
          superseded_at: string | null
          superseded_by: string | null
          total_user_wallet_balance: number
          user_count: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          cutover_timestamp?: string
          environment?: Database["public"]["Enums"]["acct_environment"]
          id?: string
          legacy_ledger_last_sequence?: number | null
          live_bankroll_balance: number
          metadata?: Json
          open_arcade_stakes?: number
          open_gross_payout_exposure?: number
          open_reserved_liability?: number
          open_sports_stakes?: number
          pending_correction_amount?: number
          pending_correction_reference?: string | null
          reconstructed_bankroll_balance?: number | null
          snapshot?: Json
          snapshot_hash?: string | null
          status?: Database["public"]["Enums"]["acct_cutover_status"]
          supersede_reason?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
          total_user_wallet_balance: number
          user_count: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          cutover_timestamp?: string
          environment?: Database["public"]["Enums"]["acct_environment"]
          id?: string
          legacy_ledger_last_sequence?: number | null
          live_bankroll_balance?: number
          metadata?: Json
          open_arcade_stakes?: number
          open_gross_payout_exposure?: number
          open_reserved_liability?: number
          open_sports_stakes?: number
          pending_correction_amount?: number
          pending_correction_reference?: string | null
          reconstructed_bankroll_balance?: number | null
          snapshot?: Json
          snapshot_hash?: string | null
          status?: Database["public"]["Enums"]["acct_cutover_status"]
          supersede_reason?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
          total_user_wallet_balance?: number
          user_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "accounting_cutover_batches_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "accounting_cutover_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_cutover_batches_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "v_accounting_cutover_status"
            referencedColumns: ["cutover_batch_id"]
          },
        ]
      }
      accounting_journal_lines: {
        Row: {
          account_id: string
          balance_after: number
          balance_before: number
          created_at: string
          credit: number
          debit: number
          id: string
          journal_id: string
          line_number: number
          metadata: Json
          signed_effect: number
        }
        Insert: {
          account_id: string
          balance_after: number
          balance_before: number
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          journal_id: string
          line_number: number
          metadata?: Json
          signed_effect: number
        }
        Update: {
          account_id?: string
          balance_after?: number
          balance_before?: number
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          journal_id?: string
          line_number?: number
          metadata?: Json
          signed_effect?: number
        }
        Relationships: [
          {
            foreignKeyName: "accounting_journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_account_activity"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "accounting_journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_balance_reconstruction"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "accounting_journal_lines_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "accounting_journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_lines_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_journals"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_journals: {
        Row: {
          approved_by: string | null
          correlation_id: string | null
          created_at: string
          created_by: string | null
          cutover_batch_id: string | null
          effective_at: string
          environment: Database["public"]["Enums"]["acct_environment"]
          event_type: string | null
          game: string | null
          id: string
          idempotency_key: string
          journal_number: string
          journal_type: Database["public"]["Enums"]["acct_journal_type"]
          ledger_seq: number
          metadata: Json
          product: string | null
          reference_id: string | null
          reference_type: string | null
          reversal_of_journal_id: string | null
          reversed_by_journal_id: string | null
          settlement_version: number | null
          status: Database["public"]["Enums"]["acct_journal_status"]
        }
        Insert: {
          approved_by?: string | null
          correlation_id?: string | null
          created_at?: string
          created_by?: string | null
          cutover_batch_id?: string | null
          effective_at?: string
          environment?: Database["public"]["Enums"]["acct_environment"]
          event_type?: string | null
          game?: string | null
          id?: string
          idempotency_key: string
          journal_number: string
          journal_type: Database["public"]["Enums"]["acct_journal_type"]
          ledger_seq: number
          metadata?: Json
          product?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reversal_of_journal_id?: string | null
          reversed_by_journal_id?: string | null
          settlement_version?: number | null
          status?: Database["public"]["Enums"]["acct_journal_status"]
        }
        Update: {
          approved_by?: string | null
          correlation_id?: string | null
          created_at?: string
          created_by?: string | null
          cutover_batch_id?: string | null
          effective_at?: string
          environment?: Database["public"]["Enums"]["acct_environment"]
          event_type?: string | null
          game?: string | null
          id?: string
          idempotency_key?: string
          journal_number?: string
          journal_type?: Database["public"]["Enums"]["acct_journal_type"]
          ledger_seq?: number
          metadata?: Json
          product?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reversal_of_journal_id?: string | null
          reversed_by_journal_id?: string | null
          settlement_version?: number | null
          status?: Database["public"]["Enums"]["acct_journal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "accounting_journals_cutover_batch_id_fkey"
            columns: ["cutover_batch_id"]
            isOneToOne: false
            referencedRelation: "accounting_cutover_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journals_cutover_batch_id_fkey"
            columns: ["cutover_batch_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_cutover_status"
            referencedColumns: ["cutover_batch_id"]
          },
          {
            foreignKeyName: "accounting_journals_reversal_of_journal_id_fkey"
            columns: ["reversal_of_journal_id"]
            isOneToOne: false
            referencedRelation: "accounting_journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journals_reversal_of_journal_id_fkey"
            columns: ["reversal_of_journal_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journals_reversed_by_journal_id_fkey"
            columns: ["reversed_by_journal_id"]
            isOneToOne: false
            referencedRelation: "accounting_journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journals_reversed_by_journal_id_fkey"
            columns: ["reversed_by_journal_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_journals"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_liability_reservations: {
        Row: {
          config_version: string | null
          counts_toward_available: boolean
          created_at: string
          environment: Database["public"]["Enums"]["acct_environment"]
          game: string | null
          id: string
          initial_reserved_amount: number
          max_gross_payout: number
          max_net_liability: number
          metadata: Json
          product: string
          reference_id: string
          reference_type: string
          release_reason: string | null
          released_at: string | null
          reserved_amount: number
          reserved_at: string
          stake_collected: number
          status: string
          superseded_at: string | null
          updated_at: string
          user_id: string | null
          version: number
        }
        Insert: {
          config_version?: string | null
          counts_toward_available?: boolean
          created_at?: string
          environment: Database["public"]["Enums"]["acct_environment"]
          game?: string | null
          id?: string
          initial_reserved_amount?: number
          max_gross_payout: number
          max_net_liability: number
          metadata?: Json
          product: string
          reference_id: string
          reference_type: string
          release_reason?: string | null
          released_at?: string | null
          reserved_amount: number
          reserved_at?: string
          stake_collected?: number
          status?: string
          superseded_at?: string | null
          updated_at?: string
          user_id?: string | null
          version?: number
        }
        Update: {
          config_version?: string | null
          counts_toward_available?: boolean
          created_at?: string
          environment?: Database["public"]["Enums"]["acct_environment"]
          game?: string | null
          id?: string
          initial_reserved_amount?: number
          max_gross_payout?: number
          max_net_liability?: number
          metadata?: Json
          product?: string
          reference_id?: string
          reference_type?: string
          release_reason?: string | null
          released_at?: string | null
          reserved_amount?: number
          reserved_at?: string
          stake_collected?: number
          status?: string
          superseded_at?: string | null
          updated_at?: string
          user_id?: string | null
          version?: number
        }
        Relationships: []
      }
      accounting_migration_flag_envs: {
        Row: {
          capacity_enforced: boolean | null
          created_at: string
          dual_write: boolean | null
          environment: Database["public"]["Enums"]["acct_environment"]
          journal_enabled: boolean | null
          liability_enforced: boolean | null
          notes: string | null
          product: string
          updated_at: string
        }
        Insert: {
          capacity_enforced?: boolean | null
          created_at?: string
          dual_write?: boolean | null
          environment: Database["public"]["Enums"]["acct_environment"]
          journal_enabled?: boolean | null
          liability_enforced?: boolean | null
          notes?: string | null
          product: string
          updated_at?: string
        }
        Update: {
          capacity_enforced?: boolean | null
          created_at?: string
          dual_write?: boolean | null
          environment?: Database["public"]["Enums"]["acct_environment"]
          journal_enabled?: boolean | null
          liability_enforced?: boolean | null
          notes?: string | null
          product?: string
          updated_at?: string
        }
        Relationships: []
      }
      accounting_migration_flags: {
        Row: {
          capacity_enforced: boolean
          created_at: string
          dual_write: boolean
          journal_enabled: boolean
          liability_enforced: boolean
          notes: string | null
          product: string
          updated_at: string
        }
        Insert: {
          capacity_enforced?: boolean
          created_at?: string
          dual_write?: boolean
          journal_enabled?: boolean
          liability_enforced?: boolean
          notes?: string | null
          product: string
          updated_at?: string
        }
        Update: {
          capacity_enforced?: boolean
          created_at?: string
          dual_write?: boolean
          journal_enabled?: boolean
          liability_enforced?: boolean
          notes?: string | null
          product?: string
          updated_at?: string
        }
        Relationships: []
      }
      accounting_reconciliation_items: {
        Row: {
          affected_user_id: string | null
          classification: string
          created_at: string
          evidence: Json
          id: string
          is_variance_component: boolean
          narrative: string
          occurred_at: string
          requires_balance_correction: boolean
          requires_ledger_backfill: boolean
          requires_reporting_fix: boolean
          resolution_status: string
          scope: string
          updated_at: string
          variance_amount: number
        }
        Insert: {
          affected_user_id?: string | null
          classification: string
          created_at?: string
          evidence?: Json
          id?: string
          is_variance_component?: boolean
          narrative: string
          occurred_at: string
          requires_balance_correction?: boolean
          requires_ledger_backfill?: boolean
          requires_reporting_fix?: boolean
          resolution_status?: string
          scope?: string
          updated_at?: string
          variance_amount: number
        }
        Update: {
          affected_user_id?: string | null
          classification?: string
          created_at?: string
          evidence?: Json
          id?: string
          is_variance_component?: boolean
          narrative?: string
          occurred_at?: string
          requires_balance_correction?: boolean
          requires_ledger_backfill?: boolean
          requires_reporting_fix?: boolean
          resolution_status?: string
          scope?: string
          updated_at?: string
          variance_amount?: number
        }
        Relationships: []
      }
      accounting_selftest_runs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          label: string
          report: Json | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          label: string
          report?: Json | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          label?: string
          report?: Json | null
        }
        Relationships: []
      }
      admin_reauth: {
        Row: {
          expires_at: string
          issued_at: string
          two_factor_placeholder: boolean
          user_id: string
        }
        Insert: {
          expires_at: string
          issued_at?: string
          two_factor_placeholder?: boolean
          user_id: string
        }
        Update: {
          expires_at?: string
          issued_at?: string
          two_factor_placeholder?: boolean
          user_id?: string
        }
        Relationships: []
      }
      apifootball_odds_raw: {
        Row: {
          bookmaker_count: number | null
          fetched_at: string
          fixture_id: number
          id: string
          match_id: string
          payload: Json
        }
        Insert: {
          bookmaker_count?: number | null
          fetched_at?: string
          fixture_id: number
          id?: string
          match_id: string
          payload: Json
        }
        Update: {
          bookmaker_count?: number | null
          fetched_at?: string
          fixture_id?: number
          id?: string
          match_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "apifootball_odds_raw_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      apifootball_quota: {
        Row: {
          day: string
          day_limit: number
          updated_at: string
          used: number
        }
        Insert: {
          day: string
          day_limit?: number
          updated_at?: string
          used?: number
        }
        Update: {
          day?: string
          day_limit?: number
          updated_at?: string
          used?: number
        }
        Relationships: []
      }
      arcade_achievement_unlocks: {
        Row: {
          achievement_id: string
          created_at: string
          id: string
          progress: number
          reward_granted: boolean
          unlocked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          created_at?: string
          id?: string
          progress?: number
          reward_granted?: boolean
          unlocked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          created_at?: string
          id?: string
          progress?: number
          reward_granted?: boolean
          unlocked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_achievement_unlocks_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "arcade_achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_achievements: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          metric: string
          name: string
          reward_bonus_drops: number
          sort_order: number
          target_value: number
          tier: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          metric: string
          name: string
          reward_bonus_drops?: number
          sort_order?: number
          target_value: number
          tier?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          metric?: string
          name?: string
          reward_bonus_drops?: number
          sort_order?: number
          target_value?: number
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      arcade_bj_actions: {
        Row: {
          action: Database["public"]["Enums"]["bj_action"]
          action_sequence: number
          card_id: string | null
          created_at: string
          hand_id: string
          id: string
          idempotency_key: string | null
          player_hand_id: string | null
          source: string
          stake_delta: number
          state_version_after: number
          state_version_before: number
          total_after: number | null
          total_before: number | null
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["bj_action"]
          action_sequence: number
          card_id?: string | null
          created_at?: string
          hand_id: string
          id?: string
          idempotency_key?: string | null
          player_hand_id?: string | null
          source?: string
          stake_delta?: number
          state_version_after: number
          state_version_before: number
          total_after?: number | null
          total_before?: number | null
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["bj_action"]
          action_sequence?: number
          card_id?: string | null
          created_at?: string
          hand_id?: string
          id?: string
          idempotency_key?: string | null
          player_hand_id?: string | null
          source?: string
          stake_delta?: number
          state_version_after?: number
          state_version_before?: number
          total_after?: number | null
          total_before?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_bj_actions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "arcade_bj_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_bj_actions_hand_id_fkey"
            columns: ["hand_id"]
            isOneToOne: false
            referencedRelation: "arcade_bj_hands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_bj_actions_player_hand_id_fkey"
            columns: ["player_hand_id"]
            isOneToOne: false
            referencedRelation: "arcade_bj_player_hands"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_bj_cards: {
        Row: {
          card_value: number
          deal_sequence: number
          dealt_at: string
          face_up: boolean
          hand_id: string
          id: string
          owner_type: string
          player_hand_id: string | null
          rank: number
          revealed_at: string | null
          shoe_id: string
          shoe_position: number
          suit: number
        }
        Insert: {
          card_value: number
          deal_sequence: number
          dealt_at?: string
          face_up?: boolean
          hand_id: string
          id?: string
          owner_type: string
          player_hand_id?: string | null
          rank: number
          revealed_at?: string | null
          shoe_id: string
          shoe_position: number
          suit: number
        }
        Update: {
          card_value?: number
          deal_sequence?: number
          dealt_at?: string
          face_up?: boolean
          hand_id?: string
          id?: string
          owner_type?: string
          player_hand_id?: string | null
          rank?: number
          revealed_at?: string | null
          shoe_id?: string
          shoe_position?: number
          suit?: number
        }
        Relationships: [
          {
            foreignKeyName: "arcade_bj_cards_hand_id_fkey"
            columns: ["hand_id"]
            isOneToOne: false
            referencedRelation: "arcade_bj_hands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_bj_cards_player_hand_id_fkey"
            columns: ["player_hand_id"]
            isOneToOne: false
            referencedRelation: "arcade_bj_player_hands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_bj_cards_shoe_id_fkey"
            columns: ["shoe_id"]
            isOneToOne: false
            referencedRelation: "arcade_bj_shoes"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_bj_errors: {
        Row: {
          correlation_id: string | null
          created_at: string
          details: Json
          error_type: string
          hand_id: string | null
          id: string
          message: string | null
          resolution_status: string
          severity: string
          shoe_id: string | null
          user_id: string | null
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          details?: Json
          error_type: string
          hand_id?: string | null
          id?: string
          message?: string | null
          resolution_status?: string
          severity?: string
          shoe_id?: string | null
          user_id?: string | null
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          details?: Json
          error_type?: string
          hand_id?: string | null
          id?: string
          message?: string | null
          resolution_status?: string
          severity?: string
          shoe_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      arcade_bj_hands: {
        Row: {
          action_sequence: number
          active_hand_index: number
          client_seed: string
          created_at: string
          dealer_blackjack: boolean
          dealer_bust: boolean
          dealer_soft: boolean
          dealer_total: number | null
          expires_at: string
          id: string
          idempotency_key: string
          last_action_at: string
          nonce: number
          payout_ceiling_breached: boolean
          resolution_reason: string | null
          resolved_by: string | null
          result: Database["public"]["Enums"]["bj_result"] | null
          result_reason: string | null
          rule_config_id: string
          rule_version: number
          score_cap_delta: number
          score_config_id: string
          score_version: number
          server_seed_hash: string
          settled_at: string | null
          shoe_id: string
          started_at: string
          state_version: number
          status: Database["public"]["Enums"]["bj_hand_status"]
          total_payout: number
          total_score_awarded: number
          total_score_uncapped: number | null
          total_stake: number
          updated_at: string
          user_id: string
          user_net: number
          verification_id: string
          worst_case_gross: number | null
        }
        Insert: {
          action_sequence?: number
          active_hand_index?: number
          client_seed: string
          created_at?: string
          dealer_blackjack?: boolean
          dealer_bust?: boolean
          dealer_soft?: boolean
          dealer_total?: number | null
          expires_at?: string
          id?: string
          idempotency_key: string
          last_action_at?: string
          nonce: number
          payout_ceiling_breached?: boolean
          resolution_reason?: string | null
          resolved_by?: string | null
          result?: Database["public"]["Enums"]["bj_result"] | null
          result_reason?: string | null
          rule_config_id: string
          rule_version: number
          score_cap_delta?: number
          score_config_id: string
          score_version: number
          server_seed_hash: string
          settled_at?: string | null
          shoe_id: string
          started_at?: string
          state_version?: number
          status?: Database["public"]["Enums"]["bj_hand_status"]
          total_payout?: number
          total_score_awarded?: number
          total_score_uncapped?: number | null
          total_stake?: number
          updated_at?: string
          user_id: string
          user_net?: number
          verification_id?: string
          worst_case_gross?: number | null
        }
        Update: {
          action_sequence?: number
          active_hand_index?: number
          client_seed?: string
          created_at?: string
          dealer_blackjack?: boolean
          dealer_bust?: boolean
          dealer_soft?: boolean
          dealer_total?: number | null
          expires_at?: string
          id?: string
          idempotency_key?: string
          last_action_at?: string
          nonce?: number
          payout_ceiling_breached?: boolean
          resolution_reason?: string | null
          resolved_by?: string | null
          result?: Database["public"]["Enums"]["bj_result"] | null
          result_reason?: string | null
          rule_config_id?: string
          rule_version?: number
          score_cap_delta?: number
          score_config_id?: string
          score_version?: number
          server_seed_hash?: string
          settled_at?: string | null
          shoe_id?: string
          started_at?: string
          state_version?: number
          status?: Database["public"]["Enums"]["bj_hand_status"]
          total_payout?: number
          total_score_awarded?: number
          total_score_uncapped?: number | null
          total_stake?: number
          updated_at?: string
          user_id?: string
          user_net?: number
          verification_id?: string
          worst_case_gross?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_bj_hands_rule_config_id_fkey"
            columns: ["rule_config_id"]
            isOneToOne: false
            referencedRelation: "arcade_bj_rule_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_bj_hands_score_config_id_fkey"
            columns: ["score_config_id"]
            isOneToOne: false
            referencedRelation: "arcade_bj_score_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_bj_hands_shoe_id_fkey"
            columns: ["shoe_id"]
            isOneToOne: false
            referencedRelation: "arcade_bj_shoes"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_bj_player_hands: {
        Row: {
          created_at: string
          final_total: number | null
          hand_id: string
          hand_index: number
          id: string
          is_blackjack: boolean
          is_bust: boolean
          is_doubled: boolean
          is_soft: boolean
          is_split: boolean
          is_split_ace: boolean
          parent_player_hand_id: string | null
          payout: number
          result: Database["public"]["Enums"]["bj_result"] | null
          score_awarded: number
          settled_at: string | null
          stake: number
          status: Database["public"]["Enums"]["bj_ph_status"]
        }
        Insert: {
          created_at?: string
          final_total?: number | null
          hand_id: string
          hand_index: number
          id?: string
          is_blackjack?: boolean
          is_bust?: boolean
          is_doubled?: boolean
          is_soft?: boolean
          is_split?: boolean
          is_split_ace?: boolean
          parent_player_hand_id?: string | null
          payout?: number
          result?: Database["public"]["Enums"]["bj_result"] | null
          score_awarded?: number
          settled_at?: string | null
          stake?: number
          status?: Database["public"]["Enums"]["bj_ph_status"]
        }
        Update: {
          created_at?: string
          final_total?: number | null
          hand_id?: string
          hand_index?: number
          id?: string
          is_blackjack?: boolean
          is_bust?: boolean
          is_doubled?: boolean
          is_soft?: boolean
          is_split?: boolean
          is_split_ace?: boolean
          parent_player_hand_id?: string | null
          payout?: number
          result?: Database["public"]["Enums"]["bj_result"] | null
          score_awarded?: number
          settled_at?: string | null
          stake?: number
          status?: Database["public"]["Enums"]["bj_ph_status"]
        }
        Relationships: [
          {
            foreignKeyName: "arcade_bj_player_hands_hand_id_fkey"
            columns: ["hand_id"]
            isOneToOne: false
            referencedRelation: "arcade_bj_hands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_bj_player_hands_parent_player_hand_id_fkey"
            columns: ["parent_player_hand_id"]
            isOneToOne: false
            referencedRelation: "arcade_bj_player_hands"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_bj_risk_flags: {
        Row: {
          assigned_admin: string | null
          confidence: number
          created_at: string
          evidence: Json
          flag_type: string
          hand_id: string | null
          id: string
          notes: string | null
          resolution: string | null
          review_status: string
          severity: string
          shoe_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_admin?: string | null
          confidence?: number
          created_at?: string
          evidence?: Json
          flag_type: string
          hand_id?: string | null
          id?: string
          notes?: string | null
          resolution?: string | null
          review_status?: string
          severity?: string
          shoe_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_admin?: string | null
          confidence?: number
          created_at?: string
          evidence?: Json
          flag_type?: string
          hand_id?: string | null
          id?: string
          notes?: string | null
          resolution?: string | null
          review_status?: string
          severity?: string
          shoe_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      arcade_bj_rule_configs: {
        Row: {
          action_timeout_seconds: number
          announcement: string | null
          approved_by: string | null
          auto_stand_on_21: boolean
          blackjack_payout: number
          change_reason: string | null
          chip_values: number[]
          created_at: string
          created_by: string | null
          daily_hand_limit: number
          dealer_hits_soft_17: boolean
          dealer_peek: boolean
          deck_count: number
          double_after_split: boolean
          double_allowed: boolean
          effective_from: string
          effective_to: string | null
          hit_split_aces: boolean
          id: string
          maintenance_mode: boolean
          max_payout: number
          max_split_hands: number
          max_stake: number
          min_stake: number
          name: string
          penetration: number
          resplit_aces: boolean
          resplit_allowed: boolean
          status: Database["public"]["Enums"]["bj_config_status"]
          strategy_table_version: number
          updated_at: string
          version: number
        }
        Insert: {
          action_timeout_seconds?: number
          announcement?: string | null
          approved_by?: string | null
          auto_stand_on_21?: boolean
          blackjack_payout?: number
          change_reason?: string | null
          chip_values?: number[]
          created_at?: string
          created_by?: string | null
          daily_hand_limit?: number
          dealer_hits_soft_17?: boolean
          dealer_peek?: boolean
          deck_count?: number
          double_after_split?: boolean
          double_allowed?: boolean
          effective_from?: string
          effective_to?: string | null
          hit_split_aces?: boolean
          id?: string
          maintenance_mode?: boolean
          max_payout?: number
          max_split_hands?: number
          max_stake?: number
          min_stake?: number
          name: string
          penetration?: number
          resplit_aces?: boolean
          resplit_allowed?: boolean
          status?: Database["public"]["Enums"]["bj_config_status"]
          strategy_table_version?: number
          updated_at?: string
          version: number
        }
        Update: {
          action_timeout_seconds?: number
          announcement?: string | null
          approved_by?: string | null
          auto_stand_on_21?: boolean
          blackjack_payout?: number
          change_reason?: string | null
          chip_values?: number[]
          created_at?: string
          created_by?: string | null
          daily_hand_limit?: number
          dealer_hits_soft_17?: boolean
          dealer_peek?: boolean
          deck_count?: number
          double_after_split?: boolean
          double_allowed?: boolean
          effective_from?: string
          effective_to?: string | null
          hit_split_aces?: boolean
          id?: string
          maintenance_mode?: boolean
          max_payout?: number
          max_split_hands?: number
          max_stake?: number
          min_stake?: number
          name?: string
          penetration?: number
          resplit_aces?: boolean
          resplit_allowed?: boolean
          status?: Database["public"]["Enums"]["bj_config_status"]
          strategy_table_version?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      arcade_bj_score_balances: {
        Row: {
          created_at: string
          total_score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          total_score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          total_score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      arcade_bj_score_configs: {
        Row: {
          approved_by: string | null
          change_reason: string | null
          created_at: string
          created_by: string | null
          double_win_score: number
          effective_from: string
          effective_to: string | null
          five_card_win_score: number
          id: string
          loss_score: number
          max_score_per_round: number
          name: string
          natural_blackjack_score: number
          push_score: number
          split_win_score: number
          status: Database["public"]["Enums"]["bj_config_status"]
          updated_at: string
          version: number
          win_score: number
        }
        Insert: {
          approved_by?: string | null
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          double_win_score?: number
          effective_from?: string
          effective_to?: string | null
          five_card_win_score?: number
          id?: string
          loss_score?: number
          max_score_per_round?: number
          name: string
          natural_blackjack_score?: number
          push_score?: number
          split_win_score?: number
          status?: Database["public"]["Enums"]["bj_config_status"]
          updated_at?: string
          version: number
          win_score?: number
        }
        Update: {
          approved_by?: string | null
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          double_win_score?: number
          effective_from?: string
          effective_to?: string | null
          five_card_win_score?: number
          id?: string
          loss_score?: number
          max_score_per_round?: number
          name?: string
          natural_blackjack_score?: number
          push_score?: number
          split_win_score?: number
          status?: Database["public"]["Enums"]["bj_config_status"]
          updated_at?: string
          version?: number
          win_score?: number
        }
        Relationships: []
      }
      arcade_bj_score_ledger: {
        Row: {
          admin_id: string | null
          created_at: string
          hand_id: string | null
          id: string
          idempotency_key: string | null
          player_hand_id: string | null
          reason: string | null
          score_amount: number
          score_config_version: number
          score_type: Database["public"]["Enums"]["bj_score_txn"]
          total_after: number
          total_before: number
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          hand_id?: string | null
          id?: string
          idempotency_key?: string | null
          player_hand_id?: string | null
          reason?: string | null
          score_amount: number
          score_config_version: number
          score_type: Database["public"]["Enums"]["bj_score_txn"]
          total_after: number
          total_before: number
          user_id: string
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          hand_id?: string | null
          id?: string
          idempotency_key?: string | null
          player_hand_id?: string | null
          reason?: string | null
          score_amount?: number
          score_config_version?: number
          score_type?: Database["public"]["Enums"]["bj_score_txn"]
          total_after?: number
          total_before?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_bj_score_ledger_hand_id_fkey"
            columns: ["hand_id"]
            isOneToOne: false
            referencedRelation: "arcade_bj_hands"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_bj_shoes: {
        Row: {
          card_order: number[]
          client_seed: string
          created_at: string
          current_index: number
          cut_index: number
          deck_count: number
          id: string
          nonce: number
          retired_at: string | null
          revealed_at: string | null
          rule_version: number
          server_seed: string
          server_seed_hash: string
          shuffle_version: number
          status: Database["public"]["Enums"]["bj_shoe_status"]
          total_cards: number
          updated_at: string
          user_id: string
        }
        Insert: {
          card_order: number[]
          client_seed: string
          created_at?: string
          current_index?: number
          cut_index: number
          deck_count?: number
          id?: string
          nonce: number
          retired_at?: string | null
          revealed_at?: string | null
          rule_version: number
          server_seed: string
          server_seed_hash: string
          shuffle_version?: number
          status?: Database["public"]["Enums"]["bj_shoe_status"]
          total_cards?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          card_order?: number[]
          client_seed?: string
          created_at?: string
          current_index?: number
          cut_index?: number
          deck_count?: number
          id?: string
          nonce?: number
          retired_at?: string | null
          revealed_at?: string | null
          rule_version?: number
          server_seed?: string
          server_seed_hash?: string
          shuffle_version?: number
          status?: Database["public"]["Enums"]["bj_shoe_status"]
          total_cards?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      arcade_challenge_progress: {
        Row: {
          challenge_id: string
          completed_at: string | null
          created_at: string
          id: string
          period_bucket: string
          progress: number
          reward_granted: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          period_bucket: string
          progress?: number
          reward_granted?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          period_bucket?: string
          progress?: number
          reward_granted?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_challenge_progress_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "arcade_challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_challenges: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          metric: string
          name: string
          period: string
          reward_bonus_drops: number
          sort_order: number
          target_value: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          metric: string
          name: string
          period: string
          reward_bonus_drops?: number
          sort_order?: number
          target_value: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          metric?: string
          name?: string
          period?: string
          reward_bonus_drops?: number
          sort_order?: number
          target_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      arcade_config_activation: {
        Row: {
          activated_at: string
          activated_by: string | null
          config_version: number
          environment: Database["public"]["Enums"]["acct_environment"]
          product: string
          reason: string | null
        }
        Insert: {
          activated_at?: string
          activated_by?: string | null
          config_version: number
          environment: Database["public"]["Enums"]["acct_environment"]
          product: string
          reason?: string | null
        }
        Update: {
          activated_at?: string
          activated_by?: string | null
          config_version?: number
          environment?: Database["public"]["Enums"]["acct_environment"]
          product?: string
          reason?: string | null
        }
        Relationships: []
      }
      arcade_config_activation_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          environment: Database["public"]["Enums"]["acct_environment"]
          id: string
          new_version: number
          previous_version: number | null
          product: string
          reason: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          environment: Database["public"]["Enums"]["acct_environment"]
          id?: string
          new_version: number
          previous_version?: number | null
          product: string
          reason: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          environment?: Database["public"]["Enums"]["acct_environment"]
          id?: string
          new_version?: number
          previous_version?: number | null
          product?: string
          reason?: string
        }
        Relationships: []
      }
      arcade_config_versions: {
        Row: {
          change_reason: string
          created_at: string
          created_by: string | null
          id: string
          measured_house_edge: number | null
          measured_rtp: number | null
          payload: Json
          product: string
          simulation_rounds: number | null
          target_house_edge: number
          target_rtp: number
          version: number
        }
        Insert: {
          change_reason: string
          created_at?: string
          created_by?: string | null
          id?: string
          measured_house_edge?: number | null
          measured_rtp?: number | null
          payload?: Json
          product: string
          simulation_rounds?: number | null
          target_house_edge: number
          target_rtp: number
          version: number
        }
        Update: {
          change_reason?: string
          created_at?: string
          created_by?: string | null
          id?: string
          measured_house_edge?: number | null
          measured_rtp?: number | null
          payload?: Json
          product?: string
          simulation_rounds?: number | null
          target_house_edge?: number
          target_rtp?: number
          version?: number
        }
        Relationships: []
      }
      arcade_cosmetics: {
        Row: {
          achievement_code: string | null
          code: string
          cosmetic_type: Database["public"]["Enums"]["arcade_cosmetic_type"]
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          preview_accent: string | null
          preview_color: string | null
          rarity: Database["public"]["Enums"]["arcade_cosmetic_rarity"]
          unlock_type: Database["public"]["Enums"]["arcade_cosmetic_unlock"]
          updated_at: string
        }
        Insert: {
          achievement_code?: string | null
          code: string
          cosmetic_type: Database["public"]["Enums"]["arcade_cosmetic_type"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          preview_accent?: string | null
          preview_color?: string | null
          rarity?: Database["public"]["Enums"]["arcade_cosmetic_rarity"]
          unlock_type?: Database["public"]["Enums"]["arcade_cosmetic_unlock"]
          updated_at?: string
        }
        Update: {
          achievement_code?: string | null
          code?: string
          cosmetic_type?: Database["public"]["Enums"]["arcade_cosmetic_type"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          preview_accent?: string | null
          preview_color?: string | null
          rarity?: Database["public"]["Enums"]["arcade_cosmetic_rarity"]
          unlock_type?: Database["public"]["Enums"]["arcade_cosmetic_unlock"]
          updated_at?: string
        }
        Relationships: []
      }
      arcade_drop_balances: {
        Row: {
          bonus_available: number
          created_at: string
          daily_available: number
          daily_reset_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bonus_available?: number
          created_at?: string
          daily_available?: number
          daily_reset_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bonus_available?: number
          created_at?: string
          daily_available?: number
          daily_reset_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      arcade_drop_transactions: {
        Row: {
          admin_id: string | null
          bonus_after: number
          bonus_before: number
          created_at: string
          daily_after: number
          daily_before: number
          expires_at: string | null
          id: string
          quantity: number
          reason: string | null
          related_game_id: string | null
          source: string | null
          type: Database["public"]["Enums"]["arcade_drop_txn_type"]
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          bonus_after: number
          bonus_before: number
          created_at?: string
          daily_after: number
          daily_before: number
          expires_at?: string | null
          id?: string
          quantity: number
          reason?: string | null
          related_game_id?: string | null
          source?: string | null
          type: Database["public"]["Enums"]["arcade_drop_txn_type"]
          user_id: string
        }
        Update: {
          admin_id?: string | null
          bonus_after?: number
          bonus_before?: number
          created_at?: string
          daily_after?: number
          daily_before?: number
          expires_at?: string | null
          id?: string
          quantity?: number
          reason?: string | null
          related_game_id?: string | null
          source?: string | null
          type?: Database["public"]["Enums"]["arcade_drop_txn_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_drop_transactions_related_game_id_fkey"
            columns: ["related_game_id"]
            isOneToOne: false
            referencedRelation: "arcade_plinko_games"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_events: {
        Row: {
          bonus_drops_per_day: number
          code: string
          created_at: string
          description: string | null
          ends_at: string
          id: string
          is_active: boolean
          name: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          bonus_drops_per_day?: number
          code: string
          created_at?: string
          description?: string | null
          ends_at: string
          id?: string
          is_active?: boolean
          name: string
          starts_at: string
          updated_at?: string
        }
        Update: {
          bonus_drops_per_day?: number
          code?: string
          created_at?: string
          description?: string | null
          ends_at?: string
          id?: string
          is_active?: boolean
          name?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      arcade_mini_configs: {
        Row: {
          announcement: string | null
          chip_values: number[]
          cooldown_seconds: number
          created_at: string
          daily_round_limit: number
          id: string
          maintenance_mode: boolean
          max_multiplier: number
          max_stake: number
          min_stake: number
          payload: Json
          product: string
          round_ttl_seconds: number
          status: string
          target_rtp: number
          updated_at: string
          version: number
        }
        Insert: {
          announcement?: string | null
          chip_values?: number[]
          cooldown_seconds?: number
          created_at?: string
          daily_round_limit?: number
          id?: string
          maintenance_mode?: boolean
          max_multiplier?: number
          max_stake?: number
          min_stake?: number
          payload?: Json
          product: string
          round_ttl_seconds?: number
          status?: string
          target_rtp?: number
          updated_at?: string
          version?: number
        }
        Update: {
          announcement?: string | null
          chip_values?: number[]
          cooldown_seconds?: number
          created_at?: string
          daily_round_limit?: number
          id?: string
          maintenance_mode?: boolean
          max_multiplier?: number
          max_stake?: number
          min_stake?: number
          payload?: Json
          product?: string
          round_ttl_seconds?: number
          status?: string
          target_rtp?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      arcade_mini_rounds: {
        Row: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        Insert: {
          client_seed?: string
          config_id: string
          config_version: number
          created_at?: string
          expires_at?: string | null
          gross_return?: number
          house_net?: number
          id?: string
          idempotency_key?: string | null
          multiplier?: number
          nonce?: number
          outcome?: string | null
          product: string
          random_hex?: string | null
          result_reason?: string | null
          seed_id?: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at?: string | null
          settled_at?: string | null
          stake?: number
          state?: Json
          status?: string
          step_count?: number
          user_id: string
          user_net?: number
          verification_id?: string
        }
        Update: {
          client_seed?: string
          config_id?: string
          config_version?: number
          created_at?: string
          expires_at?: string | null
          gross_return?: number
          house_net?: number
          id?: string
          idempotency_key?: string | null
          multiplier?: number
          nonce?: number
          outcome?: string | null
          product?: string
          random_hex?: string | null
          result_reason?: string | null
          seed_id?: string | null
          server_seed?: string
          server_seed_hash?: string
          server_seed_revealed_at?: string | null
          settled_at?: string | null
          stake?: number
          state?: Json
          status?: string
          step_count?: number
          user_id?: string
          user_net?: number
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_mini_rounds_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "arcade_mini_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_plinko_games: {
        Row: {
          client_seed: string
          completed_at: string
          created_at: string
          drop_type: string
          id: string
          idempotency_key: string
          landing_slot: number
          multiplier: number
          nonce: number
          outcome: Database["public"]["Enums"]["arcade_outcome"]
          path: number[]
          payout: number
          profile_id: string
          risk_mode: Database["public"]["Enums"]["arcade_risk_mode"]
          rows: number
          score: number
          score_band: Database["public"]["Enums"]["arcade_score_band"]
          seed_id: string
          server_seed_hash: string
          stake_per_ball: number
          user_id: string
          verification_id: string
        }
        Insert: {
          client_seed: string
          completed_at?: string
          created_at?: string
          drop_type?: string
          id?: string
          idempotency_key: string
          landing_slot: number
          multiplier?: number
          nonce: number
          outcome: Database["public"]["Enums"]["arcade_outcome"]
          path: number[]
          payout?: number
          profile_id: string
          risk_mode: Database["public"]["Enums"]["arcade_risk_mode"]
          rows: number
          score: number
          score_band: Database["public"]["Enums"]["arcade_score_band"]
          seed_id: string
          server_seed_hash: string
          stake_per_ball?: number
          user_id: string
          verification_id: string
        }
        Update: {
          client_seed?: string
          completed_at?: string
          created_at?: string
          drop_type?: string
          id?: string
          idempotency_key?: string
          landing_slot?: number
          multiplier?: number
          nonce?: number
          outcome?: Database["public"]["Enums"]["arcade_outcome"]
          path?: number[]
          payout?: number
          profile_id?: string
          risk_mode?: Database["public"]["Enums"]["arcade_risk_mode"]
          rows?: number
          score?: number
          score_band?: Database["public"]["Enums"]["arcade_score_band"]
          seed_id?: string
          server_seed_hash?: string
          stake_per_ball?: number
          user_id?: string
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_plinko_games_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "arcade_score_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_plinko_games_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "arcade_randomness_seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_randomness_seeds: {
        Row: {
          client_seed: string
          created_at: string
          id: string
          nonce: number
          revealed_at: string | null
          server_seed: string
          server_seed_hash: string
          status: string
          user_id: string
        }
        Insert: {
          client_seed: string
          created_at?: string
          id?: string
          nonce?: number
          revealed_at?: string | null
          server_seed: string
          server_seed_hash: string
          status?: string
          user_id: string
        }
        Update: {
          client_seed?: string
          created_at?: string
          id?: string
          nonce?: number
          revealed_at?: string | null
          server_seed?: string
          server_seed_hash?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      arcade_roulette_bets: {
        Row: {
          bet_label: string
          bet_type: string
          covered_count: number
          covered_pockets: number[]
          created_at: string
          gross_return: number
          id: string
          is_win: boolean
          net_result: number
          return_multiplier: number
          spin_id: string
          stake: number
          user_id: string
          winning_pocket: number
        }
        Insert: {
          bet_label: string
          bet_type: string
          covered_count: number
          covered_pockets: number[]
          created_at?: string
          gross_return?: number
          id?: string
          is_win: boolean
          net_result?: number
          return_multiplier: number
          spin_id: string
          stake: number
          user_id: string
          winning_pocket: number
        }
        Update: {
          bet_label?: string
          bet_type?: string
          covered_count?: number
          covered_pockets?: number[]
          created_at?: string
          gross_return?: number
          id?: string
          is_win?: boolean
          net_result?: number
          return_multiplier?: number
          spin_id?: string
          stake?: number
          user_id?: string
          winning_pocket?: number
        }
        Relationships: [
          {
            foreignKeyName: "arcade_roulette_bets_spin_id_fkey"
            columns: ["spin_id"]
            isOneToOne: false
            referencedRelation: "arcade_roulette_spins"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_roulette_configurations: {
        Row: {
          announcement: string | null
          black_pockets: number[]
          change_reason: string | null
          chip_values: number[]
          cooldown_seconds: number
          created_at: string
          created_by: string | null
          daily_spin_limit: number
          id: string
          maintenance_mode: boolean
          max_positions: number
          max_stake_per_position: number
          max_total_stake: number
          min_total_stake: number
          published_at: string | null
          red_pockets: number[]
          status: string
          updated_at: string
          version: number
          wheel_order: number[]
        }
        Insert: {
          announcement?: string | null
          black_pockets: number[]
          change_reason?: string | null
          chip_values?: number[]
          cooldown_seconds?: number
          created_at?: string
          created_by?: string | null
          daily_spin_limit?: number
          id?: string
          maintenance_mode?: boolean
          max_positions?: number
          max_stake_per_position?: number
          max_total_stake?: number
          min_total_stake?: number
          published_at?: string | null
          red_pockets: number[]
          status?: string
          updated_at?: string
          version: number
          wheel_order: number[]
        }
        Update: {
          announcement?: string | null
          black_pockets?: number[]
          change_reason?: string | null
          chip_values?: number[]
          cooldown_seconds?: number
          created_at?: string
          created_by?: string | null
          daily_spin_limit?: number
          id?: string
          maintenance_mode?: boolean
          max_positions?: number
          max_stake_per_position?: number
          max_total_stake?: number
          min_total_stake?: number
          published_at?: string | null
          red_pockets?: number[]
          status?: string
          updated_at?: string
          version?: number
          wheel_order?: number[]
        }
        Relationships: []
      }
      arcade_roulette_spins: {
        Row: {
          client_seed: string
          completed_at: string | null
          config_id: string
          config_version: number
          created_at: string
          house_net: number
          id: string
          idempotency_key: string
          losing_positions: number
          nonce: number
          position_count: number
          processing_ms: number
          random_hex: string
          seed_id: string
          server_seed_hash: string
          status: Database["public"]["Enums"]["arcade_roulette_status"]
          total_return: number
          total_stake: number
          user_id: string
          user_net: number
          verification_id: string
          winning_colour: string
          winning_pocket: number
          winning_positions: number
        }
        Insert: {
          client_seed: string
          completed_at?: string | null
          config_id: string
          config_version: number
          created_at?: string
          house_net?: number
          id?: string
          idempotency_key: string
          losing_positions?: number
          nonce: number
          position_count?: number
          processing_ms?: number
          random_hex: string
          seed_id: string
          server_seed_hash: string
          status?: Database["public"]["Enums"]["arcade_roulette_status"]
          total_return?: number
          total_stake: number
          user_id: string
          user_net?: number
          verification_id: string
          winning_colour: string
          winning_pocket: number
          winning_positions?: number
        }
        Update: {
          client_seed?: string
          completed_at?: string | null
          config_id?: string
          config_version?: number
          created_at?: string
          house_net?: number
          id?: string
          idempotency_key?: string
          losing_positions?: number
          nonce?: number
          position_count?: number
          processing_ms?: number
          random_hex?: string
          seed_id?: string
          server_seed_hash?: string
          status?: Database["public"]["Enums"]["arcade_roulette_status"]
          total_return?: number
          total_stake?: number
          user_id?: string
          user_net?: number
          verification_id?: string
          winning_colour?: string
          winning_pocket?: number
          winning_positions?: number
        }
        Relationships: [
          {
            foreignKeyName: "arcade_roulette_spins_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "arcade_roulette_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_roulette_spins_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "arcade_randomness_seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_rps_configurations: {
        Row: {
          announcement: string | null
          chip_values: number[]
          cooldown_seconds: number
          created_at: string
          daily_round_limit: number
          draw_multiplier: number
          id: string
          ladder_multipliers: number[]
          ladder_tail_multiplier: number
          maintenance_mode: boolean
          max_stake: number
          min_stake: number
          round_ttl_seconds: number
          status: string
          updated_at: string
          version: number
          win_multiplier: number
        }
        Insert: {
          announcement?: string | null
          chip_values?: number[]
          cooldown_seconds?: number
          created_at?: string
          daily_round_limit?: number
          draw_multiplier?: number
          id?: string
          ladder_multipliers?: number[]
          ladder_tail_multiplier?: number
          maintenance_mode?: boolean
          max_stake?: number
          min_stake?: number
          round_ttl_seconds?: number
          status?: string
          updated_at?: string
          version?: number
          win_multiplier?: number
        }
        Update: {
          announcement?: string | null
          chip_values?: number[]
          cooldown_seconds?: number
          created_at?: string
          daily_round_limit?: number
          draw_multiplier?: number
          id?: string
          ladder_multipliers?: number[]
          ladder_tail_multiplier?: number
          maintenance_mode?: boolean
          max_stake?: number
          min_stake?: number
          round_ttl_seconds?: number
          status?: string
          updated_at?: string
          version?: number
          win_multiplier?: number
        }
        Relationships: []
      }
      arcade_rps_rounds: {
        Row: {
          client_reveal_ms: number | null
          client_seed: string | null
          config_id: string
          config_version: number
          created_at: string
          expires_at: string
          gross_return: number | null
          hmac_input: string | null
          house_net: number | null
          id: string
          idempotency_key: string | null
          ladder_step: number
          multiplier: number | null
          nonce: number
          outcome: string | null
          parent_round_id: string | null
          player_choice: string | null
          prepared_at: string
          processing_ms: number | null
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_choice: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number | null
          status: string
          updated_at: string
          user_id: string
          user_net: number | null
          verification_id: string
        }
        Insert: {
          client_reveal_ms?: number | null
          client_seed?: string | null
          config_id: string
          config_version: number
          created_at?: string
          expires_at: string
          gross_return?: number | null
          hmac_input?: string | null
          house_net?: number | null
          id?: string
          idempotency_key?: string | null
          ladder_step?: number
          multiplier?: number | null
          nonce: number
          outcome?: string | null
          parent_round_id?: string | null
          player_choice?: string | null
          prepared_at?: string
          processing_ms?: number | null
          random_hex?: string | null
          result_reason?: string | null
          seed_id?: string | null
          server_choice?: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at?: string | null
          settled_at?: string | null
          stake?: number | null
          status?: string
          updated_at?: string
          user_id: string
          user_net?: number | null
          verification_id?: string
        }
        Update: {
          client_reveal_ms?: number | null
          client_seed?: string | null
          config_id?: string
          config_version?: number
          created_at?: string
          expires_at?: string
          gross_return?: number | null
          hmac_input?: string | null
          house_net?: number | null
          id?: string
          idempotency_key?: string | null
          ladder_step?: number
          multiplier?: number | null
          nonce?: number
          outcome?: string | null
          parent_round_id?: string | null
          player_choice?: string | null
          prepared_at?: string
          processing_ms?: number | null
          random_hex?: string | null
          result_reason?: string | null
          seed_id?: string | null
          server_choice?: string | null
          server_seed?: string
          server_seed_hash?: string
          server_seed_revealed_at?: string | null
          settled_at?: string | null
          stake?: number | null
          status?: string
          updated_at?: string
          user_id?: string
          user_net?: number | null
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_rps_rounds_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "arcade_rps_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_rps_rounds_parent_round_id_fkey"
            columns: ["parent_round_id"]
            isOneToOne: false
            referencedRelation: "arcade_rps_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_rps_rounds_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "arcade_randomness_seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_score_profile_slots: {
        Row: {
          created_at: string
          id: string
          multiplier: number
          profile_id: string
          score: number
          slot_index: number
        }
        Insert: {
          created_at?: string
          id?: string
          multiplier?: number
          profile_id: string
          score: number
          slot_index: number
        }
        Update: {
          created_at?: string
          id?: string
          multiplier?: number
          profile_id?: string
          score?: number
          slot_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "arcade_score_profile_slots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "arcade_score_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_score_profiles: {
        Row: {
          approved_by: string | null
          change_reason: string | null
          created_at: string
          created_by: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          risk_mode: Database["public"]["Enums"]["arcade_risk_mode"]
          rows: number
          status: Database["public"]["Enums"]["arcade_profile_status"]
          updated_at: string
          version: number
        }
        Insert: {
          approved_by?: string | null
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          risk_mode: Database["public"]["Enums"]["arcade_risk_mode"]
          rows: number
          status?: Database["public"]["Enums"]["arcade_profile_status"]
          updated_at?: string
          version: number
        }
        Update: {
          approved_by?: string | null
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          risk_mode?: Database["public"]["Enums"]["arcade_risk_mode"]
          rows?: number
          status?: Database["public"]["Enums"]["arcade_profile_status"]
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      arcade_score_transactions: {
        Row: {
          balance_after: number
          created_at: string
          delta: number
          game_id: string | null
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          balance_after: number
          created_at?: string
          delta: number
          game_id?: string | null
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          delta?: number
          game_id?: string | null
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_score_transactions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "arcade_plinko_games"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_treasure_configurations: {
        Row: {
          announcement: string | null
          approved_by: string | null
          change_reason: string | null
          chip_values: number[]
          cooldown_seconds: number
          created_at: string
          created_by: string | null
          daily_round_limit: number
          difficulty: string
          effective_from: string | null
          effective_to: string | null
          grid_cols: number
          grid_rows: number
          id: string
          label: string
          maintenance_mode: boolean
          max_multiplier: number
          max_return: number
          max_stake: number
          min_stake: number
          published_at: string | null
          round_timeout_seconds: number
          rtp_version: number
          status: string
          target_rtp: number
          trap_count: number
          updated_at: string
          version: number
        }
        Insert: {
          announcement?: string | null
          approved_by?: string | null
          change_reason?: string | null
          chip_values?: number[]
          cooldown_seconds?: number
          created_at?: string
          created_by?: string | null
          daily_round_limit?: number
          difficulty: string
          effective_from?: string | null
          effective_to?: string | null
          grid_cols: number
          grid_rows: number
          id?: string
          label: string
          maintenance_mode?: boolean
          max_multiplier?: number
          max_return?: number
          max_stake?: number
          min_stake?: number
          published_at?: string | null
          round_timeout_seconds?: number
          rtp_version?: number
          status?: string
          target_rtp: number
          trap_count: number
          updated_at?: string
          version: number
        }
        Update: {
          announcement?: string | null
          approved_by?: string | null
          change_reason?: string | null
          chip_values?: number[]
          cooldown_seconds?: number
          created_at?: string
          created_by?: string | null
          daily_round_limit?: number
          difficulty?: string
          effective_from?: string | null
          effective_to?: string | null
          grid_cols?: number
          grid_rows?: number
          id?: string
          label?: string
          maintenance_mode?: boolean
          max_multiplier?: number
          max_return?: number
          max_stake?: number
          min_stake?: number
          published_at?: string | null
          round_timeout_seconds?: number
          rtp_version?: number
          status?: string
          target_rtp?: number
          trap_count?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      arcade_treasure_multiplier_tables: {
        Row: {
          actual_multiplier: number
          config_id: string
          config_version: number
          created_at: string
          display_multiplier: number
          fair_multiplier: number
          grid_size: number
          id: string
          payout_rule: string
          rtp_version: number
          safe_reveals: number
          survival_probability: number
          target_rtp: number
          trap_count: number
        }
        Insert: {
          actual_multiplier: number
          config_id: string
          config_version: number
          created_at?: string
          display_multiplier: number
          fair_multiplier: number
          grid_size: number
          id?: string
          payout_rule?: string
          rtp_version: number
          safe_reveals: number
          survival_probability: number
          target_rtp: number
          trap_count: number
        }
        Update: {
          actual_multiplier?: number
          config_id?: string
          config_version?: number
          created_at?: string
          display_multiplier?: number
          fair_multiplier?: number
          grid_size?: number
          id?: string
          payout_rule?: string
          rtp_version?: number
          safe_reveals?: number
          survival_probability?: number
          target_rtp?: number
          trap_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "arcade_treasure_multiplier_tables_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "arcade_treasure_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_treasure_round_actions: {
        Row: {
          action_sequence: number
          action_type: string
          created_at: string
          id: string
          idempotency_key: string
          metadata: Json
          multiplier_after: number | null
          outcome: string | null
          potential_return_after: number | null
          round_id: string
          state_version_after: number
          state_version_before: number
          tile_index: number | null
          user_id: string
        }
        Insert: {
          action_sequence: number
          action_type: string
          created_at?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          multiplier_after?: number | null
          outcome?: string | null
          potential_return_after?: number | null
          round_id: string
          state_version_after?: number
          state_version_before?: number
          tile_index?: number | null
          user_id: string
        }
        Update: {
          action_sequence?: number
          action_type?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          multiplier_after?: number | null
          outcome?: string | null
          potential_return_after?: number | null
          round_id?: string
          state_version_after?: number
          state_version_before?: number
          tile_index?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_treasure_round_actions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "arcade_treasure_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_treasure_rounds: {
        Row: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          current_multiplier: number
          difficulty: string
          expires_at: string
          final_multiplier: number | null
          grid_cols: number
          grid_rows: number
          gross_return: number
          id: string
          idempotency_key: string
          last_action_at: string
          nonce: number
          platform_net: number
          result_reason: string | null
          rtp_version: number
          safe_reveals: number
          seed_id: string
          selected_trap_index: number | null
          server_seed_hash: string
          settled_at: string | null
          stake: number
          started_at: string
          state_version: number
          status: Database["public"]["Enums"]["arcade_treasure_status"]
          trap_count: number
          unrounded_return: number
          updated_at: string
          user_id: string
          user_net: number
          verification_id: string
        }
        Insert: {
          client_seed: string
          config_id: string
          config_version: number
          created_at?: string
          current_multiplier?: number
          difficulty: string
          expires_at: string
          final_multiplier?: number | null
          grid_cols: number
          grid_rows: number
          gross_return?: number
          id?: string
          idempotency_key: string
          last_action_at?: string
          nonce: number
          platform_net?: number
          result_reason?: string | null
          rtp_version: number
          safe_reveals?: number
          seed_id: string
          selected_trap_index?: number | null
          server_seed_hash: string
          settled_at?: string | null
          stake: number
          started_at?: string
          state_version?: number
          status?: Database["public"]["Enums"]["arcade_treasure_status"]
          trap_count: number
          unrounded_return?: number
          updated_at?: string
          user_id: string
          user_net?: number
          verification_id: string
        }
        Update: {
          client_seed?: string
          config_id?: string
          config_version?: number
          created_at?: string
          current_multiplier?: number
          difficulty?: string
          expires_at?: string
          final_multiplier?: number | null
          grid_cols?: number
          grid_rows?: number
          gross_return?: number
          id?: string
          idempotency_key?: string
          last_action_at?: string
          nonce?: number
          platform_net?: number
          result_reason?: string | null
          rtp_version?: number
          safe_reveals?: number
          seed_id?: string
          selected_trap_index?: number | null
          server_seed_hash?: string
          settled_at?: string | null
          stake?: number
          started_at?: string
          state_version?: number
          status?: Database["public"]["Enums"]["arcade_treasure_status"]
          trap_count?: number
          unrounded_return?: number
          updated_at?: string
          user_id?: string
          user_net?: number
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_treasure_rounds_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "arcade_treasure_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_treasure_rounds_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "arcade_randomness_seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_treasure_tiles: {
        Row: {
          id: string
          reveal_sequence: number | null
          revealed_at: string | null
          round_id: string
          selected_by_user: boolean
          tile_index: number
          tile_type: string
        }
        Insert: {
          id?: string
          reveal_sequence?: number | null
          revealed_at?: string | null
          round_id: string
          selected_by_user?: boolean
          tile_index: number
          tile_type: string
        }
        Update: {
          id?: string
          reveal_sequence?: number | null
          revealed_at?: string | null
          round_id?: string
          selected_by_user?: boolean
          tile_index?: number
          tile_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_treasure_tiles_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "arcade_treasure_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_user_cosmetics: {
        Row: {
          cosmetic_id: string
          cosmetic_type: Database["public"]["Enums"]["arcade_cosmetic_type"]
          equipped: boolean
          id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          cosmetic_id: string
          cosmetic_type: Database["public"]["Enums"]["arcade_cosmetic_type"]
          equipped?: boolean
          id?: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          cosmetic_id?: string
          cosmetic_type?: Database["public"]["Enums"]["arcade_cosmetic_type"]
          equipped?: boolean
          id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_user_cosmetics_cosmetic_id_fkey"
            columns: ["cosmetic_id"]
            isOneToOne: false
            referencedRelation: "arcade_cosmetics"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          ip: string | null
          is_simulation: boolean
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          request_id: string | null
          target_user_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          is_simulation?: boolean
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          request_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          is_simulation?: boolean
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          request_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      correlated_exposure_alerts: {
        Row: {
          bet_ids: string[]
          correlation_group: string
          created_at: string
          gross_payout: number
          id: string
          match_id: string
          net_liability: number
          related_markets: string[]
          related_outcomes: string[]
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          total_stake: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bet_ids?: string[]
          correlation_group: string
          created_at?: string
          gross_payout?: number
          id?: string
          match_id: string
          net_liability?: number
          related_markets?: string[]
          related_outcomes?: string[]
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          total_stake?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bet_ids?: string[]
          correlation_group?: string
          created_at?: string
          gross_payout?: number
          id?: string
          match_id?: string
          net_liability?: number
          related_markets?: string[]
          related_outcomes?: string[]
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          total_stake?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "correlated_exposure_alerts_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      csse_free_bets: {
        Row: {
          consumed_at: string | null
          created_at: string
          id: string
          metadata: Json
          prediction_id: string | null
          settled_at: string | null
          settled_outcome: string | null
          source: string
          stake_amount: number
          status: string
          token_cost: number
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          prediction_id?: string | null
          settled_at?: string | null
          settled_outcome?: string | null
          source?: string
          stake_amount: number
          status?: string
          token_cost: number
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          prediction_id?: string | null
          settled_at?: string | null
          settled_outcome?: string | null
          source?: string
          stake_amount?: number
          status?: string
          token_cost?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "csse_free_bets_prediction_fk"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      csse_store_items: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          item_key: string
          kind: string
          label: string
          metadata: Json
          sort_order: number
          stake_amount: number
          token_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          item_key: string
          kind: string
          label: string
          metadata?: Json
          sort_order?: number
          stake_amount: number
          token_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          item_key?: string
          kind?: string
          label?: string
          metadata?: Json
          sort_order?: number
          stake_amount?: number
          token_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      csse_token_transactions: {
        Row: {
          balance_after: number
          created_at: string
          delta: number
          id: string
          kind: string
          metadata: Json
          source: string
          source_ref: string | null
          user_id: string
        }
        Insert: {
          balance_after: number
          created_at?: string
          delta: number
          id?: string
          kind: string
          metadata?: Json
          source: string
          source_ref?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          delta?: number
          id?: string
          kind?: string
          metadata?: Json
          source?: string
          source_ref?: string | null
          user_id?: string
        }
        Relationships: []
      }
      csse_token_wallets: {
        Row: {
          balance: number
          lifetime_earned: number
          lifetime_spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          lifetime_earned?: number
          lifetime_spent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          lifetime_earned?: number
          lifetime_spent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      f1_bets: {
        Row: {
          created_at: string
          id: string
          market_id: string
          market_type: string
          odds_locked: number
          potential_payout: number
          race_id: string
          selection_key: string
          selection_label: string
          settled_at: string | null
          stake: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          market_id: string
          market_type: string
          odds_locked: number
          potential_payout: number
          race_id: string
          selection_key: string
          selection_label: string
          settled_at?: string | null
          stake: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string
          market_type?: string
          odds_locked?: number
          potential_payout?: number
          race_id?: string
          selection_key?: string
          selection_label?: string
          settled_at?: string | null
          stake?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "f1_bets_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "f1_race_markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "f1_bets_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "f1_races"
            referencedColumns: ["id"]
          },
        ]
      }
      f1_championship_bets: {
        Row: {
          created_at: string
          id: string
          market_id: string
          market_type: string
          odds_locked: number
          potential_payout: number
          season: number
          selection_key: string
          selection_label: string
          settled_at: string | null
          stake: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          market_id: string
          market_type: string
          odds_locked: number
          potential_payout: number
          season: number
          selection_key: string
          selection_label: string
          settled_at?: string | null
          stake: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string
          market_type?: string
          odds_locked?: number
          potential_payout?: number
          season?: number
          selection_key?: string
          selection_label?: string
          settled_at?: string | null
          stake?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "f1_championship_bets_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "f1_championship_markets"
            referencedColumns: ["id"]
          },
        ]
      }
      f1_championship_markets: {
        Row: {
          created_at: string
          id: string
          label: string
          market_type: string
          odds: number
          season: number
          selection_key: string
          settled_at: string | null
          status: string
          updated_at: string
          winning: boolean | null
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          market_type: string
          odds: number
          season: number
          selection_key: string
          settled_at?: string | null
          status?: string
          updated_at?: string
          winning?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          market_type?: string
          odds?: number
          season?: number
          selection_key?: string
          settled_at?: string | null
          status?: string
          updated_at?: string
          winning?: boolean | null
        }
        Relationships: []
      }
      f1_constructors: {
        Row: {
          active: boolean
          created_at: string
          id: string
          logo_url: string | null
          name: string
          provider_id: number | null
          team_key: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          provider_id?: number | null
          team_key: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          provider_id?: number | null
          team_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      f1_drivers: {
        Row: {
          abbr: string | null
          active: boolean
          created_at: string
          driver_key: string
          id: string
          name: string
          nationality: string | null
          number: number | null
          photo_url: string | null
          provider_id: number | null
          team_key: string | null
          updated_at: string
        }
        Insert: {
          abbr?: string | null
          active?: boolean
          created_at?: string
          driver_key: string
          id?: string
          name: string
          nationality?: string | null
          number?: number | null
          photo_url?: string | null
          provider_id?: number | null
          team_key?: string | null
          updated_at?: string
        }
        Update: {
          abbr?: string | null
          active?: boolean
          created_at?: string
          driver_key?: string
          id?: string
          name?: string
          nationality?: string | null
          number?: number | null
          photo_url?: string | null
          provider_id?: number | null
          team_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "f1_drivers_team_key_fkey"
            columns: ["team_key"]
            isOneToOne: false
            referencedRelation: "f1_constructors"
            referencedColumns: ["team_key"]
          },
        ]
      }
      f1_live_race_state: {
        Row: {
          fastest_lap: Json | null
          fetched_at: string
          lap_current: number | null
          lap_total: number | null
          race_id: string
          race_status: string | null
          standings: Json
          updated_at: string
        }
        Insert: {
          fastest_lap?: Json | null
          fetched_at?: string
          lap_current?: number | null
          lap_total?: number | null
          race_id: string
          race_status?: string | null
          standings?: Json
          updated_at?: string
        }
        Update: {
          fastest_lap?: Json | null
          fetched_at?: string
          lap_current?: number | null
          lap_total?: number | null
          race_id?: string
          race_status?: string | null
          standings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "f1_live_race_state_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: true
            referencedRelation: "f1_races"
            referencedColumns: ["id"]
          },
        ]
      }
      f1_race_markets: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          label: string
          market_type: string
          odds: number
          opened_at: string
          race_id: string
          secondary_selection_key: string | null
          selection_key: string
          settled_at: string | null
          status: string
          updated_at: string
          winning: boolean | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          label: string
          market_type: string
          odds: number
          opened_at?: string
          race_id: string
          secondary_selection_key?: string | null
          selection_key: string
          settled_at?: string | null
          status?: string
          updated_at?: string
          winning?: boolean | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          label?: string
          market_type?: string
          odds?: number
          opened_at?: string
          race_id?: string
          secondary_selection_key?: string | null
          selection_key?: string
          settled_at?: string | null
          status?: string
          updated_at?: string
          winning?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "f1_race_markets_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "f1_races"
            referencedColumns: ["id"]
          },
        ]
      }
      f1_race_odds_snapshots: {
        Row: {
          id: string
          market_id: string
          odds: number
          snapshot_at: string
        }
        Insert: {
          id?: string
          market_id: string
          odds: number
          snapshot_at?: string
        }
        Update: {
          id?: string
          market_id?: string
          odds?: number
          snapshot_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "f1_race_odds_snapshots_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "f1_race_markets"
            referencedColumns: ["id"]
          },
        ]
      }
      f1_races: {
        Row: {
          circuit: string | null
          country: string | null
          created_at: string
          fastest_lap: Json | null
          id: string
          name: string
          provider_id: number | null
          quali_at: string | null
          qualifying: Json | null
          race_key: string
          results: Json | null
          round: number
          season: number
          settled_at: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          circuit?: string | null
          country?: string | null
          created_at?: string
          fastest_lap?: Json | null
          id?: string
          name: string
          provider_id?: number | null
          quali_at?: string | null
          qualifying?: Json | null
          race_key: string
          results?: Json | null
          round: number
          season: number
          settled_at?: string | null
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          circuit?: string | null
          country?: string | null
          created_at?: string
          fastest_lap?: Json | null
          id?: string
          name?: string
          provider_id?: number | null
          quali_at?: string | null
          qualifying?: Json | null
          race_key?: string
          results?: Json | null
          round?: number
          season?: number
          settled_at?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      f1_seasons: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      f1_sync_runs: {
        Row: {
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          meta: Json | null
          records: number | null
          started_at: string
          status: string
          task: string
        }
        Insert: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          meta?: Json | null
          records?: number | null
          started_at?: string
          status: string
          task: string
        }
        Update: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          meta?: Json | null
          records?: number | null
          started_at?: string
          status?: string
          task?: string
        }
        Relationships: []
      }
      football_event_analytics: {
        Row: {
          fetched_at: string
          payload: Json
          sports_event_id: string
        }
        Insert: {
          fetched_at?: string
          payload: Json
          sports_event_id: string
        }
        Update: {
          fetched_at?: string
          payload?: Json
          sports_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "football_event_analytics_sports_event_id_fkey"
            columns: ["sports_event_id"]
            isOneToOne: true
            referencedRelation: "sports_events"
            referencedColumns: ["id"]
          },
        ]
      }
      health_check_runs: {
        Row: {
          check_name: string
          created_at: string
          duration_ms: number
          error: string | null
          id: string
          metadata: Json
          status: string
        }
        Insert: {
          check_name: string
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          metadata?: Json
          status: string
        }
        Update: {
          check_name?: string
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          metadata?: Json
          status?: string
        }
        Relationships: []
      }
      incidents: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          resolution_summary: string | null
          resolved_at: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          severity: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      league_members: {
        Row: {
          joined_at: string
          league_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          league_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          league_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invite_code: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code?: string
          name?: string
        }
        Relationships: []
      }
      market_odds_snapshots: {
        Row: {
          id: string
          market: string
          match_id: string
          odds: number
          selection: string
          snapshot_at: string
          source: string
        }
        Insert: {
          id?: string
          market: string
          match_id: string
          odds: number
          selection: string
          snapshot_at?: string
          source?: string
        }
        Update: {
          id?: string
          market?: string
          match_id?: string
          odds?: number
          selection?: string
          snapshot_at?: string
          source?: string
        }
        Relationships: []
      }
      market_rules: {
        Row: {
          audit_notes: string | null
          category: string
          created_at: string
          data_required: string[]
          display_name: string
          id: string
          is_active: boolean
          is_scoreline_dependent: boolean
          is_stat_dependent: boolean
          market_aliases: string[]
          market_key: string
          risk_notes: string | null
          settlement_basis: string
          supported_outcomes: string[]
          updated_at: string
          user_facing_note: string | null
          void_conditions: string[]
        }
        Insert: {
          audit_notes?: string | null
          category: string
          created_at?: string
          data_required?: string[]
          display_name: string
          id?: string
          is_active?: boolean
          is_scoreline_dependent?: boolean
          is_stat_dependent?: boolean
          market_aliases?: string[]
          market_key: string
          risk_notes?: string | null
          settlement_basis: string
          supported_outcomes?: string[]
          updated_at?: string
          user_facing_note?: string | null
          void_conditions?: string[]
        }
        Update: {
          audit_notes?: string | null
          category?: string
          created_at?: string
          data_required?: string[]
          display_name?: string
          id?: string
          is_active?: boolean
          is_scoreline_dependent?: boolean
          is_stat_dependent?: boolean
          market_aliases?: string[]
          market_key?: string
          risk_notes?: string | null
          settlement_basis?: string
          supported_outcomes?: string[]
          updated_at?: string
          user_facing_note?: string | null
          void_conditions?: string[]
        }
        Relationships: []
      }
      match_events: {
        Row: {
          assist_name: string | null
          comments: string | null
          created_at: string
          dedup_key: string
          detail: string | null
          extra_minute: number | null
          id: string
          match_id: string
          minute: number | null
          player_name: string | null
          side: string | null
          type: string
        }
        Insert: {
          assist_name?: string | null
          comments?: string | null
          created_at?: string
          dedup_key: string
          detail?: string | null
          extra_minute?: number | null
          id?: string
          match_id: string
          minute?: number | null
          player_name?: string | null
          side?: string | null
          type: string
        }
        Update: {
          assist_name?: string | null
          comments?: string | null
          created_at?: string
          dedup_key?: string
          detail?: string | null
          extra_minute?: number | null
          id?: string
          match_id?: string
          minute?: number | null
          player_name?: string | null
          side?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_exposure_scenarios: {
        Row: {
          assumptions: Json
          away_goals: number | null
          calculated_at: string
          contributing_bet_ids: string[]
          exposure_breakdown: Json
          gross_payout: number
          home_goals: number | null
          id: string
          match_id: string
          net_liability: number
          scenario_key: string
          scenario_label: string
          total_stake_involved: number
          winning_bet_count: number
        }
        Insert: {
          assumptions?: Json
          away_goals?: number | null
          calculated_at?: string
          contributing_bet_ids?: string[]
          exposure_breakdown?: Json
          gross_payout?: number
          home_goals?: number | null
          id?: string
          match_id: string
          net_liability?: number
          scenario_key: string
          scenario_label: string
          total_stake_involved?: number
          winning_bet_count?: number
        }
        Update: {
          assumptions?: Json
          away_goals?: number | null
          calculated_at?: string
          contributing_bet_ids?: string[]
          exposure_breakdown?: Json
          gross_payout?: number
          home_goals?: number | null
          id?: string
          match_id?: string
          net_liability?: number
          scenario_key?: string
          scenario_label?: string
          total_stake_involved?: number
          winning_bet_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_exposure_scenarios_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_h2h: {
        Row: {
          fetched_at: string
          fixtures: Json
          pair_key: string
          team_a: string
          team_b: string
        }
        Insert: {
          fetched_at?: string
          fixtures?: Json
          pair_key: string
          team_a: string
          team_b: string
        }
        Update: {
          fetched_at?: string
          fixtures?: Json
          pair_key?: string
          team_a?: string
          team_b?: string
        }
        Relationships: []
      }
      match_injuries: {
        Row: {
          fetched_at: string
          id: string
          match_id: string
          player_name: string
          position: string | null
          reason: string | null
          side: string
          type: string | null
        }
        Insert: {
          fetched_at?: string
          id?: string
          match_id: string
          player_name: string
          position?: string | null
          reason?: string | null
          side: string
          type?: string | null
        }
        Update: {
          fetched_at?: string
          id?: string
          match_id?: string
          player_name?: string
          position?: string | null
          reason?: string | null
          side?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_injuries_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_lineups: {
        Row: {
          coach_name: string | null
          fetched_at: string
          formation: string | null
          id: string
          match_id: string
          side: string
          starters: Json
          substitutes: Json
          team_logo: string | null
          team_name: string | null
        }
        Insert: {
          coach_name?: string | null
          fetched_at?: string
          formation?: string | null
          id?: string
          match_id: string
          side: string
          starters?: Json
          substitutes?: Json
          team_logo?: string | null
          team_name?: string | null
        }
        Update: {
          coach_name?: string | null
          fetched_at?: string
          formation?: string | null
          id?: string
          match_id?: string
          side?: string
          starters?: Json
          substitutes?: Json
          team_logo?: string | null
          team_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_lineups_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_market_odds: {
        Row: {
          active: boolean
          created_at: string
          generated: boolean
          id: string
          market: string
          match_id: string
          odds: number
          selection: string
          source: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          generated?: boolean
          id?: string
          market: string
          match_id: string
          odds: number
          selection: string
          source?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          generated?: boolean
          id?: string
          market?: string
          match_id?: string
          odds?: number
          selection?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_market_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_odds_snapshots: {
        Row: {
          away_odds: number
          created_at: string
          draw_odds: number
          home_odds: number
          id: string
          match_id: string
          raw_bookmaker_count: number | null
          sampled_at: string
          source: string
        }
        Insert: {
          away_odds: number
          created_at?: string
          draw_odds: number
          home_odds: number
          id?: string
          match_id: string
          raw_bookmaker_count?: number | null
          sampled_at?: string
          source?: string
        }
        Update: {
          away_odds?: number
          created_at?: string
          draw_odds?: number
          home_odds?: number
          id?: string
          match_id?: string
          raw_bookmaker_count?: number | null
          sampled_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_odds_snapshots_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_player_ratings: {
        Row: {
          assists: number | null
          fetched_at: string
          goals: number | null
          id: string
          match_id: string
          minutes: number | null
          number: number | null
          passes_accuracy: number | null
          passes_total: number | null
          player_id: number | null
          player_name: string
          position: string | null
          rating: number | null
          red_cards: number | null
          shots_on: number | null
          shots_total: number | null
          side: string
          tackles: number | null
          yellow_cards: number | null
        }
        Insert: {
          assists?: number | null
          fetched_at?: string
          goals?: number | null
          id?: string
          match_id: string
          minutes?: number | null
          number?: number | null
          passes_accuracy?: number | null
          passes_total?: number | null
          player_id?: number | null
          player_name: string
          position?: string | null
          rating?: number | null
          red_cards?: number | null
          shots_on?: number | null
          shots_total?: number | null
          side: string
          tackles?: number | null
          yellow_cards?: number | null
        }
        Update: {
          assists?: number | null
          fetched_at?: string
          goals?: number | null
          id?: string
          match_id?: string
          minutes?: number | null
          number?: number | null
          passes_accuracy?: number | null
          passes_total?: number | null
          player_id?: number | null
          player_name?: string
          position?: string | null
          rating?: number | null
          red_cards?: number | null
          shots_on?: number | null
          shots_total?: number | null
          side?: string
          tackles?: number | null
          yellow_cards?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_player_ratings_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_pool_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          is_simulation: boolean
          match_id: string
          pool_balance_after: number
          pool_balance_before: number
          prediction_id: string | null
          transaction_type: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          is_simulation?: boolean
          match_id: string
          pool_balance_after: number
          pool_balance_before: number
          prediction_id?: string | null
          transaction_type: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          is_simulation?: boolean
          match_id?: string
          pool_balance_after?: number
          pool_balance_before?: number
          prediction_id?: string | null
          transaction_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_pool_transactions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_pool_transactions_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      match_stake_pools: {
        Row: {
          away_pool: number
          created_at: string
          draw_pool: number
          home_pool: number
          id: string
          is_simulation: boolean
          match_id: string
          settled: boolean
          settled_at: string | null
          total_pool: number
          updated_at: string
          voided: boolean
        }
        Insert: {
          away_pool?: number
          created_at?: string
          draw_pool?: number
          home_pool?: number
          id?: string
          is_simulation?: boolean
          match_id: string
          settled?: boolean
          settled_at?: string | null
          total_pool?: number
          updated_at?: string
          voided?: boolean
        }
        Update: {
          away_pool?: number
          created_at?: string
          draw_pool?: number
          home_pool?: number
          id?: string
          is_simulation?: boolean
          match_id?: string
          settled?: boolean
          settled_at?: string | null
          total_pool?: number
          updated_at?: string
          voided?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "match_stake_pools_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_stats: {
        Row: {
          corners: number | null
          fetched_at: string
          fouls: number | null
          id: string
          match_id: string
          offsides: number | null
          passes_accurate: number | null
          passes_pct: number | null
          passes_total: number | null
          possession: number | null
          red_cards: number | null
          saves: number | null
          shots_blocked: number | null
          shots_inside: number | null
          shots_off: number | null
          shots_on: number | null
          shots_outside: number | null
          shots_total: number | null
          side: string
          xg: number | null
          yellow_cards: number | null
        }
        Insert: {
          corners?: number | null
          fetched_at?: string
          fouls?: number | null
          id?: string
          match_id: string
          offsides?: number | null
          passes_accurate?: number | null
          passes_pct?: number | null
          passes_total?: number | null
          possession?: number | null
          red_cards?: number | null
          saves?: number | null
          shots_blocked?: number | null
          shots_inside?: number | null
          shots_off?: number | null
          shots_on?: number | null
          shots_outside?: number | null
          shots_total?: number | null
          side: string
          xg?: number | null
          yellow_cards?: number | null
        }
        Update: {
          corners?: number | null
          fetched_at?: string
          fouls?: number | null
          id?: string
          match_id?: string
          offsides?: number | null
          passes_accurate?: number | null
          passes_pct?: number | null
          passes_total?: number | null
          possession?: number | null
          red_cards?: number | null
          saves?: number | null
          shots_blocked?: number | null
          shots_inside?: number | null
          shots_off?: number | null
          shots_on?: number | null
          shots_outside?: number | null
          shots_total?: number | null
          side?: string
          xg?: number | null
          yellow_cards?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_stats_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          apifootball_fixture_id: number | null
          away_cards: number | null
          away_corners: number | null
          away_crest: string | null
          away_liability: number
          away_score: number | null
          away_score_ht: number | null
          away_team: string
          created_at: string
          draw_liability: number
          exposure_is_stale: boolean
          exposure_last_calculated_at: string | null
          external_id: string | null
          finished_at: string | null
          first_card_team: string | null
          first_corner_team: string | null
          ft_away_score: number | null
          ft_home_score: number | null
          group_name: string | null
          home_cards: number | null
          home_corners: number | null
          home_crest: string | null
          home_liability: number
          home_score: number | null
          home_score_ht: number | null
          home_team: string
          id: string
          is_simulation: boolean
          kickoff_at: string
          live_elapsed: number | null
          live_status_short: string | null
          manual_override: boolean
          margin_disabled: boolean
          odds_source: string | null
          odds_status: string
          odds_updated_at: string | null
          penalty_away_score: number | null
          penalty_home_score: number | null
          qualifier: string | null
          red_card_occurred: boolean | null
          reference_odds: Json | null
          stage: string | null
          stats_status: string
          status: Database["public"]["Enums"]["match_status"]
          suspended_markets: string[]
          updated_at: string
          winner: string | null
          worst_case_exposure: number
          worst_case_gross_payout: number
          worst_case_net_liability: number
          worst_case_scenario_key: string | null
          worst_case_scenario_label: string | null
        }
        Insert: {
          apifootball_fixture_id?: number | null
          away_cards?: number | null
          away_corners?: number | null
          away_crest?: string | null
          away_liability?: number
          away_score?: number | null
          away_score_ht?: number | null
          away_team: string
          created_at?: string
          draw_liability?: number
          exposure_is_stale?: boolean
          exposure_last_calculated_at?: string | null
          external_id?: string | null
          finished_at?: string | null
          first_card_team?: string | null
          first_corner_team?: string | null
          ft_away_score?: number | null
          ft_home_score?: number | null
          group_name?: string | null
          home_cards?: number | null
          home_corners?: number | null
          home_crest?: string | null
          home_liability?: number
          home_score?: number | null
          home_score_ht?: number | null
          home_team: string
          id?: string
          is_simulation?: boolean
          kickoff_at: string
          live_elapsed?: number | null
          live_status_short?: string | null
          manual_override?: boolean
          margin_disabled?: boolean
          odds_source?: string | null
          odds_status?: string
          odds_updated_at?: string | null
          penalty_away_score?: number | null
          penalty_home_score?: number | null
          qualifier?: string | null
          red_card_occurred?: boolean | null
          reference_odds?: Json | null
          stage?: string | null
          stats_status?: string
          status?: Database["public"]["Enums"]["match_status"]
          suspended_markets?: string[]
          updated_at?: string
          winner?: string | null
          worst_case_exposure?: number
          worst_case_gross_payout?: number
          worst_case_net_liability?: number
          worst_case_scenario_key?: string | null
          worst_case_scenario_label?: string | null
        }
        Update: {
          apifootball_fixture_id?: number | null
          away_cards?: number | null
          away_corners?: number | null
          away_crest?: string | null
          away_liability?: number
          away_score?: number | null
          away_score_ht?: number | null
          away_team?: string
          created_at?: string
          draw_liability?: number
          exposure_is_stale?: boolean
          exposure_last_calculated_at?: string | null
          external_id?: string | null
          finished_at?: string | null
          first_card_team?: string | null
          first_corner_team?: string | null
          ft_away_score?: number | null
          ft_home_score?: number | null
          group_name?: string | null
          home_cards?: number | null
          home_corners?: number | null
          home_crest?: string | null
          home_liability?: number
          home_score?: number | null
          home_score_ht?: number | null
          home_team?: string
          id?: string
          is_simulation?: boolean
          kickoff_at?: string
          live_elapsed?: number | null
          live_status_short?: string | null
          manual_override?: boolean
          margin_disabled?: boolean
          odds_source?: string | null
          odds_status?: string
          odds_updated_at?: string | null
          penalty_away_score?: number | null
          penalty_home_score?: number | null
          qualifier?: string | null
          red_card_occurred?: boolean | null
          reference_odds?: Json | null
          stage?: string | null
          stats_status?: string
          status?: Database["public"]["Enums"]["match_status"]
          suspended_markets?: string[]
          updated_at?: string
          winner?: string | null
          worst_case_exposure?: number
          worst_case_gross_payout?: number
          worst_case_net_liability?: number
          worst_case_scenario_key?: string | null
          worst_case_scenario_label?: string | null
        }
        Relationships: []
      }
      notification_events: {
        Row: {
          channel_results: Json
          created_at: string
          error_message: string | null
          event_type: string
          failed_at: string | null
          id: string
          payload: Json
          recipient_user_id: string | null
          related_record_id: string | null
          related_record_type: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          channel_results?: Json
          created_at?: string
          error_message?: string | null
          event_type: string
          failed_at?: string | null
          id?: string
          payload?: Json
          recipient_user_id?: string | null
          related_record_id?: string | null
          related_record_type?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          channel_results?: Json
          created_at?: string
          error_message?: string | null
          event_type?: string
          failed_at?: string | null
          id?: string
          payload?: Json
          recipient_user_id?: string | null
          related_record_id?: string | null
          related_record_type?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          email_enabled: boolean
          push_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          email_enabled?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          email_enabled?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_events: {
        Row: {
          created_at: string
          event: string
          id: string
          metadata: Json
          step_index: number | null
          tour_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          metadata?: Json
          step_index?: number | null
          tour_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          metadata?: Json
          step_index?: number | null
          tour_key?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_settings: {
        Row: {
          enabled: boolean
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      operational_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          category: string
          created_at: string
          id: string
          level: string
          message: string | null
          metadata: Json
          resolved_at: string | null
          resolved_by: string | null
          status: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          category: string
          created_at?: string
          id?: string
          level: string
          message?: string | null
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          category?: string
          created_at?: string
          id?: string
          level?: string
          message?: string | null
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title?: string
        }
        Relationships: []
      }
      page_views: {
        Row: {
          created_at: string
          id: string
          path: string
        }
        Insert: {
          created_at?: string
          id?: string
          path?: string
        }
        Update: {
          created_at?: string
          id?: string
          path?: string
        }
        Relationships: []
      }
      payout_requests: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          bank_account_number: string
          bank_name: string
          bank_reference_no: string | null
          checker_notes: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          proof_file_name: string | null
          proof_file_path: string | null
          proof_file_size: number | null
          proof_file_type: string | null
          proof_uploaded_at: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["payout_request_status"]
          updated_at: string
          user_decision_at: string | null
          user_id: string
          user_rejection_reason: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account_number: string
          bank_name: string
          bank_reference_no?: string | null
          checker_notes?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          proof_file_name?: string | null
          proof_file_path?: string | null
          proof_file_size?: number | null
          proof_file_type?: string | null
          proof_uploaded_at?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payout_request_status"]
          updated_at?: string
          user_decision_at?: string | null
          user_id: string
          user_rejection_reason?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account_number?: string
          bank_name?: string
          bank_reference_no?: string | null
          checker_notes?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          proof_file_name?: string | null
          proof_file_path?: string | null
          proof_file_size?: number | null
          proof_file_type?: string | null
          proof_uploaded_at?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payout_request_status"]
          updated_at?: string
          user_decision_at?: string | null
          user_id?: string
          user_rejection_reason?: string | null
        }
        Relationships: []
      }
      platform_bankroll: {
        Row: {
          balance: number
          created_at: string
          house_user_id: string | null
          id: number
          is_active: boolean
          kind: string
          total_payouts_paid: number
          total_stakes_collected: number
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          house_user_id?: string | null
          id?: number
          is_active?: boolean
          kind?: string
          total_payouts_paid?: number
          total_stakes_collected?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          house_user_id?: string | null
          id?: number
          is_active?: boolean
          kind?: string
          total_payouts_paid?: number
          total_stakes_collected?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_bankroll_write_log: {
        Row: {
          app_context: string | null
          balance_after: number | null
          balance_before: number | null
          bankroll_id: number
          created_at: string
          db_user: string
          id: number
          txid: number
        }
        Insert: {
          app_context?: string | null
          balance_after?: number | null
          balance_before?: number | null
          bankroll_id: number
          created_at?: string
          db_user: string
          id?: number
          txid: number
        }
        Update: {
          app_context?: string | null
          balance_after?: number | null
          balance_before?: number | null
          bankroll_id?: number
          created_at?: string
          db_user?: string
          id?: number
          txid?: number
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          admin_alert_emails: string[]
          alert_suppression_window_minutes: number
          allow_single_admin_self_approval: boolean
          apply_margin_to_real: boolean
          bets_paused: boolean
          cards_corners_void_after_hours: number
          correct_score_disabled: boolean
          correlation_groups: Json
          critical_alert_email_enabled: boolean
          disabled_markets: string[]
          exposure_cap_pct: number
          high_odds_disabled: boolean
          high_odds_threshold: number
          id: number
          last_alert_sent_at: string | null
          margin_pct: number
          max_bets_per_user_per_match: number
          max_correct_score_other_liability: number | null
          max_high_odds_stake: number | null
          max_match_worst_case_liability: number | null
          max_odds_age_minutes: number | null
          max_potential_payout: number
          max_single_bet_payout: number | null
          max_single_outcome_liability: number | null
          max_stake_per_bet: number
          max_user_daily_potential_payout: number
          max_user_match_correlated_payout: number
          max_user_match_potential_payout: number
          max_user_match_stake: number
          odds_deviation_threshold_pct: number | null
          updated_at: string
        }
        Insert: {
          admin_alert_emails?: string[]
          alert_suppression_window_minutes?: number
          allow_single_admin_self_approval?: boolean
          apply_margin_to_real?: boolean
          bets_paused?: boolean
          cards_corners_void_after_hours?: number
          correct_score_disabled?: boolean
          correlation_groups?: Json
          critical_alert_email_enabled?: boolean
          disabled_markets?: string[]
          exposure_cap_pct?: number
          high_odds_disabled?: boolean
          high_odds_threshold?: number
          id?: number
          last_alert_sent_at?: string | null
          margin_pct?: number
          max_bets_per_user_per_match?: number
          max_correct_score_other_liability?: number | null
          max_high_odds_stake?: number | null
          max_match_worst_case_liability?: number | null
          max_odds_age_minutes?: number | null
          max_potential_payout?: number
          max_single_bet_payout?: number | null
          max_single_outcome_liability?: number | null
          max_stake_per_bet?: number
          max_user_daily_potential_payout?: number
          max_user_match_correlated_payout?: number
          max_user_match_potential_payout?: number
          max_user_match_stake?: number
          odds_deviation_threshold_pct?: number | null
          updated_at?: string
        }
        Update: {
          admin_alert_emails?: string[]
          alert_suppression_window_minutes?: number
          allow_single_admin_self_approval?: boolean
          apply_margin_to_real?: boolean
          bets_paused?: boolean
          cards_corners_void_after_hours?: number
          correct_score_disabled?: boolean
          correlation_groups?: Json
          critical_alert_email_enabled?: boolean
          disabled_markets?: string[]
          exposure_cap_pct?: number
          high_odds_disabled?: boolean
          high_odds_threshold?: number
          id?: number
          last_alert_sent_at?: string | null
          margin_pct?: number
          max_bets_per_user_per_match?: number
          max_correct_score_other_liability?: number | null
          max_high_odds_stake?: number | null
          max_match_worst_case_liability?: number | null
          max_odds_age_minutes?: number | null
          max_potential_payout?: number
          max_single_bet_payout?: number | null
          max_single_outcome_liability?: number | null
          max_stake_per_bet?: number
          max_user_daily_potential_payout?: number
          max_user_match_correlated_payout?: number
          max_user_match_potential_payout?: number
          max_user_match_stake?: number
          odds_deviation_threshold_pct?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          bet_id: string | null
          created_at: string
          id: string
          is_simulation: boolean
          ledger_seq: number | null
          match_id: string | null
          note: string | null
          transaction_type: Database["public"]["Enums"]["platform_txn_type"]
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          bet_id?: string | null
          created_at?: string
          id?: string
          is_simulation?: boolean
          ledger_seq?: number | null
          match_id?: string | null
          note?: string | null
          transaction_type: Database["public"]["Enums"]["platform_txn_type"]
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          bet_id?: string | null
          created_at?: string
          id?: string
          is_simulation?: boolean
          ledger_seq?: number | null
          match_id?: string | null
          note?: string | null
          transaction_type?: Database["public"]["Enums"]["platform_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "platform_transactions_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_transactions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      point_requests: {
        Row: {
          id: string
          is_simulation: boolean
          proof_file_name: string | null
          proof_file_path: string | null
          proof_file_size: number | null
          proof_file_type: string | null
          public_reference: string | null
          reason: string | null
          rejection_reason: string | null
          requested_amount: number
          requested_at: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["point_request_status"]
          submitted_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          is_simulation?: boolean
          proof_file_name?: string | null
          proof_file_path?: string | null
          proof_file_size?: number | null
          proof_file_type?: string | null
          public_reference?: string | null
          reason?: string | null
          rejection_reason?: string | null
          requested_amount: number
          requested_at?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["point_request_status"]
          submitted_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          is_simulation?: boolean
          proof_file_name?: string | null
          proof_file_path?: string | null
          proof_file_size?: number | null
          proof_file_type?: string | null
          public_reference?: string | null
          reason?: string | null
          rejection_reason?: string | null
          requested_amount?: number
          requested_at?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["point_request_status"]
          submitted_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      predictions: {
        Row: {
          client_request_id: string | null
          created_at: string
          flagged_for_review: boolean
          flagged_reason: string | null
          free_bet_id: string | null
          gross_payout: number
          house_profit_loss: number
          id: string
          is_simulation: boolean
          market: Database["public"]["Enums"]["prediction_market"]
          market_label: string | null
          market_text: string | null
          match_id: string | null
          net_profit: number
          outcome: string
          points: number
          potential_return: number
          reference_odds: number
          reference_odds_snapshot_id: string | null
          selection_label: string | null
          settled_at: string | null
          settled_result: string | null
          settlement_accounting_version: string
          status: Database["public"]["Enums"]["prediction_status"]
          user_id: string
          virtual_stake: number
        }
        Insert: {
          client_request_id?: string | null
          created_at?: string
          flagged_for_review?: boolean
          flagged_reason?: string | null
          free_bet_id?: string | null
          gross_payout?: number
          house_profit_loss?: number
          id?: string
          is_simulation?: boolean
          market: Database["public"]["Enums"]["prediction_market"]
          market_label?: string | null
          market_text?: string | null
          match_id?: string | null
          net_profit?: number
          outcome: string
          points?: number
          potential_return?: number
          reference_odds?: number
          reference_odds_snapshot_id?: string | null
          selection_label?: string | null
          settled_at?: string | null
          settled_result?: string | null
          settlement_accounting_version?: string
          status?: Database["public"]["Enums"]["prediction_status"]
          user_id: string
          virtual_stake?: number
        }
        Update: {
          client_request_id?: string | null
          created_at?: string
          flagged_for_review?: boolean
          flagged_reason?: string | null
          free_bet_id?: string | null
          gross_payout?: number
          house_profit_loss?: number
          id?: string
          is_simulation?: boolean
          market?: Database["public"]["Enums"]["prediction_market"]
          market_label?: string | null
          market_text?: string | null
          match_id?: string | null
          net_profit?: number
          outcome?: string
          points?: number
          potential_return?: number
          reference_odds?: number
          reference_odds_snapshot_id?: string | null
          selection_label?: string | null
          settled_at?: string | null
          settled_result?: string | null
          settlement_accounting_version?: string
          status?: Database["public"]["Enums"]["prediction_status"]
          user_id?: string
          virtual_stake?: number
        }
        Relationships: [
          {
            foreignKeyName: "predictions_free_bet_id_fkey"
            columns: ["free_bet_id"]
            isOneToOne: false
            referencedRelation: "csse_free_bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_reference_odds_snapshot_id_fkey"
            columns: ["reference_odds_snapshot_id"]
            isOneToOne: false
            referencedRelation: "match_odds_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_provider: string | null
          avatar_url: string | null
          created_at: string
          display_name: string
          force_password_change: boolean
          id: string
          is_simulation: boolean
          onboarding_completed_at: string | null
          onboarding_enabled: boolean
          onboarding_skipped_at: string | null
          phone_number: string | null
          public_reference: string
          referral_code: string
          referred_by_code: string | null
          risk_factor: number
          risk_factor_reason: string | null
          risk_factor_updated_at: string | null
          suspended: boolean
          tour_progress: Json
        }
        Insert: {
          auth_provider?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name: string
          force_password_change?: boolean
          id: string
          is_simulation?: boolean
          onboarding_completed_at?: string | null
          onboarding_enabled?: boolean
          onboarding_skipped_at?: string | null
          phone_number?: string | null
          public_reference?: string
          referral_code: string
          referred_by_code?: string | null
          risk_factor?: number
          risk_factor_reason?: string | null
          risk_factor_updated_at?: string | null
          suspended?: boolean
          tour_progress?: Json
        }
        Update: {
          auth_provider?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          force_password_change?: boolean
          id?: string
          is_simulation?: boolean
          onboarding_completed_at?: string | null
          onboarding_enabled?: boolean
          onboarding_skipped_at?: string | null
          phone_number?: string | null
          public_reference?: string
          referral_code?: string
          referred_by_code?: string | null
          risk_factor?: number
          risk_factor_reason?: string | null
          risk_factor_updated_at?: string | null
          suspended?: boolean
          tour_progress?: Json
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          revoked_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action: string
          count: number
          created_at: string
          id: string
          scope: string
          window_start: string
        }
        Insert: {
          action: string
          count?: number
          created_at?: string
          id?: string
          scope: string
          window_start: string
        }
        Update: {
          action?: string
          count?: number
          created_at?: string
          id?: string
          scope?: string
          window_start?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          cumulative_settled_wagered: number
          flag_reason: string | null
          flagged: boolean
          id: string
          referral_code: string
          referred_user_id: string
          referrer_user_id: string
          stage1_completed: boolean
          stage1_rewarded_at: string | null
          stage2_completed: boolean
          stage2_rewarded_at: string | null
          stage3_completed: boolean
          stage3_rewarded_at: string | null
          total_tokens_awarded: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          cumulative_settled_wagered?: number
          flag_reason?: string | null
          flagged?: boolean
          id?: string
          referral_code: string
          referred_user_id: string
          referrer_user_id: string
          stage1_completed?: boolean
          stage1_rewarded_at?: string | null
          stage2_completed?: boolean
          stage2_rewarded_at?: string | null
          stage3_completed?: boolean
          stage3_rewarded_at?: string | null
          total_tokens_awarded?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          cumulative_settled_wagered?: number
          flag_reason?: string | null
          flagged?: boolean
          id?: string
          referral_code?: string
          referred_user_id?: string
          referrer_user_id?: string
          stage1_completed?: boolean
          stage1_rewarded_at?: string | null
          stage2_completed?: boolean
          stage2_rewarded_at?: string | null
          stage3_completed?: boolean
          stage3_rewarded_at?: string | null
          total_tokens_awarded?: number
          updated_at?: string
        }
        Relationships: []
      }
      saved_bank_accounts: {
        Row: {
          account_holder_name: string | null
          account_number: string
          bank_name: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_holder_name?: string | null
          account_number: string
          bank_name: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_holder_name?: string | null
          account_number?: string
          bank_name?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      settlement_journal: {
        Row: {
          created_at: string
          final_status: string | null
          gross_payout: number | null
          id: string
          idempotency_key: string
          metadata: Json
          previous_status: string | null
          product: string
          reference_id: string
          settlement_action: string
          settlement_version: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          final_status?: string | null
          gross_payout?: number | null
          id?: string
          idempotency_key: string
          metadata?: Json
          previous_status?: string | null
          product: string
          reference_id: string
          settlement_action: string
          settlement_version?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          final_status?: string | null
          gross_payout?: number | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          previous_status?: string | null
          product?: string
          reference_id?: string
          settlement_action?: string
          settlement_version?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sports_bets: {
        Row: {
          accepted_odds: number
          actual_payout: number | null
          competition_code: string
          created_at: string
          id: string
          idempotency_key: string | null
          market_key: string
          placed_at: string
          potential_payout: number
          provider_odds_ts: string | null
          selection_key: string
          settled_at: string | null
          sport_code: string
          sports_event_id: string
          sports_market_id: string
          sports_selection_id: string
          stake: number
          status: string
          updated_at: string
          user_id: string
          void_reason: string | null
        }
        Insert: {
          accepted_odds: number
          actual_payout?: number | null
          competition_code: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          market_key: string
          placed_at?: string
          potential_payout: number
          provider_odds_ts?: string | null
          selection_key: string
          settled_at?: string | null
          sport_code: string
          sports_event_id: string
          sports_market_id: string
          sports_selection_id: string
          stake: number
          status?: string
          updated_at?: string
          user_id: string
          void_reason?: string | null
        }
        Update: {
          accepted_odds?: number
          actual_payout?: number | null
          competition_code?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          market_key?: string
          placed_at?: string
          potential_payout?: number
          provider_odds_ts?: string | null
          selection_key?: string
          settled_at?: string | null
          sport_code?: string
          sports_event_id?: string
          sports_market_id?: string
          sports_selection_id?: string
          stake?: number
          status?: string
          updated_at?: string
          user_id?: string
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sports_bets_sports_event_id_fkey"
            columns: ["sports_event_id"]
            isOneToOne: false
            referencedRelation: "sports_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sports_bets_sports_market_id_fkey"
            columns: ["sports_market_id"]
            isOneToOne: false
            referencedRelation: "sports_markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sports_bets_sports_selection_id_fkey"
            columns: ["sports_selection_id"]
            isOneToOne: false
            referencedRelation: "sports_market_selections"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_competitions: {
        Row: {
          allowed_markets: Json
          api_football_league_id: number | null
          competition_code: string
          config: Json
          country: string | null
          created_at: string
          current_season: string | null
          display_name: string
          display_order: number
          fixture_sync_enabled: boolean
          id: string
          is_enabled: boolean
          live_sync_enabled: boolean
          logo_url: string | null
          odds_api_sport_key: string | null
          odds_sync_enabled: boolean
          settlement_enabled: boolean
          short_name: string | null
          sport_code: string
          updated_at: string
        }
        Insert: {
          allowed_markets?: Json
          api_football_league_id?: number | null
          competition_code: string
          config?: Json
          country?: string | null
          created_at?: string
          current_season?: string | null
          display_name: string
          display_order?: number
          fixture_sync_enabled?: boolean
          id?: string
          is_enabled?: boolean
          live_sync_enabled?: boolean
          logo_url?: string | null
          odds_api_sport_key?: string | null
          odds_sync_enabled?: boolean
          settlement_enabled?: boolean
          short_name?: string | null
          sport_code: string
          updated_at?: string
        }
        Update: {
          allowed_markets?: Json
          api_football_league_id?: number | null
          competition_code?: string
          config?: Json
          country?: string | null
          created_at?: string
          current_season?: string | null
          display_name?: string
          display_order?: number
          fixture_sync_enabled?: boolean
          id?: string
          is_enabled?: boolean
          live_sync_enabled?: boolean
          logo_url?: string | null
          odds_api_sport_key?: string | null
          odds_sync_enabled?: boolean
          settlement_enabled?: boolean
          short_name?: string | null
          sport_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      sports_event_provider_mappings: {
        Row: {
          created_at: string
          id: string
          mapping_method: string | null
          mapping_status: string
          match_confidence: number
          metadata: Json
          needs_review: boolean
          provider: string
          provider_competition_id: string | null
          provider_event_id: string
          sports_event_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          mapping_method?: string | null
          mapping_status?: string
          match_confidence?: number
          metadata?: Json
          needs_review?: boolean
          provider: string
          provider_competition_id?: string | null
          provider_event_id: string
          sports_event_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mapping_method?: string | null
          mapping_status?: string
          match_confidence?: number
          metadata?: Json
          needs_review?: boolean
          provider?: string
          provider_competition_id?: string | null
          provider_event_id?: string
          sports_event_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sports_event_provider_mappings_sports_event_id_fkey"
            columns: ["sports_event_id"]
            isOneToOne: false
            referencedRelation: "sports_events"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_events: {
        Row: {
          away_logo: string | null
          away_name: string | null
          away_provider_id: string | null
          away_score: number | null
          away_short: string | null
          competition_code: string
          created_at: string
          event_name: string | null
          final_result: Json | null
          home_logo: string | null
          home_name: string | null
          home_provider_id: string | null
          home_score: number | null
          home_short: string | null
          ht_away_score: number | null
          ht_home_score: number | null
          id: string
          is_enabled: boolean
          is_featured: boolean
          live_minute: number | null
          live_state: Json
          markets_open: boolean
          round: string | null
          scheduled_at: string
          season: string | null
          source_metadata: Json
          sport_code: string
          status: string
          timezone: string | null
          updated_at: string
          venue: string | null
        }
        Insert: {
          away_logo?: string | null
          away_name?: string | null
          away_provider_id?: string | null
          away_score?: number | null
          away_short?: string | null
          competition_code: string
          created_at?: string
          event_name?: string | null
          final_result?: Json | null
          home_logo?: string | null
          home_name?: string | null
          home_provider_id?: string | null
          home_score?: number | null
          home_short?: string | null
          ht_away_score?: number | null
          ht_home_score?: number | null
          id?: string
          is_enabled?: boolean
          is_featured?: boolean
          live_minute?: number | null
          live_state?: Json
          markets_open?: boolean
          round?: string | null
          scheduled_at: string
          season?: string | null
          source_metadata?: Json
          sport_code: string
          status?: string
          timezone?: string | null
          updated_at?: string
          venue?: string | null
        }
        Update: {
          away_logo?: string | null
          away_name?: string | null
          away_provider_id?: string | null
          away_score?: number | null
          away_short?: string | null
          competition_code?: string
          created_at?: string
          event_name?: string | null
          final_result?: Json | null
          home_logo?: string | null
          home_name?: string | null
          home_provider_id?: string | null
          home_score?: number | null
          home_short?: string | null
          ht_away_score?: number | null
          ht_home_score?: number | null
          id?: string
          is_enabled?: boolean
          is_featured?: boolean
          live_minute?: number | null
          live_state?: Json
          markets_open?: boolean
          round?: string | null
          scheduled_at?: string
          season?: string | null
          source_metadata?: Json
          sport_code?: string
          status?: string
          timezone?: string | null
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sports_events_competition_code_fkey"
            columns: ["competition_code"]
            isOneToOne: false
            referencedRelation: "sports_competitions"
            referencedColumns: ["competition_code"]
          },
        ]
      }
      sports_feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      sports_market_selections: {
        Row: {
          created_at: string
          decimal_odds: number
          display_name: string
          id: string
          line: number | null
          result: string | null
          selection_key: string
          sort_order: number
          sports_market_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decimal_odds: number
          display_name: string
          id?: string
          line?: number | null
          result?: string | null
          selection_key: string
          sort_order?: number
          sports_market_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decimal_odds?: number
          display_name?: string
          id?: string
          line?: number | null
          result?: string | null
          selection_key?: string
          sort_order?: number
          sports_market_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sports_market_selections_sports_market_id_fkey"
            columns: ["sports_market_id"]
            isOneToOne: false
            referencedRelation: "sports_markets"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_markets: {
        Row: {
          category: string
          closes_at: string | null
          created_at: string
          display_name: string
          id: string
          last_odds_update_at: string | null
          line: number | null
          market_key: string
          opens_at: string | null
          period: string
          provider: string | null
          provider_market_key: string | null
          provider_odds_ts: string | null
          settled_at: string | null
          settlement_reason: string | null
          settlement_result: Json | null
          sort_order: number
          sports_event_id: string
          stale_after_seconds: number
          status: string
          suspension_reason: string | null
          updated_at: string
          void_reason: string | null
          winning_selection_keys: string[] | null
        }
        Insert: {
          category?: string
          closes_at?: string | null
          created_at?: string
          display_name: string
          id?: string
          last_odds_update_at?: string | null
          line?: number | null
          market_key: string
          opens_at?: string | null
          period?: string
          provider?: string | null
          provider_market_key?: string | null
          provider_odds_ts?: string | null
          settled_at?: string | null
          settlement_reason?: string | null
          settlement_result?: Json | null
          sort_order?: number
          sports_event_id: string
          stale_after_seconds?: number
          status?: string
          suspension_reason?: string | null
          updated_at?: string
          void_reason?: string | null
          winning_selection_keys?: string[] | null
        }
        Update: {
          category?: string
          closes_at?: string | null
          created_at?: string
          display_name?: string
          id?: string
          last_odds_update_at?: string | null
          line?: number | null
          market_key?: string
          opens_at?: string | null
          period?: string
          provider?: string | null
          provider_market_key?: string | null
          provider_odds_ts?: string | null
          settled_at?: string | null
          settlement_reason?: string | null
          settlement_result?: Json | null
          sort_order?: number
          sports_event_id?: string
          stale_after_seconds?: number
          status?: string
          suspension_reason?: string | null
          updated_at?: string
          void_reason?: string | null
          winning_selection_keys?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "sports_markets_sports_event_id_fkey"
            columns: ["sports_event_id"]
            isOneToOne: false
            referencedRelation: "sports_events"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_odds_snapshots: {
        Row: {
          bookmaker: string | null
          decimal_odds: number
          fetched_at: string
          id: number
          market_key: string
          provider: string
          provider_ts: string | null
          selection_key: string
          sports_event_id: string
          sports_market_id: string | null
        }
        Insert: {
          bookmaker?: string | null
          decimal_odds: number
          fetched_at?: string
          id?: number
          market_key: string
          provider: string
          provider_ts?: string | null
          selection_key: string
          sports_event_id: string
          sports_market_id?: string | null
        }
        Update: {
          bookmaker?: string | null
          decimal_odds?: number
          fetched_at?: string
          id?: number
          market_key?: string
          provider?: string
          provider_ts?: string | null
          selection_key?: string
          sports_event_id?: string
          sports_market_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sports_odds_snapshots_sports_event_id_fkey"
            columns: ["sports_event_id"]
            isOneToOne: false
            referencedRelation: "sports_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sports_odds_snapshots_sports_market_id_fkey"
            columns: ["sports_market_id"]
            isOneToOne: false
            referencedRelation: "sports_markets"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_results: {
        Row: {
          captured_at: string
          extra_time: boolean
          final_away_score: number | null
          final_home_score: number | null
          ft_status: string | null
          ht_away_score: number | null
          ht_home_score: number | null
          id: string
          penalties: boolean
          provider: string
          raw_stats: Json
          sports_event_id: string
          updated_at: string
        }
        Insert: {
          captured_at?: string
          extra_time?: boolean
          final_away_score?: number | null
          final_home_score?: number | null
          ft_status?: string | null
          ht_away_score?: number | null
          ht_home_score?: number | null
          id?: string
          penalties?: boolean
          provider: string
          raw_stats?: Json
          sports_event_id: string
          updated_at?: string
        }
        Update: {
          captured_at?: string
          extra_time?: boolean
          final_away_score?: number | null
          final_home_score?: number | null
          ft_status?: string | null
          ht_away_score?: number | null
          ht_home_score?: number | null
          id?: string
          penalties?: boolean
          provider?: string
          raw_stats?: Json
          sports_event_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sports_results_sports_event_id_fkey"
            columns: ["sports_event_id"]
            isOneToOne: true
            referencedRelation: "sports_events"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_settlement_items: {
        Row: {
          action: string
          created_at: string
          detail: Json
          id: string
          payout: number
          settlement_run_id: string
          sports_bet_id: string | null
          sports_market_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json
          id?: string
          payout?: number
          settlement_run_id: string
          sports_bet_id?: string | null
          sports_market_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json
          id?: string
          payout?: number
          settlement_run_id?: string
          sports_bet_id?: string | null
          sports_market_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sports_settlement_items_settlement_run_id_fkey"
            columns: ["settlement_run_id"]
            isOneToOne: false
            referencedRelation: "sports_settlement_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sports_settlement_items_sports_bet_id_fkey"
            columns: ["sports_bet_id"]
            isOneToOne: false
            referencedRelation: "sports_bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sports_settlement_items_sports_market_id_fkey"
            columns: ["sports_market_id"]
            isOneToOne: false
            referencedRelation: "sports_markets"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_settlement_runs: {
        Row: {
          bets_settled: number
          created_at: string
          finished_at: string | null
          id: string
          markets_settled: number
          notes: string | null
          sports_event_id: string
          started_at: string
          status: string
          total_payout: number
          triggered_by: string | null
        }
        Insert: {
          bets_settled?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          markets_settled?: number
          notes?: string | null
          sports_event_id: string
          started_at?: string
          status?: string
          total_payout?: number
          triggered_by?: string | null
        }
        Update: {
          bets_settled?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          markets_settled?: number
          notes?: string | null
          sports_event_id?: string
          started_at?: string
          status?: string
          total_payout?: number
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sports_settlement_runs_sports_event_id_fkey"
            columns: ["sports_event_id"]
            isOneToOne: false
            referencedRelation: "sports_events"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_sync_errors: {
        Row: {
          created_at: string
          detail: Json
          id: string
          message: string
          provider: string
          scope: string | null
          sync_run_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: string
          message: string
          provider: string
          scope?: string | null
          sync_run_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: string
          message?: string
          provider?: string
          scope?: string | null
          sync_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sports_sync_errors_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sports_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_sync_runs: {
        Row: {
          api_status: number | null
          competition_code: string | null
          finished_at: string | null
          id: string
          job_type: string
          metadata: Json
          provider: string
          records_created: number
          records_fetched: number
          records_skipped: number
          records_updated: number
          retry_count: number
          sport_code: string | null
          started_at: string
          status: string
        }
        Insert: {
          api_status?: number | null
          competition_code?: string | null
          finished_at?: string | null
          id?: string
          job_type: string
          metadata?: Json
          provider: string
          records_created?: number
          records_fetched?: number
          records_skipped?: number
          records_updated?: number
          retry_count?: number
          sport_code?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          api_status?: number | null
          competition_code?: string | null
          finished_at?: string | null
          id?: string
          job_type?: string
          metadata?: Json
          provider?: string
          records_created?: number
          records_fetched?: number
          records_skipped?: number
          records_updated?: number
          retry_count?: number
          sport_code?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      support_audit_logs: {
        Row: {
          action_type: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          target_id: string | null
          target_type: string | null
          target_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          target_id?: string | null
          target_type?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          target_id?: string | null
          target_type?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      support_conversations: {
        Row: {
          claimed_by: string | null
          created_at: string
          id: string
          last_message_at: string | null
          last_staff_message_at: string | null
          last_user_message_at: string | null
          staff_last_read_at: string | null
          status: string
          updated_at: string
          user_id: string
          user_last_read_at: string | null
        }
        Insert: {
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_staff_message_at?: string | null
          last_user_message_at?: string | null
          staff_last_read_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          user_last_read_at?: string | null
        }
        Update: {
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_staff_message_at?: string | null
          last_user_message_at?: string | null
          staff_last_read_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          user_last_read_at?: string | null
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          attachment_type: string | null
          body: string | null
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
          sender_role: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_type?: string | null
          body?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
          sender_role: string
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_type?: string | null
          body?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      team_season_stats: {
        Row: {
          fetched_at: string
          id: string
          league_id: number
          payload: Json
          recent_form: Json | null
          season: number
          team_key: string
          team_name: string | null
        }
        Insert: {
          fetched_at?: string
          id?: string
          league_id: number
          payload: Json
          recent_form?: Json | null
          season: number
          team_key: string
          team_name?: string | null
        }
        Update: {
          fetched_at?: string
          id?: string
          league_id?: number
          payload?: Json
          recent_form?: Json | null
          season?: number
          team_key?: string
          team_name?: string | null
        }
        Relationships: []
      }
      tournament_outrights: {
        Row: {
          id: string
          odds: number
          source: string | null
          team: string
          tournament_key: string
          updated_at: string
        }
        Insert: {
          id?: string
          odds: number
          source?: string | null
          team: string
          tournament_key: string
          updated_at?: string
        }
        Update: {
          id?: string
          odds?: number
          source?: string | null
          team?: string
          tournament_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_outrights_tournament_key_fkey"
            columns: ["tournament_key"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["key"]
          },
        ]
      }
      tournaments: {
        Row: {
          created_at: string
          key: string
          locks_at: string | null
          name: string
          settled_at: string | null
          status: string
          updated_at: string
          winner_team: string | null
        }
        Insert: {
          created_at?: string
          key: string
          locks_at?: string | null
          name: string
          settled_at?: string | null
          status?: string
          updated_at?: string
          winner_team?: string | null
        }
        Update: {
          created_at?: string
          key?: string
          locks_at?: string | null
          name?: string
          settled_at?: string | null
          status?: string
          updated_at?: string
          winner_team?: string | null
        }
        Relationships: []
      }
      ufc_bets: {
        Row: {
          fight_id: string
          id: string
          market_type: string
          odds_locked: number
          payout: number | null
          placed_at: string
          potential_payout: number
          selection_key: string
          selection_label: string
          settled_at: string | null
          stake: number
          status: string
          user_id: string
        }
        Insert: {
          fight_id: string
          id?: string
          market_type: string
          odds_locked: number
          payout?: number | null
          placed_at?: string
          potential_payout: number
          selection_key: string
          selection_label: string
          settled_at?: string | null
          stake: number
          status?: string
          user_id: string
        }
        Update: {
          fight_id?: string
          id?: string
          market_type?: string
          odds_locked?: number
          payout?: number | null
          placed_at?: string
          potential_payout?: number
          selection_key?: string
          selection_label?: string
          settled_at?: string | null
          stake?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ufc_bets_fight_id_fkey"
            columns: ["fight_id"]
            isOneToOne: false
            referencedRelation: "ufc_fights"
            referencedColumns: ["id"]
          },
        ]
      }
      ufc_events: {
        Row: {
          created_at: string
          event_key: string
          id: string
          is_active: boolean
          last_sync_error: string | null
          last_synced_at: string | null
          name: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_key: string
          id?: string
          is_active?: boolean
          last_sync_error?: string | null
          last_synced_at?: string | null
          name: string
          starts_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_key?: string
          id?: string
          is_active?: boolean
          last_sync_error?: string | null
          last_synced_at?: string | null
          name?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ufc_feed_state: {
        Row: {
          created_at: string
          id: boolean
          last_discovery_at: string | null
          last_odds_at: string | null
          last_result: Json | null
          plan_limited: boolean
          plan_message: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: boolean
          last_discovery_at?: string | null
          last_odds_at?: string | null
          last_result?: Json | null
          plan_limited?: boolean
          plan_message?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: boolean
          last_discovery_at?: string | null
          last_odds_at?: string | null
          last_result?: Json | null
          plan_limited?: boolean
          plan_message?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ufc_fight_h2h: {
        Row: {
          created_at: string
          date: string | null
          event_name: string | null
          fight_id: string
          fighter_slot: string | null
          id: string
          is_win: boolean | null
          method: string | null
          opponent_name: string | null
          past_fight_apimma_id: number | null
          record_type: string
          round: number | null
          winner_slot: string | null
        }
        Insert: {
          created_at?: string
          date?: string | null
          event_name?: string | null
          fight_id: string
          fighter_slot?: string | null
          id?: string
          is_win?: boolean | null
          method?: string | null
          opponent_name?: string | null
          past_fight_apimma_id?: number | null
          record_type?: string
          round?: number | null
          winner_slot?: string | null
        }
        Update: {
          created_at?: string
          date?: string | null
          event_name?: string | null
          fight_id?: string
          fighter_slot?: string | null
          id?: string
          is_win?: boolean | null
          method?: string | null
          opponent_name?: string | null
          past_fight_apimma_id?: number | null
          record_type?: string
          round?: number | null
          winner_slot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ufc_fight_h2h_fight_id_fkey"
            columns: ["fight_id"]
            isOneToOne: false
            referencedRelation: "ufc_fights"
            referencedColumns: ["id"]
          },
        ]
      }
      ufc_fight_markets: {
        Row: {
          fight_id: string
          id: string
          is_active: boolean
          label: string
          market_type: string
          odds: number
          selection_key: string
          updated_at: string
        }
        Insert: {
          fight_id: string
          id?: string
          is_active?: boolean
          label: string
          market_type: string
          odds: number
          selection_key: string
          updated_at?: string
        }
        Update: {
          fight_id?: string
          id?: string
          is_active?: boolean
          label?: string
          market_type?: string
          odds?: number
          selection_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ufc_fight_markets_fight_id_fkey"
            columns: ["fight_id"]
            isOneToOne: false
            referencedRelation: "ufc_fights"
            referencedColumns: ["id"]
          },
        ]
      }
      ufc_fight_stats: {
        Row: {
          control_time_sec: number | null
          created_at: string
          fight_id: string
          fighter_slot: string
          id: string
          knockdowns: number | null
          raw: Json | null
          significant_strikes_attempted: number | null
          significant_strikes_landed: number | null
          strikes_attempted: number | null
          strikes_landed: number | null
          submission_attempts: number | null
          takedowns_attempted: number | null
          takedowns_landed: number | null
          updated_at: string
        }
        Insert: {
          control_time_sec?: number | null
          created_at?: string
          fight_id: string
          fighter_slot: string
          id?: string
          knockdowns?: number | null
          raw?: Json | null
          significant_strikes_attempted?: number | null
          significant_strikes_landed?: number | null
          strikes_attempted?: number | null
          strikes_landed?: number | null
          submission_attempts?: number | null
          takedowns_attempted?: number | null
          takedowns_landed?: number | null
          updated_at?: string
        }
        Update: {
          control_time_sec?: number | null
          created_at?: string
          fight_id?: string
          fighter_slot?: string
          id?: string
          knockdowns?: number | null
          raw?: Json | null
          significant_strikes_attempted?: number | null
          significant_strikes_landed?: number | null
          strikes_attempted?: number | null
          strikes_landed?: number | null
          submission_attempts?: number | null
          takedowns_attempted?: number | null
          takedowns_landed?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ufc_fight_stats_fight_id_fkey"
            columns: ["fight_id"]
            isOneToOne: false
            referencedRelation: "ufc_fights"
            referencedColumns: ["id"]
          },
        ]
      }
      ufc_fighters: {
        Row: {
          age_years: number | null
          apimma_id: number | null
          birth_place: string | null
          country: string | null
          created_at: string
          dob: string | null
          gender: string | null
          height_cm: number | null
          id: string
          ko_l: number | null
          ko_w: number | null
          name: string
          nickname: string | null
          photo_url: string | null
          reach_cm: number | null
          record_d: number | null
          record_l: number | null
          record_w: number | null
          stance: string | null
          sub_l: number | null
          sub_w: number | null
          team_name: string | null
          updated_at: string
          weight_class: string | null
          weight_lbs: number | null
        }
        Insert: {
          age_years?: number | null
          apimma_id?: number | null
          birth_place?: string | null
          country?: string | null
          created_at?: string
          dob?: string | null
          gender?: string | null
          height_cm?: number | null
          id?: string
          ko_l?: number | null
          ko_w?: number | null
          name: string
          nickname?: string | null
          photo_url?: string | null
          reach_cm?: number | null
          record_d?: number | null
          record_l?: number | null
          record_w?: number | null
          stance?: string | null
          sub_l?: number | null
          sub_w?: number | null
          team_name?: string | null
          updated_at?: string
          weight_class?: string | null
          weight_lbs?: number | null
        }
        Update: {
          age_years?: number | null
          apimma_id?: number | null
          birth_place?: string | null
          country?: string | null
          created_at?: string
          dob?: string | null
          gender?: string | null
          height_cm?: number | null
          id?: string
          ko_l?: number | null
          ko_w?: number | null
          name?: string
          nickname?: string | null
          photo_url?: string | null
          reach_cm?: number | null
          record_d?: number | null
          record_l?: number | null
          record_w?: number | null
          stance?: string | null
          sub_l?: number | null
          sub_w?: number | null
          team_name?: string | null
          updated_at?: string
          weight_class?: string | null
          weight_lbs?: number | null
        }
        Relationships: []
      }
      ufc_fights: {
        Row: {
          apimma_fight_id: number | null
          apimma_fighter_a_id: number | null
          apimma_fighter_b_id: number | null
          card_position: string
          commence_time: string
          created_at: string
          event_id: string
          fighter_a: string
          fighter_a_logo: string | null
          fighter_b: string
          fighter_b_logo: string | null
          id: string
          is_title_fight: boolean
          margin_disabled: boolean
          odds_api_event_id: string | null
          result_method: string | null
          result_round: number | null
          scheduled_rounds: number
          settled_at: string | null
          status: string
          updated_at: string
          weight_class: string | null
          winner: string | null
        }
        Insert: {
          apimma_fight_id?: number | null
          apimma_fighter_a_id?: number | null
          apimma_fighter_b_id?: number | null
          card_position?: string
          commence_time: string
          created_at?: string
          event_id: string
          fighter_a: string
          fighter_a_logo?: string | null
          fighter_b: string
          fighter_b_logo?: string | null
          id?: string
          is_title_fight?: boolean
          margin_disabled?: boolean
          odds_api_event_id?: string | null
          result_method?: string | null
          result_round?: number | null
          scheduled_rounds?: number
          settled_at?: string | null
          status?: string
          updated_at?: string
          weight_class?: string | null
          winner?: string | null
        }
        Update: {
          apimma_fight_id?: number | null
          apimma_fighter_a_id?: number | null
          apimma_fighter_b_id?: number | null
          card_position?: string
          commence_time?: string
          created_at?: string
          event_id?: string
          fighter_a?: string
          fighter_a_logo?: string | null
          fighter_b?: string
          fighter_b_logo?: string | null
          id?: string
          is_title_fight?: boolean
          margin_disabled?: boolean
          odds_api_event_id?: string | null
          result_method?: string | null
          result_round?: number | null
          scheduled_rounds?: number
          settled_at?: string | null
          status?: string
          updated_at?: string
          weight_class?: string | null
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ufc_fights_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "ufc_events"
            referencedColumns: ["id"]
          },
        ]
      }
      ufc_market_snapshots: {
        Row: {
          fight_id: string
          id: number
          market_type: string
          odds: number
          sampled_at: string
          selection_key: string
        }
        Insert: {
          fight_id: string
          id?: number
          market_type: string
          odds: number
          sampled_at?: string
          selection_key: string
        }
        Update: {
          fight_id?: string
          id?: number
          market_type?: string
          odds?: number
          sampled_at?: string
          selection_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "ufc_market_snapshots_fight_id_fkey"
            columns: ["fight_id"]
            isOneToOne: false
            referencedRelation: "ufc_fights"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_adjustment_requests: {
        Row: {
          adjustment_type: string
          after_balance: number | null
          amount: number
          applied_at: string | null
          approved_at: string | null
          approved_by: string | null
          before_balance: number | null
          created_at: string
          id: string
          metadata: Json
          reason: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_by: string
          status: string
          target_user_id: string
        }
        Insert: {
          adjustment_type: string
          after_balance?: number | null
          amount: number
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          before_balance?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          reason: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_by: string
          status?: string
          target_user_id: string
        }
        Update: {
          adjustment_type?: string
          after_balance?: number | null
          amount?: number
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          before_balance?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_by?: string
          status?: string
          target_user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          accounting_journal_id: string | null
          accounting_sync_error: string | null
          accounting_sync_status: string
          accounting_synced_at: string | null
          admin_action_id: string | null
          amount: number
          balance_after: number
          balance_before: number
          bet_id: string | null
          created_at: string
          id: string
          is_simulation: boolean
          ledger_seq: number | null
          metadata: Json
          note: string | null
          payout_request_id: string | null
          reference_id: string | null
          reference_type: Database["public"]["Enums"]["wallet_ref_type"]
          transaction_category: string | null
          type: Database["public"]["Enums"]["wallet_txn_type"]
          user_id: string
        }
        Insert: {
          accounting_journal_id?: string | null
          accounting_sync_error?: string | null
          accounting_sync_status?: string
          accounting_synced_at?: string | null
          admin_action_id?: string | null
          amount: number
          balance_after: number
          balance_before: number
          bet_id?: string | null
          created_at?: string
          id?: string
          is_simulation?: boolean
          ledger_seq?: number | null
          metadata?: Json
          note?: string | null
          payout_request_id?: string | null
          reference_id?: string | null
          reference_type: Database["public"]["Enums"]["wallet_ref_type"]
          transaction_category?: string | null
          type: Database["public"]["Enums"]["wallet_txn_type"]
          user_id: string
        }
        Update: {
          accounting_journal_id?: string | null
          accounting_sync_error?: string | null
          accounting_sync_status?: string
          accounting_synced_at?: string | null
          admin_action_id?: string | null
          amount?: number
          balance_after?: number
          balance_before?: number
          bet_id?: string | null
          created_at?: string
          id?: string
          is_simulation?: boolean
          ledger_seq?: number | null
          metadata?: Json
          note?: string | null
          payout_request_id?: string | null
          reference_id?: string | null
          reference_type?: Database["public"]["Enums"]["wallet_ref_type"]
          transaction_category?: string | null
          type?: Database["public"]["Enums"]["wallet_txn_type"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          is_simulation: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          is_simulation?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          is_simulation?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      match_market_exposure: {
        Row: {
          bet_count: number | null
          liability: number | null
          market: string | null
          match_id: string | null
          selection: string | null
          total_stake: number | null
        }
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_transactions_signed: {
        Row: {
          amount_conflict: boolean | null
          balance_after: number | null
          balance_before: number | null
          bet_id: string | null
          created_at: string | null
          direction: string | null
          id: string | null
          is_simulation: boolean | null
          ledger_seq: number | null
          match_id: string | null
          note: string | null
          recorded_amount: number | null
          signed_amount: number | null
          transaction_type:
            | Database["public"]["Enums"]["platform_txn_type"]
            | null
        }
        Insert: {
          amount_conflict?: never
          balance_after?: number | null
          balance_before?: number | null
          bet_id?: string | null
          created_at?: string | null
          direction?: never
          id?: string | null
          is_simulation?: boolean | null
          ledger_seq?: number | null
          match_id?: string | null
          note?: string | null
          recorded_amount?: number | null
          signed_amount?: never
          transaction_type?:
            | Database["public"]["Enums"]["platform_txn_type"]
            | null
        }
        Update: {
          amount_conflict?: never
          balance_after?: number | null
          balance_before?: number | null
          bet_id?: string | null
          created_at?: string | null
          direction?: never
          id?: string | null
          is_simulation?: boolean | null
          ledger_seq?: number | null
          match_id?: string | null
          note?: string | null
          recorded_amount?: number | null
          signed_amount?: never
          transaction_type?:
            | Database["public"]["Enums"]["platform_txn_type"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_transactions_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_transactions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      v_accounting_account_activity: {
        Row: {
          account_code: string | null
          account_id: string | null
          balance_after: number | null
          balance_before: number | null
          credit: number | null
          debit: number | null
          effective_at: string | null
          journal_number: string | null
          ledger_seq: number | null
          signed_effect: number | null
          status: Database["public"]["Enums"]["acct_journal_status"] | null
          user_id: string | null
        }
        Relationships: []
      }
      v_accounting_balance_reconstruction: {
        Row: {
          account_code: string | null
          account_id: string | null
          journal_derived_balance: number | null
          last_journal_seq: number | null
          last_materialised_seq: number | null
          materialised_balance: number | null
          reconciliation_status: string | null
          user_id: string | null
          variance: number | null
        }
        Relationships: []
      }
      v_accounting_blackjack_reconciliation: {
        Row: {
          hands: number | null
          ledger_payouts: number | null
          ledger_stakes: number | null
          legacy_payouts: number | null
          legacy_stakes: number | null
          payout_variance: number | null
          stake_variance: number | null
        }
        Relationships: []
      }
      v_accounting_bridge_status: {
        Row: {
          newest: string | null
          oldest: string | null
          status: string | null
          transactions: number | null
        }
        Relationships: []
      }
      v_accounting_cutover_status: {
        Row: {
          account_count: number | null
          cutover_batch_id: string | null
          cutover_timestamp: string | null
          live_bankroll_balance: number | null
          opening_journal_number: string | null
          opening_ledger_seq: number | null
          opening_total: number | null
          pending_correction_amount: number | null
          pending_correction_reference: string | null
          reconstructed_bankroll_balance: number | null
          reconstruction_variance: number | null
          snapshot_hash: string | null
          status: Database["public"]["Enums"]["acct_cutover_status"] | null
        }
        Relationships: []
      }
      v_accounting_journals: {
        Row: {
          effective_at: string | null
          event_type: string | null
          game: string | null
          id: string | null
          journal_number: string | null
          journal_type: Database["public"]["Enums"]["acct_journal_type"] | null
          ledger_seq: number | null
          product: string | null
          reference_id: string | null
          reference_type: string | null
          reversal_of_journal_id: string | null
          reversed_by_journal_id: string | null
          status: Database["public"]["Enums"]["acct_journal_status"] | null
          total_credit: number | null
          total_debit: number | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_journals_reversal_of_journal_id_fkey"
            columns: ["reversal_of_journal_id"]
            isOneToOne: false
            referencedRelation: "accounting_journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journals_reversal_of_journal_id_fkey"
            columns: ["reversal_of_journal_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journals_reversed_by_journal_id_fkey"
            columns: ["reversed_by_journal_id"]
            isOneToOne: false
            referencedRelation: "accounting_journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journals_reversed_by_journal_id_fkey"
            columns: ["reversed_by_journal_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_journals"
            referencedColumns: ["id"]
          },
        ]
      }
      v_accounting_migration_readiness: {
        Row: {
          checked_at: string | null
          drift_total: number | null
          drift_users: number | null
          error_tx: number | null
          mixed_journals: number | null
          pending_tx: number | null
          ready_for_product_migration: boolean | null
          reserved_payout_liability: number | null
          trial_balance_imbalance: number | null
          unclassified_reserved_liability: number | null
        }
        Relationships: []
      }
      v_accounting_open_liability: {
        Row: {
          environment: Database["public"]["Enums"]["acct_environment"] | null
          max_net_liability: number | null
          max_potential_payout: number | null
          open_positions: number | null
          open_stakes: number | null
          product: string | null
          reserved_against_bankroll: number | null
        }
        Relationships: []
      }
      v_accounting_platform_pl: {
        Row: {
          environment: Database["public"]["Enums"]["acct_environment"] | null
          excluded_transfer_clearing: number | null
          expense: number | null
          house_bankroll: number | null
          platform_pl: number | null
          revenue: number | null
        }
        Relationships: []
      }
      v_accounting_plinko_bankroll_control: {
        Row: {
          available_reserve: number | null
          bankroll_movement: number | null
          closed_to_reserve: number | null
          environment: Database["public"]["Enums"]["acct_environment"] | null
          payout_expense: number | null
          plinko_pl: number | null
          reconciled: boolean | null
          stake_revenue: number | null
        }
        Relationships: []
      }
      v_accounting_plinko_reconciliation: {
        Row: {
          checked_at: string | null
          journalled_games: number | null
          ledger_house_margin: number | null
          ledger_payouts: number | null
          ledger_stakes: number | null
          legacy_payouts: number | null
          legacy_stakes: number | null
          payout_variance: number | null
          reconciled: boolean | null
          stake_variance: number | null
          unposted_games_since_cutover: number | null
        }
        Relationships: []
      }
      v_accounting_reconciliation_summary: {
        Row: {
          classification: string | null
          items: number | null
          needs_balance_correction: number | null
          needs_ledger_backfill: number | null
          needs_reporting_fix: number | null
          variance_amount: number | null
        }
        Relationships: []
      }
      v_accounting_roulette_reconciliation: {
        Row: {
          ledger_payouts: number | null
          ledger_stakes: number | null
          legacy_payouts: number | null
          legacy_stakes: number | null
          payout_variance: number | null
          spins: number | null
          stake_variance: number | null
        }
        Relationships: []
      }
      v_accounting_treasure_reconciliation: {
        Row: {
          ledger_payouts: number | null
          ledger_stakes: number | null
          legacy_payouts: number | null
          legacy_stakes: number | null
          payout_variance: number | null
          settled_rounds: number | null
          stake_variance: number | null
        }
        Relationships: []
      }
      v_accounting_trial_balance: {
        Row: {
          account_code: string | null
          account_type: Database["public"]["Enums"]["acct_account_type"] | null
          closing_balance: number | null
          credit_total: number | null
          debit_total: number | null
          environment: Database["public"]["Enums"]["acct_environment"] | null
        }
        Relationships: []
      }
      v_accounting_wallet_drift: {
        Row: {
          drift: number | null
          environment: string | null
          ledger_balance: number | null
          legacy_balance: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_bankroll_reconstruction: {
        Row: {
          actual_balance: number | null
          explained_variance: number | null
          reconstructed_balance: number | null
          variance: number | null
        }
        Relationships: []
      }
      v_my_accounting_activity: {
        Row: {
          account_code: string | null
          balance_after: number | null
          credit: number | null
          debit: number | null
          effective_at: string | null
          journal_number: string | null
          journal_type: Database["public"]["Enums"]["acct_journal_type"] | null
          ledger_seq: number | null
          product: string | null
          signed_effect: number | null
        }
        Relationships: []
      }
      wallet_transactions_signed: {
        Row: {
          amount_conflict: boolean | null
          balance_after: number | null
          balance_before: number | null
          created_at: string | null
          direction: string | null
          id: string | null
          ledger_seq: number | null
          note: string | null
          recorded_amount: number | null
          reference_id: string | null
          reference_type: Database["public"]["Enums"]["wallet_ref_type"] | null
          signed_amount: number | null
          type: Database["public"]["Enums"]["wallet_txn_type"] | null
          type_direction_conflict: boolean | null
          user_id: string | null
        }
        Insert: {
          amount_conflict?: never
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string | null
          direction?: never
          id?: string | null
          ledger_seq?: number | null
          note?: string | null
          recorded_amount?: number | null
          reference_id?: string | null
          reference_type?: Database["public"]["Enums"]["wallet_ref_type"] | null
          signed_amount?: never
          type?: Database["public"]["Enums"]["wallet_txn_type"] | null
          type_direction_conflict?: never
          user_id?: string | null
        }
        Update: {
          amount_conflict?: never
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string | null
          direction?: never
          id?: string | null
          ledger_seq?: number | null
          note?: string | null
          recorded_amount?: number | null
          reference_id?: string | null
          reference_type?: Database["public"]["Enums"]["wallet_ref_type"] | null
          signed_amount?: never
          type?: Database["public"]["Enums"]["wallet_txn_type"] | null
          type_direction_conflict?: never
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _correlation_groups_for: {
        Args: {
          p_market: string
          p_market_text: string
          p_outcome: string
          p_selection: string
        }
        Returns: string[]
      }
      _exposure_bet_wins: {
        Args: {
          p_away: number
          p_home: number
          p_market: string
          p_market_text: string
          p_outcome: string
          p_selection: string
        }
        Returns: boolean
      }
      _exposure_norm: { Args: { txt: string }; Returns: string }
      _is_admin_maker_checker: { Args: { _uid: string }; Returns: boolean }
      _live_bankroll: { Args: never; Returns: number }
      _resolve_wallet_adjustment_admin: {
        Args: { p_admin_id?: string }
        Returns: string
      }
      accounting_apply_correction_proposal: {
        Args: { p_id: string }
        Returns: Json
      }
      accounting_arcade_assert_capacity: {
        Args: {
          p_max_gross: number
          p_product: string
          p_stake?: number
          p_user: string
        }
        Returns: undefined
      }
      accounting_arcade_hook: {
        Args: {
          p_effective: string
          p_meta: Json
          p_payout: number
          p_product: string
          p_ref_id: string
          p_ref_type: string
          p_stake: number
          p_user: string
          p_wallet_category: string
          p_wallet_idem?: string
        }
        Returns: undefined
      }
      accounting_arcade_selftest: { Args: never; Returns: Json }
      accounting_assert_capacity: {
        Args: {
          p_is_simulation?: boolean
          p_max_gross: number
          p_product: string
          p_stake?: number
          p_user: string
        }
        Returns: undefined
      }
      accounting_available_reserve: {
        Args: { p_env: Database["public"]["Enums"]["acct_environment"] }
        Returns: number
      }
      accounting_available_reserve_locked: {
        Args: { p_env: Database["public"]["Enums"]["acct_environment"] }
        Returns: number
      }
      accounting_bankroll_drift_alert: { Args: never; Returns: Json }
      accounting_bankroll_reconciliation: {
        Args: {
          p_environment?: Database["public"]["Enums"]["acct_environment"]
        }
        Returns: Json
      }
      accounting_bridge_sync: { Args: { p_limit?: number }; Returns: Json }
      accounting_bridge_wallet_transaction: {
        Args: { p_tx_id: string }
        Returns: Json
      }
      accounting_caller_authorised: { Args: never; Returns: boolean }
      accounting_flags_for: {
        Args: {
          p_env: Database["public"]["Enums"]["acct_environment"]
          p_product: string
        }
        Returns: {
          capacity_enforced: boolean
          dual_write: boolean
          journal_enabled: boolean
          liability_enforced: boolean
        }[]
      }
      accounting_integrity_scan: { Args: never; Returns: Json }
      accounting_internal_ctx: { Args: never; Returns: boolean }
      accounting_liability_integrity_alert: { Args: never; Returns: Json }
      accounting_liability_test_cleanup: {
        Args: { p_ref_type: string; p_round?: string }
        Returns: undefined
      }
      accounting_phase10_invariants: { Args: never; Returns: Json }
      accounting_phase10_product_tests: { Args: never; Returns: Json }
      accounting_phase10_selftest: { Args: never; Returns: Json }
      accounting_phase101_selftest: { Args: never; Returns: Json }
      accounting_phase5_final_selftest: { Args: never; Returns: Json }
      accounting_phase5_treasure_expiry_test: { Args: never; Returns: Json }
      accounting_phase6_selftest: { Args: never; Returns: Json }
      accounting_phase8_selftest: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          passed: boolean
        }[]
      }
      accounting_pl_report: {
        Args: {
          p_basis?: string
          p_config_version?: string
          p_environment?: Database["public"]["Enums"]["acct_environment"]
          p_from?: string
          p_game?: string
          p_products?: string[]
          p_sport?: string
          p_to?: string
          p_user?: string
        }
        Returns: Json
      }
      accounting_plinko_selftest: { Args: never; Returns: Json }
      accounting_position_state: {
        Args: { p_reference_id: string; p_reference_type: string }
        Returns: {
          is_terminal: boolean
          outcome: string
          product: string
          settled_at: string
          status: string
        }[]
      }
      accounting_post_arcade_settlement: {
        Args: {
          p_effective: string
          p_meta?: Json
          p_payout: number
          p_product: string
          p_ref_id: string
          p_ref_type: string
          p_stake: number
          p_user: string
          p_wallet_category?: string
          p_wallet_idem?: string
        }
        Returns: Json
      }
      accounting_post_journal: {
        Args: {
          p_allow_negative?: boolean
          p_approved_by?: string
          p_correlation_id?: string
          p_created_by?: string
          p_cutover_batch_id?: string
          p_effective_at?: string
          p_environment?: string
          p_event_type?: string
          p_game?: string
          p_idempotency_key: string
          p_journal_type: string
          p_lines: Json
          p_metadata?: Json
          p_product?: string
          p_reference_id?: string
          p_reference_type?: string
          p_reversal_of?: string
          p_settlement_version?: number
        }
        Returns: Json
      }
      accounting_post_plinko_game: {
        Args: { p_game_id: string }
        Returns: Json
      }
      accounting_post_sports_position: {
        Args: {
          p_effective: string
          p_env?: Database["public"]["Enums"]["acct_environment"]
          p_meta?: Json
          p_payout: number
          p_product: string
          p_ref_id: string
          p_ref_type: string
          p_release_liability?: boolean
          p_stake: number
          p_user: string
        }
        Returns: Json
      }
      accounting_release_liability: {
        Args: {
          p_reason?: string
          p_reference_id: string
          p_reference_type: string
        }
        Returns: undefined
      }
      accounting_repair_terminal_reservation: {
        Args: {
          p_reason: string
          p_reference_id: string
          p_reference_type: string
        }
        Returns: Json
      }
      accounting_reserve_liability: {
        Args: {
          p_config_version?: string
          p_game: string
          p_max_gross: number
          p_metadata?: Json
          p_product: string
          p_reference_id: string
          p_reference_type: string
          p_settled?: boolean
          p_stake: number
          p_user: string
        }
        Returns: string
      }
      accounting_reserved_liability: {
        Args: { p_env: Database["public"]["Enums"]["acct_environment"] }
        Returns: number
      }
      accounting_reverse_arcade_settlement: {
        Args: { p_product: string; p_reason: string; p_ref_id: string }
        Returns: Json
      }
      accounting_reverse_journal: {
        Args: {
          p_approved_by?: string
          p_created_by?: string
          p_idempotency_key: string
          p_journal_id: string
          p_reason: string
        }
        Returns: Json
      }
      accounting_reverse_plinko_game: {
        Args: { p_game_id: string; p_reason: string }
        Returns: Json
      }
      accounting_run_phase5_final_selftest: { Args: never; Returns: undefined }
      accounting_sports_env: {
        Args: { p_is_simulation?: boolean; p_user: string }
        Returns: Database["public"]["Enums"]["acct_environment"]
      }
      accounting_sports_hook: {
        Args: {
          p_effective: string
          p_is_simulation?: boolean
          p_meta?: Json
          p_payout: number
          p_product: string
          p_ref_id: string
          p_ref_type: string
          p_release_liability?: boolean
          p_stake: number
          p_user: string
        }
        Returns: undefined
      }
      accounting_terminal_reservation_violations: {
        Args: never
        Returns: {
          environment: string
          position_outcome: string
          position_status: string
          product: string
          reference_id: string
          reference_type: string
          reservation_id: string
          reserved_amount: number
          reserved_at: string
          settled_at: string
        }[]
      }
      accounting_user_env: {
        Args: { p_user: string }
        Returns: Database["public"]["Enums"]["acct_environment"]
      }
      acct_money_ok: { Args: { v: number }; Returns: boolean }
      acct_money_scale: { Args: never; Returns: number }
      acct_round_liability: { Args: { v: number }; Returns: number }
      acct_round_money: { Args: { v: number }; Returns: number }
      acct_round_payout: { Args: { v: number }; Returns: number }
      acct_round_stake: { Args: { v: number }; Returns: number }
      adjust_correct_score_odds: {
        Args: {
          p_match_id: string
          p_max_odds?: number
          p_target_overround?: number
        }
        Returns: undefined
      }
      admin_adjust_referral: {
        Args: {
          p_reason: string
          p_referral_id: string
          p_tokens_delta: number
        }
        Returns: undefined
      }
      admin_flag_referral: {
        Args: { p_flagged: boolean; p_reason: string; p_referral_id: string }
        Returns: undefined
      }
      admin_grant_tokens: {
        Args: { p_amount: number; p_reason: string; p_user_id: string }
        Returns: number
      }
      admin_reset_onboarding: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      admin_set_global_onboarding: {
        Args: { p_enabled: boolean }
        Returns: undefined
      }
      admin_set_match_margin_disabled: {
        Args: { p_disabled: boolean; p_match_id: string }
        Returns: undefined
      }
      admin_set_onboarding_enabled: {
        Args: { p_enabled: boolean; p_user_id: string }
        Returns: undefined
      }
      apifootball_consume_quota: {
        Args: { p_requests?: number }
        Returns: {
          out_allowed: boolean
          out_day_limit: number
          out_remaining: number
          out_used: number
        }[]
      }
      approve_wallet_adjustment: {
        Args: {
          p_admin_id?: string
          p_checker_note?: string
          p_request_id: string
        }
        Returns: Json
      }
      arcade_admin_resolve_treasure_round: {
        Args: {
          p_admin: string
          p_reason: string
          p_round: string
          p_status: string
        }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          current_multiplier: number
          difficulty: string
          expires_at: string
          final_multiplier: number | null
          grid_cols: number
          grid_rows: number
          gross_return: number
          id: string
          idempotency_key: string
          last_action_at: string
          nonce: number
          platform_net: number
          result_reason: string | null
          rtp_version: number
          safe_reveals: number
          seed_id: string
          selected_trap_index: number | null
          server_seed_hash: string
          settled_at: string | null
          stake: number
          started_at: string
          state_version: number
          status: Database["public"]["Enums"]["arcade_treasure_status"]
          trap_count: number
          unrounded_return: number
          updated_at: string
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_treasure_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_admin_snapshot: {
        Args: { p_admin: string; p_window_hours?: number }
        Returns: Json
      }
      arcade_bj_admin_resolve_hand: {
        Args: {
          p_action: string
          p_admin: string
          p_hand: string
          p_reason: string
        }
        Returns: undefined
      }
      arcade_bj_assert_capacity: {
        Args: { p_max_payout: number; p_stake: number; p_user: string }
        Returns: undefined
      }
      arcade_bj_double: {
        Args: {
          p_hand: string
          p_idempotency_key: string
          p_player_hand: string
          p_state_version: number
          p_user: string
        }
        Returns: undefined
      }
      arcade_bj_draw: {
        Args: {
          p_face_up: boolean
          p_hand: string
          p_owner: string
          p_player_hand: string
        }
        Returns: {
          card_value: number
          deal_sequence: number
          dealt_at: string
          face_up: boolean
          hand_id: string
          id: string
          owner_type: string
          player_hand_id: string | null
          rank: number
          revealed_at: string | null
          shoe_id: string
          shoe_position: number
          suit: number
        }
        SetofOptions: {
          from: "*"
          to: "arcade_bj_cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_bj_expire_hands: { Args: never; Returns: number }
      arcade_bj_hit: {
        Args: {
          p_hand: string
          p_idempotency_key: string
          p_player_hand: string
          p_state_version: number
          p_user: string
        }
        Returns: undefined
      }
      arcade_bj_is_terminal: {
        Args: { p_status: Database["public"]["Enums"]["bj_hand_status"] }
        Returns: boolean
      }
      arcade_bj_phase7_selftest: { Args: never; Returns: Json }
      arcade_bj_publish_rule_config: {
        Args: { p_admin: string; p_patch: Json; p_reason: string }
        Returns: string
      }
      arcade_bj_publish_score_config: {
        Args: { p_admin: string; p_patch: Json; p_reason: string }
        Returns: string
      }
      arcade_bj_resync_reservation: {
        Args: { p_hand: string }
        Returns: undefined
      }
      arcade_bj_reveal_shoe: {
        Args: { p_hand: string; p_user: string }
        Returns: Json
      }
      arcade_bj_reverse_settlement: {
        Args: { p_hand: string; p_reason: string }
        Returns: Json
      }
      arcade_bj_settle: { Args: { p_hand: string }; Returns: undefined }
      arcade_bj_shuffle: {
        Args: {
          p_client_seed: string
          p_n: number
          p_nonce: number
          p_server_seed: string
        }
        Returns: number[]
      }
      arcade_bj_split: {
        Args: {
          p_hand: string
          p_idempotency_key: string
          p_player_hand: string
          p_state_version: number
          p_user: string
        }
        Returns: undefined
      }
      arcade_bj_stand: {
        Args: {
          p_hand: string
          p_idempotency_key: string
          p_player_hand: string
          p_state_version: number
          p_user: string
        }
        Returns: undefined
      }
      arcade_bj_start_hand: {
        Args: {
          p_client_seed: string
          p_idempotency_key: string
          p_stake: number
          p_user: string
        }
        Returns: string
      }
      arcade_bj_value: { Args: { p_ranks: number[] }; Returns: number[] }
      arcade_bj_worst_case_gross: {
        Args: { p_rule_config: string; p_stake: number }
        Returns: number
      }
      arcade_config_selftest: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          passed: boolean
        }[]
      }
      arcade_config_version_for: {
        Args: { p_product: string; p_user: string }
        Returns: number
      }
      arcade_config_version_in_env: {
        Args: {
          p_env: Database["public"]["Enums"]["acct_environment"]
          p_product: string
        }
        Returns: number
      }
      arcade_crash_cashout: {
        Args: { p_round_id: string; p_user: string }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_crash_point: {
        Args: {
          p_cap: number
          p_edge: number
          p_round: Database["public"]["Tables"]["arcade_mini_rounds"]["Row"]
        }
        Returns: number
      }
      arcade_crash_resolve: {
        Args: {
          p_round: Database["public"]["Tables"]["arcade_mini_rounds"]["Row"]
        }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "arcade_mini_rounds"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_crash_start: {
        Args: {
          p_auto: number
          p_client_seed: string
          p_idempotency_key: string
          p_stake: number
          p_user: string
        }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_crash_sweep: { Args: { p_user: string }; Returns: undefined }
      arcade_dice_multiplier: {
        Args: {
          p_cap: number
          p_direction: string
          p_rtp: number
          p_target: number
        }
        Returns: number
      }
      arcade_dice_play: {
        Args: {
          p_client_seed: string
          p_direction: string
          p_idempotency_key: string
          p_stake: number
          p_target: number
          p_user: string
        }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_ensure_daily: {
        Args: { p_daily_alloc: number; p_user: string }
        Returns: {
          bonus_available: number
          created_at: string
          daily_available: number
          daily_reset_date: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_drop_balances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_generate_path: {
        Args: {
          p_client_seed: string
          p_nonce: number
          p_rows: number
          p_server_seed: string
        }
        Returns: number[]
      }
      arcade_hilo_cashout: {
        Args: { p_round_id: string; p_user: string }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_hilo_draw: {
        Args: {
          p_cursor: number
          p_round: Database["public"]["Tables"]["arcade_mini_rounds"]["Row"]
        }
        Returns: Json
      }
      arcade_hilo_guess: {
        Args: { p_guess: string; p_round_id: string; p_user: string }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_hilo_prob: {
        Args: { p_guess: string; p_rank: number }
        Returns: number
      }
      arcade_hilo_start: {
        Args: {
          p_client_seed: string
          p_idempotency_key: string
          p_stake: number
          p_user: string
        }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_keno_draw: {
        Args: {
          p_draws: number
          p_pool: number
          p_round: Database["public"]["Tables"]["arcade_mini_rounds"]["Row"]
        }
        Returns: number[]
      }
      arcade_keno_play: {
        Args: {
          p_client_seed: string
          p_idempotency_key: string
          p_picks: number[]
          p_risk: string
          p_stake: number
          p_user: string
        }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_mini_close: {
        Args: {
          p_multiplier: number
          p_outcome: string
          p_random_hex: string
          p_round_id: string
          p_state: Json
        }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_mini_hex: {
        Args: { p_cursor: number; p_input: string; p_server_seed: string }
        Returns: string
      }
      arcade_mini_open: {
        Args: {
          p_client_seed: string
          p_idempotency_key: string
          p_max_gross: number
          p_product: string
          p_stake: number
          p_state: Json
          p_user: string
        }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_mini_rand: {
        Args: { p_cursor: number; p_input: string; p_server_seed: string }
        Returns: number
      }
      arcade_period_bucket: {
        Args: { p_period: string; p_ts: string }
        Returns: string
      }
      arcade_place_plinko_drop: {
        Args: {
          p_client_seed: string
          p_idempotency_key: string
          p_risk: Database["public"]["Enums"]["arcade_risk_mode"]
          p_rows: number
          p_stake: number
          p_user: string
        }
        Returns: {
          client_seed: string
          completed_at: string
          created_at: string
          drop_type: string
          id: string
          idempotency_key: string
          landing_slot: number
          multiplier: number
          nonce: number
          outcome: Database["public"]["Enums"]["arcade_outcome"]
          path: number[]
          payout: number
          profile_id: string
          risk_mode: Database["public"]["Enums"]["arcade_risk_mode"]
          rows: number
          score: number
          score_band: Database["public"]["Enums"]["arcade_score_band"]
          seed_id: string
          server_seed_hash: string
          stake_per_ball: number
          user_id: string
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_plinko_games"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_place_roulette_spin: {
        Args: {
          p_bets: Json
          p_client_seed: string
          p_idempotency_key: string
          p_user: string
        }
        Returns: {
          client_seed: string
          completed_at: string | null
          config_id: string
          config_version: number
          created_at: string
          house_net: number
          id: string
          idempotency_key: string
          losing_positions: number
          nonce: number
          position_count: number
          processing_ms: number
          random_hex: string
          seed_id: string
          server_seed_hash: string
          status: Database["public"]["Enums"]["arcade_roulette_status"]
          total_return: number
          total_stake: number
          user_id: string
          user_net: number
          verification_id: string
          winning_colour: string
          winning_pocket: number
          winning_positions: number
        }
        SetofOptions: {
          from: "*"
          to: "arcade_roulette_spins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_poker_deal: {
        Args: {
          p_client_seed: string
          p_idempotency_key: string
          p_stake: number
          p_user: string
        }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_poker_deck: {
        Args: {
          p_round: Database["public"]["Tables"]["arcade_mini_rounds"]["Row"]
        }
        Returns: number[]
      }
      arcade_poker_draw: {
        Args: { p_holds: number[]; p_round_id: string; p_user: string }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_poker_eval: { Args: { p_cards: number[] }; Returns: string }
      arcade_promote_config: {
        Args: {
          p_environment: Database["public"]["Enums"]["acct_environment"]
          p_product: string
          p_reason: string
          p_version: number
        }
        Returns: Json
      }
      arcade_publish_mini_config: {
        Args: {
          p_admin: string
          p_patch: Json
          p_product: string
          p_reason: string
        }
        Returns: {
          announcement: string | null
          chip_values: number[]
          cooldown_seconds: number
          created_at: string
          daily_round_limit: number
          id: string
          maintenance_mode: boolean
          max_multiplier: number
          max_stake: number
          min_stake: number
          payload: Json
          product: string
          round_ttl_seconds: number
          status: string
          target_rtp: number
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_configs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_publish_roulette_config: {
        Args: { p_admin: string; p_patch: Json; p_reason: string }
        Returns: {
          announcement: string | null
          black_pockets: number[]
          change_reason: string | null
          chip_values: number[]
          cooldown_seconds: number
          created_at: string
          created_by: string | null
          daily_spin_limit: number
          id: string
          maintenance_mode: boolean
          max_positions: number
          max_stake_per_position: number
          max_total_stake: number
          min_total_stake: number
          published_at: string | null
          red_pockets: number[]
          status: string
          updated_at: string
          version: number
          wheel_order: number[]
        }
        SetofOptions: {
          from: "*"
          to: "arcade_roulette_configurations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_publish_rps_config: {
        Args: { p_admin: string; p_patch: Json; p_reason: string }
        Returns: {
          announcement: string | null
          chip_values: number[]
          cooldown_seconds: number
          created_at: string
          daily_round_limit: number
          draw_multiplier: number
          id: string
          ladder_multipliers: number[]
          ladder_tail_multiplier: number
          maintenance_mode: boolean
          max_stake: number
          min_stake: number
          round_ttl_seconds: number
          status: string
          updated_at: string
          version: number
          win_multiplier: number
        }
        SetofOptions: {
          from: "*"
          to: "arcade_rps_configurations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_publish_treasure_config: {
        Args: {
          p_admin: string
          p_difficulty: string
          p_patch: Json
          p_reason: string
        }
        Returns: {
          announcement: string | null
          approved_by: string | null
          change_reason: string | null
          chip_values: number[]
          cooldown_seconds: number
          created_at: string
          created_by: string | null
          daily_round_limit: number
          difficulty: string
          effective_from: string | null
          effective_to: string | null
          grid_cols: number
          grid_rows: number
          id: string
          label: string
          maintenance_mode: boolean
          max_multiplier: number
          max_return: number
          max_stake: number
          min_stake: number
          published_at: string | null
          round_timeout_seconds: number
          rtp_version: number
          status: string
          target_rtp: number
          trap_count: number
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "arcade_treasure_configurations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_rollback_config: {
        Args: {
          p_environment: Database["public"]["Enums"]["acct_environment"]
          p_product: string
          p_reason: string
        }
        Returns: Json
      }
      arcade_roulette_draw: {
        Args: { p_client_seed: string; p_nonce: number; p_server_seed: string }
        Returns: Record<string, unknown>
      }
      arcade_rps_draw: {
        Args: { p_hmac_input: string; p_server_seed: string }
        Returns: {
          choice: string
          random_hex: string
        }[]
      }
      arcade_rps_expire_rounds: { Args: never; Returns: number }
      arcade_rps_prepare_round: {
        Args: { p_parent_round_id?: string; p_user: string }
        Returns: {
          out_expires_at: string
          out_ladder_step: number
          out_nonce: number
          out_round_id: string
          out_server_seed_hash: string
          out_win_multiplier: number
        }[]
      }
      arcade_rps_settle: {
        Args: {
          p_client_reveal_ms?: number
          p_client_seed: string
          p_idempotency_key: string
          p_player_choice: string
          p_round_id: string
          p_stake: number
          p_user: string
        }
        Returns: {
          client_reveal_ms: number | null
          client_seed: string | null
          config_id: string
          config_version: number
          created_at: string
          expires_at: string
          gross_return: number | null
          hmac_input: string | null
          house_net: number | null
          id: string
          idempotency_key: string | null
          ladder_step: number
          multiplier: number | null
          nonce: number
          outcome: string | null
          parent_round_id: string | null
          player_choice: string | null
          prepared_at: string
          processing_ms: number | null
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_choice: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number | null
          status: string
          updated_at: string
          user_id: string
          user_net: number | null
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_rps_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_rps_step_multiplier: {
        Args: {
          p_cfg: Database["public"]["Tables"]["arcade_rps_configurations"]["Row"]
          p_step: number
        }
        Returns: number
      }
      arcade_score_band_for: {
        Args: { p_score: number }
        Returns: Database["public"]["Enums"]["arcade_score_band"]
      }
      arcade_towers_cashout: {
        Args: { p_round_id: string; p_user: string }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_towers_dragons: {
        Args: {
          p_dragons: number
          p_round: Database["public"]["Tables"]["arcade_mini_rounds"]["Row"]
          p_row: number
          p_tiles: number
        }
        Returns: number[]
      }
      arcade_towers_pick: {
        Args: { p_round_id: string; p_tile: number; p_user: string }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_towers_reveal_all: {
        Args: {
          p_round: Database["public"]["Tables"]["arcade_mini_rounds"]["Row"]
        }
        Returns: Json
      }
      arcade_towers_start: {
        Args: {
          p_client_seed: string
          p_difficulty: string
          p_idempotency_key: string
          p_stake: number
          p_user: string
        }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_treasure_build_multipliers: {
        Args: { p_config: string }
        Returns: number
      }
      arcade_treasure_collect: {
        Args: {
          p_idempotency_key: string
          p_round: string
          p_state_version: number
          p_user: string
        }
        Returns: Json
      }
      arcade_treasure_expire_rounds: {
        Args: { p_limit?: number }
        Returns: number
      }
      arcade_treasure_generate_traps: {
        Args: {
          p_client_seed: string
          p_m: number
          p_n: number
          p_nonce: number
          p_server_seed: string
        }
        Returns: number[]
      }
      arcade_treasure_reveal_tile: {
        Args: {
          p_idempotency_key: string
          p_round: string
          p_state_version: number
          p_tile: number
          p_user: string
        }
        Returns: Json
      }
      arcade_treasure_start_round: {
        Args: {
          p_client_seed: string
          p_difficulty: string
          p_idempotency_key: string
          p_stake: number
          p_user: string
        }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          current_multiplier: number
          difficulty: string
          expires_at: string
          final_multiplier: number | null
          grid_cols: number
          grid_rows: number
          gross_return: number
          id: string
          idempotency_key: string
          last_action_at: string
          nonce: number
          platform_net: number
          result_reason: string | null
          rtp_version: number
          safe_reveals: number
          seed_id: string
          selected_trap_index: number | null
          server_seed_hash: string
          settled_at: string | null
          stake: number
          started_at: string
          state_version: number
          status: Database["public"]["Enums"]["arcade_treasure_status"]
          trap_count: number
          unrounded_return: number
          updated_at: string
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_treasure_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arcade_wheel_play: {
        Args: {
          p_client_seed: string
          p_idempotency_key: string
          p_risk: string
          p_stake: number
          p_user: string
        }
        Returns: {
          client_seed: string
          config_id: string
          config_version: number
          created_at: string
          expires_at: string | null
          gross_return: number
          house_net: number
          id: string
          idempotency_key: string | null
          multiplier: number
          nonce: number
          outcome: string | null
          product: string
          random_hex: string | null
          result_reason: string | null
          seed_id: string | null
          server_seed: string
          server_seed_hash: string
          server_seed_revealed_at: string | null
          settled_at: string | null
          stake: number
          state: Json
          status: string
          step_count: number
          user_id: string
          user_net: number
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "arcade_mini_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_bet_within_liability_caps: {
        Args: {
          p_market: string
          p_match_id: string
          p_odds: number
          p_selection: string
          p_stake: number
        }
        Returns: undefined
      }
      assert_betting_allowed: {
        Args: {
          p_is_simulation?: boolean
          p_market: string
          p_match_id: string
          p_odds: number
          p_outcome?: string
          p_user_id: string
        }
        Returns: undefined
      }
      assert_user_match_risk: {
        Args: {
          p_market: string
          p_match_id: string
          p_odds: number
          p_selection: string
          p_stake: number
          p_user_id: string
        }
        Returns: undefined
      }
      auto_settle_ufc_winner_atomic: {
        Args: { p_fight_id: string; p_winner: string }
        Returns: number
      }
      award_referral_milestones: {
        Args: { p_referred_user_id: string }
        Returns: undefined
      }
      cancel_pending_bet: {
        Args: { p_prediction_id: string; p_user_id: string }
        Returns: string
      }
      cancel_ufc_bet: {
        Args: { p_bet_id: string; p_user_id: string }
        Returns: string
      }
      cancel_wallet_adjustment: {
        Args: { p_admin_id?: string; p_request_id: string }
        Returns: Json
      }
      check_match_market_betting: {
        Args: { p_market: string; p_match_id: string }
        Returns: string
      }
      check_rate_limit: {
        Args: {
          p_action: string
          p_max: number
          p_scope: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      classify_correlation_groups: {
        Args: { p_market: string; p_selection: string }
        Returns: string[]
      }
      close_started_f1_race_markets: { Args: never; Returns: number }
      create_audit_log: {
        Args: {
          p_action: string
          p_actor_user_id?: string
          p_after?: Json
          p_before?: Json
          p_entity: string
          p_entity_id?: string
          p_ip?: string
          p_is_simulation?: boolean
          p_metadata?: Json
          p_reason?: string
          p_request_id?: string
          p_target_user_id?: string
          p_user_agent?: string
        }
        Returns: string
      }
      credit_user_void_refund: {
        Args: {
          p_amount: number
          p_match: string
          p_pred: string
          p_user: string
        }
        Returns: undefined
      }
      csse_credit_tokens: {
        Args: {
          p_delta: number
          p_kind: string
          p_metadata?: Json
          p_source: string
          p_source_ref: string
          p_user_id: string
        }
        Returns: number
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      demo_guest_reset: { Args: never; Returns: number }
      edit_pending_bet_stake: {
        Args: {
          p_new_stake: number
          p_prediction_id: string
          p_user_id: string
        }
        Returns: number
      }
      edit_ufc_bet_stake: {
        Args: { p_bet_id: string; p_new_stake: number; p_user_id: string }
        Returns: number
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_my_profile: { Args: never; Returns: string }
      finalize_ufc_fight_void_remaining: {
        Args: { p_fight_id: string; p_reason?: string }
        Returns: number
      }
      flag_prediction_for_review: {
        Args: { p_prediction_id: string; p_reason: string }
        Returns: Json
      }
      generate_public_reference: { Args: never; Returns: string }
      generate_referral_code: { Args: never; Returns: string }
      get_correlated_exposure_alerts: {
        Args: { p_status?: string }
        Returns: Json
      }
      get_match_exposure_summary: {
        Args: { p_match_id: string }
        Returns: Json
      }
      get_onboarding_completion_stats: { Args: never; Returns: Json }
      get_recent_sports_sync_runs: {
        Args: { _limit?: number }
        Returns: {
          competition_code: string
          finished_at: string
          id: string
          job_type: string
          provider: string
          records_created: number
          records_fetched: number
          records_updated: number
          sport_code: string
          started_at: string
          status: string
        }[]
      }
      get_simulation_outcome_analytics: { Args: never; Returns: Json }
      get_simulation_stress_metrics: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_onboarding_event: {
        Args: {
          p_event: string
          p_metadata?: Json
          p_step_index?: number
          p_tour_key: string
        }
        Returns: undefined
      }
      mark_onboarding_complete: { Args: never; Returns: undefined }
      mark_onboarding_skipped: { Args: never; Returns: undefined }
      mark_tour_complete: { Args: { p_tour_key: string }; Returns: undefined }
      market_odds_cap: { Args: { p_market: string }; Returns: number }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      payout_approve_atomic: {
        Args: { p_admin_id: string; p_payout_id: string }
        Returns: string
      }
      payout_user_confirm: {
        Args: { p_payout_id: string; p_user_id: string }
        Returns: undefined
      }
      payout_user_reject_atomic: {
        Args: { p_payout_id: string; p_reason: string; p_user_id: string }
        Returns: string
      }
      pick_odds_weighted_score: {
        Args: { p_match_id: string }
        Returns: {
          away_score: number
          home_score: number
          outcome: string
          outcome_prob: number
        }[]
      }
      place_bet_atomic: {
        Args: {
          p_cap_pct?: number
          p_client_request_id?: string
          p_market: Database["public"]["Enums"]["prediction_market"]
          p_match_id: string
          p_odds: number
          p_outcome: string
          p_snapshot_id?: string
          p_stake: number
          p_user_id: string
        }
        Returns: string
      }
      place_f1_championship_bet_atomic: {
        Args: {
          p_market_id: string
          p_max_odds: number
          p_stake: number
          p_user_id: string
        }
        Returns: string
      }
      place_f1_race_bet_atomic: {
        Args: {
          p_market_id: string
          p_max_odds: number
          p_stake: number
          p_user_id: string
        }
        Returns: string
      }
      place_free_bet_atomic: {
        Args: {
          p_client_request_id: string
          p_free_bet_id: string
          p_market: Database["public"]["Enums"]["prediction_market"]
          p_match_id: string
          p_odds: number
          p_outcome: string
          p_snapshot_id: string
          p_user_id: string
        }
        Returns: string
      }
      place_market_bet_atomic: {
        Args: {
          p_client_request_id?: string
          p_market: string
          p_match_id: string
          p_selection: string
          p_stake: number
          p_user_id: string
        }
        Returns: string
      }
      place_sports_bet_atomic: {
        Args: {
          p_event_id: string
          p_idempotency_key?: string
          p_market_id: string
          p_max_odds: number
          p_selection_id: string
          p_stake: number
          p_user_id: string
        }
        Returns: string
      }
      place_ufc_bet_atomic: {
        Args: {
          p_fight_id: string
          p_market_type: string
          p_odds: number
          p_selection_key: string
          p_selection_label: string
          p_stake: number
          p_user_id: string
        }
        Returns: string
      }
      platform_apply_change: {
        Args: {
          p_amount: number
          p_bet_id?: string
          p_is_simulation?: boolean
          p_match_id?: string
          p_note?: string
          p_type: Database["public"]["Enums"]["platform_txn_type"]
        }
        Returns: number
      }
      poisson_pmf: { Args: { k: number; lambda: number }; Returns: number }
      pool_apply_change: {
        Args: {
          p_amount: number
          p_desc?: string
          p_match_id: string
          p_outcome: string
          p_prediction_id?: string
          p_type: string
          p_user_id?: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalc_match_liabilities: {
        Args: { p_match_id: string }
        Returns: undefined
      }
      recalculate_correlated_exposure: {
        Args: { p_match_id: string }
        Returns: Json
      }
      recalculate_match_scenario_exposure: {
        Args: { p_match_id: string }
        Returns: Json
      }
      redeem_free_bet: {
        Args: {
          p_stake_amount: number
          p_store_item: string
          p_token_cost: number
          p_user_id: string
        }
        Returns: string
      }
      refresh_odds_status_for_open_matches: { Args: never; Returns: undefined }
      regenerate_match_market_odds: {
        Args: { p_match_id: string }
        Returns: undefined
      }
      regrade_cards_corners_for_match: {
        Args: { p_match_id: string }
        Returns: {
          delta: number
          new_status: string
          old_status: string
          prediction_id: string
        }[]
      }
      regrade_prediction_manual: {
        Args: {
          p_actor_id: string
          p_new_status: string
          p_prediction_id: string
          p_reason: string
        }
        Returns: Json
      }
      regrade_ufc_bet_manual: {
        Args: {
          p_actor_id: string
          p_bet_id: string
          p_new_status: string
          p_reason: string
        }
        Returns: Json
      }
      reject_wallet_adjustment: {
        Args: {
          p_admin_id?: string
          p_rejection_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      reprice_match_market_odds: {
        Args: { p_match_id: string }
        Returns: number
      }
      reprice_match_reference_odds: {
        Args: { p_match_id: string }
        Returns: boolean
      }
      reprice_open_match_market_odds: { Args: never; Returns: number }
      request_wallet_adjustment: {
        Args: {
          p_adjustment_type: string
          p_admin_id?: string
          p_amount: number
          p_reason: string
          p_target_user_id: string
        }
        Returns: Json
      }
      reset_simulation_data: { Args: { p_admin_id: string }; Returns: Json }
      resolve_correlated_exposure_alert: {
        Args: { p_alert_id: string; p_resolution_note: string }
        Returns: Json
      }
      reverse_settled_predictions_for_match: {
        Args: { p_match_id: string }
        Returns: number
      }
      run_reconciliation_check: { Args: never; Returns: Json }
      run_simulation_batch_settle: { Args: never; Returns: Json }
      run_simulation_tick: {
        Args: { p_match_duration_minutes?: number }
        Returns: Json
      }
      seed_cards_corners_odds: {
        Args: { p_match_id: string }
        Returns: undefined
      }
      seed_match_market_odds: {
        Args: { p_match_id: string }
        Returns: undefined
      }
      set_house_user: {
        Args: { p_admin_id: string; p_house_user_id: string }
        Returns: string
      }
      settle_cards_corners_after_delay: {
        Args: { p_match_id: string; p_min_delay?: string }
        Returns: number
      }
      settle_cards_corners_for_match: {
        Args: { p_match_id: string }
        Returns: number
      }
      settle_match_all_markets_atomic: {
        Args: {
          p_away: number
          p_away_ht?: number
          p_home: number
          p_home_ht?: number
          p_match_id: string
          p_qualifier?: string
        }
        Returns: number
      }
      settle_match_atomic: {
        Args: { p_away_score: number; p_home_score: number; p_match_id: string }
        Returns: number
      }
      settle_new_markets_for_match: {
        Args: {
          p_away: number
          p_away_ht?: number
          p_home: number
          p_home_ht?: number
          p_match_id: string
        }
        Returns: number
      }
      settle_sports_market_atomic: {
        Args: {
          p_market_id: string
          p_run_id?: string
          p_void?: boolean
          p_winning_selection_ids: string[]
        }
        Returns: {
          bets_updated: number
          total_payout: number
        }[]
      }
      settle_to_qualify_for_match: {
        Args: { p_match_id: string; p_qualifier: string }
        Returns: number
      }
      settle_tournament_winner_atomic: {
        Args: { p_tournament_key: string; p_winner_team: string }
        Returns: number
      }
      settle_ufc_fight_atomic: {
        Args: {
          p_fight_id: string
          p_method: string
          p_round: number
          p_winner: string
        }
        Returns: number
      }
      settlement_claim: {
        Args: {
          p_action: string
          p_final_status?: string
          p_gross_payout?: number
          p_metadata?: Json
          p_previous_status?: string
          p_product: string
          p_reference_id: string
          p_user_id?: string
          p_version?: number
        }
        Returns: string
      }
      settlement_claim_then_fail: {
        Args: { p_product: string; p_reference_id: string }
        Returns: undefined
      }
      settlement_next_version:
        | {
            Args: { p_product: string; p_reference_id: string }
            Returns: number
          }
        | {
            Args: {
              p_action: string
              p_product: string
              p_reference_id: string
            }
            Returns: number
          }
      settlement_test_cleanup: { Args: { p_tag: string }; Returns: undefined }
      settlement_try_claim: {
        Args: {
          p_action: string
          p_final_status?: string
          p_gross_payout?: number
          p_metadata?: Json
          p_previous_status?: string
          p_product: string
          p_reference_id: string
          p_user_id?: string
          p_version?: number
        }
        Returns: Json
      }
      sports_journal_reconciliation: {
        Args: { p_env?: Database["public"]["Enums"]["acct_environment"] }
        Returns: Json
      }
      sports_journal_selftest: {
        Args: { p_env?: Database["public"]["Enums"]["acct_environment"] }
        Returns: Json
      }
      staff_approve_point_request: {
        Args: { p_note?: string; p_request_id: string; p_staff_id: string }
        Returns: number
      }
      staff_reject_point_request: {
        Args: { p_reason: string; p_request_id: string; p_staff_id: string }
        Returns: undefined
      }
      trust_community_growth: { Args: never; Returns: Json }
      trust_mask_name: {
        Args: { name: string; public_ref: string }
        Returns: string
      }
      trust_my_badges: { Args: { _user: string }; Returns: Json }
      trust_payout_performance: { Args: never; Returns: Json }
      trust_platform_pulse: { Args: never; Returns: Json }
      trust_platform_status: {
        Args: never
        Returns: {
          last_checked: string
          service: string
          status: string
        }[]
      }
      trust_recent_activity: {
        Args: never
        Returns: {
          at: string
          detail: string
          kind: string
          who: string
        }[]
      }
      trust_support_stats: { Args: never; Returns: Json }
      update_platform_settings:
        | {
            Args: {
              p_admin_id: string
              p_apply_margin_to_real: boolean
              p_exposure_cap_pct: number
              p_margin_pct: number
              p_max_potential_payout: number
              p_max_stake_per_bet: number
            }
            Returns: {
              admin_alert_emails: string[]
              alert_suppression_window_minutes: number
              allow_single_admin_self_approval: boolean
              apply_margin_to_real: boolean
              bets_paused: boolean
              cards_corners_void_after_hours: number
              correct_score_disabled: boolean
              correlation_groups: Json
              critical_alert_email_enabled: boolean
              disabled_markets: string[]
              exposure_cap_pct: number
              high_odds_disabled: boolean
              high_odds_threshold: number
              id: number
              last_alert_sent_at: string | null
              margin_pct: number
              max_bets_per_user_per_match: number
              max_correct_score_other_liability: number | null
              max_high_odds_stake: number | null
              max_match_worst_case_liability: number | null
              max_odds_age_minutes: number | null
              max_potential_payout: number
              max_single_bet_payout: number | null
              max_single_outcome_liability: number | null
              max_stake_per_bet: number
              max_user_daily_potential_payout: number
              max_user_match_correlated_payout: number
              max_user_match_potential_payout: number
              max_user_match_stake: number
              odds_deviation_threshold_pct: number | null
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "platform_settings"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_admin_id: string
              p_apply_margin_to_real: boolean
              p_bets_paused?: boolean
              p_correct_score_disabled?: boolean
              p_disabled_markets?: string[]
              p_exposure_cap_pct: number
              p_high_odds_disabled?: boolean
              p_high_odds_threshold?: number
              p_margin_pct: number
              p_max_bets_per_user_per_match?: number
              p_max_potential_payout: number
              p_max_stake_per_bet: number
            }
            Returns: {
              admin_alert_emails: string[]
              alert_suppression_window_minutes: number
              allow_single_admin_self_approval: boolean
              apply_margin_to_real: boolean
              bets_paused: boolean
              cards_corners_void_after_hours: number
              correct_score_disabled: boolean
              correlation_groups: Json
              critical_alert_email_enabled: boolean
              disabled_markets: string[]
              exposure_cap_pct: number
              high_odds_disabled: boolean
              high_odds_threshold: number
              id: number
              last_alert_sent_at: string | null
              margin_pct: number
              max_bets_per_user_per_match: number
              max_correct_score_other_liability: number | null
              max_high_odds_stake: number | null
              max_match_worst_case_liability: number | null
              max_odds_age_minutes: number | null
              max_potential_payout: number
              max_single_bet_payout: number | null
              max_single_outcome_liability: number | null
              max_stake_per_bet: number
              max_user_daily_potential_payout: number
              max_user_match_correlated_payout: number
              max_user_match_potential_payout: number
              max_user_match_stake: number
              odds_deviation_threshold_pct: number | null
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "platform_settings"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      void_match_atomic: { Args: { p_match_id: string }; Returns: number }
      void_ufc_bet_manual: {
        Args: { p_actor_id: string; p_bet_id: string; p_reason: string }
        Returns: Json
      }
      void_ufc_fight_atomic: {
        Args: { p_fight_id: string; p_reason: string }
        Returns: number
      }
      wallet_apply_change: {
        Args: {
          p_amount: number
          p_is_simulation?: boolean
          p_note?: string
          p_reference_id: string
          p_reference_type: Database["public"]["Enums"]["wallet_ref_type"]
          p_type: Database["public"]["Enums"]["wallet_txn_type"]
          p_user_id: string
        }
        Returns: {
          new_balance: number
          txn_id: string
        }[]
      }
      wallet_approve_request: {
        Args: { p_admin_id: string; p_note?: string; p_request_id: string }
        Returns: number
      }
      wallet_reject_request: {
        Args: { p_admin_id: string; p_note?: string; p_request_id: string }
        Returns: undefined
      }
    }
    Enums: {
      acct_account_status: "ACTIVE" | "CLOSED" | "SUSPENDED"
      acct_account_type:
        | "LIABILITY"
        | "ASSET"
        | "EQUITY"
        | "REVENUE"
        | "EXPENSE"
        | "HOUSE_RESERVE"
        | "SUSPENSE"
      acct_cutover_status:
        | "DRAFT"
        | "VALIDATED"
        | "APPROVED"
        | "OPENING_POSTED"
        | "CANCELLED"
      acct_environment: "PRODUCTION" | "SIMULATION" | "TEST"
      acct_journal_status: "DRAFT" | "POSTED" | "REVERSED" | "REJECTED"
      acct_journal_type:
        | "OPENING_BALANCE"
        | "STAKE_PLACED"
        | "PAYOUT_SETTLED"
        | "REFUND"
        | "VOID"
        | "REVERSAL"
        | "BONUS_GRANT"
        | "POINTS_EXPIRY"
        | "ADMIN_CORRECTION"
        | "MIGRATION_CORRECTION"
        | "ROUNDING"
        | "LEGACY_BACKFILL_REFERENCE"
        | "TEST"
      acct_normal_balance: "DEBIT" | "CREDIT"
      app_role:
        | "admin"
        | "member"
        | "pending"
        | "super_admin"
        | "viewer"
        | "customer_support"
      arcade_cosmetic_rarity: "common" | "rare" | "epic" | "legendary"
      arcade_cosmetic_type: "ball" | "board"
      arcade_cosmetic_unlock: "free" | "achievement" | "admin"
      arcade_drop_txn_type:
        | "daily_grant"
        | "bonus_grant"
        | "consume"
        | "refund"
        | "expiry"
        | "admin_grant"
        | "admin_revoke"
      arcade_outcome: "WIN" | "LOSS" | "VOID" | "REVERSED" | "PENDING" | "ERROR"
      arcade_profile_status: "draft" | "active" | "retired"
      arcade_risk_mode: "low" | "medium" | "high"
      arcade_roulette_status:
        | "WIN"
        | "LOSS"
        | "PUSH"
        | "PENDING"
        | "VOID"
        | "REVERSED"
        | "ERROR"
      arcade_score_band:
        | "ZERO"
        | "LOW"
        | "STANDARD"
        | "HIGH"
        | "RARE"
        | "JACKPOT"
      arcade_treasure_status:
        | "CREATED"
        | "ACTIVE"
        | "COLLECTING"
        | "WON"
        | "LOST"
        | "PUSH"
        | "VOID"
        | "REVERSED"
        | "EXPIRED"
        | "ERROR"
      bj_action:
        | "DEAL"
        | "HIT"
        | "STAND"
        | "DOUBLE"
        | "SPLIT"
        | "TIMEOUT_STAND"
        | "DEALER_DRAW"
        | "SETTLE"
      bj_config_status:
        | "draft"
        | "review"
        | "approved"
        | "scheduled"
        | "active"
        | "retired"
      bj_entry_txn:
        | "daily_allocation"
        | "bonus_grant"
        | "challenge_reward"
        | "achievement_reward"
        | "consume"
        | "void_return"
        | "admin_correction"
        | "expiry"
      bj_hand_status:
        | "CREATED"
        | "DEALING"
        | "PLAYER_TURN"
        | "DEALER_CHECK"
        | "DEALER_TURN"
        | "SETTLING"
        | "COMPLETED"
        | "VOID"
        | "REVERSED"
        | "EXPIRED"
        | "ERROR"
      bj_ph_status:
        | "ACTIVE"
        | "STOOD"
        | "DOUBLED"
        | "BLACKJACK"
        | "BUST"
        | "SPLIT_ACE_LOCKED"
        | "WON"
        | "LOST"
        | "PUSH"
        | "VOID"
        | "REVERSED"
      bj_result:
        | "BLACKJACK"
        | "WIN"
        | "LOSS"
        | "PUSH"
        | "BUST"
        | "MIXED"
        | "VOID"
        | "REVERSED"
      bj_score_txn:
        | "blackjack_result"
        | "win_result"
        | "push_result"
        | "double_result"
        | "split_result"
        | "challenge_bonus"
        | "achievement_bonus"
        | "void_reversal"
        | "admin_correction"
      bj_shoe_status:
        | "ACTIVE"
        | "NEAR_CUT"
        | "RETIRED"
        | "AWAITING_REVEAL"
        | "VERIFIED"
        | "VERIFICATION_FAILED"
        | "SUSPENDED"
      match_status:
        | "scheduled"
        | "live"
        | "finished"
        | "postponed"
        | "cancelled"
      payout_request_status:
        | "pending"
        | "approved"
        | "proof_uploaded"
        | "completed"
        | "rejected_by_admin"
        | "rejected_by_user"
      platform_txn_type:
        | "stake_collected"
        | "payout_paid"
        | "void_refund"
        | "admin_topup"
        | "admin_withdrawal"
        | "match_pool_collected"
        | "payout_clawback"
      point_request_status:
        | "pending_upload"
        | "pending"
        | "approved"
        | "rejected"
      prediction_market:
        | "result"
        | "correct_score"
        | "total_goals"
        | "btts"
        | "first_scorer"
        | "tournament_winner"
        | "group_winner"
        | "over_under_0_5"
        | "over_under_1_5"
        | "over_under_2_5"
        | "over_under_3_5"
        | "over_under_4_5"
        | "over_under_5_5"
        | "over_under_6_5"
        | "half_time_full_time"
        | "exact_total_goals"
        | "to_qualify"
        | "double_chance"
        | "draw_no_bet"
        | "goals_odd_even"
        | "clean_sheet_home"
        | "clean_sheet_away"
        | "win_to_nil_home"
        | "win_to_nil_away"
        | "cards_over_under_2_5"
        | "cards_over_under_3_5"
        | "cards_over_under_4_5"
        | "cards_over_under_5_5"
        | "home_cards_over_under_1_5"
        | "away_cards_over_under_1_5"
        | "red_card_match"
        | "first_card"
        | "corners_over_under_8_5"
        | "corners_over_under_9_5"
        | "corners_over_under_10_5"
        | "corners_over_under_11_5"
        | "home_corners_over_under_4_5"
        | "away_corners_over_under_4_5"
        | "first_corner"
      prediction_status: "pending" | "won" | "lost" | "void"
      wallet_ref_type:
        | "point_request"
        | "bet_placement"
        | "bet_settlement"
        | "admin_adjustment"
        | "house_bankroll"
        | "payout"
      wallet_txn_type: "credit" | "debit" | "refund" | "adjustment"
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
      acct_account_status: ["ACTIVE", "CLOSED", "SUSPENDED"],
      acct_account_type: [
        "LIABILITY",
        "ASSET",
        "EQUITY",
        "REVENUE",
        "EXPENSE",
        "HOUSE_RESERVE",
        "SUSPENSE",
      ],
      acct_cutover_status: [
        "DRAFT",
        "VALIDATED",
        "APPROVED",
        "OPENING_POSTED",
        "CANCELLED",
      ],
      acct_environment: ["PRODUCTION", "SIMULATION", "TEST"],
      acct_journal_status: ["DRAFT", "POSTED", "REVERSED", "REJECTED"],
      acct_journal_type: [
        "OPENING_BALANCE",
        "STAKE_PLACED",
        "PAYOUT_SETTLED",
        "REFUND",
        "VOID",
        "REVERSAL",
        "BONUS_GRANT",
        "POINTS_EXPIRY",
        "ADMIN_CORRECTION",
        "MIGRATION_CORRECTION",
        "ROUNDING",
        "LEGACY_BACKFILL_REFERENCE",
        "TEST",
      ],
      acct_normal_balance: ["DEBIT", "CREDIT"],
      app_role: [
        "admin",
        "member",
        "pending",
        "super_admin",
        "viewer",
        "customer_support",
      ],
      arcade_cosmetic_rarity: ["common", "rare", "epic", "legendary"],
      arcade_cosmetic_type: ["ball", "board"],
      arcade_cosmetic_unlock: ["free", "achievement", "admin"],
      arcade_drop_txn_type: [
        "daily_grant",
        "bonus_grant",
        "consume",
        "refund",
        "expiry",
        "admin_grant",
        "admin_revoke",
      ],
      arcade_outcome: ["WIN", "LOSS", "VOID", "REVERSED", "PENDING", "ERROR"],
      arcade_profile_status: ["draft", "active", "retired"],
      arcade_risk_mode: ["low", "medium", "high"],
      arcade_roulette_status: [
        "WIN",
        "LOSS",
        "PUSH",
        "PENDING",
        "VOID",
        "REVERSED",
        "ERROR",
      ],
      arcade_score_band: ["ZERO", "LOW", "STANDARD", "HIGH", "RARE", "JACKPOT"],
      arcade_treasure_status: [
        "CREATED",
        "ACTIVE",
        "COLLECTING",
        "WON",
        "LOST",
        "PUSH",
        "VOID",
        "REVERSED",
        "EXPIRED",
        "ERROR",
      ],
      bj_action: [
        "DEAL",
        "HIT",
        "STAND",
        "DOUBLE",
        "SPLIT",
        "TIMEOUT_STAND",
        "DEALER_DRAW",
        "SETTLE",
      ],
      bj_config_status: [
        "draft",
        "review",
        "approved",
        "scheduled",
        "active",
        "retired",
      ],
      bj_entry_txn: [
        "daily_allocation",
        "bonus_grant",
        "challenge_reward",
        "achievement_reward",
        "consume",
        "void_return",
        "admin_correction",
        "expiry",
      ],
      bj_hand_status: [
        "CREATED",
        "DEALING",
        "PLAYER_TURN",
        "DEALER_CHECK",
        "DEALER_TURN",
        "SETTLING",
        "COMPLETED",
        "VOID",
        "REVERSED",
        "EXPIRED",
        "ERROR",
      ],
      bj_ph_status: [
        "ACTIVE",
        "STOOD",
        "DOUBLED",
        "BLACKJACK",
        "BUST",
        "SPLIT_ACE_LOCKED",
        "WON",
        "LOST",
        "PUSH",
        "VOID",
        "REVERSED",
      ],
      bj_result: [
        "BLACKJACK",
        "WIN",
        "LOSS",
        "PUSH",
        "BUST",
        "MIXED",
        "VOID",
        "REVERSED",
      ],
      bj_score_txn: [
        "blackjack_result",
        "win_result",
        "push_result",
        "double_result",
        "split_result",
        "challenge_bonus",
        "achievement_bonus",
        "void_reversal",
        "admin_correction",
      ],
      bj_shoe_status: [
        "ACTIVE",
        "NEAR_CUT",
        "RETIRED",
        "AWAITING_REVEAL",
        "VERIFIED",
        "VERIFICATION_FAILED",
        "SUSPENDED",
      ],
      match_status: ["scheduled", "live", "finished", "postponed", "cancelled"],
      payout_request_status: [
        "pending",
        "approved",
        "proof_uploaded",
        "completed",
        "rejected_by_admin",
        "rejected_by_user",
      ],
      platform_txn_type: [
        "stake_collected",
        "payout_paid",
        "void_refund",
        "admin_topup",
        "admin_withdrawal",
        "match_pool_collected",
        "payout_clawback",
      ],
      point_request_status: [
        "pending_upload",
        "pending",
        "approved",
        "rejected",
      ],
      prediction_market: [
        "result",
        "correct_score",
        "total_goals",
        "btts",
        "first_scorer",
        "tournament_winner",
        "group_winner",
        "over_under_0_5",
        "over_under_1_5",
        "over_under_2_5",
        "over_under_3_5",
        "over_under_4_5",
        "over_under_5_5",
        "over_under_6_5",
        "half_time_full_time",
        "exact_total_goals",
        "to_qualify",
        "double_chance",
        "draw_no_bet",
        "goals_odd_even",
        "clean_sheet_home",
        "clean_sheet_away",
        "win_to_nil_home",
        "win_to_nil_away",
        "cards_over_under_2_5",
        "cards_over_under_3_5",
        "cards_over_under_4_5",
        "cards_over_under_5_5",
        "home_cards_over_under_1_5",
        "away_cards_over_under_1_5",
        "red_card_match",
        "first_card",
        "corners_over_under_8_5",
        "corners_over_under_9_5",
        "corners_over_under_10_5",
        "corners_over_under_11_5",
        "home_corners_over_under_4_5",
        "away_corners_over_under_4_5",
        "first_corner",
      ],
      prediction_status: ["pending", "won", "lost", "void"],
      wallet_ref_type: [
        "point_request",
        "bet_placement",
        "bet_settlement",
        "admin_adjustment",
        "house_bankroll",
        "payout",
      ],
      wallet_txn_type: ["credit", "debit", "refund", "adjustment"],
    },
  },
} as const
