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
          away_score_ht: number | null
          away_team: string
          created_at: string
          draw_liability: number
          external_id: string | null
          group_name: string | null
          home_crest: string | null
          home_liability: number
          home_score: number | null
          home_score_ht: number | null
          home_team: string
          id: string
          is_simulation: boolean
          kickoff_at: string
          manual_override: boolean
          margin_disabled: boolean
          odds_source: string | null
          odds_status: string
          odds_updated_at: string | null
          reference_odds: Json | null
          stage: string | null
          status: Database["public"]["Enums"]["match_status"]
          suspended_markets: string[]
          updated_at: string
          winner: string | null
          worst_case_exposure: number
        }
        Insert: {
          away_crest?: string | null
          away_liability?: number
          away_score?: number | null
          away_score_ht?: number | null
          away_team: string
          created_at?: string
          draw_liability?: number
          external_id?: string | null
          group_name?: string | null
          home_crest?: string | null
          home_liability?: number
          home_score?: number | null
          home_score_ht?: number | null
          home_team: string
          id?: string
          is_simulation?: boolean
          kickoff_at: string
          manual_override?: boolean
          margin_disabled?: boolean
          odds_source?: string | null
          odds_status?: string
          odds_updated_at?: string | null
          reference_odds?: Json | null
          stage?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          suspended_markets?: string[]
          updated_at?: string
          winner?: string | null
          worst_case_exposure?: number
        }
        Update: {
          away_crest?: string | null
          away_liability?: number
          away_score?: number | null
          away_score_ht?: number | null
          away_team?: string
          created_at?: string
          draw_liability?: number
          external_id?: string | null
          group_name?: string | null
          home_crest?: string | null
          home_liability?: number
          home_score?: number | null
          home_score_ht?: number | null
          home_team?: string
          id?: string
          is_simulation?: boolean
          kickoff_at?: string
          manual_override?: boolean
          margin_disabled?: boolean
          odds_source?: string | null
          odds_status?: string
          odds_updated_at?: string | null
          reference_odds?: Json | null
          stage?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          suspended_markets?: string[]
          updated_at?: string
          winner?: string | null
          worst_case_exposure?: number
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
          admin_alert_emails: string[]
          alert_suppression_window_minutes: number
          apply_margin_to_real: boolean
          bets_paused: boolean
          correct_score_disabled: boolean
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
          odds_deviation_threshold_pct: number | null
          updated_at: string
        }
        Insert: {
          admin_alert_emails?: string[]
          alert_suppression_window_minutes?: number
          apply_margin_to_real?: boolean
          bets_paused?: boolean
          correct_score_disabled?: boolean
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
          odds_deviation_threshold_pct?: number | null
          updated_at?: string
        }
        Update: {
          admin_alert_emails?: string[]
          alert_suppression_window_minutes?: number
          apply_margin_to_real?: boolean
          bets_paused?: boolean
          correct_score_disabled?: boolean
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
          id: string
          is_simulation: boolean
          market: Database["public"]["Enums"]["prediction_market"]
          market_label: string | null
          market_text: string | null
          match_id: string | null
          outcome: string
          points: number
          potential_return: number
          reference_odds: number
          reference_odds_snapshot_id: string | null
          selection_label: string | null
          settled_at: string | null
          settled_result: string | null
          status: Database["public"]["Enums"]["prediction_status"]
          user_id: string
          virtual_stake: number
        }
        Insert: {
          client_request_id?: string | null
          created_at?: string
          flagged_for_review?: boolean
          flagged_reason?: string | null
          id?: string
          is_simulation?: boolean
          market: Database["public"]["Enums"]["prediction_market"]
          market_label?: string | null
          market_text?: string | null
          match_id?: string | null
          outcome: string
          points?: number
          potential_return?: number
          reference_odds?: number
          reference_odds_snapshot_id?: string | null
          selection_label?: string | null
          settled_at?: string | null
          settled_result?: string | null
          status?: Database["public"]["Enums"]["prediction_status"]
          user_id: string
          virtual_stake?: number
        }
        Update: {
          client_request_id?: string | null
          created_at?: string
          flagged_for_review?: boolean
          flagged_reason?: string | null
          id?: string
          is_simulation?: boolean
          market?: Database["public"]["Enums"]["prediction_market"]
          market_label?: string | null
          market_text?: string | null
          match_id?: string | null
          outcome?: string
          points?: number
          potential_return?: number
          reference_odds?: number
          reference_odds_snapshot_id?: string | null
          selection_label?: string | null
          settled_at?: string | null
          settled_result?: string | null
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
          force_password_change: boolean
          id: string
          is_simulation: boolean
          onboarding_completed_at: string | null
          onboarding_enabled: boolean
          onboarding_skipped_at: string | null
          phone_number: string | null
          public_reference: string
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
          suspended?: boolean
          tour_progress?: Json
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
    }
    Functions: {
      adjust_correct_score_odds: {
        Args: {
          p_match_id: string
          p_max_odds?: number
          p_target_overround?: number
        }
        Returns: undefined
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
          p_user_id: string
        }
        Returns: undefined
      }
      cancel_pending_bet: {
        Args: { p_prediction_id: string; p_user_id: string }
        Returns: string
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
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      edit_pending_bet_stake: {
        Args: {
          p_new_stake: number
          p_prediction_id: string
          p_user_id: string
        }
        Returns: number
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      generate_public_reference: { Args: never; Returns: string }
      get_onboarding_completion_stats: { Args: never; Returns: Json }
      get_simulation_outcome_analytics: { Args: never; Returns: Json }
      get_simulation_stress_metrics: { Args: never; Returns: Json }
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
      refresh_odds_status_for_open_matches: { Args: never; Returns: undefined }
      regenerate_match_market_odds: {
        Args: { p_match_id: string }
        Returns: undefined
      }
      reset_simulation_data: { Args: { p_admin_id: string }; Returns: Json }
      run_reconciliation_check: { Args: never; Returns: Json }
      run_simulation_batch_settle: { Args: never; Returns: Json }
      run_simulation_tick: {
        Args: { p_match_duration_minutes?: number }
        Returns: Json
      }
      seed_match_market_odds: {
        Args: { p_match_id: string }
        Returns: undefined
      }
      set_house_user: {
        Args: { p_admin_id: string; p_house_user_id: string }
        Returns: string
      }
      settle_match_all_markets_atomic: {
        Args: {
          p_away: number
          p_away_ht?: number
          p_home: number
          p_home_ht?: number
          p_match_id: string
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
      settle_tournament_winner_atomic: {
        Args: { p_tournament_key: string; p_winner_team: string }
        Returns: number
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
              apply_margin_to_real: boolean
              bets_paused: boolean
              correct_score_disabled: boolean
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
              apply_margin_to_real: boolean
              bets_paused: boolean
              correct_score_disabled: boolean
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
      app_role:
        | "admin"
        | "member"
        | "pending"
        | "super_admin"
        | "viewer"
        | "customer_support"
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
      app_role: [
        "admin",
        "member",
        "pending",
        "super_admin",
        "viewer",
        "customer_support",
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
