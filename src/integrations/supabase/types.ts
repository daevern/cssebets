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
          name: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_key: string
          id?: string
          is_active?: boolean
          name: string
          starts_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_key?: string
          id?: string
          is_active?: boolean
          name?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: []
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
      ufc_fights: {
        Row: {
          card_position: string
          commence_time: string
          created_at: string
          event_id: string
          fighter_a: string
          fighter_b: string
          id: string
          odds_api_event_id: string | null
          result_method: string | null
          result_round: number | null
          scheduled_rounds: number
          settled_at: string | null
          status: string
          updated_at: string
          winner: string | null
        }
        Insert: {
          card_position?: string
          commence_time: string
          created_at?: string
          event_id: string
          fighter_a: string
          fighter_b: string
          id?: string
          odds_api_event_id?: string | null
          result_method?: string | null
          result_round?: number | null
          scheduled_rounds?: number
          settled_at?: string | null
          status?: string
          updated_at?: string
          winner?: string | null
        }
        Update: {
          card_position?: string
          commence_time?: string
          created_at?: string
          event_id?: string
          fighter_a?: string
          fighter_b?: string
          id?: string
          odds_api_event_id?: string | null
          result_method?: string | null
          result_round?: number | null
          scheduled_rounds?: number
          settled_at?: string | null
          status?: string
          updated_at?: string
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
          admin_action_id: string | null
          amount: number
          balance_after: number
          balance_before: number
          bet_id: string | null
          created_at: string
          id: string
          is_simulation: boolean
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
          admin_action_id?: string | null
          amount: number
          balance_after: number
          balance_before: number
          bet_id?: string | null
          created_at?: string
          id?: string
          is_simulation?: boolean
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
          admin_action_id?: string | null
          amount?: number
          balance_after?: number
          balance_before?: number
          bet_id?: string | null
          created_at?: string
          id?: string
          is_simulation?: boolean
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
      award_referral_milestones: {
        Args: { p_referred_user_id: string }
        Returns: undefined
      }
      cancel_pending_bet: {
        Args: { p_prediction_id: string; p_user_id: string }
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
      edit_pending_bet_stake: {
        Args: {
          p_new_stake: number
          p_prediction_id: string
          p_user_id: string
        }
        Returns: number
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
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
