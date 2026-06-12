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
          user_agent?: string | null
          user_id?: string | null
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
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
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
      matches: {
        Row: {
          away_crest: string | null
          away_liability: number
          away_score: number | null
          away_team: string
          created_at: string
          draw_liability: number
          external_id: string | null
          group_name: string | null
          home_crest: string | null
          home_liability: number
          home_score: number | null
          home_team: string
          id: string
          is_simulation: boolean
          kickoff_at: string
          odds_source: string | null
          odds_updated_at: string | null
          reference_odds: Json | null
          stage: string | null
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
          winner: string | null
          worst_case_exposure: number
        }
        Insert: {
          away_crest?: string | null
          away_liability?: number
          away_score?: number | null
          away_team: string
          created_at?: string
          draw_liability?: number
          external_id?: string | null
          group_name?: string | null
          home_crest?: string | null
          home_liability?: number
          home_score?: number | null
          home_team: string
          id?: string
          is_simulation?: boolean
          kickoff_at: string
          odds_source?: string | null
          odds_updated_at?: string | null
          reference_odds?: Json | null
          stage?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          winner?: string | null
          worst_case_exposure?: number
        }
        Update: {
          away_crest?: string | null
          away_liability?: number
          away_score?: number | null
          away_team?: string
          created_at?: string
          draw_liability?: number
          external_id?: string | null
          group_name?: string | null
          home_crest?: string | null
          home_liability?: number
          home_score?: number | null
          home_team?: string
          id?: string
          is_simulation?: boolean
          kickoff_at?: string
          odds_source?: string | null
          odds_updated_at?: string | null
          reference_odds?: Json | null
          stage?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          winner?: string | null
          worst_case_exposure?: number
        }
        Relationships: []
      }
      payout_requests: {
        Row: {
          amount: number
          approved_at: string | null
          bank_account_number: string
          bank_name: string
          completed_at: string | null
          created_at: string
          id: string
          proof_file_name: string | null
          proof_file_path: string | null
          proof_file_size: number | null
          proof_file_type: string | null
          proof_uploaded_at: string | null
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
          bank_account_number: string
          bank_name: string
          completed_at?: string | null
          created_at?: string
          id?: string
          proof_file_name?: string | null
          proof_file_path?: string | null
          proof_file_size?: number | null
          proof_file_type?: string | null
          proof_uploaded_at?: string | null
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
          bank_account_number?: string
          bank_name?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          proof_file_name?: string | null
          proof_file_path?: string | null
          proof_file_size?: number | null
          proof_file_type?: string | null
          proof_uploaded_at?: string | null
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
          total_payouts_paid: number
          total_stakes_collected: number
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          house_user_id?: string | null
          id?: number
          total_payouts_paid?: number
          total_stakes_collected?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          house_user_id?: string | null
          id?: number
          total_payouts_paid?: number
          total_stakes_collected?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          apply_margin_to_real: boolean
          exposure_cap_pct: number
          id: number
          margin_pct: number
          max_potential_payout: number
          max_stake_per_bet: number
          updated_at: string
        }
        Insert: {
          apply_margin_to_real?: boolean
          exposure_cap_pct?: number
          id?: number
          margin_pct?: number
          max_potential_payout?: number
          max_stake_per_bet?: number
          updated_at?: string
        }
        Update: {
          apply_margin_to_real?: boolean
          exposure_cap_pct?: number
          id?: number
          margin_pct?: number
          max_potential_payout?: number
          max_stake_per_bet?: number
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
          id: string
          is_simulation: boolean
          market: Database["public"]["Enums"]["prediction_market"]
          match_id: string | null
          outcome: string
          points: number
          potential_return: number
          reference_odds: number
          reference_odds_snapshot_id: string | null
          settled_at: string | null
          status: Database["public"]["Enums"]["prediction_status"]
          user_id: string
          virtual_stake: number
        }
        Insert: {
          client_request_id?: string | null
          created_at?: string
          id?: string
          is_simulation?: boolean
          market: Database["public"]["Enums"]["prediction_market"]
          match_id?: string | null
          outcome: string
          points?: number
          potential_return?: number
          reference_odds?: number
          reference_odds_snapshot_id?: string | null
          settled_at?: string | null
          status?: Database["public"]["Enums"]["prediction_status"]
          user_id: string
          virtual_stake?: number
        }
        Update: {
          client_request_id?: string | null
          created_at?: string
          id?: string
          is_simulation?: boolean
          market?: Database["public"]["Enums"]["prediction_market"]
          match_id?: string | null
          outcome?: string
          points?: number
          potential_return?: number
          reference_odds?: number
          reference_odds_snapshot_id?: string | null
          settled_at?: string | null
          status?: Database["public"]["Enums"]["prediction_status"]
          user_id?: string
          virtual_stake?: number
        }
        Relationships: [
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
          id: string
          is_simulation: boolean
          phone_number: string | null
          suspended: boolean
        }
        Insert: {
          auth_provider?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          is_simulation?: boolean
          phone_number?: string | null
          suspended?: boolean
        }
        Update: {
          auth_provider?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_simulation?: boolean
          phone_number?: string | null
          suspended?: boolean
        }
        Relationships: []
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
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          id: string
          is_simulation: boolean
          note: string | null
          reference_id: string | null
          reference_type: Database["public"]["Enums"]["wallet_ref_type"]
          type: Database["public"]["Enums"]["wallet_txn_type"]
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          id?: string
          is_simulation?: boolean
          note?: string | null
          reference_id?: string | null
          reference_type: Database["public"]["Enums"]["wallet_ref_type"]
          type: Database["public"]["Enums"]["wallet_txn_type"]
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          id?: string
          is_simulation?: boolean
          note?: string | null
          reference_id?: string | null
          reference_type?: Database["public"]["Enums"]["wallet_ref_type"]
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
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_simulation_outcome_analytics: { Args: never; Returns: Json }
      get_simulation_stress_metrics: { Args: never; Returns: Json }
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
      reset_simulation_data: { Args: { p_admin_id: string }; Returns: Json }
      run_simulation_batch_settle: { Args: never; Returns: Json }
      run_simulation_tick: {
        Args: { p_match_duration_minutes?: number }
        Returns: Json
      }
      set_house_user: {
        Args: { p_admin_id: string; p_house_user_id: string }
        Returns: string
      }
      settle_match_atomic: {
        Args: { p_away_score: number; p_home_score: number; p_match_id: string }
        Returns: number
      }
      settle_tournament_winner_atomic: {
        Args: { p_tournament_key: string; p_winner_team: string }
        Returns: number
      }
      update_platform_settings: {
        Args: {
          p_admin_id: string
          p_apply_margin_to_real: boolean
          p_exposure_cap_pct: number
          p_margin_pct: number
          p_max_potential_payout: number
          p_max_stake_per_bet: number
        }
        Returns: {
          apply_margin_to_real: boolean
          exposure_cap_pct: number
          id: number
          margin_pct: number
          max_potential_payout: number
          max_stake_per_bet: number
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
      app_role: "admin" | "member" | "pending" | "super_admin" | "viewer"
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
      app_role: ["admin", "member", "pending", "super_admin", "viewer"],
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
