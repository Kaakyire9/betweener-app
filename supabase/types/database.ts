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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      account_merge_cases: {
        Row: {
          candidate_reason: string | null
          created_at: string
          created_by: string | null
          evidence: Json
          executed_at: string | null
          executed_by: string | null
          execution_summary: Json
          id: string
          notes: string | null
          preflight_summary: Json
          request_channel: string
          requester_user_id: string | null
          resolved_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_profile_id: string | null
          source_user_id: string
          status: string
          target_profile_id: string | null
          target_user_id: string
          updated_at: string
        }
        Insert: {
          candidate_reason?: string | null
          created_at?: string
          created_by?: string | null
          evidence?: Json
          executed_at?: string | null
          executed_by?: string | null
          execution_summary?: Json
          id?: string
          notes?: string | null
          preflight_summary?: Json
          request_channel?: string
          requester_user_id?: string | null
          resolved_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_profile_id?: string | null
          source_user_id: string
          status?: string
          target_profile_id?: string | null
          target_user_id: string
          updated_at?: string
        }
        Update: {
          candidate_reason?: string | null
          created_at?: string
          created_by?: string | null
          evidence?: Json
          executed_at?: string | null
          executed_by?: string | null
          execution_summary?: Json
          id?: string
          notes?: string | null
          preflight_summary?: Json
          request_channel?: string
          requester_user_id?: string | null
          resolved_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_profile_id?: string | null
          source_user_id?: string
          status?: string
          target_profile_id?: string | null
          target_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_merge_cases_source_profile_id_fkey"
            columns: ["source_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_merge_cases_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_merge_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          merge_case_id: string
          metadata: Json
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          merge_case_id: string
          metadata?: Json
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          merge_case_id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "account_merge_events_merge_case_id_fkey"
            columns: ["merge_case_id"]
            isOneToOne: false
            referencedRelation: "account_merge_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      account_merge_execution_failures: {
        Row: {
          actor_user_id: string | null
          context: Json
          created_at: string
          error_context: string | null
          error_detail: string | null
          error_hint: string | null
          error_message: string
          failed_step: string | null
          id: string
          merge_case_id: string | null
          source_user_id: string | null
          sqlstate: string | null
          target_user_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          context?: Json
          created_at?: string
          error_context?: string | null
          error_detail?: string | null
          error_hint?: string | null
          error_message: string
          failed_step?: string | null
          id?: string
          merge_case_id?: string | null
          source_user_id?: string | null
          sqlstate?: string | null
          target_user_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          context?: Json
          created_at?: string
          error_context?: string | null
          error_detail?: string | null
          error_hint?: string | null
          error_message?: string
          failed_step?: string | null
          id?: string
          merge_case_id?: string | null
          source_user_id?: string | null
          sqlstate?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_merge_execution_failures_merge_case_id_fkey"
            columns: ["merge_case_id"]
            isOneToOne: false
            referencedRelation: "account_merge_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      account_recovery_request_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          request_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          request_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_recovery_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "account_recovery_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      account_recovery_requests: {
        Row: {
          contact_email: string | null
          created_at: string
          current_sign_in_method: string | null
          evidence: Json
          id: string
          linked_merge_case_id: string | null
          note: string | null
          previous_account_email: string | null
          previous_sign_in_method: string | null
          requester_profile_id: string | null
          requester_user_id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          current_sign_in_method?: string | null
          evidence?: Json
          id?: string
          linked_merge_case_id?: string | null
          note?: string | null
          previous_account_email?: string | null
          previous_sign_in_method?: string | null
          requester_profile_id?: string | null
          requester_user_id: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          current_sign_in_method?: string | null
          evidence?: Json
          id?: string
          linked_merge_case_id?: string | null
          note?: string | null
          previous_account_email?: string | null
          previous_sign_in_method?: string | null
          requester_profile_id?: string | null
          requester_user_id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_recovery_requests_linked_merge_case_id_fkey"
            columns: ["linked_merge_case_id"]
            isOneToOne: false
            referencedRelation: "account_merge_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_recovery_requests_requester_profile_id_fkey"
            columns: ["requester_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      betweener_venues: {
        Row: {
          address: string
          badges: Json
          city: string
          created_at: string
          google_place_id: string | null
          id: string
          is_active: boolean
          lat: number
          lng: number
          map_link: string | null
          metadata: Json
          name: string
          region: string | null
          slug: string
          sort_order: number
          summary: string | null
          updated_at: string
        }
        Insert: {
          address: string
          badges?: Json
          city: string
          created_at?: string
          google_place_id?: string | null
          id?: string
          is_active?: boolean
          lat: number
          lng: number
          map_link?: string | null
          metadata?: Json
          name: string
          region?: string | null
          slug: string
          sort_order?: number
          summary?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          badges?: Json
          city?: string
          created_at?: string
          google_place_id?: string | null
          id?: string
          is_active?: boolean
          lat?: number
          lng?: number
          map_link?: string | null
          metadata?: Json
          name?: string
          region?: string | null
          slug?: string
          sort_order?: number
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      chat_prefs: {
        Row: {
          id: string
          muted: boolean
          peer_id: string
          pinned: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          muted?: boolean
          peer_id: string
          pinned?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          muted?: boolean
          peer_id?: string
          pinned?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      circle_members: {
        Row: {
          circle_id: string
          created_at: string
          id: string
          is_visible: boolean
          profile_id: string
          role: string
          status: string
        }
        Insert: {
          circle_id: string
          created_at?: string
          id?: string
          is_visible?: boolean
          profile_id: string
          role?: string
          status?: string
        }
        Update: {
          circle_id?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          profile_id?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_members_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circles: {
        Row: {
          category: string | null
          created_at: string
          created_by_profile_id: string
          description: string | null
          id: string
          image_path: string | null
          image_updated_at: string | null
          name: string
          updated_at: string
          visibility: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by_profile_id: string
          description?: string | null
          id?: string
          image_path?: string | null
          image_updated_at?: string | null
          name: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by_profile_id?: string
          description?: string | null
          id?: string
          image_path?: string | null
          image_updated_at?: string | null
          name?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "circles_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      date_plan_concierge_requests: {
        Row: {
          assigned_admin_user_id: string | null
          created_at: string
          date_plan_id: string
          id: string
          note: string | null
          requested_by_profile_id: string
          requested_by_user_id: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_admin_user_id?: string | null
          created_at?: string
          date_plan_id: string
          id?: string
          note?: string | null
          requested_by_profile_id: string
          requested_by_user_id: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_admin_user_id?: string | null
          created_at?: string
          date_plan_id?: string
          id?: string
          note?: string | null
          requested_by_profile_id?: string
          requested_by_user_id?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_plan_concierge_requests_date_plan_id_fkey"
            columns: ["date_plan_id"]
            isOneToOne: true
            referencedRelation: "date_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_plan_concierge_requests_requested_by_profile_id_fkey"
            columns: ["requested_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      date_plans: {
        Row: {
          accepted_at: string | null
          accepted_by_profile_id: string | null
          city: string | null
          concierge_requested: boolean
          concierge_requested_at: string | null
          concierge_requested_by_profile_id: string | null
          created_at: string
          creator_profile_id: string
          creator_user_id: string
          declined_at: string | null
          declined_by_profile_id: string | null
          id: string
          lat: number | null
          lng: number | null
          message_id: string | null
          note: string | null
          parent_plan_id: string | null
          place_address: string | null
          place_badges: Json
          place_name: string
          place_source: string
          place_summary: string | null
          recipient_profile_id: string
          recipient_user_id: string
          response_kind: string
          scheduled_for: string
          status: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          city?: string | null
          concierge_requested?: boolean
          concierge_requested_at?: string | null
          concierge_requested_by_profile_id?: string | null
          created_at?: string
          creator_profile_id: string
          creator_user_id: string
          declined_at?: string | null
          declined_by_profile_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          message_id?: string | null
          note?: string | null
          parent_plan_id?: string | null
          place_address?: string | null
          place_badges?: Json
          place_name: string
          place_source: string
          place_summary?: string | null
          recipient_profile_id: string
          recipient_user_id: string
          response_kind?: string
          scheduled_for: string
          status?: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          city?: string | null
          concierge_requested?: boolean
          concierge_requested_at?: string | null
          concierge_requested_by_profile_id?: string | null
          created_at?: string
          creator_profile_id?: string
          creator_user_id?: string
          declined_at?: string | null
          declined_by_profile_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          message_id?: string | null
          note?: string | null
          parent_plan_id?: string | null
          place_address?: string | null
          place_badges?: Json
          place_name?: string
          place_source?: string
          place_summary?: string | null
          recipient_profile_id?: string
          recipient_user_id?: string
          response_kind?: string
          scheduled_for?: string
          status?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "date_plans_accepted_by_profile_id_fkey"
            columns: ["accepted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_plans_concierge_requested_by_profile_id_fkey"
            columns: ["concierge_requested_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_plans_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_plans_declined_by_profile_id_fkey"
            columns: ["declined_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_plans_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_plans_parent_plan_id_fkey"
            columns: ["parent_plan_id"]
            isOneToOne: false
            referencedRelation: "date_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_plans_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_plans_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "betweener_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      distance_calculations_cache: {
        Row: {
          accuracy: string
          calculated_at: string | null
          confidence_score: number | null
          cultural_context: Json | null
          distance_km: number
          expires_at: string | null
          id: string
          method: string
          user1_id: string
          user2_id: string
        }
        Insert: {
          accuracy: string
          calculated_at?: string | null
          confidence_score?: number | null
          cultural_context?: Json | null
          distance_km: number
          expires_at?: string | null
          id?: string
          method: string
          user1_id: string
          user2_id: string
        }
        Update: {
          accuracy?: string
          calculated_at?: string | null
          confidence_score?: number | null
          cultural_context?: Json | null
          distance_km?: number
          expires_at?: string | null
          id?: string
          method?: string
          user1_id?: string
          user2_id?: string
        }
        Relationships: []
      }
      ghana_locations: {
        Row: {
          created_at: string | null
          cultural_significance: Json | null
          id: string
          location: unknown
          major_tribes: string[] | null
          name: string
          parent_region: string | null
          population: number | null
          traditional_area: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          cultural_significance?: Json | null
          id?: string
          location?: unknown
          major_tribes?: string[] | null
          name: string
          parent_region?: string | null
          population?: number | null
          traditional_area?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          cultural_significance?: Json | null
          id?: string
          location?: unknown
          major_tribes?: string[] | null
          name?: string
          parent_region?: string | null
          population?: number | null
          traditional_area?: string | null
          type?: string
        }
        Relationships: []
      }
      intent_request_nudges: {
        Row: {
          created_at: string
          id: string
          intent_request_id: string
          kind: string
          metadata: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          intent_request_id: string
          kind: string
          metadata?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          intent_request_id?: string
          kind?: string
          metadata?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intent_request_nudges_intent_request_id_fkey"
            columns: ["intent_request_id"]
            isOneToOne: false
            referencedRelation: "intent_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      intent_requests: {
        Row: {
          actor_id: string
          created_at: string
          expires_at: string
          id: string
          message: string | null
          metadata: Json
          recipient_id: string
          status: string
          suggested_place: string | null
          suggested_time: string | null
          type: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          expires_at: string
          id?: string
          message?: string | null
          metadata?: Json
          recipient_id: string
          status?: string
          suggested_place?: string | null
          suggested_time?: string | null
          type: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          message?: string | null
          metadata?: Json
          recipient_id?: string
          status?: string
          suggested_place?: string | null
          suggested_time?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "intent_requests_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intent_requests_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interests: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      internal_admins: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          created_at: string
          id: string
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
          user1_id: string
          user2_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          user1_id: string
          user2_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          user1_id?: string
          user2_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_match_user1"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_match_user2"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merged_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          merge_case_id: string
          note: string | null
          source_profile_id: string
          source_user_id: string
          status: string
          target_profile_id: string
          target_user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          merge_case_id: string
          note?: string | null
          source_profile_id: string
          source_user_id: string
          status?: string
          target_profile_id: string
          target_user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          merge_case_id?: string
          note?: string | null
          source_profile_id?: string
          source_user_id?: string
          status?: string
          target_profile_id?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merged_accounts_merge_case_id_fkey"
            columns: ["merge_case_id"]
            isOneToOne: true
            referencedRelation: "account_merge_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merged_accounts_source_profile_id_fkey"
            columns: ["source_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merged_accounts_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_edits: {
        Row: {
          created_at: string
          editor_user_id: string
          id: string
          message_id: string
          previous_text: string
        }
        Insert: {
          created_at?: string
          editor_user_id: string
          id?: string
          message_id: string
          previous_text: string
        }
        Update: {
          created_at?: string
          editor_user_id?: string
          id?: string
          message_id?: string
          previous_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_edits_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_hides: {
        Row: {
          created_at: string
          id: string
          message_id: string
          peer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          peer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          peer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_message_hides_message"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_pins: {
        Row: {
          created_at: string
          id: string
          message_id: string
          peer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          peer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          peer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_message_pins_message"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_message_reactions_message"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_views: {
        Row: {
          created_at: string
          id: string
          message_id: string
          viewer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          viewer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_views_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          audio_duration: number | null
          audio_path: string | null
          audio_waveform: Json | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_for_all: boolean
          delivered_at: string | null
          e2ee: boolean
          edited_at: string | null
          enc: Json | null
          encrypted_key_nonce: string | null
          encrypted_key_receiver: string | null
          encrypted_key_sender: string | null
          encrypted_media: boolean
          encrypted_media_alg: string | null
          encrypted_media_mime: string | null
          encrypted_media_nonce: string | null
          encrypted_media_path: string | null
          encrypted_media_size: number | null
          id: string
          is_read: boolean
          is_view_once: boolean
          media_kind: string | null
          message_type: string
          receiver_id: string
          reply_to_message_id: string | null
          sender_id: string
          status: string
          storage_path: string | null
          text: string
          view_once: boolean
          viewed_at: string | null
          viewed_by: string | null
        }
        Insert: {
          audio_duration?: number | null
          audio_path?: string | null
          audio_waveform?: Json | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_for_all?: boolean
          delivered_at?: string | null
          e2ee?: boolean
          edited_at?: string | null
          enc?: Json | null
          encrypted_key_nonce?: string | null
          encrypted_key_receiver?: string | null
          encrypted_key_sender?: string | null
          encrypted_media?: boolean
          encrypted_media_alg?: string | null
          encrypted_media_mime?: string | null
          encrypted_media_nonce?: string | null
          encrypted_media_path?: string | null
          encrypted_media_size?: number | null
          id?: string
          is_read?: boolean
          is_view_once?: boolean
          media_kind?: string | null
          message_type?: string
          receiver_id: string
          reply_to_message_id?: string | null
          sender_id: string
          status?: string
          storage_path?: string | null
          text?: string
          view_once?: boolean
          viewed_at?: string | null
          viewed_by?: string | null
        }
        Update: {
          audio_duration?: number | null
          audio_path?: string | null
          audio_waveform?: Json | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_for_all?: boolean
          delivered_at?: string | null
          e2ee?: boolean
          edited_at?: string | null
          enc?: Json | null
          encrypted_key_nonce?: string | null
          encrypted_key_receiver?: string | null
          encrypted_key_sender?: string | null
          encrypted_media?: boolean
          encrypted_media_alg?: string | null
          encrypted_media_mime?: string | null
          encrypted_media_nonce?: string | null
          encrypted_media_path?: string | null
          encrypted_media_size?: number | null
          id?: string
          is_read?: boolean
          is_view_once?: boolean
          media_kind?: string | null
          message_type?: string
          receiver_id?: string
          reply_to_message_id?: string | null
          sender_id?: string
          status?: string
          storage_path?: string | null
          text?: string
          view_once?: boolean
          viewed_at?: string | null
          viewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_messages_reply_to"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          is_deleted: boolean
          moment_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          moment_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          moment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moment_comments_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          moment_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          moment_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          moment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moment_reactions_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
        ]
      }
      moments: {
        Row: {
          caption: string | null
          created_at: string
          expires_at: string
          id: string
          is_deleted: boolean
          media_url: string | null
          text_body: string | null
          thumbnail_url: string | null
          type: string
          user_id: string
          visibility: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          is_deleted?: boolean
          media_url?: string | null
          text_body?: string | null
          thumbnail_url?: string | null
          type: string
          user_id: string
          visibility?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          is_deleted?: boolean
          media_url?: string | null
          text_body?: string | null
          thumbnail_url?: string | null
          type?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      notification_prefs: {
        Row: {
          announcements: boolean
          boosts: boolean
          gifts: boolean
          id: string
          inapp_enabled: boolean
          likes: boolean
          matches: boolean
          message_reactions: boolean
          messages: boolean
          moments: boolean
          notes: boolean
          preview_text: boolean
          push_enabled: boolean
          quiet_hours_enabled: boolean
          quiet_hours_end: string
          quiet_hours_start: string
          quiet_hours_tz: string
          reactions: boolean
          superlikes: boolean
          updated_at: string
          user_id: string
          verification: boolean
        }
        Insert: {
          announcements?: boolean
          boosts?: boolean
          gifts?: boolean
          id?: string
          inapp_enabled?: boolean
          likes?: boolean
          matches?: boolean
          message_reactions?: boolean
          messages?: boolean
          moments?: boolean
          notes?: boolean
          preview_text?: boolean
          push_enabled?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          quiet_hours_tz?: string
          reactions?: boolean
          superlikes?: boolean
          updated_at?: string
          user_id: string
          verification?: boolean
        }
        Update: {
          announcements?: boolean
          boosts?: boolean
          gifts?: boolean
          id?: string
          inapp_enabled?: boolean
          likes?: boolean
          matches?: boolean
          message_reactions?: boolean
          messages?: boolean
          moments?: boolean
          notes?: boolean
          preview_text?: boolean
          push_enabled?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          quiet_hours_tz?: string
          reactions?: boolean
          superlikes?: boolean
          updated_at?: string
          user_id?: string
          verification?: boolean
        }
        Relationships: []
      }
      phone_verifications: {
        Row: {
          attempts: number | null
          carrier_name: string | null
          carrier_type: string | null
          confidence_score: number | null
          country_code: string | null
          created_at: string | null
          id: string
          is_ghana_number: boolean | null
          is_verified: boolean | null
          last_attempt_at: string | null
          phone_number: string
          request_ip: string | null
          request_user_agent: string | null
          signup_session_id: string
          status: string
          updated_at: string | null
          user_id: string | null
          verification_attempts: number | null
          verification_score: number | null
          verification_sid: string | null
          verified_at: string | null
        }
        Insert: {
          attempts?: number | null
          carrier_name?: string | null
          carrier_type?: string | null
          confidence_score?: number | null
          country_code?: string | null
          created_at?: string | null
          id?: string
          is_ghana_number?: boolean | null
          is_verified?: boolean | null
          last_attempt_at?: string | null
          phone_number: string
          request_ip?: string | null
          request_user_agent?: string | null
          signup_session_id: string
          status?: string
          updated_at?: string | null
          user_id?: string | null
          verification_attempts?: number | null
          verification_score?: number | null
          verification_sid?: string | null
          verified_at?: string | null
        }
        Update: {
          attempts?: number | null
          carrier_name?: string | null
          carrier_type?: string | null
          confidence_score?: number | null
          country_code?: string | null
          created_at?: string | null
          id?: string
          is_ghana_number?: boolean | null
          is_verified?: boolean | null
          last_attempt_at?: string | null
          phone_number?: string
          request_ip?: string | null
          request_user_agent?: string | null
          signup_session_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string | null
          verification_attempts?: number | null
          verification_score?: number | null
          verification_sid?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      photos: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          ordering: number
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          ordering?: number
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          ordering?: number
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_boosts: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          starts_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          starts_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          starts_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_boosts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_gifts: {
        Row: {
          created_at: string
          gift_type: string
          id: string
          profile_id: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          gift_type: string
          id?: string
          profile_id: string
          sender_id: string
        }
        Update: {
          created_at?: string
          gift_type?: string
          id?: string
          profile_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_gifts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_image_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          image_url: string
          profile_id: string
          reactor_user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          image_url: string
          profile_id: string
          reactor_user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          image_url?: string
          profile_id?: string
          reactor_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_image_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_interests: {
        Row: {
          created_at: string
          interest_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          interest_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          interest_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_profile_interest_interest"
            columns: ["interest_id"]
            isOneToOne: false
            referencedRelation: "interests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_profile_interest_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_notes: {
        Row: {
          created_at: string
          id: string
          note: string
          profile_id: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note: string
          profile_id: string
          sender_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          profile_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_notes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_prompt_guesses: {
        Row: {
          attempts_count: number
          created_at: string
          guessed_value: string
          id: string
          is_correct: boolean
          normalized_guess: string
          profile_prompt_id: string
          target_profile_id: string
          updated_at: string
          viewer_profile_id: string
        }
        Insert: {
          attempts_count?: number
          created_at?: string
          guessed_value: string
          id?: string
          is_correct?: boolean
          normalized_guess: string
          profile_prompt_id: string
          target_profile_id: string
          updated_at?: string
          viewer_profile_id: string
        }
        Update: {
          attempts_count?: number
          created_at?: string
          guessed_value?: string
          id?: string
          is_correct?: boolean
          normalized_guess?: string
          profile_prompt_id?: string
          target_profile_id?: string
          updated_at?: string
          viewer_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_prompt_guesses_profile_prompt_id_fkey"
            columns: ["profile_prompt_id"]
            isOneToOne: false
            referencedRelation: "profile_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_prompt_guesses_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_prompt_guesses_viewer_profile_id_fkey"
            columns: ["viewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_prompts: {
        Row: {
          answer: string
          created_at: string
          guess_mode: string | null
          guess_options: Json | null
          hint_text: string | null
          id: string
          normalized_answer: string | null
          profile_id: string
          prompt_key: string
          prompt_title: string | null
          prompt_type: string
          reveal_policy: string
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          guess_mode?: string | null
          guess_options?: Json | null
          hint_text?: string | null
          id?: string
          normalized_answer?: string | null
          profile_id: string
          prompt_key: string
          prompt_title?: string | null
          prompt_type?: string
          reveal_policy?: string
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          guess_mode?: string | null
          guess_options?: Json | null
          hint_text?: string | null
          id?: string
          normalized_answer?: string | null
          profile_id?: string
          prompt_key?: string
          prompt_title?: string | null
          prompt_type?: string
          reveal_policy?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_prompts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_signals: {
        Row: {
          dwell_score: number
          id: string
          intro_video_completed: boolean
          intro_video_started: boolean
          last_interacted_at: string
          liked: boolean
          opened_profile_count: number
          profile_id: string
          target_profile_id: string
        }
        Insert: {
          dwell_score?: number
          id?: string
          intro_video_completed?: boolean
          intro_video_started?: boolean
          last_interacted_at?: string
          liked?: boolean
          opened_profile_count?: number
          profile_id: string
          target_profile_id: string
        }
        Update: {
          dwell_score?: number
          id?: string
          intro_video_completed?: boolean
          intro_video_started?: boolean
          last_interacted_at?: string
          liked?: boolean
          opened_profile_count?: number
          profile_id?: string
          target_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_signals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_signals_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number | null
          ai_score: number | null
          ai_score_updated_at: string | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          current_country: string | null
          current_country_code: string | null
          deleted_at: string | null
          discoverable_in_vibes: boolean
          drinking: string | null
          education: string | null
          exercise_frequency: string | null
          full_name: string | null
          future_ghana_plans: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          has_children: string | null
          height: string | null
          id: string
          is_active: boolean
          languages_spoken: string[] | null
          last_active: string | null
          last_ghana_visit: string | null
          latitude: number | null
          living_situation: string | null
          location: string | null
          location_precision: Database["public"]["Enums"]["location_precision"]
          location_updated_at: string | null
          longitude: number | null
          looking_for: string | null
          love_language: string | null
          matchmaking_mode: boolean
          max_age_interest: number | null
          min_age_interest: number | null
          occupation: string | null
          onboarding_step: number
          online: boolean
          personality_type: string | null
          pets: string | null
          phone_number: string | null
          phone_verification_score: number | null
          phone_verified: boolean | null
          photos: string[] | null
          profile_completed: boolean
          profile_video: string | null
          public_key: string | null
          region: string | null
          religion: Database["public"]["Enums"]["religion"] | null
          search_name: string | null
          smoking: string | null
          superlikes_left: number
          superlikes_reset_at: string | null
          tribe: string | null
          updated_at: string
          user_id: string
          username: string | null
          verification_level: number | null
          wants_children: string | null
          years_in_diaspora: number | null
        }
        Insert: {
          age?: number | null
          ai_score?: number | null
          ai_score_updated_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          current_country?: string | null
          current_country_code?: string | null
          deleted_at?: string | null
          discoverable_in_vibes?: boolean
          drinking?: string | null
          education?: string | null
          exercise_frequency?: string | null
          full_name?: string | null
          future_ghana_plans?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          has_children?: string | null
          height?: string | null
          id?: string
          is_active?: boolean
          languages_spoken?: string[] | null
          last_active?: string | null
          last_ghana_visit?: string | null
          latitude?: number | null
          living_situation?: string | null
          location?: string | null
          location_precision?: Database["public"]["Enums"]["location_precision"]
          location_updated_at?: string | null
          longitude?: number | null
          looking_for?: string | null
          love_language?: string | null
          matchmaking_mode?: boolean
          max_age_interest?: number | null
          min_age_interest?: number | null
          occupation?: string | null
          onboarding_step?: number
          online?: boolean
          personality_type?: string | null
          pets?: string | null
          phone_number?: string | null
          phone_verification_score?: number | null
          phone_verified?: boolean | null
          photos?: string[] | null
          profile_completed?: boolean
          profile_video?: string | null
          public_key?: string | null
          region?: string | null
          religion?: Database["public"]["Enums"]["religion"] | null
          search_name?: string | null
          smoking?: string | null
          superlikes_left?: number
          superlikes_reset_at?: string | null
          tribe?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
          verification_level?: number | null
          wants_children?: string | null
          years_in_diaspora?: number | null
        }
        Update: {
          age?: number | null
          ai_score?: number | null
          ai_score_updated_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          current_country?: string | null
          current_country_code?: string | null
          deleted_at?: string | null
          discoverable_in_vibes?: boolean
          drinking?: string | null
          education?: string | null
          exercise_frequency?: string | null
          full_name?: string | null
          future_ghana_plans?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          has_children?: string | null
          height?: string | null
          id?: string
          is_active?: boolean
          languages_spoken?: string[] | null
          last_active?: string | null
          last_ghana_visit?: string | null
          latitude?: number | null
          living_situation?: string | null
          location?: string | null
          location_precision?: Database["public"]["Enums"]["location_precision"]
          location_updated_at?: string | null
          longitude?: number | null
          looking_for?: string | null
          love_language?: string | null
          matchmaking_mode?: boolean
          max_age_interest?: number | null
          min_age_interest?: number | null
          occupation?: string | null
          onboarding_step?: number
          online?: boolean
          personality_type?: string | null
          pets?: string | null
          phone_number?: string | null
          phone_verification_score?: number | null
          phone_verified?: boolean | null
          photos?: string[] | null
          profile_completed?: boolean
          profile_video?: string | null
          public_key?: string | null
          region?: string | null
          religion?: Database["public"]["Enums"]["religion"] | null
          search_name?: string | null
          smoking?: string | null
          superlikes_left?: number
          superlikes_reset_at?: string | null
          tribe?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
          verification_level?: number | null
          wants_children?: string | null
          years_in_diaspora?: number | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          device_id: string | null
          id: string
          last_seen_at: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          created_at: string
          key: string
          last_request_at: string
          window_bucket: number
          window_seconds: number
        }
        Insert: {
          count?: number
          created_at?: string
          key: string
          last_request_at?: string
          window_bucket: number
          window_seconds: number
        }
        Update: {
          count?: number
          created_at?: string
          key?: string
          last_request_at?: string
          window_bucket?: number
          window_seconds?: number
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reported_id: string
          reporter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reported_id: string
          reporter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reported_id?: string
          reporter_id?: string
          status?: string
        }
        Relationships: []
      }
      revenuecat_webhook_events: {
        Row: {
          aliases: string[]
          app_user_id: string | null
          created_at: string
          environment: string | null
          event_id: string
          event_timestamp_ms: number | null
          event_type: string
          id: string
          last_error: string | null
          original_app_user_id: string | null
          payload: Json
          processed_at: string | null
          processing_status: string
          synced_user_ids: string[]
          transferred_from: string[]
          transferred_to: string[]
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          app_user_id?: string | null
          created_at?: string
          environment?: string | null
          event_id: string
          event_timestamp_ms?: number | null
          event_type: string
          id?: string
          last_error?: string | null
          original_app_user_id?: string | null
          payload: Json
          processed_at?: string | null
          processing_status?: string
          synced_user_ids?: string[]
          transferred_from?: string[]
          transferred_to?: string[]
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          app_user_id?: string | null
          created_at?: string
          environment?: string | null
          event_id?: string
          event_timestamp_ms?: number | null
          event_type?: string
          id?: string
          last_error?: string | null
          original_app_user_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          synced_user_ids?: string[]
          transferred_from?: string[]
          transferred_to?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          dark_mode: boolean
          id: string
          notifications: boolean
          show_age: boolean
          show_distance: boolean
          show_online: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dark_mode?: boolean
          id?: string
          notifications?: boolean
          show_age?: boolean
          show_distance?: boolean
          show_online?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dark_mode?: boolean
          id?: string
          notifications?: boolean
          show_age?: boolean
          show_distance?: boolean
          show_online?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      signup_events: {
        Row: {
          app_version: string | null
          auth_method: string | null
          created_at: string
          device_model: string | null
          device_os: string | null
          geo_accuracy: number | null
          geo_lat: number | null
          geo_lng: number | null
          id: string
          ip_address: string | null
          ip_city: string | null
          ip_country: string | null
          ip_region: string | null
          ip_timezone: string | null
          oauth_provider: string | null
          phone_number: string | null
          phone_verification_score: number | null
          phone_verified: boolean
          signup_session_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          auth_method?: string | null
          created_at?: string
          device_model?: string | null
          device_os?: string | null
          geo_accuracy?: number | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          ip_address?: string | null
          ip_city?: string | null
          ip_country?: string | null
          ip_region?: string | null
          ip_timezone?: string | null
          oauth_provider?: string | null
          phone_number?: string | null
          phone_verification_score?: number | null
          phone_verified?: boolean
          signup_session_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          auth_method?: string | null
          created_at?: string
          device_model?: string | null
          device_os?: string | null
          geo_accuracy?: number | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          ip_address?: string | null
          ip_city?: string | null
          ip_country?: string | null
          ip_region?: string | null
          ip_timezone?: string | null
          oauth_provider?: string | null
          phone_number?: string | null
          phone_verification_score?: number | null
          phone_verified?: boolean
          signup_session_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      status_views: {
        Row: {
          id: string
          status_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          id?: string
          status_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          id?: string
          status_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_views_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "user_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          ends_at: string
          external_customer_id: string | null
          external_entitlement: string | null
          external_environment: string | null
          external_product_id: string | null
          id: string
          is_active: boolean
          source: string
          started_at: string
          type: Database["public"]["Enums"]["subscription_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          ends_at: string
          external_customer_id?: string | null
          external_entitlement?: string | null
          external_environment?: string | null
          external_product_id?: string | null
          id?: string
          is_active?: boolean
          source?: string
          started_at?: string
          type: Database["public"]["Enums"]["subscription_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          ends_at?: string
          external_customer_id?: string | null
          external_entitlement?: string | null
          external_environment?: string | null
          external_product_id?: string | null
          id?: string
          is_active?: boolean
          source?: string
          started_at?: string
          type?: Database["public"]["Enums"]["subscription_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suggested_move_events: {
        Row: {
          batch_key: string | null
          candidate_profile_id: string
          created_at: string
          event_type: string
          id: string
          is_hero: boolean | null
          metadata: Json
          slot_index: number | null
          surface: string
          viewer_profile_id: string
          viewer_user_id: string
        }
        Insert: {
          batch_key?: string | null
          candidate_profile_id: string
          created_at?: string
          event_type: string
          id?: string
          is_hero?: boolean | null
          metadata?: Json
          slot_index?: number | null
          surface?: string
          viewer_profile_id: string
          viewer_user_id: string
        }
        Update: {
          batch_key?: string | null
          candidate_profile_id?: string
          created_at?: string
          event_type?: string
          id?: string
          is_hero?: boolean | null
          metadata?: Json
          slot_index?: number | null
          surface?: string
          viewer_profile_id?: string
          viewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggested_move_events_candidate_profile_id_fkey"
            columns: ["candidate_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggested_move_events_viewer_profile_id_fkey"
            columns: ["viewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      swipes: {
        Row: {
          action: Database["public"]["Enums"]["swipe_action"]
          created_at: string
          id: string
          swiper_id: string
          target_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["swipe_action"]
          created_at?: string
          id?: string
          swiper_id: string
          target_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["swipe_action"]
          created_at?: string
          id?: string
          swiper_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_swipe_target"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_swipe_user"
            columns: ["swiper_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_messages: {
        Row: {
          created_at: string
          event_type: string
          id: string
          intent_request_id: string | null
          metadata: Json
          peer_user_id: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type?: string
          id?: string
          intent_request_id?: string | null
          metadata?: Json
          peer_user_id: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          intent_request_id?: string | null
          metadata?: Json
          peer_user_id?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_messages_intent_request_id_fkey"
            columns: ["intent_request_id"]
            isOneToOne: false
            referencedRelation: "intent_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_history: {
        Row: {
          created_at: string | null
          cultural_significance: Json | null
          destination_location: unknown
          distance_km: number | null
          duration_hours: number | null
          end_date: string | null
          id: string
          origin_location: unknown
          start_date: string | null
          travel_mode: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          cultural_significance?: Json | null
          destination_location?: unknown
          distance_km?: number | null
          duration_hours?: number | null
          end_date?: string | null
          id?: string
          origin_location?: unknown
          start_date?: string | null
          travel_mode: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          cultural_significance?: Json | null
          destination_location?: unknown
          distance_km?: number | null
          duration_hours?: number | null
          end_date?: string | null
          id?: string
          origin_location?: unknown
          start_date?: string | null
          travel_mode?: string
          user_id?: string
        }
        Relationships: []
      }
      user_location_profiles: {
        Row: {
          created_at: string | null
          current_address: Json | null
          current_location: unknown
          current_travel_mode: string | null
          diaspora_status: string | null
          ghana_region: string | null
          home_address: Json | null
          home_location: unknown
          hometown: string | null
          id: string
          is_traveling: boolean | null
          location_sharing: Json | null
          location_updated_at: string | null
          privacy_level: string | null
          traditional_area: string | null
          travel_confidence: number | null
          tribe: string | null
          updated_at: string | null
          user_id: string
          work_address: Json | null
          work_location: unknown
          years_in_diaspora: number | null
        }
        Insert: {
          created_at?: string | null
          current_address?: Json | null
          current_location?: unknown
          current_travel_mode?: string | null
          diaspora_status?: string | null
          ghana_region?: string | null
          home_address?: Json | null
          home_location?: unknown
          hometown?: string | null
          id?: string
          is_traveling?: boolean | null
          location_sharing?: Json | null
          location_updated_at?: string | null
          privacy_level?: string | null
          traditional_area?: string | null
          travel_confidence?: number | null
          tribe?: string | null
          updated_at?: string | null
          user_id: string
          work_address?: Json | null
          work_location?: unknown
          years_in_diaspora?: number | null
        }
        Update: {
          created_at?: string | null
          current_address?: Json | null
          current_location?: unknown
          current_travel_mode?: string | null
          diaspora_status?: string | null
          ghana_region?: string | null
          home_address?: Json | null
          home_location?: unknown
          hometown?: string | null
          id?: string
          is_traveling?: boolean | null
          location_sharing?: Json | null
          location_updated_at?: string | null
          privacy_level?: string | null
          traditional_area?: string | null
          travel_confidence?: number | null
          tribe?: string | null
          updated_at?: string | null
          user_id?: string
          work_address?: Json | null
          work_location?: unknown
          years_in_diaspora?: number | null
        }
        Relationships: []
      }
      user_statuses: {
        Row: {
          background_color: string | null
          caption: string | null
          created_at: string
          expires_at: string
          id: string
          is_active: boolean
          media_type: string
          media_url: string
          text_position: string | null
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          background_color?: string | null
          caption?: string | null
          created_at?: string
          expires_at: string
          id?: string
          is_active?: boolean
          media_type: string
          media_url: string
          text_position?: string | null
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          background_color?: string | null
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          media_type?: string
          media_url?: string
          text_position?: string | null
          updated_at?: string
          user_id?: string
          view_count?: number
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          is_premium: boolean
          is_verified: boolean
          last_active: string | null
          name: string
          password: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          is_premium?: boolean
          is_verified?: boolean
          last_active?: string | null
          name: string
          password?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          is_premium?: boolean
          is_verified?: boolean
          last_active?: string | null
          name?: string
          password?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      verification_requests: {
        Row: {
          auto_verification_data: Json | null
          auto_verification_score: number | null
          created_at: string | null
          document_url: string | null
          id: string
          profile_id: string | null
          reviewed_at: string | null
          reviewer_notes: string | null
          status: string | null
          submitted_at: string | null
          updated_at: string | null
          user_id: string | null
          user_notified: boolean | null
          verification_type: string
        }
        Insert: {
          auto_verification_data?: Json | null
          auto_verification_score?: number | null
          created_at?: string | null
          document_url?: string | null
          id?: string
          profile_id?: string | null
          reviewed_at?: string | null
          reviewer_notes?: string | null
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_notified?: boolean | null
          verification_type: string
        }
        Update: {
          auto_verification_data?: Json | null
          auto_verification_score?: number | null
          created_at?: string | null
          document_url?: string | null
          id?: string
          profile_id?: string | null
          reviewed_at?: string | null
          reviewer_notes?: string | null
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_notified?: boolean | null
          verification_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      public_user_locations: {
        Row: {
          current_travel_mode: string | null
          diaspora_status: string | null
          display_hometown: string | null
          display_location: unknown
          ghana_region: string | null
          is_traveling: boolean | null
          privacy_level: string | null
          user_id: string | null
        }
        Insert: {
          current_travel_mode?: string | null
          diaspora_status?: string | null
          display_hometown?: never
          display_location?: never
          ghana_region?: string | null
          is_traveling?: boolean | null
          privacy_level?: string | null
          user_id?: string | null
        }
        Update: {
          current_travel_mode?: string | null
          diaspora_status?: string | null
          display_hometown?: never
          display_location?: never
          ghana_region?: string | null
          is_traveling?: boolean | null
          privacy_level?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      bump_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: {
          allowed: boolean
          current_count: number
          window_bucket_out: number
        }[]
      }
      calculate_cultural_compatibility: {
        Args: { user1_id: string; user2_id: string }
        Returns: number
      }
      calculate_distance_km: {
        Args: { location1: unknown; location2: unknown }
        Returns: number
      }
      calculate_user_distance: {
        Args: {
          include_cultural_context?: boolean
          user1_id: string
          user2_id: string
        }
        Returns: {
          accuracy: string
          confidence_score: number
          cultural_context: Json
          distance_km: number
          method: string
        }[]
      }
      can_view_moment: { Args: { p_moment_id: string }; Returns: boolean }
      clean_expired_distance_cache: { Args: never; Returns: number }
      cleanup_phone_verifications_orphans: { Args: never; Returns: undefined }
      decrement_superlike: { Args: { p_profile_id: string }; Returns: number }
      detect_travel_for_user: {
        Args: { p_user_id: string }
        Returns: {
          confidence_score: number
          distance_from_home: number
          is_traveling: boolean
          travel_mode: string
        }[]
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      edit_message: {
        Args: { message_id: string; new_text: string }
        Returns: {
          audio_duration: number | null
          audio_path: string | null
          audio_waveform: Json | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_for_all: boolean
          delivered_at: string | null
          e2ee: boolean
          edited_at: string | null
          enc: Json | null
          encrypted_key_nonce: string | null
          encrypted_key_receiver: string | null
          encrypted_key_sender: string | null
          encrypted_media: boolean
          encrypted_media_alg: string | null
          encrypted_media_mime: string | null
          encrypted_media_nonce: string | null
          encrypted_media_path: string | null
          encrypted_media_size: number | null
          id: string
          is_read: boolean
          is_view_once: boolean
          media_kind: string | null
          message_type: string
          receiver_id: string
          reply_to_message_id: string | null
          sender_id: string
          status: string
          storage_path: string | null
          text: string
          view_once: boolean
          viewed_at: string | null
          viewed_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_active_subscription_plan: {
        Args: { p_user_id?: string }
        Returns: Database["public"]["Enums"]["subscription_type"]
      }
      get_nearby_users: {
        Args: { p_limit?: number; p_radius_km?: number; p_user_id: string }
        Returns: {
          distance_km: number
          user_id: string
        }[]
      }
      get_recs_active: {
        Args: { p_user_id: string; p_window_minutes?: number }
        Returns: {
          age: number
          ai_score: number
          avatar_url: string
          bio: string
          full_name: string
          id: string
          is_active: boolean
          last_active: string
          latitude: number
          location: string
          longitude: number
          online: boolean
          personality_type: string
          profile_video: string
          region: string
          religion: string
          tribe: string
          user_id: string
          verification_level: number
          verified: boolean
        }[]
      }
      get_recs_active_scored: {
        Args: { p_user_id: string; p_window_minutes?: number }
        Returns: {
          age: number
          ai_score: number
          avatar_url: string
          bio: string
          full_name: string
          id: string
          is_active: boolean
          last_active: string
          latitude: number
          location: string
          longitude: number
          online: boolean
          personality_type: string
          profile_video: string
          region: string
          religion: string
          tribe: string
          user_id: string
          verification_level: number
          verified: boolean
        }[]
      }
      get_recs_for_you_scored: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          age: number
          ai_score: number
          avatar_url: string
          bio: string
          distance_km: number
          full_name: string
          id: string
          is_active: boolean
          last_active: string
          latitude: number
          location: string
          longitude: number
          online: boolean
          personality_type: string
          profile_video: string
          region: string
          religion: string
          tribe: string
          user_id: string
          verification_level: number
          verified: boolean
        }[]
      }
      get_recs_nearby: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          age: number
          ai_score: number
          avatar_url: string
          bio: string
          distance_km: number
          full_name: string
          id: string
          is_active: boolean
          last_active: string
          latitude: number
          location: string
          longitude: number
          online: boolean
          personality_type: string
          profile_video: string
          region: string
          religion: string
          tribe: string
          user_id: string
          verification_level: number
          verified: boolean
        }[]
      }
      get_recs_nearby_scored: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          age: number
          ai_score: number
          avatar_url: string
          bio: string
          distance_km: number
          full_name: string
          id: string
          is_active: boolean
          last_active: string
          latitude: number
          location: string
          longitude: number
          online: boolean
          personality_type: string
          profile_video: string
          region: string
          religion: string
          tribe: string
          user_id: string
          verification_level: number
          verified: boolean
        }[]
      }
      get_viewed_profile_prompts: {
        Args: { p_profile_id: string; p_viewer_profile_id?: string }
        Returns: {
          answer: string
          created_at: string
          guess_mode: string
          guess_options: Json
          hint_text: string
          id: string
          profile_id: string
          prompt_key: string
          prompt_title: string
          prompt_type: string
          reveal_policy: string
          viewer_guess: string
          viewer_guess_is_correct: boolean
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      is_circle_member: {
        Args: { p_circle_id: string; p_user_id: string }
        Returns: boolean
      }
      is_circle_owner: {
        Args: { p_circle_id: string; p_user_id: string }
        Returns: boolean
      }
      is_internal_admin: { Args: never; Returns: boolean }
      is_match: { Args: { a: string; b: string }; Returns: boolean }
      is_quiet_hours: { Args: { p_user_id: string }; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      reset_daily_superlikes: { Args: never; Returns: undefined }
      rpc_accept_date_plan: {
        Args: { p_plan_id: string }
        Returns: {
          concierge_requested: boolean
          plan_id: string
          status: string
        }[]
      }
      rpc_ack_verification_request: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      rpc_submit_selfie_liveness_verification: {
        Args: {
          p_capture_mode?: string
          p_challenge_type?: string
          p_document_path: string
          p_profile_id: string
          p_reference_asset_path?: string
        }
        Returns: {
          already_pending: boolean
          created_at: string
          request_id: string
          status: string
        }[]
      }
      rpc_admin_create_account_merge_case: {
        Args: {
          p_candidate_reason?: string
          p_evidence?: Json
          p_notes?: string
          p_request_channel?: string
          p_requester_user_id?: string
          p_source_profile_id?: string
          p_source_user_id: string
          p_target_profile_id?: string
          p_target_user_id: string
        }
        Returns: string
      }
      rpc_admin_dashboard_overview: { Args: never; Returns: Json }
      rpc_admin_execute_account_merge_case: {
        Args: { p_case_id: string }
        Returns: Json
      }
      rpc_admin_get_account_merge_case: {
        Args: { p_case_id: string }
        Returns: {
          candidate_reason: string
          created_at: string
          created_by: string
          evidence: Json
          executed_at: string
          executed_by: string
          execution_summary: Json
          id: string
          notes: string
          preflight_summary: Json
          request_channel: string
          requester_user_id: string
          resolved_at: string
          reviewed_at: string
          reviewed_by: string
          source_avatar_url: string
          source_name: string
          source_profile_id: string
          source_user_id: string
          status: string
          target_avatar_url: string
          target_name: string
          target_profile_id: string
          target_user_id: string
          updated_at: string
        }[]
      }
      rpc_admin_get_account_merge_case_events: {
        Args: { p_case_id: string }
        Returns: {
          actor_role: string
          actor_user_id: string
          created_at: string
          event_type: string
          id: string
          merge_case_id: string
          metadata: Json
        }[]
      }
      rpc_admin_get_account_merge_queue: {
        Args: never
        Returns: {
          candidate_reason: string
          created_at: string
          created_by: string
          evidence: Json
          executed_at: string
          executed_by: string
          execution_summary: Json
          id: string
          notes: string
          preflight_summary: Json
          request_channel: string
          requester_user_id: string
          resolved_at: string
          reviewed_at: string
          reviewed_by: string
          source_avatar_url: string
          source_name: string
          source_profile_id: string
          source_user_id: string
          status: string
          target_avatar_url: string
          target_name: string
          target_profile_id: string
          target_user_id: string
          updated_at: string
        }[]
      }
      rpc_admin_get_account_recovery_request: {
        Args: { p_request_id: string }
        Returns: {
          contact_email: string
          created_at: string
          current_sign_in_method: string
          evidence: Json
          id: string
          linked_merge_case_id: string
          note: string
          previous_account_email: string
          previous_sign_in_method: string
          requester_avatar_url: string
          requester_name: string
          requester_profile_id: string
          requester_user_id: string
          review_notes: string
          reviewed_at: string
          reviewed_by: string
          status: string
          updated_at: string
        }[]
      }
      rpc_admin_get_account_recovery_request_events: {
        Args: { p_request_id: string }
        Returns: {
          actor_role: string
          actor_user_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
          request_id: string
        }[]
      }
      rpc_admin_get_account_recovery_requests: {
        Args: never
        Returns: {
          contact_email: string
          created_at: string
          current_sign_in_method: string
          evidence: Json
          id: string
          linked_merge_case_id: string
          note: string
          previous_account_email: string
          previous_sign_in_method: string
          requester_avatar_url: string
          requester_name: string
          requester_profile_id: string
          requester_user_id: string
          review_notes: string
          reviewed_at: string
          reviewed_by: string
          status: string
          updated_at: string
        }[]
      }
      rpc_admin_get_account_recovery_requests_by_merge_case: {
        Args: { p_merge_case_id: string }
        Returns: {
          contact_email: string
          created_at: string
          current_sign_in_method: string
          evidence: Json
          id: string
          linked_merge_case_id: string
          note: string
          previous_account_email: string
          previous_sign_in_method: string
          requester_avatar_url: string
          requester_name: string
          requester_profile_id: string
          requester_user_id: string
          review_notes: string
          reviewed_at: string
          reviewed_by: string
          status: string
          updated_at: string
        }[]
      }
      rpc_admin_get_date_plan_concierge_queue: {
        Args: never
        Returns: {
          city: string
          concierge_requested_at: string
          creator_name: string
          creator_profile_id: string
          date_plan_id: string
          date_plan_status: string
          place_address: string
          place_name: string
          recipient_name: string
          recipient_profile_id: string
          request_id: string
          request_note: string
          request_status: string
          requested_at: string
          requested_by_name: string
          requested_by_profile_id: string
          scheduled_for: string
        }[]
      }
      rpc_admin_get_reports_queue: {
        Args: never
        Returns: {
          created_at: string
          id: string
          reason: string
          reported_avatar: string
          reported_name: string
          reported_user_id: string
          reported_verification_level: number
          reporter_avatar: string
          reporter_name: string
          reporter_user_id: string
          reporter_verification_level: number
          status: string
        }[]
      }
      rpc_admin_get_verification_queue: {
        Args: never
        Returns: {
          auto_verification_score: number
          avatar_url: string
          current_country: string
          document_url: string
          full_name: string
          id: string
          profile_id: string
          reviewed_at: string
          reviewer_notes: string
          status: string
          submitted_at: string
          user_id: string
          verification_level: number
          verification_type: string
        }[]
      }
      rpc_admin_preview_account_merge_case: {
        Args: { p_case_id: string }
        Returns: Json
      }
      rpc_admin_review_verification_request: {
        Args: { p_decision: string; p_notes?: string; p_request_id: string }
        Returns: boolean
      }
      rpc_admin_update_account_merge_case: {
        Args: {
          p_case_id: string
          p_execution_summary?: Json
          p_notes?: string
          p_status: string
        }
        Returns: boolean
      }
      rpc_admin_update_account_recovery_request: {
        Args: {
          p_linked_merge_case_id?: string
          p_request_id: string
          p_review_notes?: string
          p_status: string
        }
        Returns: boolean
      }
      rpc_admin_update_report_status: {
        Args: { p_report_id: string; p_status: string }
        Returns: boolean
      }
      rpc_approve_circle_member: {
        Args: { p_circle_id: string; p_member_id: string; p_profile_id: string }
        Returns: boolean
      }
      rpc_backfill_swipe_likes_into_intent_requests: {
        Args: { p_days?: number; p_limit?: number }
        Returns: number
      }
      rpc_cancel_date_plan: {
        Args: { p_plan_id: string }
        Returns: {
          concierge_requested: boolean
          plan_id: string
          status: string
        }[]
      }
      rpc_cancel_intent_request: {
        Args: { p_request_id: string }
        Returns: string
      }
      rpc_create_circle: {
        Args: {
          p_category?: string
          p_description: string
          p_name: string
          p_profile_id: string
          p_visibility?: string
        }
        Returns: string
      }
      rpc_create_intent_request: {
        Args: {
          p_message?: string
          p_metadata?: Json
          p_recipient_id: string
          p_suggested_place?: string
          p_suggested_time?: string
          p_type: string
        }
        Returns: string
      }
      rpc_create_profile_boost: { Args: never; Returns: Json }
      rpc_decide_intent_request: {
        Args: { p_decision: string; p_request_id: string }
        Returns: string
      }
      rpc_decline_date_plan: {
        Args: { p_plan_id: string }
        Returns: {
          concierge_requested: boolean
          plan_id: string
          status: string
        }[]
      }
      rpc_get_merged_account_redirect: { Args: never; Returns: Json }
      rpc_get_my_premium_state: { Args: never; Returns: Json }
      rpc_get_phone_verification_status: { Args: never; Returns: Json }
      rpc_get_suggested_moves: {
        Args: { p_limit?: number; p_profile_id: string }
        Returns: {
          active_now: boolean
          age: number
          avatar_url: string
          bio_snippet: string
          candidate_tier: number
          distance_km: number
          full_name: string
          has_intro_video: boolean
          id: string
          prompt_answer: string
          prompt_title: string
          quality_band: number
          recently_active: boolean
          same_looking_for: boolean
          same_region: boolean
          same_religion: boolean
          shared_interest_count: number
          shared_interest_names: string[]
          short_tags: string[]
        }[]
      }
      rpc_get_user_taste: { Args: { p_profile_id: string }; Returns: Json }
      rpc_insert_request_acceptance_system_messages: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      rpc_join_circle: {
        Args: { p_circle_id: string; p_profile_id: string }
        Returns: string
      }
      rpc_leave_circle: {
        Args: { p_circle_id: string; p_profile_id: string }
        Returns: boolean
      }
      rpc_link_phone_verification: {
        Args: { p_signup_session_id: string }
        Returns: boolean
      }
      rpc_log_suggested_move_event: {
        Args: {
          p_batch_key?: string
          p_candidate_profile_id: string
          p_event_type: string
          p_is_hero?: boolean
          p_metadata?: Json
          p_slot_index?: number
          p_surface?: string
          p_viewer_profile_id: string
        }
        Returns: boolean
      }
      rpc_mark_expired_intent_requests: { Args: never; Returns: number }
      rpc_process_intent_request_jobs: {
        Args: { p_remind_before?: string; p_window?: string }
        Returns: Json
      }
      rpc_remove_circle_member: {
        Args: { p_circle_id: string; p_member_id: string; p_profile_id: string }
        Returns: boolean
      }
      rpc_request_account_recovery: {
        Args: {
          p_contact_email?: string
          p_current_sign_in_method?: string
          p_evidence?: Json
          p_note?: string
          p_previous_account_email?: string
          p_previous_sign_in_method?: string
        }
        Returns: string
      }
      rpc_request_date_plan_concierge: {
        Args: { p_note?: string; p_plan_id: string }
        Returns: {
          concierge_requested: boolean
          plan_id: string
          request_id: string
        }[]
      }
      rpc_send_date_plan:
        | {
            Args: {
              p_city?: string
              p_lat?: number
              p_lng?: number
              p_note?: string
              p_parent_plan_id?: string
              p_place_address?: string
              p_place_badges?: Json
              p_place_name: string
              p_place_source?: string
              p_place_summary?: string
              p_recipient_profile_id: string
              p_reply_to_message_id?: string
              p_response_kind?: string
              p_scheduled_for: string
              p_venue_id?: string
            }
            Returns: {
              message_id: string
              plan_id: string
            }[]
          }
        | {
            Args: {
              p_city?: string
              p_lat?: number
              p_lng?: number
              p_note?: string
              p_place_address?: string
              p_place_badges?: Json
              p_place_name: string
              p_place_source?: string
              p_place_summary?: string
              p_recipient_profile_id: string
              p_reply_to_message_id?: string
              p_scheduled_for: string
              p_venue_id?: string
            }
            Returns: {
              message_id: string
              plan_id: string
            }[]
          }
      rpc_set_circle_member_role: {
        Args: {
          p_circle_id: string
          p_member_id: string
          p_profile_id: string
          p_role: string
        }
        Returns: boolean
      }
      rpc_upsert_profile_signal: {
        Args: {
          p_dwell_delta?: number
          p_intro_video_completed?: boolean
          p_intro_video_started?: boolean
          p_liked?: boolean
          p_opened_delta?: number
          p_profile_id: string
          p_target_profile_id: string
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      spatial_ref_sys_rows: {
        Args: never
        Returns: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "spatial_ref_sys"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      submit_profile_prompt_guess: {
        Args: {
          p_guess: string
          p_prompt_id: string
          p_viewer_profile_id: string
        }
        Returns: {
          is_correct: boolean
          revealed_answer: string
          viewer_guess: string
        }[]
      }
      unaccent: { Args: { "": string }; Returns: string }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      upsert_push_token: {
        Args: {
          p_app_version: string
          p_device_id: string
          p_platform: string
          p_token: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      gender: "MALE" | "FEMALE" | "NON_BINARY" | "OTHER"
      location_precision: "EXACT" | "CITY"
      match_status: "PENDING" | "ACCEPTED" | "REJECTED"
      religion: "CHRISTIAN" | "MUSLIM" | "TRADITIONALIST" | "OTHER"
      subscription_type: "FREE" | "SILVER" | "GOLD"
      swipe_action: "LIKE" | "PASS" | "SUPERLIKE"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
      gender: ["MALE", "FEMALE", "NON_BINARY", "OTHER"],
      location_precision: ["EXACT", "CITY"],
      match_status: ["PENDING", "ACCEPTED", "REJECTED"],
      religion: ["CHRISTIAN", "MUSLIM", "TRADITIONALIST", "OTHER"],
      subscription_type: ["FREE", "SILVER", "GOLD"],
      swipe_action: ["LIKE", "PASS", "SUPERLIKE"],
    },
  },
} as const
