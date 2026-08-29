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
      account_deletion_requests: {
        Row: {
          completed_at: string | null
          contact_email: string | null
          failure_reason: string | null
          feedback: string | null
          id: string
          metadata: Json
          profile_id: string | null
          reason_keys: string[]
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          contact_email?: string | null
          failure_reason?: string | null
          feedback?: string | null
          id?: string
          metadata?: Json
          profile_id?: string | null
          reason_keys: string[]
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          contact_email?: string | null
          failure_reason?: string | null
          feedback?: string | null
          id?: string
          metadata?: Json
          profile_id?: string | null
          reason_keys?: string[]
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      account_disconnected_signin_providers: {
        Row: {
          active: boolean
          created_at: string
          disconnected_at: string
          id: string
          provider: string
          reconnected_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          disconnected_at?: string
          id?: string
          provider: string
          reconnected_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          disconnected_at?: string
          id?: string
          provider?: string
          reconnected_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      account_identity_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          profile_id: string | null
          user_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          profile_id?: string | null
          user_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          profile_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_identity_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "account_identity_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
      account_recovery_sessions: {
        Row: {
          conflicting_phone_number: string
          consumed_at: string | null
          created_at: string
          dispatch_count: number
          expires_at: string
          id: string
          last_dispatched_at: string | null
          metadata: Json
          owner_profile_id: string | null
          owner_user_id: string
          recovery_token: string
          requester_user_id: string
          verified_at: string
        }
        Insert: {
          conflicting_phone_number: string
          consumed_at?: string | null
          created_at?: string
          dispatch_count?: number
          expires_at?: string
          id?: string
          last_dispatched_at?: string | null
          metadata?: Json
          owner_profile_id?: string | null
          owner_user_id: string
          recovery_token?: string
          requester_user_id: string
          verified_at?: string
        }
        Update: {
          conflicting_phone_number?: string
          consumed_at?: string | null
          created_at?: string
          dispatch_count?: number
          expires_at?: string
          id?: string
          last_dispatched_at?: string | null
          metadata?: Json
          owner_profile_id?: string | null
          owner_user_id?: string
          recovery_token?: string
          requester_user_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_recovery_sessions_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "account_recovery_sessions_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_retention_events: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          profile_id: string | null
          source: string
          trigger_reason: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          profile_id?: string | null
          source?: string
          trigger_reason?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          profile_id?: string | null
          source?: string
          trigger_reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      app_version_history: {
        Row: {
          build_number: number
          created_at: string
          id: string
          platform: string
          release_notes: string | null
          release_type: string
          released_at: string | null
          title: string | null
          version: string
          whats_new_items: Json
        }
        Insert: {
          build_number: number
          created_at?: string
          id?: string
          platform: string
          release_notes?: string | null
          release_type?: string
          released_at?: string | null
          title?: string | null
          version: string
          whats_new_items?: Json
        }
        Update: {
          build_number?: number
          created_at?: string
          id?: string
          platform?: string
          release_notes?: string | null
          release_type?: string
          released_at?: string | null
          title?: string | null
          version?: string
          whats_new_items?: Json
        }
        Relationships: []
      }
      app_version_rules: {
        Row: {
          created_at: string
          enabled: boolean
          environment: string
          id: string
          latest_build_number: number
          latest_version: string
          minimum_supported_build_number: number
          minimum_supported_version: string
          platform: string
          soft_prompt_cooldown_hours: number
          store_url: string
          update_message: string | null
          update_mode: string
          update_title: string | null
          updated_at: string
          whats_new_items: Json
          whats_new_title: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          environment?: string
          id?: string
          latest_build_number: number
          latest_version: string
          minimum_supported_build_number: number
          minimum_supported_version: string
          platform: string
          soft_prompt_cooldown_hours?: number
          store_url: string
          update_message?: string | null
          update_mode?: string
          update_title?: string | null
          updated_at?: string
          whats_new_items?: Json
          whats_new_title?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          environment?: string
          id?: string
          latest_build_number?: number
          latest_version?: string
          minimum_supported_build_number?: number
          minimum_supported_version?: string
          platform?: string
          soft_prompt_cooldown_hours?: number
          store_url?: string
          update_message?: string | null
          update_mode?: string
          update_title?: string | null
          updated_at?: string
          whats_new_items?: Json
          whats_new_title?: string | null
        }
        Relationships: []
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
      chat_attachment_cancellations: {
        Row: {
          cancelled_at: string
          client_message_id: string
          receiver_id: string
          sender_id: string
        }
        Insert: {
          cancelled_at?: string
          client_message_id: string
          receiver_id: string
          sender_id: string
        }
        Update: {
          cancelled_at?: string
          client_message_id?: string
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      chat_attachment_cleanup_queue: {
        Row: {
          attachment_id: string | null
          attempts: number
          bucket_id: string
          created_at: string
          delete_after: string
          deleted_at: string | null
          id: number
          last_error: string | null
          processing_started_at: string | null
          reason: string
          status: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          attachment_id?: string | null
          attempts?: number
          bucket_id: string
          created_at?: string
          delete_after?: string
          deleted_at?: string | null
          id?: number
          last_error?: string | null
          processing_started_at?: string | null
          reason: string
          status?: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          attachment_id?: string | null
          attempts?: number
          bucket_id?: string
          created_at?: string
          delete_after?: string
          deleted_at?: string | null
          id?: number
          last_error?: string | null
          processing_started_at?: string | null
          reason?: string
          status?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_attachment_cleanup_queue_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "message_attachments"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_attachment_finalization_keys: {
        Row: {
          canonical_message_id: string | null
          client_message_id: string
          completed_at: string | null
          created_at: string
          finalization_key: string
          last_replayed_at: string | null
          replay_count: number
          request_hash: string
          request_payload: Json
          sender_id: string
          status: string
        }
        Insert: {
          canonical_message_id?: string | null
          client_message_id: string
          completed_at?: string | null
          created_at?: string
          finalization_key?: string
          last_replayed_at?: string | null
          replay_count?: number
          request_hash: string
          request_payload: Json
          sender_id: string
          status?: string
        }
        Update: {
          canonical_message_id?: string | null
          client_message_id?: string
          completed_at?: string | null
          created_at?: string
          finalization_key?: string
          last_replayed_at?: string | null
          replay_count?: number
          request_hash?: string
          request_payload?: Json
          sender_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_attachment_finalization_keys_canonical_message_id_fkey"
            columns: ["canonical_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_attachment_lifecycle_events: {
        Row: {
          actor_user_id: string | null
          attachment_id: string | null
          client_message_id: string
          created_at: string
          details: Json
          event_type: string
          from_state: string | null
          id: number
          message_id: string | null
          state_version: number | null
          to_state: string | null
        }
        Insert: {
          actor_user_id?: string | null
          attachment_id?: string | null
          client_message_id: string
          created_at?: string
          details?: Json
          event_type: string
          from_state?: string | null
          id?: never
          message_id?: string | null
          state_version?: number | null
          to_state?: string | null
        }
        Update: {
          actor_user_id?: string | null
          attachment_id?: string | null
          client_message_id?: string
          created_at?: string
          details?: Json
          event_type?: string
          from_state?: string | null
          id?: never
          message_id?: string | null
          state_version?: number | null
          to_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_attachment_lifecycle_events_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "message_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_attachment_lifecycle_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_attachment_retention_config: {
        Row: {
          cron_secret: string
          enabled: boolean
          endpoint: string
          singleton: boolean
          updated_at: string
        }
        Insert: {
          cron_secret: string
          enabled?: boolean
          endpoint: string
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          cron_secret?: string
          enabled?: boolean
          endpoint?: string
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      chat_attachment_retention_runs: {
        Row: {
          abandoned_finalization_count: number
          claimed_count: number
          completed_at: string | null
          dead_letter_count: number
          deleted_count: number
          error: string | null
          failed_count: number
          id: number
          scheduled_count: number
          started_at: string
          status: string
        }
        Insert: {
          abandoned_finalization_count?: number
          claimed_count?: number
          completed_at?: string | null
          dead_letter_count?: number
          deleted_count?: number
          error?: string | null
          failed_count?: number
          id?: number
          scheduled_count?: number
          started_at?: string
          status?: string
        }
        Update: {
          abandoned_finalization_count?: number
          claimed_count?: number
          completed_at?: string | null
          dead_letter_count?: number
          deleted_count?: number
          error?: string | null
          failed_count?: number
          id?: number
          scheduled_count?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      chat_conversation_summaries: {
        Row: {
          last_activity_at: string | null
          last_activity_kind: string | null
          last_activity_message_id: string | null
          last_activity_preview: string | null
          last_message_created_at: string | null
          last_message_deleted_for_all: boolean
          last_message_delivered_at: string | null
          last_message_edited_at: string | null
          last_message_id: string | null
          last_message_is_read: boolean
          last_message_is_view_once: boolean
          last_message_reaction_created_at: string | null
          last_message_reaction_emoji: string | null
          last_message_reaction_target_type: string | null
          last_message_reaction_user_id: string | null
          last_message_receiver_id: string | null
          last_message_sender_id: string | null
          last_message_text: string | null
          last_message_type: string | null
          owner_user_id: string
          peer_user_id: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          last_activity_at?: string | null
          last_activity_kind?: string | null
          last_activity_message_id?: string | null
          last_activity_preview?: string | null
          last_message_created_at?: string | null
          last_message_deleted_for_all?: boolean
          last_message_delivered_at?: string | null
          last_message_edited_at?: string | null
          last_message_id?: string | null
          last_message_is_read?: boolean
          last_message_is_view_once?: boolean
          last_message_reaction_created_at?: string | null
          last_message_reaction_emoji?: string | null
          last_message_reaction_target_type?: string | null
          last_message_reaction_user_id?: string | null
          last_message_receiver_id?: string | null
          last_message_sender_id?: string | null
          last_message_text?: string | null
          last_message_type?: string | null
          owner_user_id: string
          peer_user_id: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          last_activity_at?: string | null
          last_activity_kind?: string | null
          last_activity_message_id?: string | null
          last_activity_preview?: string | null
          last_message_created_at?: string | null
          last_message_deleted_for_all?: boolean
          last_message_delivered_at?: string | null
          last_message_edited_at?: string | null
          last_message_id?: string | null
          last_message_is_read?: boolean
          last_message_is_view_once?: boolean
          last_message_reaction_created_at?: string | null
          last_message_reaction_emoji?: string | null
          last_message_reaction_target_type?: string | null
          last_message_reaction_user_id?: string | null
          last_message_receiver_id?: string | null
          last_message_sender_id?: string | null
          last_message_text?: string | null
          last_message_type?: string | null
          owner_user_id?: string
          peer_user_id?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversation_summaries_last_activity_message_id_fkey"
            columns: ["last_activity_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversation_summaries_last_message_id_fkey"
            columns: ["last_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_media_album_item_cancellations: {
        Row: {
          attachment_id: string
          cancelled_at: string
          client_message_id: string
          receiver_id: string
          sender_id: string
        }
        Insert: {
          attachment_id: string
          cancelled_at?: string
          client_message_id: string
          receiver_id: string
          sender_id: string
        }
        Update: {
          attachment_id?: string
          cancelled_at?: string
          client_message_id?: string
          receiver_id?: string
          sender_id?: string
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
      chat_typing_state: {
        Row: {
          peer_user_id: string
          typing_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          peer_user_id: string
          typing_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          peer_user_id?: string
          typing_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      circle_invitations: {
        Row: {
          circle_id: string
          created_at: string
          expires_at: string
          id: string
          invited_profile_id: string
          inviter_profile_id: string
          message: string | null
          responded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          circle_id: string
          created_at?: string
          expires_at?: string
          id?: string
          invited_profile_id: string
          inviter_profile_id: string
          message?: string | null
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          circle_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          invited_profile_id?: string
          inviter_profile_id?: string
          message?: string | null
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_invitations_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "circle_invitations_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_invitations_invited_profile_id_fkey"
            columns: ["invited_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_invitations_invited_profile_id_fkey"
            columns: ["invited_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_invitations_inviter_profile_id_fkey"
            columns: ["inviter_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_invitations_inviter_profile_id_fkey"
            columns: ["inviter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_love_seats: {
        Row: {
          approved_by_profile_id: string | null
          circle_id: string
          created_at: string
          ends_at: string | null
          featured_profile_id: string
          id: string
          nominated_by_profile_id: string | null
          quote: string | null
          reason: string | null
          responded_at: string | null
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_by_profile_id?: string | null
          circle_id: string
          created_at?: string
          ends_at?: string | null
          featured_profile_id: string
          id?: string
          nominated_by_profile_id?: string | null
          quote?: string | null
          reason?: string | null
          responded_at?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_by_profile_id?: string | null
          circle_id?: string
          created_at?: string
          ends_at?: string | null
          featured_profile_id?: string
          id?: string
          nominated_by_profile_id?: string | null
          quote?: string | null
          reason?: string | null
          responded_at?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_love_seats_approved_by_profile_id_fkey"
            columns: ["approved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_love_seats_approved_by_profile_id_fkey"
            columns: ["approved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_love_seats_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "circle_love_seats_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_love_seats_featured_profile_id_fkey"
            columns: ["featured_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_love_seats_featured_profile_id_fkey"
            columns: ["featured_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_love_seats_nominated_by_profile_id_fkey"
            columns: ["nominated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_love_seats_nominated_by_profile_id_fkey"
            columns: ["nominated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_members: {
        Row: {
          circle_id: string
          created_at: string
          id: string
          is_visible: boolean
          joined_at: string
          left_at: string | null
          profile_id: string
          role: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          circle_id: string
          created_at?: string
          id?: string
          is_visible?: boolean
          joined_at?: string
          left_at?: string | null
          profile_id: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          circle_id?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          joined_at?: string
          left_at?: string | null
          profile_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "circle_members_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
      circle_prompt_responses: {
        Row: {
          circle_id: string | null
          created_at: string
          id: string
          is_deleted: boolean
          profile_id: string
          prompt_id: string
          reaction_count: number
          response: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          circle_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          profile_id: string
          prompt_id: string
          reaction_count?: number
          response: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          circle_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          profile_id?: string
          prompt_id?: string
          reaction_count?: number
          response?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "circle_prompt_responses_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "circle_prompt_responses_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_prompt_responses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_prompt_responses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_prompt_responses_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "circle_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_prompts: {
        Row: {
          circle_id: string | null
          created_at: string
          created_by_admin_id: string | null
          created_by_profile_id: string | null
          expires_at: string | null
          id: string
          prompt: string
          prompt_type: string
          starts_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          circle_id?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          created_by_profile_id?: string | null
          expires_at?: string | null
          id?: string
          prompt: string
          prompt_type?: string
          starts_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          circle_id?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          created_by_profile_id?: string | null
          expires_at?: string | null
          id?: string
          prompt?: string
          prompt_type?: string
          starts_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_prompts_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "circle_prompts_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_prompts_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_prompts_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_pulse_comment_edits: {
        Row: {
          comment_id: string
          created_at: string
          editor_profile_id: string
          editor_user_id: string
          id: string
          previous_body: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          editor_profile_id: string
          editor_user_id: string
          id?: string
          previous_body: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          editor_profile_id?: string
          editor_user_id?: string
          id?: string
          previous_body?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_pulse_comment_edits_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "circle_pulse_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_comment_edits_editor_profile_id_fkey"
            columns: ["editor_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_pulse_comment_edits_editor_profile_id_fkey"
            columns: ["editor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_pulse_comment_reactions: {
        Row: {
          circle_id: string
          comment_id: string
          created_at: string
          id: string
          profile_id: string
          pulse_item_id: string
          reaction: string
          updated_at: string
          user_id: string
        }
        Insert: {
          circle_id: string
          comment_id: string
          created_at?: string
          id?: string
          profile_id: string
          pulse_item_id: string
          reaction?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          circle_id?: string
          comment_id?: string
          created_at?: string
          id?: string
          profile_id?: string
          pulse_item_id?: string
          reaction?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_pulse_comment_reactions_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "circle_pulse_comment_reactions_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "circle_pulse_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_comment_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_pulse_comment_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_comment_reactions_pulse_item_id_fkey"
            columns: ["pulse_item_id"]
            isOneToOne: false
            referencedRelation: "circle_pulse_items"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_pulse_comment_reports: {
        Row: {
          circle_id: string
          comment_id: string
          created_at: string
          id: string
          pulse_item_id: string
          reason: string
          reporter_profile_id: string
          reporter_user_id: string
          reviewed_at: string | null
          reviewed_by_profile_id: string | null
          status: string
        }
        Insert: {
          circle_id: string
          comment_id: string
          created_at?: string
          id?: string
          pulse_item_id: string
          reason?: string
          reporter_profile_id: string
          reporter_user_id: string
          reviewed_at?: string | null
          reviewed_by_profile_id?: string | null
          status?: string
        }
        Update: {
          circle_id?: string
          comment_id?: string
          created_at?: string
          id?: string
          pulse_item_id?: string
          reason?: string
          reporter_profile_id?: string
          reporter_user_id?: string
          reviewed_at?: string | null
          reviewed_by_profile_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_pulse_comment_reports_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "circle_pulse_comment_reports_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "circle_pulse_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_comment_reports_pulse_item_id_fkey"
            columns: ["pulse_item_id"]
            isOneToOne: false
            referencedRelation: "circle_pulse_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_comment_reports_reporter_profile_id_fkey"
            columns: ["reporter_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_pulse_comment_reports_reporter_profile_id_fkey"
            columns: ["reporter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_comment_reports_reviewed_by_profile_id_fkey"
            columns: ["reviewed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_pulse_comment_reports_reviewed_by_profile_id_fkey"
            columns: ["reviewed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_pulse_comments: {
        Row: {
          body: string
          circle_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          parent_comment_id: string | null
          pinned_at: string | null
          pinned_by_profile_id: string | null
          pinned_by_user_id: string | null
          profile_id: string
          pulse_item_id: string
          reaction_count: number
          report_count: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          circle_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          parent_comment_id?: string | null
          pinned_at?: string | null
          pinned_by_profile_id?: string | null
          pinned_by_user_id?: string | null
          profile_id: string
          pulse_item_id: string
          reaction_count?: number
          report_count?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          circle_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          parent_comment_id?: string | null
          pinned_at?: string | null
          pinned_by_profile_id?: string | null
          pinned_by_user_id?: string | null
          profile_id?: string
          pulse_item_id?: string
          reaction_count?: number
          report_count?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_pulse_comments_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "circle_pulse_comments_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "circle_pulse_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_comments_pinned_by_profile_id_fkey"
            columns: ["pinned_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_pulse_comments_pinned_by_profile_id_fkey"
            columns: ["pinned_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_pulse_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_comments_pulse_item_id_fkey"
            columns: ["pulse_item_id"]
            isOneToOne: false
            referencedRelation: "circle_pulse_items"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_pulse_discussion_reads: {
        Row: {
          circle_id: string
          created_at: string
          id: string
          last_seen_at: string
          last_seen_comment_id: string | null
          profile_id: string
          pulse_item_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          circle_id: string
          created_at?: string
          id?: string
          last_seen_at?: string
          last_seen_comment_id?: string | null
          profile_id: string
          pulse_item_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          circle_id?: string
          created_at?: string
          id?: string
          last_seen_at?: string
          last_seen_comment_id?: string | null
          profile_id?: string
          pulse_item_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_pulse_discussion_reads_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "circle_pulse_discussion_reads_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_discussion_reads_last_seen_comment_id_fkey"
            columns: ["last_seen_comment_id"]
            isOneToOne: false
            referencedRelation: "circle_pulse_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_discussion_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_pulse_discussion_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_discussion_reads_pulse_item_id_fkey"
            columns: ["pulse_item_id"]
            isOneToOne: false
            referencedRelation: "circle_pulse_items"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_pulse_items: {
        Row: {
          body: string | null
          circle_id: string
          comment_count: number
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          discussion_cta: string | null
          discussion_summary: string | null
          expires_at: string | null
          gathering_id: string | null
          id: string
          image_url: string | null
          item_type: string
          love_seat_id: string | null
          media_type: string | null
          media_url: string | null
          moment_id: string | null
          priority: number
          prompt_id: string | null
          starts_at: string | null
          status: string
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          circle_id: string
          comment_count?: number
          created_at?: string
          created_by_profile_id?: string | null
          created_by_user_id?: string | null
          discussion_cta?: string | null
          discussion_summary?: string | null
          expires_at?: string | null
          gathering_id?: string | null
          id?: string
          image_url?: string | null
          item_type: string
          love_seat_id?: string | null
          media_type?: string | null
          media_url?: string | null
          moment_id?: string | null
          priority?: number
          prompt_id?: string | null
          starts_at?: string | null
          status?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          circle_id?: string
          comment_count?: number
          created_at?: string
          created_by_profile_id?: string | null
          created_by_user_id?: string | null
          discussion_cta?: string | null
          discussion_summary?: string | null
          expires_at?: string | null
          gathering_id?: string | null
          id?: string
          image_url?: string | null
          item_type?: string
          love_seat_id?: string | null
          media_type?: string | null
          media_url?: string | null
          moment_id?: string | null
          priority?: number
          prompt_id?: string | null
          starts_at?: string | null
          status?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_pulse_items_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "circle_pulse_items_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_items_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_pulse_items_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_items_gathering_id_fkey"
            columns: ["gathering_id"]
            isOneToOne: false
            referencedRelation: "gatherings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_items_love_seat_id_fkey"
            columns: ["love_seat_id"]
            isOneToOne: false
            referencedRelation: "circle_love_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_items_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_items_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "circle_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_pulse_welcome_members: {
        Row: {
          circle_id: string
          created_at: string
          expires_at: string
          id: string
          joined_at: string
          membership_id: string
          profile_id: string
          pulse_item_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          circle_id: string
          created_at?: string
          expires_at?: string
          id?: string
          joined_at?: string
          membership_id: string
          profile_id: string
          pulse_item_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          circle_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          joined_at?: string
          membership_id?: string
          profile_id?: string
          pulse_item_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_pulse_welcome_members_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "circle_pulse_welcome_members_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_welcome_members_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: true
            referencedRelation: "circle_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_welcome_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_pulse_welcome_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_pulse_welcome_members_pulse_item_id_fkey"
            columns: ["pulse_item_id"]
            isOneToOne: false
            referencedRelation: "circle_pulse_items"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_reports: {
        Row: {
          circle_id: string | null
          created_at: string
          details: string | null
          gathering_id: string | null
          id: string
          prompt_response_id: string | null
          reason: string
          reporter_profile_id: string
          reporter_user_id: string | null
          reviewed_at: string | null
          reviewed_by_admin_id: string | null
          status: string
        }
        Insert: {
          circle_id?: string | null
          created_at?: string
          details?: string | null
          gathering_id?: string | null
          id?: string
          prompt_response_id?: string | null
          reason: string
          reporter_profile_id: string
          reporter_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by_admin_id?: string | null
          status?: string
        }
        Update: {
          circle_id?: string | null
          created_at?: string
          details?: string | null
          gathering_id?: string | null
          id?: string
          prompt_response_id?: string | null
          reason?: string
          reporter_profile_id?: string
          reporter_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by_admin_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_reports_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "circle_reports_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_reports_gathering_id_fkey"
            columns: ["gathering_id"]
            isOneToOne: false
            referencedRelation: "gatherings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_reports_prompt_response_id_fkey"
            columns: ["prompt_response_id"]
            isOneToOne: false
            referencedRelation: "circle_prompt_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_reports_reporter_profile_id_fkey"
            columns: ["reporter_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_reports_reporter_profile_id_fkey"
            columns: ["reporter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_role_requests: {
        Row: {
          circle_id: string
          created_at: string
          id: string
          note: string | null
          rejection_reason: string | null
          requested_role: string
          requester_profile_id: string
          requester_user_id: string | null
          reviewed_at: string | null
          reviewed_by_profile_id: string | null
          reviewed_by_user_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          circle_id: string
          created_at?: string
          id?: string
          note?: string | null
          rejection_reason?: string | null
          requested_role: string
          requester_profile_id: string
          requester_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by_profile_id?: string | null
          reviewed_by_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          circle_id?: string
          created_at?: string
          id?: string
          note?: string | null
          rejection_reason?: string | null
          requested_role?: string
          requester_profile_id?: string
          requester_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by_profile_id?: string | null
          reviewed_by_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_role_requests_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "circle_role_requests_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_role_requests_requester_profile_id_fkey"
            columns: ["requester_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_role_requests_requester_profile_id_fkey"
            columns: ["requester_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_role_requests_reviewed_by_profile_id_fkey"
            columns: ["reviewed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_role_requests_reviewed_by_profile_id_fkey"
            columns: ["reviewed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_roles: {
        Row: {
          assigned_by_admin_id: string | null
          circle_id: string
          created_at: string
          id: string
          profile_id: string
          role: string
          user_id: string | null
        }
        Insert: {
          assigned_by_admin_id?: string | null
          circle_id: string
          created_at?: string
          id?: string
          profile_id: string
          role?: string
          user_id?: string | null
        }
        Update: {
          assigned_by_admin_id?: string | null
          circle_id?: string
          created_at?: string
          id?: string
          profile_id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "circle_roles_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "circle_roles_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circle_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circles: {
        Row: {
          active_this_week_count: number
          approved_at: string | null
          approved_by_admin_id: string | null
          archived_at: string | null
          audience_tags: string[]
          category: string | null
          circle_type: string
          city: string | null
          country_code: string | null
          country_name: string | null
          cover_image_url: string | null
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          culture_tags: string[]
          description: string | null
          diaspora_tags: string[]
          faith_tags: string[]
          gathering_count: number
          host_note: string | null
          host_note_updated_at: string | null
          host_note_updated_by_profile_id: string | null
          icon_url: string | null
          id: string
          image_path: string | null
          image_updated_at: string | null
          interest_tags: string[]
          is_featured: boolean
          is_official: boolean
          is_partner: boolean
          latitude: number | null
          longitude: number | null
          member_count: number
          name: string
          region: string | null
          rejected_reason: string | null
          report_count: number
          requires_join_approval: boolean
          rules: string | null
          safety_note: string | null
          short_description: string | null
          slug: string | null
          status: string
          updated_at: string
          visibility: string
          visibility_scope: string
        }
        Insert: {
          active_this_week_count?: number
          approved_at?: string | null
          approved_by_admin_id?: string | null
          archived_at?: string | null
          audience_tags?: string[]
          category?: string | null
          circle_type?: string
          city?: string | null
          country_code?: string | null
          country_name?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          created_by_user_id?: string | null
          culture_tags?: string[]
          description?: string | null
          diaspora_tags?: string[]
          faith_tags?: string[]
          gathering_count?: number
          host_note?: string | null
          host_note_updated_at?: string | null
          host_note_updated_by_profile_id?: string | null
          icon_url?: string | null
          id?: string
          image_path?: string | null
          image_updated_at?: string | null
          interest_tags?: string[]
          is_featured?: boolean
          is_official?: boolean
          is_partner?: boolean
          latitude?: number | null
          longitude?: number | null
          member_count?: number
          name: string
          region?: string | null
          rejected_reason?: string | null
          report_count?: number
          requires_join_approval?: boolean
          rules?: string | null
          safety_note?: string | null
          short_description?: string | null
          slug?: string | null
          status?: string
          updated_at?: string
          visibility?: string
          visibility_scope?: string
        }
        Update: {
          active_this_week_count?: number
          approved_at?: string | null
          approved_by_admin_id?: string | null
          archived_at?: string | null
          audience_tags?: string[]
          category?: string | null
          circle_type?: string
          city?: string | null
          country_code?: string | null
          country_name?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          created_by_user_id?: string | null
          culture_tags?: string[]
          description?: string | null
          diaspora_tags?: string[]
          faith_tags?: string[]
          gathering_count?: number
          host_note?: string | null
          host_note_updated_at?: string | null
          host_note_updated_by_profile_id?: string | null
          icon_url?: string | null
          id?: string
          image_path?: string | null
          image_updated_at?: string | null
          interest_tags?: string[]
          is_featured?: boolean
          is_official?: boolean
          is_partner?: boolean
          latitude?: number | null
          longitude?: number | null
          member_count?: number
          name?: string
          region?: string | null
          rejected_reason?: string | null
          report_count?: number
          requires_join_approval?: boolean
          rules?: string | null
          safety_note?: string | null
          short_description?: string | null
          slug?: string | null
          status?: string
          updated_at?: string
          visibility?: string
          visibility_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "circles_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circles_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circles_host_note_updated_by_profile_id_fkey"
            columns: ["host_note_updated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circles_host_note_updated_by_profile_id_fkey"
            columns: ["host_note_updated_by_profile_id"]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
      gathering_attendees: {
        Row: {
          checked_in_at: string | null
          created_at: string
          gathering_id: string
          id: string
          profile_id: string
          status: string
          updated_at: string
          user_id: string | null
          visible_to_others: boolean
        }
        Insert: {
          checked_in_at?: string | null
          created_at?: string
          gathering_id: string
          id?: string
          profile_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
          visible_to_others?: boolean
        }
        Update: {
          checked_in_at?: string | null
          created_at?: string
          gathering_id?: string
          id?: string
          profile_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          visible_to_others?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "gathering_attendees_gathering_id_fkey"
            columns: ["gathering_id"]
            isOneToOne: false
            referencedRelation: "gatherings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gathering_attendees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "gathering_attendees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gatherings: {
        Row: {
          address_visibility: string
          approved_at: string | null
          approved_by_admin_id: string | null
          attendee_count: number
          cancelled_at: string | null
          circle_id: string | null
          city: string | null
          country_code: string | null
          country_name: string | null
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          description: string | null
          ends_at: string | null
          featured_profile_id: string | null
          gathering_type: string
          host_created_for_member: boolean
          id: string
          is_official: boolean
          is_partner_venue: boolean
          latitude: number | null
          longitude: number | null
          max_attendees: number | null
          online_url: string | null
          platform: string | null
          poster_url: string | null
          presentation_mode: string
          region: string | null
          rejected_reason: string | null
          safe_first_date_space: boolean
          safety_note: string | null
          seat_context: string | null
          slug: string | null
          starts_at: string
          status: string
          tags: string[]
          timezone: string | null
          title: string
          updated_at: string
          venue_address: string | null
          venue_name: string | null
        }
        Insert: {
          address_visibility?: string
          approved_at?: string | null
          approved_by_admin_id?: string | null
          attendee_count?: number
          cancelled_at?: string | null
          circle_id?: string | null
          city?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          created_by_user_id?: string | null
          description?: string | null
          ends_at?: string | null
          featured_profile_id?: string | null
          gathering_type?: string
          host_created_for_member?: boolean
          id?: string
          is_official?: boolean
          is_partner_venue?: boolean
          latitude?: number | null
          longitude?: number | null
          max_attendees?: number | null
          online_url?: string | null
          platform?: string | null
          poster_url?: string | null
          presentation_mode?: string
          region?: string | null
          rejected_reason?: string | null
          safe_first_date_space?: boolean
          safety_note?: string | null
          seat_context?: string | null
          slug?: string | null
          starts_at: string
          status?: string
          tags?: string[]
          timezone?: string | null
          title: string
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
        }
        Update: {
          address_visibility?: string
          approved_at?: string | null
          approved_by_admin_id?: string | null
          attendee_count?: number
          cancelled_at?: string | null
          circle_id?: string | null
          city?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          created_by_user_id?: string | null
          description?: string | null
          ends_at?: string | null
          featured_profile_id?: string | null
          gathering_type?: string
          host_created_for_member?: boolean
          id?: string
          is_official?: boolean
          is_partner_venue?: boolean
          latitude?: number | null
          longitude?: number | null
          max_attendees?: number | null
          online_url?: string | null
          platform?: string | null
          poster_url?: string | null
          presentation_mode?: string
          region?: string | null
          rejected_reason?: string | null
          safe_first_date_space?: boolean
          safety_note?: string | null
          seat_context?: string | null
          slug?: string | null
          starts_at?: string
          status?: string
          tags?: string[]
          timezone?: string | null
          title?: string
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gatherings_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "gatherings_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gatherings_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "gatherings_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gatherings_featured_profile_id_fkey"
            columns: ["featured_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "gatherings_featured_profile_id_fkey"
            columns: ["featured_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ghana_localities: {
        Row: {
          district: string | null
          feature_code: string
          geoname_id: number
          latitude: number
          longitude: number
          name: string
          normalized_aliases: string[]
          normalized_name: string
          normalized_region: string
          population: number
          rank_weight: number
          refreshed_at: string
          region: string
          search_text: string
        }
        Insert: {
          district?: string | null
          feature_code: string
          geoname_id: number
          latitude: number
          longitude: number
          name: string
          normalized_aliases?: string[]
          normalized_name: string
          normalized_region: string
          population?: number
          rank_weight?: number
          refreshed_at?: string
          region: string
          search_text: string
        }
        Update: {
          district?: string | null
          feature_code?: string
          geoname_id?: number
          latitude?: number
          longitude?: number
          name?: string
          normalized_aliases?: string[]
          normalized_name?: string
          normalized_region?: string
          population?: number
          rank_weight?: number
          refreshed_at?: string
          region?: string
          search_text?: string
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
      global_localities: {
        Row: {
          admin1_code: string | null
          admin1_name: string | null
          ascii_name: string | null
          country_code: string
          country_name: string
          feature_code: string
          geoname_id: number
          latitude: number
          longitude: number
          name: string
          normalized_name: string | null
          population: number
          provider: string
          refreshed_at: string
          search_text: string
          timezone: string | null
        }
        Insert: {
          admin1_code?: string | null
          admin1_name?: string | null
          ascii_name?: string | null
          country_code: string
          country_name: string
          feature_code: string
          geoname_id: number
          latitude: number
          longitude: number
          name: string
          normalized_name?: string | null
          population?: number
          provider?: string
          refreshed_at?: string
          search_text: string
          timezone?: string | null
        }
        Update: {
          admin1_code?: string | null
          admin1_name?: string | null
          ascii_name?: string | null
          country_code?: string
          country_name?: string
          feature_code?: string
          geoname_id?: number
          latitude?: number
          longitude?: number
          name?: string
          normalized_name?: string | null
          population?: number
          provider?: string
          refreshed_at?: string
          search_text?: string
          timezone?: string | null
        }
        Relationships: []
      }
      inbox_items: {
        Row: {
          action_required: boolean
          actor_id: string | null
          body: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_required?: boolean
          actor_id?: string | null
          body: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_required?: boolean
          actor_id?: string | null
          body?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      intent_reflections: {
        Row: {
          created_at: string
          id: string
          intent_request_id: string
          owner_profile_id: string
          selected_reasons: string[]
          source: string
          target_profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          intent_request_id: string
          owner_profile_id: string
          selected_reasons?: string[]
          source?: string
          target_profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          intent_request_id?: string
          owner_profile_id?: string
          selected_reasons?: string[]
          source?: string
          target_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intent_reflections_intent_request_id_fkey"
            columns: ["intent_request_id"]
            isOneToOne: false
            referencedRelation: "intent_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intent_reflections_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "intent_reflections_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intent_reflections_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "intent_reflections_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
      live_audience_poll_options: {
        Row: {
          id: string
          label: string
          option_index: number
          poll_id: string
        }
        Insert: {
          id?: string
          label: string
          option_index: number
          poll_id: string
        }
        Update: {
          id?: string
          label?: string
          option_index?: number
          poll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_audience_poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "live_audience_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      live_audience_poll_templates: {
        Row: {
          created_at: string
          display_order: number
          enabled: boolean
          options: Json
          poll_kind: string
          prompt: string
          template_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          enabled?: boolean
          options: Json
          poll_kind: string
          prompt: string
          template_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          enabled?: boolean
          options?: Json
          poll_kind?: string
          prompt?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      live_audience_poll_updates: {
        Row: {
          session_id: string
          updated_at: string
          version: number
        }
        Insert: {
          session_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          session_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_audience_poll_updates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_audience_poll_votes: {
        Row: {
          client_vote_id: string
          option_id: string
          poll_id: string
          user_id: string
          voted_at: string
        }
        Insert: {
          client_vote_id: string
          option_id: string
          poll_id: string
          user_id: string
          voted_at?: string
        }
        Update: {
          client_vote_id?: string
          option_id?: string
          poll_id?: string
          user_id?: string
          voted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_audience_poll_vote_option_fk"
            columns: ["poll_id", "option_id"]
            isOneToOne: false
            referencedRelation: "live_audience_poll_options"
            referencedColumns: ["poll_id", "id"]
          },
          {
            foreignKeyName: "live_audience_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "live_audience_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      live_audience_polls: {
        Row: {
          client_request_id: string
          closed_at: string | null
          closes_at: string
          id: string
          opened_at: string
          opened_by_user_id: string
          poll_kind: string
          prompt: string
          session_id: string
          state: string
          template_key: string
        }
        Insert: {
          client_request_id: string
          closed_at?: string | null
          closes_at: string
          id?: string
          opened_at?: string
          opened_by_user_id: string
          poll_kind: string
          prompt: string
          session_id: string
          state?: string
          template_key: string
        }
        Update: {
          client_request_id?: string
          closed_at?: string | null
          closes_at?: string
          id?: string
          opened_at?: string
          opened_by_user_id?: string
          poll_kind?: string
          prompt?: string
          session_id?: string
          state?: string
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_audience_polls_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_audience_polls_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "live_audience_poll_templates"
            referencedColumns: ["template_key"]
          },
        ]
      }
      live_chemistry_conversations: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          mutually_ready_at: string | null
          participant_a_profile_id: string
          participant_a_user_id: string
          participant_b_profile_id: string
          participant_b_user_id: string
          reveal_offered_at: string | null
          revealed_at: string | null
          session_id: string
          source_id: string
          source_kind: string
          state: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          mutually_ready_at?: string | null
          participant_a_profile_id: string
          participant_a_user_id: string
          participant_b_profile_id: string
          participant_b_user_id: string
          reveal_offered_at?: string | null
          revealed_at?: string | null
          session_id: string
          source_id: string
          source_kind: string
          state?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          mutually_ready_at?: string | null
          participant_a_profile_id?: string
          participant_a_user_id?: string
          participant_b_profile_id?: string
          participant_b_user_id?: string
          reveal_offered_at?: string | null
          revealed_at?: string | null
          session_id?: string
          source_id?: string
          source_kind?: string
          state?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_chemistry_conversations_participant_a_profile_id_fkey"
            columns: ["participant_a_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_chemistry_conversations_participant_a_profile_id_fkey"
            columns: ["participant_a_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_chemistry_conversations_participant_b_profile_id_fkey"
            columns: ["participant_b_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_chemistry_conversations_participant_b_profile_id_fkey"
            columns: ["participant_b_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_chemistry_conversations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_chemistry_events: {
        Row: {
          actor_user_id: string | null
          conversation_id: string
          created_at: string
          event_type: string
          id: number
          metadata: Json
          session_id: string
        }
        Insert: {
          actor_user_id?: string | null
          conversation_id: string
          created_at?: string
          event_type: string
          id?: never
          metadata?: Json
          session_id: string
        }
        Update: {
          actor_user_id?: string | null
          conversation_id?: string
          created_at?: string
          event_type?: string
          id?: never
          metadata?: Json
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_chemistry_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "live_chemistry_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_chemistry_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_chemistry_readiness: {
        Row: {
          conversation_id: string
          ready_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          ready_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          ready_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_chemistry_readiness_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "live_chemistry_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      live_chemistry_updates: {
        Row: {
          conversation_id: string
          session_id: string
          updated_at: string
          version: number
        }
        Insert: {
          conversation_id: string
          session_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          conversation_id?: string
          session_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_chemistry_updates_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "live_chemistry_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_chemistry_updates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_comments: {
        Row: {
          body: string
          client_comment_id: string
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by_user_id: string | null
          profile_id: string
          session_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          client_comment_id: string
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by_user_id?: string | null
          profile_id: string
          session_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          client_comment_id?: string
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by_user_id?: string | null
          profile_id?: string
          session_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_comments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_creator_eligibility: {
        Row: {
          allowed_context_types: string[]
          created_at: string
          enabled: boolean
          expires_at: string | null
          granted_by_user_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_context_types?: string[]
          created_at?: string
          enabled?: boolean
          expires_at?: string | null
          granted_by_user_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_context_types?: string[]
          created_at?: string
          enabled?: boolean
          expires_at?: string | null
          granted_by_user_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      live_maintenance_failures: {
        Row: {
          error_message: string
          id: number
          occurred_at: string
          sqlstate: string
          task_name: string
        }
        Insert: {
          error_message: string
          id?: never
          occurred_at?: string
          sqlstate: string
          task_name: string
        }
        Update: {
          error_message?: string
          id?: never
          occurred_at?: string
          sqlstate?: string
          task_name?: string
        }
        Relationships: []
      }
      live_match_round_responses: {
        Row: {
          decision: string
          id: string
          match_round_id: string
          responded_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          decision: string
          id?: string
          match_round_id: string
          responded_at?: string
          session_id: string
          user_id: string
        }
        Update: {
          decision?: string
          id?: string
          match_round_id?: string
          responded_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_match_response_round_session_fk"
            columns: ["match_round_id", "session_id"]
            isOneToOne: false
            referencedRelation: "live_match_rounds"
            referencedColumns: ["id", "session_id"]
          },
          {
            foreignKeyName: "live_match_round_responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_match_round_updates: {
        Row: {
          session_id: string
          updated_at: string
          version: number
        }
        Insert: {
          session_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          session_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_match_round_updates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_match_rounds: {
        Row: {
          client_proposal_id: string
          completed_at: string | null
          connection_signals: Json
          consent_resolved_at: string | null
          conversation_spark: Json
          created_at: string
          created_by_user_id: string
          expires_at: string
          id: string
          introduction_started_at: string | null
          invited_at: string
          participant_a_profile_id: string
          participant_a_user_id: string
          participant_b_profile_id: string
          participant_b_user_id: string
          session_id: string
          state: string
          updated_at: string
          version: number
        }
        Insert: {
          client_proposal_id: string
          completed_at?: string | null
          connection_signals?: Json
          consent_resolved_at?: string | null
          conversation_spark?: Json
          created_at?: string
          created_by_user_id: string
          expires_at?: string
          id?: string
          introduction_started_at?: string | null
          invited_at?: string
          participant_a_profile_id: string
          participant_a_user_id: string
          participant_b_profile_id: string
          participant_b_user_id: string
          session_id: string
          state?: string
          updated_at?: string
          version?: number
        }
        Update: {
          client_proposal_id?: string
          completed_at?: string | null
          connection_signals?: Json
          consent_resolved_at?: string | null
          conversation_spark?: Json
          created_at?: string
          created_by_user_id?: string
          expires_at?: string
          id?: string
          introduction_started_at?: string | null
          invited_at?: string
          participant_a_profile_id?: string
          participant_a_user_id?: string
          participant_b_profile_id?: string
          participant_b_user_id?: string
          session_id?: string
          state?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_match_rounds_participant_a_profile_id_fkey"
            columns: ["participant_a_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_match_rounds_participant_a_profile_id_fkey"
            columns: ["participant_a_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_match_rounds_participant_b_profile_id_fkey"
            columns: ["participant_b_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_match_rounds_participant_b_profile_id_fkey"
            columns: ["participant_b_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_match_rounds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_moderation_actions: {
        Row: {
          action: string
          actor_user_id: string
          client_action_id: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          session_id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          client_action_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          session_id: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          client_action_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          session_id?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_moderation_actions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_participant_arrival_updates: {
        Row: {
          arrived_at: string
          profile_id: string
          session_id: string
          version: number
        }
        Insert: {
          arrived_at?: string
          profile_id: string
          session_id: string
          version?: number
        }
        Update: {
          arrived_at?: string
          profile_id?: string
          session_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_participant_arrival_updates_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_participant_arrival_updates_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_participant_arrival_updates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_participant_roles: {
        Row: {
          assigned_by_user_id: string
          created_at: string
          id: string
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          assigned_by_user_id: string
          created_at?: string
          id?: string
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          assigned_by_user_id?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_participant_roles_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_participants: {
        Row: {
          connection_quality_state: string
          created_at: string
          id: string
          invited_at: string
          joined_at: string | null
          last_connection_change_at: string | null
          last_seen_at: string | null
          left_at: string | null
          microphone_muted_by_moderator: boolean
          open_to_introductions: boolean
          origin_context_id: string | null
          origin_context_type: string
          profile_id: string
          reconnect_state: string | null
          role: string
          rsvp_status: string
          session_id: string
          stage_joined_at: string | null
          stage_left_at: string | null
          stage_slot: number | null
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_quality_state?: string
          created_at?: string
          id?: string
          invited_at?: string
          joined_at?: string | null
          last_connection_change_at?: string | null
          last_seen_at?: string | null
          left_at?: string | null
          microphone_muted_by_moderator?: boolean
          open_to_introductions?: boolean
          origin_context_id?: string | null
          origin_context_type: string
          profile_id: string
          reconnect_state?: string | null
          role?: string
          rsvp_status?: string
          session_id: string
          stage_joined_at?: string | null
          stage_left_at?: string | null
          stage_slot?: number | null
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_quality_state?: string
          created_at?: string
          id?: string
          invited_at?: string
          joined_at?: string | null
          last_connection_change_at?: string | null
          last_seen_at?: string | null
          left_at?: string | null
          microphone_muted_by_moderator?: boolean
          open_to_introductions?: boolean
          origin_context_id?: string | null
          origin_context_type?: string
          profile_id?: string
          reconnect_state?: string | null
          role?: string
          rsvp_status?: string
          session_id?: string
          stage_joined_at?: string | null
          stage_left_at?: string | null
          stage_slot?: number | null
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_presence_leases: {
        Row: {
          expires_at: string
          heartbeat_at: string
          participant_id: string
          session_id: string
          user_id: string
        }
        Insert: {
          expires_at?: string
          heartbeat_at?: string
          participant_id: string
          session_id: string
          user_id: string
        }
        Update: {
          expires_at?: string
          heartbeat_at?: string
          participant_id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_presence_leases_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: true
            referencedRelation: "live_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_presence_leases_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_private_spark_exit_responses: {
        Row: {
          decision: string
          private_spark_id: string
          responded_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          decision: string
          private_spark_id: string
          responded_at?: string
          session_id: string
          user_id: string
        }
        Update: {
          decision?: string
          private_spark_id?: string
          responded_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_private_spark_exit_responses_private_spark_id_fkey"
            columns: ["private_spark_id"]
            isOneToOne: false
            referencedRelation: "live_private_sparks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_private_spark_exit_responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_private_spark_responses: {
        Row: {
          decision: string
          id: string
          private_spark_id: string
          responded_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          decision: string
          id?: string
          private_spark_id: string
          responded_at?: string
          session_id: string
          user_id: string
        }
        Update: {
          decision?: string
          id?: string
          private_spark_id?: string
          responded_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_private_spark_responses_private_spark_id_fkey"
            columns: ["private_spark_id"]
            isOneToOne: false
            referencedRelation: "live_private_sparks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_private_spark_responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_private_sparks: {
        Row: {
          activated_at: string | null
          active_expires_at: string | null
          chemistry_first_enabled: boolean
          consent_expires_at: string
          created_at: string
          end_reason: string | null
          ended_at: string | null
          ended_by_user_id: string | null
          exit_outcome: string
          exit_resolved_at: string | null
          id: string
          match_id: string | null
          match_round_id: string
          participant_a_profile_id: string
          participant_a_user_id: string
          participant_b_profile_id: string
          participant_b_user_id: string
          provider: string
          provider_call_id: string
          provider_call_type: string
          session_id: string
          state: string
          updated_at: string
          version: number
        }
        Insert: {
          activated_at?: string | null
          active_expires_at?: string | null
          chemistry_first_enabled?: boolean
          consent_expires_at?: string
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by_user_id?: string | null
          exit_outcome?: string
          exit_resolved_at?: string | null
          id?: string
          match_id?: string | null
          match_round_id: string
          participant_a_profile_id: string
          participant_a_user_id: string
          participant_b_profile_id: string
          participant_b_user_id: string
          provider?: string
          provider_call_id: string
          provider_call_type?: string
          session_id: string
          state?: string
          updated_at?: string
          version?: number
        }
        Update: {
          activated_at?: string | null
          active_expires_at?: string | null
          chemistry_first_enabled?: boolean
          consent_expires_at?: string
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by_user_id?: string | null
          exit_outcome?: string
          exit_resolved_at?: string | null
          id?: string
          match_id?: string | null
          match_round_id?: string
          participant_a_profile_id?: string
          participant_a_user_id?: string
          participant_b_profile_id?: string
          participant_b_user_id?: string
          provider?: string
          provider_call_id?: string
          provider_call_type?: string
          session_id?: string
          state?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_private_sparks_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_private_sparks_match_round_id_fkey"
            columns: ["match_round_id"]
            isOneToOne: true
            referencedRelation: "live_match_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_private_sparks_participant_a_profile_id_fkey"
            columns: ["participant_a_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_private_sparks_participant_a_profile_id_fkey"
            columns: ["participant_a_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_private_sparks_participant_b_profile_id_fkey"
            columns: ["participant_b_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_private_sparks_participant_b_profile_id_fkey"
            columns: ["participant_b_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_private_sparks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_provider_control_jobs: {
        Row: {
          action: string
          attempt_count: number
          created_at: string
          id: number
          last_error: string | null
          moderation_action_id: string
          processed_at: string | null
          session_id: string
          status: string
          target_user_id: string
        }
        Insert: {
          action: string
          attempt_count?: number
          created_at?: string
          id?: never
          last_error?: string | null
          moderation_action_id: string
          processed_at?: string | null
          session_id: string
          status?: string
          target_user_id: string
        }
        Update: {
          action?: string
          attempt_count?: number
          created_at?: string
          id?: never
          last_error?: string | null
          moderation_action_id?: string
          processed_at?: string | null
          session_id?: string
          status?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_provider_control_jobs_moderation_action_id_fkey"
            columns: ["moderation_action_id"]
            isOneToOne: true
            referencedRelation: "live_moderation_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_provider_control_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_provider_webhook_events: {
        Row: {
          attempt_count: number
          event_type: string
          id: number
          last_error: string | null
          payload_digest: string
          processed_at: string | null
          provider: string
          provider_event_id: string
          received_at: string
          status: string
        }
        Insert: {
          attempt_count?: number
          event_type: string
          id?: never
          last_error?: string | null
          payload_digest: string
          processed_at?: string | null
          provider: string
          provider_event_id: string
          received_at?: string
          status?: string
        }
        Update: {
          attempt_count?: number
          event_type?: string
          id?: never
          last_error?: string | null
          payload_digest?: string
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      live_quick_connect_controls: {
        Row: {
          created_at: string
          creator_mode: string
          round_seconds: number
          session_id: string
          state: string
          updated_at: string
          updated_by_user_id: string | null
          version: number
        }
        Insert: {
          created_at?: string
          creator_mode?: string
          round_seconds?: number
          session_id: string
          state?: string
          updated_at?: string
          updated_by_user_id?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          creator_mode?: string
          round_seconds?: number
          session_id?: string
          state?: string
          updated_at?: string
          updated_by_user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_quick_connect_controls_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_quick_connect_decisions: {
        Row: {
          decided_at: string
          decision: string
          pairing_id: string
          user_id: string
        }
        Insert: {
          decided_at?: string
          decision: string
          pairing_id: string
          user_id: string
        }
        Update: {
          decided_at?: string
          decision?: string
          pairing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_quick_connect_decisions_pairing_id_fkey"
            columns: ["pairing_id"]
            isOneToOne: false
            referencedRelation: "live_quick_connect_pairings"
            referencedColumns: ["id"]
          },
        ]
      }
      live_quick_connect_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: number
          metadata: Json
          pairing_id: string | null
          session_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: never
          metadata?: Json
          pairing_id?: string | null
          session_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: never
          metadata?: Json
          pairing_id?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_quick_connect_events_pairing_id_fkey"
            columns: ["pairing_id"]
            isOneToOne: false
            referencedRelation: "live_quick_connect_pairings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_quick_connect_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_quick_connect_interests: {
        Row: {
          created_at: string
          from_user_id: string
          session_id: string
          to_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          session_id: string
          to_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          session_id?: string
          to_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_quick_connect_interests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_quick_connect_pairings: {
        Row: {
          chemistry_first_enabled: boolean
          completed_at: string | null
          created_at: string
          ends_at: string
          id: string
          participant_a_profile_id: string
          participant_a_user_id: string
          participant_b_profile_id: string
          participant_b_user_id: string
          provider: string
          provider_call_id: string
          provider_call_type: string
          reconnect_deadline: string | null
          round_id: string
          session_id: string
          shared_outcome: string | null
          starts_at: string
          state: string
          updated_at: string
          version: number
        }
        Insert: {
          chemistry_first_enabled?: boolean
          completed_at?: string | null
          created_at?: string
          ends_at: string
          id?: string
          participant_a_profile_id: string
          participant_a_user_id: string
          participant_b_profile_id: string
          participant_b_user_id: string
          provider?: string
          provider_call_id: string
          provider_call_type?: string
          reconnect_deadline?: string | null
          round_id: string
          session_id: string
          shared_outcome?: string | null
          starts_at?: string
          state?: string
          updated_at?: string
          version?: number
        }
        Update: {
          chemistry_first_enabled?: boolean
          completed_at?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          participant_a_profile_id?: string
          participant_a_user_id?: string
          participant_b_profile_id?: string
          participant_b_user_id?: string
          provider?: string
          provider_call_id?: string
          provider_call_type?: string
          reconnect_deadline?: string | null
          round_id?: string
          session_id?: string
          shared_outcome?: string | null
          starts_at?: string
          state?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_quick_connect_pairings_participant_a_profile_id_fkey"
            columns: ["participant_a_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_quick_connect_pairings_participant_a_profile_id_fkey"
            columns: ["participant_a_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_quick_connect_pairings_participant_b_profile_id_fkey"
            columns: ["participant_b_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_quick_connect_pairings_participant_b_profile_id_fkey"
            columns: ["participant_b_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_quick_connect_pairings_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "live_quick_connect_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_quick_connect_pairings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_quick_connect_participants: {
        Row: {
          connection_state: string
          current_pairing_id: string | null
          joined_at: string
          last_seen_at: string
          pairing_key: string
          profile_id: string
          reconnect_deadline: string | null
          session_id: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_state?: string
          current_pairing_id?: string | null
          joined_at?: string
          last_seen_at?: string
          pairing_key?: string
          profile_id: string
          reconnect_deadline?: string | null
          session_id: string
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_state?: string
          current_pairing_id?: string | null
          joined_at?: string
          last_seen_at?: string
          pairing_key?: string
          profile_id?: string
          reconnect_deadline?: string | null
          session_id?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_quick_connect_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_quick_connect_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_quick_connect_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_quick_current_pairing_fk"
            columns: ["current_pairing_id"]
            isOneToOne: false
            referencedRelation: "live_quick_connect_pairings"
            referencedColumns: ["id"]
          },
        ]
      }
      live_quick_connect_rounds: {
        Row: {
          completed_at: string | null
          created_at: string
          ends_at: string
          id: string
          round_number: number
          session_id: string
          starts_at: string
          state: string
          updated_at: string
          version: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          ends_at: string
          id?: string
          round_number: number
          session_id: string
          starts_at?: string
          state?: string
          updated_at?: string
          version?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          round_number?: number
          session_id?: string
          starts_at?: string
          state?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_quick_connect_rounds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_quick_connect_updates: {
        Row: {
          session_id: string
          updated_at: string
          version: number
        }
        Insert: {
          session_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          session_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_quick_connect_updates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_reactions: {
        Row: {
          client_event_id: string
          created_at: string
          id: number
          profile_id: string
          reaction: string
          session_id: string
          user_id: string
        }
        Insert: {
          client_event_id: string
          created_at?: string
          id?: never
          profile_id: string
          reaction: string
          session_id: string
          user_id: string
        }
        Update: {
          client_event_id?: string
          created_at?: string
          id?: never
          profile_id?: string
          reaction?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_reactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_reports: {
        Row: {
          client_report_id: string
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_profile_id: string
          reporter_user_id: string
          resolved_at: string | null
          session_id: string
          status: string
          target_comment_id: string | null
          target_user_id: string | null
        }
        Insert: {
          client_report_id: string
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_profile_id: string
          reporter_user_id: string
          resolved_at?: string | null
          session_id: string
          status?: string
          target_comment_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          client_report_id?: string
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_profile_id?: string
          reporter_user_id?: string
          resolved_at?: string | null
          session_id?: string
          status?: string
          target_comment_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_reports_reporter_profile_id_fkey"
            columns: ["reporter_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_reports_reporter_profile_id_fkey"
            columns: ["reporter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_reports_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_reports_target_comment_id_fkey"
            columns: ["target_comment_id"]
            isOneToOne: false
            referencedRelation: "live_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      live_seat_requests: {
        Row: {
          id: string
          profile_id: string
          requested_at: string
          resolved_at: string | null
          resolved_by_user_id: string | null
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          profile_id: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          profile_id?: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_seat_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_seat_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_seat_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_capability_assignments: {
        Row: {
          assigned_by_user_id: string
          capability: string
          created_at: string
          effect: string
          id: string
          session_id: string
          user_id: string
        }
        Insert: {
          assigned_by_user_id: string
          capability: string
          created_at?: string
          effect?: string
          id?: string
          session_id: string
          user_id: string
        }
        Update: {
          assigned_by_user_id?: string
          capability?: string
          created_at?: string
          effect?: string
          id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_capability_assignments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          from_state: string | null
          id: number
          metadata: Json
          session_id: string
          to_state: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          from_state?: string | null
          id?: never
          metadata?: Json
          session_id: string
          to_state?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          from_state?: string | null
          id?: never
          metadata?: Json
          session_id?: string
          to_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_structure_updates: {
        Row: {
          reason: string
          session_id: string
          updated_at: string
          version: number
        }
        Insert: {
          reason?: string
          session_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          reason?: string
          session_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_session_structure_updates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          backstage_opened_at: string | null
          cancelled_at: string | null
          captions_enabled: boolean
          chemistry_first_enabled: boolean
          circle_id: string | null
          configuration: Json
          context_id: string | null
          context_type: string
          created_at: string
          created_by_profile_id: string
          created_by_user_id: string
          description: string | null
          ended_at: string | null
          format: string
          gathering_id: string | null
          id: string
          maximum_participants: number
          maximum_publishers: number
          minimum_participants: number
          provider: string
          provider_call_id: string
          provider_call_type: string
          quorum_reached_at: string | null
          recording_enabled: boolean
          scheduled_end: string | null
          scheduled_start: string | null
          stage_request_capacity: number
          stage_requests_open: boolean
          started_at: string | null
          status: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          backstage_opened_at?: string | null
          cancelled_at?: string | null
          captions_enabled?: boolean
          chemistry_first_enabled?: boolean
          circle_id?: string | null
          configuration?: Json
          context_id?: string | null
          context_type?: string
          created_at?: string
          created_by_profile_id: string
          created_by_user_id: string
          description?: string | null
          ended_at?: string | null
          format?: string
          gathering_id?: string | null
          id?: string
          maximum_participants?: number
          maximum_publishers?: number
          minimum_participants?: number
          provider?: string
          provider_call_id: string
          provider_call_type?: string
          quorum_reached_at?: string | null
          recording_enabled?: boolean
          scheduled_end?: string | null
          scheduled_start?: string | null
          stage_request_capacity?: number
          stage_requests_open?: boolean
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          backstage_opened_at?: string | null
          cancelled_at?: string | null
          captions_enabled?: boolean
          chemistry_first_enabled?: boolean
          circle_id?: string | null
          configuration?: Json
          context_id?: string | null
          context_type?: string
          created_at?: string
          created_by_profile_id?: string
          created_by_user_id?: string
          description?: string | null
          ended_at?: string | null
          format?: string
          gathering_id?: string | null
          id?: string
          maximum_participants?: number
          maximum_publishers?: number
          minimum_participants?: number
          provider?: string
          provider_call_id?: string
          provider_call_type?: string
          quorum_reached_at?: string | null
          recording_enabled?: boolean
          scheduled_end?: string | null
          scheduled_start?: string | null
          stage_request_capacity?: number
          stage_requests_open?: boolean
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "live_sessions_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "live_sessions_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_gathering_id_fkey"
            columns: ["gathering_id"]
            isOneToOne: false
            referencedRelation: "gatherings"
            referencedColumns: ["id"]
          },
        ]
      }
      match_celebration_events: {
        Row: {
          created_at: string
          id: string
          match_id: string
          peer_profile_id: string
          peer_user_id: string
          recipient_profile_id: string
          recipient_user_id: string
          seen_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          peer_profile_id: string
          peer_user_id: string
          recipient_profile_id: string
          recipient_user_id: string
          seen_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          peer_profile_id?: string
          peer_user_id?: string
          recipient_profile_id?: string
          recipient_user_id?: string
          seen_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_celebration_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_celebration_events_peer_profile_id_fkey"
            columns: ["peer_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "match_celebration_events_peer_profile_id_fkey"
            columns: ["peer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_celebration_events_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "match_celebration_events_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
      message_attachment_secrets: {
        Row: {
          attachment_id: string
          created_at: string
          encrypted_key_nonce: string
          encrypted_key_receiver: string
          encrypted_key_sender: string
          encrypted_media_alg: string
          encrypted_media_nonce: string
          sender_public_key: string | null
        }
        Insert: {
          attachment_id: string
          created_at?: string
          encrypted_key_nonce: string
          encrypted_key_receiver: string
          encrypted_key_sender: string
          encrypted_media_alg?: string
          encrypted_media_nonce: string
          sender_public_key?: string | null
        }
        Update: {
          attachment_id?: string
          created_at?: string
          encrypted_key_nonce?: string
          encrypted_key_receiver?: string
          encrypted_key_sender?: string
          encrypted_media_alg?: string
          encrypted_media_nonce?: string
          sender_public_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_attachment_secrets_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: true
            referencedRelation: "message_attachments"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          attachment_index: number
          attachment_type: string
          bucket_id: string
          byte_size: number | null
          client_message_id: string
          created_at: string
          deleted_at: string | null
          duration_ms: number | null
          expires_at: string | null
          height: number | null
          id: string
          is_view_once: boolean
          lifecycle_status: string
          media_group_id: string | null
          message_id: string
          mime_type: string
          original_name: string | null
          preview_bucket_id: string | null
          preview_byte_size: number | null
          preview_height: number | null
          preview_mime_type: string | null
          preview_storage_path: string | null
          preview_width: number | null
          ready_at: string | null
          receiver_id: string
          sender_id: string
          sha256: string | null
          state_version: number
          storage_path: string
          thumbnail_storage_path: string | null
          updated_at: string
          validation_details: Json
          validation_status: string
          width: number | null
        }
        Insert: {
          attachment_index?: number
          attachment_type: string
          bucket_id?: string
          byte_size?: number | null
          client_message_id: string
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number | null
          expires_at?: string | null
          height?: number | null
          id?: string
          is_view_once?: boolean
          lifecycle_status?: string
          media_group_id?: string | null
          message_id: string
          mime_type: string
          original_name?: string | null
          preview_bucket_id?: string | null
          preview_byte_size?: number | null
          preview_height?: number | null
          preview_mime_type?: string | null
          preview_storage_path?: string | null
          preview_width?: number | null
          ready_at?: string | null
          receiver_id: string
          sender_id: string
          sha256?: string | null
          state_version?: number
          storage_path: string
          thumbnail_storage_path?: string | null
          updated_at?: string
          validation_details?: Json
          validation_status?: string
          width?: number | null
        }
        Update: {
          attachment_index?: number
          attachment_type?: string
          bucket_id?: string
          byte_size?: number | null
          client_message_id?: string
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number | null
          expires_at?: string | null
          height?: number | null
          id?: string
          is_view_once?: boolean
          lifecycle_status?: string
          media_group_id?: string | null
          message_id?: string
          mime_type?: string
          original_name?: string | null
          preview_bucket_id?: string | null
          preview_byte_size?: number | null
          preview_height?: number | null
          preview_mime_type?: string | null
          preview_storage_path?: string | null
          preview_width?: number | null
          ready_at?: string | null
          receiver_id?: string
          sender_id?: string
          sha256?: string | null
          state_version?: number
          storage_path?: string
          thumbnail_storage_path?: string | null
          updated_at?: string
          validation_details?: Json
          validation_status?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_canonical_identity_fkey"
            columns: [
              "message_id",
              "sender_id",
              "receiver_id",
              "client_message_id",
            ]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: [
              "id",
              "sender_id",
              "receiver_id",
              "client_message_id",
            ]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
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
          attachment_set_hash: string | null
          attachment_state: string
          attachment_state_version: number
          audio_duration: number | null
          audio_path: string | null
          audio_waveform: Json | null
          client_message_id: string | null
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
          media_caption: string | null
          media_expected_count: number | null
          media_group_id: string | null
          media_items: Json
          media_kind: string | null
          message_type: string
          read_at: string | null
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
          attachment_set_hash?: string | null
          attachment_state?: string
          attachment_state_version?: number
          audio_duration?: number | null
          audio_path?: string | null
          audio_waveform?: Json | null
          client_message_id?: string | null
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
          media_caption?: string | null
          media_expected_count?: number | null
          media_group_id?: string | null
          media_items?: Json
          media_kind?: string | null
          message_type?: string
          read_at?: string | null
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
          attachment_set_hash?: string | null
          attachment_state?: string
          attachment_state_version?: number
          audio_duration?: number | null
          audio_path?: string | null
          audio_waveform?: Json | null
          client_message_id?: string | null
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
          media_caption?: string | null
          media_expected_count?: number | null
          media_group_id?: string | null
          media_items?: Json
          media_kind?: string | null
          message_type?: string
          read_at?: string | null
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
      moment_comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          moment_id: string
          reaction: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          moment_id: string
          reaction: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          moment_id?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moment_comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "moment_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moment_comment_reactions_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
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
          parent_comment_id: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          moment_id: string
          parent_comment_id?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          moment_id?: string
          parent_comment_id?: string | null
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
          {
            foreignKeyName: "moment_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "moment_comments"
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
      moment_views: {
        Row: {
          id: string
          moment_id: string
          viewed_at: string
          viewer_user_id: string
        }
        Insert: {
          id?: string
          moment_id: string
          viewed_at?: string
          viewer_user_id: string
        }
        Update: {
          id?: string
          moment_id?: string
          viewed_at?: string
          viewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moment_views_moment_id_fkey"
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
          metadata: Json
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
          metadata?: Json
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
          metadata?: Json
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
          circle_discussions: boolean
          gifts: boolean
          id: string
          inapp_enabled: boolean
          likes: boolean
          live_invitations: boolean
          live_reminders: boolean
          live_started: boolean
          matches: boolean
          message_reactions: boolean
          messages: boolean
          moments: boolean
          notes: boolean
          preview_text: boolean
          profile_interest: boolean
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
          circle_discussions?: boolean
          gifts?: boolean
          id?: string
          inapp_enabled?: boolean
          likes?: boolean
          live_invitations?: boolean
          live_reminders?: boolean
          live_started?: boolean
          matches?: boolean
          message_reactions?: boolean
          messages?: boolean
          moments?: boolean
          notes?: boolean
          preview_text?: boolean
          profile_interest?: boolean
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
          circle_discussions?: boolean
          gifts?: boolean
          id?: string
          inapp_enabled?: boolean
          likes?: boolean
          live_invitations?: boolean
          live_reminders?: boolean
          live_started?: boolean
          matches?: boolean
          message_reactions?: boolean
          messages?: boolean
          moments?: boolean
          notes?: boolean
          preview_text?: boolean
          profile_interest?: boolean
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
      peer_visibility_prefs: {
        Row: {
          archived: boolean
          hidden: boolean
          id: string
          peer_user_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          hidden?: boolean
          id?: string
          peer_user_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          hidden?: boolean
          id?: string
          peer_user_id?: string
          updated_at?: string
          user_id?: string
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
          audience_mode: string
          boost_type: string
          created_at: string
          ends_at: string
          focus_mode: string
          id: string
          metadata: Json
          starts_at: string
          status: string
          user_id: string
        }
        Insert: {
          audience_mode?: string
          boost_type?: string
          created_at?: string
          ends_at: string
          focus_mode?: string
          id?: string
          metadata?: Json
          starts_at?: string
          status?: string
          user_id: string
        }
        Update: {
          audience_mode?: string
          boost_type?: string
          created_at?: string
          ends_at?: string
          focus_mode?: string
          id?: string
          metadata?: Json
          starts_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_boosts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_boosts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_gift_events: {
        Row: {
          actor_profile_id: string | null
          actor_user_id: string
          created_at: string
          event_type: string
          gift_id: string
          id: string
          metadata: Json
          recipient_profile_id: string
          sender_profile_id: string | null
        }
        Insert: {
          actor_profile_id?: string | null
          actor_user_id: string
          created_at?: string
          event_type: string
          gift_id: string
          id?: string
          metadata?: Json
          recipient_profile_id: string
          sender_profile_id?: string | null
        }
        Update: {
          actor_profile_id?: string | null
          actor_user_id?: string
          created_at?: string
          event_type?: string
          gift_id?: string
          id?: string
          metadata?: Json
          recipient_profile_id?: string
          sender_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_gift_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_gift_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_gift_events_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "profile_gifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_gift_events_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_gift_events_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_gift_events_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_gift_events_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_gifts: {
        Row: {
          archived_at: string | null
          created_at: string
          gift_type: string
          id: string
          opened_at: string | null
          profile_id: string
          revealed_at: string | null
          sender_avatar_url: string | null
          sender_display_name: string
          sender_gender: string | null
          sender_id: string
          sender_profile_id: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          gift_type: string
          id?: string
          opened_at?: string | null
          profile_id: string
          revealed_at?: string | null
          sender_avatar_url?: string | null
          sender_display_name?: string
          sender_gender?: string | null
          sender_id: string
          sender_profile_id?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          gift_type?: string
          id?: string
          opened_at?: string | null
          profile_id?: string
          revealed_at?: string | null
          sender_avatar_url?: string | null
          sender_display_name?: string
          sender_gender?: string | null
          sender_id?: string
          sender_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_gifts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_gifts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_gifts_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_gifts_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_image_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_interest_notification_deliveries: {
        Row: {
          actor_profile_id: string | null
          audience_plan: string
          dedupe_scope: string
          delivered_at: string
          id: number
          recipient_user_id: string
          signal_group: string
          signal_type: string
          target_profile_id: string
        }
        Insert: {
          actor_profile_id?: string | null
          audience_plan: string
          dedupe_scope?: string
          delivered_at?: string
          id?: number
          recipient_user_id: string
          signal_group: string
          signal_type: string
          target_profile_id: string
        }
        Update: {
          actor_profile_id?: string | null
          audience_plan?: string
          dedupe_scope?: string
          delivered_at?: string
          id?: number
          recipient_user_id?: string
          signal_group?: string
          signal_type?: string
          target_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_interest_notification_deliveries_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_interest_notification_deliveries_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_interest_notification_deliveries_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_interest_notification_deliveries_target_profile_id_fkey"
            columns: ["target_profile_id"]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_notes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private_locations: {
        Row: {
          accuracy_meters: number | null
          captured_at: string
          latitude: number
          longitude: number
          profile_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy_meters?: number | null
          captured_at?: string
          latitude: number
          longitude: number
          profile_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy_meters?: number | null
          captured_at?: string
          latitude?: number
          longitude?: number
          profile_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_private_locations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_private_locations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_prompts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_recommendation_quality_metrics: {
        Row: {
          accepted_matches_60d: number
          conversation_pairs_60d: number
          deep_conversation_pairs_60d: number
          impressions_30d: number
          long_dwells_30d: number
          market_quality_score: number
          opens_30d: number
          positives_30d: number
          profile_id: string
          refreshed_at: string
        }
        Insert: {
          accepted_matches_60d?: number
          conversation_pairs_60d?: number
          deep_conversation_pairs_60d?: number
          impressions_30d?: number
          long_dwells_30d?: number
          market_quality_score?: number
          opens_30d?: number
          positives_30d?: number
          profile_id: string
          refreshed_at?: string
        }
        Update: {
          accepted_matches_60d?: number
          conversation_pairs_60d?: number
          deep_conversation_pairs_60d?: number
          impressions_30d?: number
          long_dwells_30d?: number
          market_quality_score?: number
          opens_30d?: number
          positives_30d?: number
          profile_id?: string
          refreshed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_recommendation_quality_metrics_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_recommendation_quality_metrics_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_saves: {
        Row: {
          created_at: string
          target_profile_id: string
          viewer_profile_id: string
        }
        Insert: {
          created_at?: string
          target_profile_id: string
          viewer_profile_id: string
        }
        Update: {
          created_at?: string
          target_profile_id?: string
          viewer_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_saves_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_saves_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_saves_viewer_profile_id_fkey"
            columns: ["viewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_saves_viewer_profile_id_fkey"
            columns: ["viewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_signal_gestures: {
        Row: {
          created_at: string
          dismissed_at: string | null
          expires_at: string
          id: string
          note: string | null
          reason_key: string
          reason_label: string
          receiver_profile_id: string
          receiver_user_id: string
          responded_at: string | null
          seen_at: string | null
          sender_profile_id: string
          sender_user_id: string
          source: string
          source_moment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          expires_at?: string
          id?: string
          note?: string | null
          reason_key: string
          reason_label: string
          receiver_profile_id: string
          receiver_user_id: string
          responded_at?: string | null
          seen_at?: string | null
          sender_profile_id: string
          sender_user_id: string
          source?: string
          source_moment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          expires_at?: string
          id?: string
          note?: string | null
          reason_key?: string
          reason_label?: string
          receiver_profile_id?: string
          receiver_user_id?: string
          responded_at?: string | null
          seen_at?: string | null
          sender_profile_id?: string
          sender_user_id?: string
          source?: string
          source_moment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_signal_gestures_receiver_profile_id_fkey"
            columns: ["receiver_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_signal_gestures_receiver_profile_id_fkey"
            columns: ["receiver_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_signal_gestures_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_signal_gestures_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
      profile_visibility_entitlements: {
        Row: {
          boost_audience_mode: string | null
          boost_ends_at: string | null
          boost_focus_mode: string | null
          boost_type: string | null
          has_active_boost: boolean
          premium_plan: string
          premium_rank: number
          profile_created_at: string | null
          profile_id: string
          refreshed_at: string
          user_id: string
        }
        Insert: {
          boost_audience_mode?: string | null
          boost_ends_at?: string | null
          boost_focus_mode?: string | null
          boost_type?: string | null
          has_active_boost?: boolean
          premium_plan?: string
          premium_rank?: number
          profile_created_at?: string | null
          profile_id: string
          refreshed_at?: string
          user_id: string
        }
        Update: {
          boost_audience_mode?: string | null
          boost_ends_at?: string | null
          boost_focus_mode?: string | null
          boost_type?: string | null
          has_active_boost?: boolean
          premium_plan?: string
          premium_rank?: number
          profile_created_at?: string | null
          profile_id?: string
          refreshed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_visibility_entitlements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_visibility_entitlements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_state: string
          account_state_updated_at: string
          age: number | null
          age_preference_confirmed_at: string | null
          ai_score: number | null
          ai_score_updated_at: string | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          country_lock_policy: string
          country_verification_started_at: string | null
          country_verification_target_code: string | null
          country_verified_at: string | null
          created_at: string
          created_via_provider: string | null
          current_country: string | null
          current_country_code: string | null
          deleted_at: string | null
          discoverable_in_vibes: boolean
          drinking: string | null
          duplicate_of_user_id: string | null
          education: string | null
          exercise_frequency: string | null
          full_name: string | null
          future_ghana_plans: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          has_children: string | null
          height: string | null
          hero_image_url: string | null
          id: string
          identity_disabled_at: string | null
          identity_finalized_at: string | null
          identity_resolution_reason: string | null
          identity_status: string
          identity_status_updated_at: string
          is_active: boolean
          languages_spoken: string[] | null
          last_active: string | null
          last_ghana_visit: string | null
          last_successful_auth_provider: string | null
          latitude: number | null
          living_situation: string | null
          locality_admin1_code: string | null
          locality_district: string | null
          locality_geoname_id: number | null
          locality_provider: string | null
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
          onboarding_completed_at: string | null
          onboarding_step: number
          onboarding_variant: string | null
          online: boolean
          origin_country: string | null
          origin_country_code: string | null
          origin_country_source: string
          pause_reason: string | null
          paused_at: string | null
          personality_type: string | null
          pets: string | null
          phone_number: string | null
          phone_verification_score: number | null
          phone_verified: boolean | null
          phone_verified_at: string | null
          photos: string[] | null
          profile_completed: boolean
          profile_video: string | null
          public_key: string | null
          recovered_to_user_id: string | null
          region: string | null
          relationship_compass: Json
          religion: Database["public"]["Enums"]["religion"] | null
          roots: string[] | null
          roots_locality: string | null
          roots_locality_geoname_id: number | null
          roots_note: string | null
          roots_region: string | null
          roots_visibility: string
          search_name: string | null
          smoking: string | null
          superlikes_left: number
          superlikes_reset_at: string | null
          tribe: string | null
          updated_at: string
          user_id: string
          username: string | null
          verification_level: number | null
          verification_refresh_reason: string | null
          verification_refresh_requested_at: string | null
          verification_refresh_requested_by: string | null
          verification_refresh_required: boolean
          verification_refresh_resolved_at: string | null
          verification_refresh_target_level: number | null
          verification_refresh_user_notified: boolean
          vibes_practice_completed_at: string | null
          vibes_practice_completed_version: number
          wants_children: string | null
          years_in_diaspora: number | null
        }
        Insert: {
          account_state?: string
          account_state_updated_at?: string
          age?: number | null
          age_preference_confirmed_at?: string | null
          ai_score?: number | null
          ai_score_updated_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country_lock_policy?: string
          country_verification_started_at?: string | null
          country_verification_target_code?: string | null
          country_verified_at?: string | null
          created_at?: string
          created_via_provider?: string | null
          current_country?: string | null
          current_country_code?: string | null
          deleted_at?: string | null
          discoverable_in_vibes?: boolean
          drinking?: string | null
          duplicate_of_user_id?: string | null
          education?: string | null
          exercise_frequency?: string | null
          full_name?: string | null
          future_ghana_plans?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          has_children?: string | null
          height?: string | null
          hero_image_url?: string | null
          id?: string
          identity_disabled_at?: string | null
          identity_finalized_at?: string | null
          identity_resolution_reason?: string | null
          identity_status?: string
          identity_status_updated_at?: string
          is_active?: boolean
          languages_spoken?: string[] | null
          last_active?: string | null
          last_ghana_visit?: string | null
          last_successful_auth_provider?: string | null
          latitude?: number | null
          living_situation?: string | null
          locality_admin1_code?: string | null
          locality_district?: string | null
          locality_geoname_id?: number | null
          locality_provider?: string | null
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
          onboarding_completed_at?: string | null
          onboarding_step?: number
          onboarding_variant?: string | null
          online?: boolean
          origin_country?: string | null
          origin_country_code?: string | null
          origin_country_source?: string
          pause_reason?: string | null
          paused_at?: string | null
          personality_type?: string | null
          pets?: string | null
          phone_number?: string | null
          phone_verification_score?: number | null
          phone_verified?: boolean | null
          phone_verified_at?: string | null
          photos?: string[] | null
          profile_completed?: boolean
          profile_video?: string | null
          public_key?: string | null
          recovered_to_user_id?: string | null
          region?: string | null
          relationship_compass?: Json
          religion?: Database["public"]["Enums"]["religion"] | null
          roots?: string[] | null
          roots_locality?: string | null
          roots_locality_geoname_id?: number | null
          roots_note?: string | null
          roots_region?: string | null
          roots_visibility?: string
          search_name?: string | null
          smoking?: string | null
          superlikes_left?: number
          superlikes_reset_at?: string | null
          tribe?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
          verification_level?: number | null
          verification_refresh_reason?: string | null
          verification_refresh_requested_at?: string | null
          verification_refresh_requested_by?: string | null
          verification_refresh_required?: boolean
          verification_refresh_resolved_at?: string | null
          verification_refresh_target_level?: number | null
          verification_refresh_user_notified?: boolean
          vibes_practice_completed_at?: string | null
          vibes_practice_completed_version?: number
          wants_children?: string | null
          years_in_diaspora?: number | null
        }
        Update: {
          account_state?: string
          account_state_updated_at?: string
          age?: number | null
          age_preference_confirmed_at?: string | null
          ai_score?: number | null
          ai_score_updated_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country_lock_policy?: string
          country_verification_started_at?: string | null
          country_verification_target_code?: string | null
          country_verified_at?: string | null
          created_at?: string
          created_via_provider?: string | null
          current_country?: string | null
          current_country_code?: string | null
          deleted_at?: string | null
          discoverable_in_vibes?: boolean
          drinking?: string | null
          duplicate_of_user_id?: string | null
          education?: string | null
          exercise_frequency?: string | null
          full_name?: string | null
          future_ghana_plans?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          has_children?: string | null
          height?: string | null
          hero_image_url?: string | null
          id?: string
          identity_disabled_at?: string | null
          identity_finalized_at?: string | null
          identity_resolution_reason?: string | null
          identity_status?: string
          identity_status_updated_at?: string
          is_active?: boolean
          languages_spoken?: string[] | null
          last_active?: string | null
          last_ghana_visit?: string | null
          last_successful_auth_provider?: string | null
          latitude?: number | null
          living_situation?: string | null
          locality_admin1_code?: string | null
          locality_district?: string | null
          locality_geoname_id?: number | null
          locality_provider?: string | null
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
          onboarding_completed_at?: string | null
          onboarding_step?: number
          onboarding_variant?: string | null
          online?: boolean
          origin_country?: string | null
          origin_country_code?: string | null
          origin_country_source?: string
          pause_reason?: string | null
          paused_at?: string | null
          personality_type?: string | null
          pets?: string | null
          phone_number?: string | null
          phone_verification_score?: number | null
          phone_verified?: boolean | null
          phone_verified_at?: string | null
          photos?: string[] | null
          profile_completed?: boolean
          profile_video?: string | null
          public_key?: string | null
          recovered_to_user_id?: string | null
          region?: string | null
          relationship_compass?: Json
          religion?: Database["public"]["Enums"]["religion"] | null
          roots?: string[] | null
          roots_locality?: string | null
          roots_locality_geoname_id?: number | null
          roots_note?: string | null
          roots_region?: string | null
          roots_visibility?: string
          search_name?: string | null
          smoking?: string | null
          superlikes_left?: number
          superlikes_reset_at?: string | null
          tribe?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
          verification_level?: number | null
          verification_refresh_reason?: string | null
          verification_refresh_requested_at?: string | null
          verification_refresh_requested_by?: string | null
          verification_refresh_required?: boolean
          verification_refresh_resolved_at?: string | null
          verification_refresh_target_level?: number | null
          verification_refresh_user_notified?: boolean
          vibes_practice_completed_at?: string | null
          vibes_practice_completed_version?: number
          wants_children?: string | null
          years_in_diaspora?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_roots_locality_geoname_id_fkey"
            columns: ["roots_locality_geoname_id"]
            isOneToOne: false
            referencedRelation: "ghana_localities"
            referencedColumns: ["geoname_id"]
          },
        ]
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
      relationship_compass_nudges: {
        Row: {
          compass_updated_at: string
          id: string
          kind: string
          metadata: Json
          profile_id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          compass_updated_at: string
          id?: string
          kind?: string
          metadata?: Json
          profile_id: string
          sent_at?: string
          user_id: string
        }
        Update: {
          compass_updated_at?: string
          id?: string
          kind?: string
          metadata?: Json
          profile_id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_compass_nudges_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "relationship_compass_nudges_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_gists: {
        Row: {
          audience_tags: string[]
          body: string
          circle_id: string | null
          city: string | null
          country_code: string | null
          created_at: string
          created_by_admin_id: string | null
          created_by_profile_id: string | null
          culture_tags: string[]
          faith_tags: string[]
          id: string
          perspective: string
          published_at: string | null
          relationship_intent_tags: string[]
          scheduled_for: string | null
          short_body: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience_tags?: string[]
          body: string
          circle_id?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          created_by_profile_id?: string | null
          culture_tags?: string[]
          faith_tags?: string[]
          id?: string
          perspective?: string
          published_at?: string | null
          relationship_intent_tags?: string[]
          scheduled_for?: string | null
          short_body?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience_tags?: string[]
          body?: string
          circle_id?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          created_by_profile_id?: string | null
          culture_tags?: string[]
          faith_tags?: string[]
          id?: string
          perspective?: string
          published_at?: string | null
          relationship_intent_tags?: string[]
          scheduled_for?: string | null
          short_body?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_gists_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "relationship_gists_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_gists_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "relationship_gists_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          evidence: Json
          evidence_message_created_at: string | null
          evidence_message_id: string | null
          evidence_message_sender_id: string | null
          evidence_message_text: string | null
          evidence_message_type: string | null
          id: string
          reason: string
          reported_id: string
          reporter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          evidence?: Json
          evidence_message_created_at?: string | null
          evidence_message_id?: string | null
          evidence_message_sender_id?: string | null
          evidence_message_text?: string | null
          evidence_message_type?: string | null
          id?: string
          reason: string
          reported_id: string
          reporter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          evidence?: Json
          evidence_message_created_at?: string | null
          evidence_message_id?: string | null
          evidence_message_sender_id?: string | null
          evidence_message_text?: string | null
          evidence_message_type?: string | null
          id?: string
          reason?: string
          reported_id?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_evidence_message_id_fkey"
            columns: ["evidence_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
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
      subscription_renewal_job_runs: {
        Row: {
          completed_at: string | null
          error_code: string | null
          error_message: string | null
          id: string
          result: Json
          started_at: string
          status: string
          worker_version: string
        }
        Insert: {
          completed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          result?: Json
          started_at?: string
          status: string
          worker_version?: string
        }
        Update: {
          completed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          result?: Json
          started_at?: string
          status?: string
          worker_version?: string
        }
        Relationships: []
      }
      subscription_renewal_nudges: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          kind: string
          metadata: Json
          subscription_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          kind: string
          metadata?: Json
          subscription_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          kind?: string
          metadata?: Json
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_renewal_nudges_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
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
      user_presence: {
        Row: {
          last_active: string
          online: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          last_active?: string
          online?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          last_active?: string
          online?: boolean
          updated_at?: string
          user_id?: string
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
      verification_evidence_retention: {
        Row: {
          attempts: number
          bucket_id: string
          created_at: string
          delete_after: string
          deleted_at: string | null
          last_error: string | null
          object_path: string
          processing_started_at: string | null
          request_id: string
          status: string
        }
        Insert: {
          attempts?: number
          bucket_id?: string
          created_at?: string
          delete_after: string
          deleted_at?: string | null
          last_error?: string | null
          object_path: string
          processing_started_at?: string | null
          request_id: string
          status?: string
        }
        Update: {
          attempts?: number
          bucket_id?: string
          created_at?: string
          delete_after?: string
          deleted_at?: string | null
          last_error?: string | null
          object_path?: string
          processing_started_at?: string | null
          request_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_evidence_retention_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "verification_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_liveness_challenges: {
        Row: {
          actions: string[]
          consumed_at: string | null
          evidence: Json | null
          expires_at: string
          id: string
          issued_at: string
          nonce: string
          profile_id: string
          status: string
          user_id: string
          verification_request_id: string | null
        }
        Insert: {
          actions: string[]
          consumed_at?: string | null
          evidence?: Json | null
          expires_at: string
          id?: string
          issued_at?: string
          nonce?: string
          profile_id: string
          status?: string
          user_id: string
          verification_request_id?: string | null
        }
        Update: {
          actions?: string[]
          consumed_at?: string | null
          evidence?: Json | null
          expires_at?: string
          id?: string
          issued_at?: string
          nonce?: string
          profile_id?: string
          status?: string
          user_id?: string
          verification_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_liveness_challenges_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "verification_liveness_challenges_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_liveness_challenges_verification_request_id_fkey"
            columns: ["verification_request_id"]
            isOneToOne: false
            referencedRelation: "verification_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_requests: {
        Row: {
          auto_verification_data: Json | null
          auto_verification_score: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
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
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
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
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
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
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "verification_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vibes_events: {
        Row: {
          created_at: string
          dwell_ms: number | null
          event_type: string
          id: string
          metadata: Json
          position: number | null
          segment: string
          target_profile_id: string
          target_user_id: string | null
          viewer_profile_id: string
          viewer_user_id: string
        }
        Insert: {
          created_at?: string
          dwell_ms?: number | null
          event_type: string
          id?: string
          metadata?: Json
          position?: number | null
          segment?: string
          target_profile_id: string
          target_user_id?: string | null
          viewer_profile_id: string
          viewer_user_id: string
        }
        Update: {
          created_at?: string
          dwell_ms?: number | null
          event_type?: string
          id?: string
          metadata?: Json
          position?: number | null
          segment?: string
          target_profile_id?: string
          target_user_id?: string | null
          viewer_profile_id?: string
          viewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibes_events_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "vibes_events_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vibes_events_viewer_profile_id_fkey"
            columns: ["viewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "vibes_events_viewer_profile_id_fkey"
            columns: ["viewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vibes_v4_metric_refresh_queue: {
        Row: {
          attempts: number
          last_error: string | null
          locked_at: string | null
          processed_at: string | null
          profile_id: string
          quality_dirty: boolean
          reason: string | null
          requested_at: string
          viewer_behavior_dirty: boolean
          visibility_dirty: boolean
        }
        Insert: {
          attempts?: number
          last_error?: string | null
          locked_at?: string | null
          processed_at?: string | null
          profile_id: string
          quality_dirty?: boolean
          reason?: string | null
          requested_at?: string
          viewer_behavior_dirty?: boolean
          visibility_dirty?: boolean
        }
        Update: {
          attempts?: number
          last_error?: string | null
          locked_at?: string | null
          processed_at?: string | null
          profile_id?: string
          quality_dirty?: boolean
          reason?: string | null
          requested_at?: string
          viewer_behavior_dirty?: boolean
          visibility_dirty?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "vibes_v4_metric_refresh_queue_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "vibes_v4_metric_refresh_queue_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vibes_v5_taste_refresh_queue: {
        Row: {
          attempts: number
          last_error: string | null
          requested_at: string
          viewer_profile_id: string
        }
        Insert: {
          attempts?: number
          last_error?: string | null
          requested_at?: string
          viewer_profile_id: string
        }
        Update: {
          attempts?: number
          last_error?: string | null
          requested_at?: string
          viewer_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibes_v5_taste_refresh_queue_viewer_profile_id_fkey"
            columns: ["viewer_profile_id"]
            isOneToOne: true
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "vibes_v5_taste_refresh_queue_viewer_profile_id_fkey"
            columns: ["viewer_profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vibes_v5_viewer_feature_weights: {
        Row: {
          evidence_count: number
          feature_key: string
          feature_value: string
          negative_evidence: number
          positive_evidence: number
          refreshed_at: string
          viewer_profile_id: string
          weight: number
        }
        Insert: {
          evidence_count?: number
          feature_key: string
          feature_value: string
          negative_evidence?: number
          positive_evidence?: number
          refreshed_at?: string
          viewer_profile_id: string
          weight?: number
        }
        Update: {
          evidence_count?: number
          feature_key?: string
          feature_value?: string
          negative_evidence?: number
          positive_evidence?: number
          refreshed_at?: string
          viewer_profile_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "vibes_v5_viewer_feature_weights_viewer_profile_id_fkey"
            columns: ["viewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "vibes_v5_viewer_feature_weights_viewer_profile_id_fkey"
            columns: ["viewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      viewer_profile_behavior_summary: {
        Row: {
          avg_dwell_ms: number
          full_open_count: number
          intent_opened_count: number
          intro_count: number
          last_event_at: string | null
          last_pass_at: string | null
          last_positive_at: string | null
          long_dwell_count: number
          pass_count: number
          positive_count: number
          profile_open_count: number
          profile_saved_count: number
          refreshed_at: string
          seen_count: number
          signal_opened_count: number
          target_profile_id: string
          undo_count: number
          viewer_profile_id: string
        }
        Insert: {
          avg_dwell_ms?: number
          full_open_count?: number
          intent_opened_count?: number
          intro_count?: number
          last_event_at?: string | null
          last_pass_at?: string | null
          last_positive_at?: string | null
          long_dwell_count?: number
          pass_count?: number
          positive_count?: number
          profile_open_count?: number
          profile_saved_count?: number
          refreshed_at?: string
          seen_count?: number
          signal_opened_count?: number
          target_profile_id: string
          undo_count?: number
          viewer_profile_id: string
        }
        Update: {
          avg_dwell_ms?: number
          full_open_count?: number
          intent_opened_count?: number
          intro_count?: number
          last_event_at?: string | null
          last_pass_at?: string | null
          last_positive_at?: string | null
          long_dwell_count?: number
          pass_count?: number
          positive_count?: number
          profile_open_count?: number
          profile_saved_count?: number
          refreshed_at?: string
          seen_count?: number
          signal_opened_count?: number
          target_profile_id?: string
          undo_count?: number
          viewer_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viewer_profile_behavior_summary_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "viewer_profile_behavior_summary_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viewer_profile_behavior_summary_viewer_profile_id_fkey"
            columns: ["viewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "viewer_profile_behavior_summary_viewer_profile_id_fkey"
            columns: ["viewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      warm_introductions: {
        Row: {
          accepted_by_a_at: string | null
          accepted_by_b_at: string | null
          circle_id: string | null
          created_at: string
          declined_by_profile_id: string | null
          expires_at: string
          id: string
          initiator_profile_id: string | null
          initiator_role: string
          profile_a_id: string
          profile_b_id: string
          reason: string
          shared_context: string[]
          status: string
          updated_at: string
        }
        Insert: {
          accepted_by_a_at?: string | null
          accepted_by_b_at?: string | null
          circle_id?: string | null
          created_at?: string
          declined_by_profile_id?: string | null
          expires_at?: string
          id?: string
          initiator_profile_id?: string | null
          initiator_role?: string
          profile_a_id: string
          profile_b_id: string
          reason: string
          shared_context?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_by_a_at?: string | null
          accepted_by_b_at?: string | null
          circle_id?: string | null
          created_at?: string
          declined_by_profile_id?: string | null
          expires_at?: string
          id?: string
          initiator_profile_id?: string | null
          initiator_role?: string
          profile_a_id?: string
          profile_b_id?: string
          reason?: string
          shared_context?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warm_introductions_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_location_features"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "warm_introductions_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warm_introductions_declined_by_profile_id_fkey"
            columns: ["declined_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "warm_introductions_declined_by_profile_id_fkey"
            columns: ["declined_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warm_introductions_initiator_profile_id_fkey"
            columns: ["initiator_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "warm_introductions_initiator_profile_id_fkey"
            columns: ["initiator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warm_introductions_profile_a_id_fkey"
            columns: ["profile_a_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "warm_introductions_profile_a_id_fkey"
            columns: ["profile_a_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warm_introductions_profile_b_id_fkey"
            columns: ["profile_b_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "warm_introductions_profile_b_id_fkey"
            columns: ["profile_b_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      circle_location_features: {
        Row: {
          active_this_week_count: number | null
          archived_at: string | null
          audience_tags: string[] | null
          category: string | null
          circle_id: string | null
          circle_type: string | null
          city: string | null
          city_key: string | null
          country_code: string | null
          country_key: string | null
          country_name: string | null
          cover_image_url: string | null
          created_at: string | null
          created_by_profile_id: string | null
          culture_tags: string[] | null
          description: string | null
          diaspora_tags: string[] | null
          faith_tags: string[] | null
          gathering_count: number | null
          icon_url: string | null
          image_path: string | null
          image_updated_at: string | null
          interest_tags: string[] | null
          is_featured: boolean | null
          is_official: boolean | null
          is_partner: boolean | null
          member_count: number | null
          name: string | null
          normalized_country_code: string | null
          region: string | null
          region_key: string | null
          requires_join_approval: boolean | null
          short_description: string | null
          slug: string | null
          status: string | null
          visibility: string | null
          visibility_scope: string | null
        }
        Insert: {
          active_this_week_count?: number | null
          archived_at?: string | null
          audience_tags?: string[] | null
          category?: string | null
          circle_id?: string | null
          circle_type?: string | null
          city?: string | null
          city_key?: never
          country_code?: string | null
          country_key?: never
          country_name?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          culture_tags?: string[] | null
          description?: string | null
          diaspora_tags?: string[] | null
          faith_tags?: string[] | null
          gathering_count?: number | null
          icon_url?: string | null
          image_path?: string | null
          image_updated_at?: string | null
          interest_tags?: string[] | null
          is_featured?: boolean | null
          is_official?: boolean | null
          is_partner?: boolean | null
          member_count?: number | null
          name?: string | null
          normalized_country_code?: never
          region?: string | null
          region_key?: never
          requires_join_approval?: boolean | null
          short_description?: string | null
          slug?: string | null
          status?: string | null
          visibility?: string | null
          visibility_scope?: string | null
        }
        Update: {
          active_this_week_count?: number | null
          archived_at?: string | null
          audience_tags?: string[] | null
          category?: string | null
          circle_id?: string | null
          circle_type?: string | null
          city?: string | null
          city_key?: never
          country_code?: string | null
          country_key?: never
          country_name?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          culture_tags?: string[] | null
          description?: string | null
          diaspora_tags?: string[] | null
          faith_tags?: string[] | null
          gathering_count?: number | null
          icon_url?: string | null
          image_path?: string | null
          image_updated_at?: string | null
          interest_tags?: string[] | null
          is_featured?: boolean | null
          is_official?: boolean | null
          is_partner?: boolean | null
          member_count?: number | null
          name?: string | null
          normalized_country_code?: never
          region?: string | null
          region_key?: never
          requires_join_approval?: boolean | null
          short_description?: string | null
          slug?: string | null
          status?: string | null
          visibility?: string | null
          visibility_scope?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "circles_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_location_features"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "circles_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      profile_location_features: {
        Row: {
          city: string | null
          city_key: string | null
          country_code: string | null
          country_key: string | null
          current_country: string | null
          current_country_code: string | null
          is_abroad: boolean | null
          profile_id: string | null
          region: string | null
          region_key: string | null
          user_id: string | null
        }
        Insert: {
          city?: string | null
          city_key?: never
          country_code?: never
          country_key?: never
          current_country?: string | null
          current_country_code?: string | null
          is_abroad?: never
          profile_id?: string | null
          region?: string | null
          region_key?: never
          user_id?: string | null
        }
        Update: {
          city?: string | null
          city_key?: never
          country_code?: never
          country_key?: never
          current_country?: string | null
          current_country_code?: string | null
          is_abroad?: never
          profile_id?: string | null
          region?: string | null
          region_key?: never
          user_id?: string | null
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
      apply_profile_country_lock_policy: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      backfill_profile_country_codes: {
        Args: { p_profile_ids?: string[] }
        Returns: number
      }
      backfill_profile_ghana_locality_promotions: {
        Args: { p_profile_ids?: string[] }
        Returns: number
      }
      backfill_profile_location_labels: {
        Args: { p_profile_ids?: string[] }
        Returns: number
      }
      backfill_profile_region_city_promotions: {
        Args: { p_profile_ids?: string[] }
        Returns: number
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
      can_access_chat_storage_object: {
        Args: { p_bucket_id: string; p_object_name: string; p_user_id?: string }
        Returns: boolean
      }
      can_create_live_context: {
        Args: {
          p_circle_id?: string
          p_context_type: string
          p_gathering_id?: string
          p_user_id?: string
        }
        Returns: boolean
      }
      can_invite_to_circle: {
        Args: { p_circle_id: string; p_user_id: string }
        Returns: boolean
      }
      can_manage_circle_pulse: {
        Args: { p_circle_id: string; p_user_id: string }
        Returns: boolean
      }
      can_post_moment: { Args: { p_user_id?: string }; Returns: boolean }
      can_users_chat: {
        Args: { p_receiver_user_id: string; p_sender_user_id: string }
        Returns: boolean
      }
      can_view_live_session: {
        Args: { p_session_id: string; p_user_id?: string }
        Returns: boolean
      }
      can_view_moment: { Args: { p_moment_id: string }; Returns: boolean }
      circle_pulse_comment_reaction_summary_json: {
        Args: { p_comment_id: string }
        Returns: Json
      }
      clean_expired_distance_cache: { Args: never; Returns: number }
      cleanup_live_ephemeral_activity: { Args: never; Returns: Json }
      cleanup_live_match_rounds: { Args: never; Returns: number }
      cleanup_live_private_sparks: { Args: never; Returns: number }
      cleanup_live_stale_participants: { Args: never; Returns: Json }
      cleanup_phone_verifications_orphans: { Args: never; Returns: undefined }
      cleanup_stale_circle_love_seats: {
        Args: { p_circle_id?: string }
        Returns: number
      }
      compute_location_affinities: {
        Args: { p_candidate_profile_ids: string[]; p_viewer_profile_id: string }
        Returns: {
          long_text: string
          profile_id: string
          reason_code: string
          short_text: string
          strength: number
        }[]
      }
      compute_location_affinity: {
        Args: { p_candidate_profile_id: string; p_viewer_profile_id: string }
        Returns: {
          long_text: string
          reason_code: string
          short_text: string
          strength: number
        }[]
      }
      configure_chat_attachment_retention_worker: {
        Args: { p_cron_secret: string; p_endpoint: string }
        Returns: boolean
      }
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
          attachment_set_hash: string | null
          attachment_state: string
          attachment_state_version: number
          audio_duration: number | null
          audio_path: string | null
          audio_waveform: Json | null
          client_message_id: string | null
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
          media_caption: string | null
          media_expected_count: number | null
          media_group_id: string | null
          media_items: Json
          media_kind: string | null
          message_type: string
          read_at: string | null
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
      enqueue_circle_pulse_push: {
        Args: {
          p_actor_user_id: string
          p_body: string
          p_data: Json
          p_pref_kind: string
          p_target_user_id: string
          p_title: string
        }
        Returns: boolean
      }
      enqueue_vibes_v4_metric_refresh: {
        Args: {
          p_profile_id: string
          p_quality_dirty?: boolean
          p_reason?: string
          p_viewer_behavior_dirty?: boolean
          p_visibility_dirty?: boolean
        }
        Returns: undefined
      }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      estimate_vibes_distance_km: {
        Args: {
          p_distance_km: number
          p_same_city: boolean
          p_same_country: boolean
          p_same_region: boolean
        }
        Returns: number
      }
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
      get_circle_location_affinities: {
        Args: { p_circle_ids: string[]; p_profile_id: string; p_scope?: string }
        Returns: {
          circle_id: string
          reason_code: string
          short_text: string
          strength: number
        }[]
      }
      get_circle_location_affinity: {
        Args: { p_circle_id: string; p_profile_id: string; p_scope?: string }
        Returns: {
          reason_code: string
          short_text: string
          strength: number
        }[]
      }
      get_circle_pulse_comment_projection: {
        Args: {
          p_comment_id: string
          p_viewer_profile_id: string
          p_viewer_user_id: string
        }
        Returns: {
          avatar_url: string
          body: string
          can_edit: boolean
          can_pin: boolean
          can_remove: boolean
          circle_id: string
          created_at: string
          display_name: string
          edited_at: string
          id: string
          is_own: boolean
          my_reaction: string
          parent_comment_id: string
          pinned_at: string
          profile_id: string
          pulse_item_id: string
          reaction_count: number
          reaction_summary: Json
          reply_preview_body: string
          reply_preview_display_name: string
          reply_preview_profile_id: string
          report_count: number
          updated_at: string
        }[]
      }
      get_global_locality: {
        Args: { p_geoname_id: number }
        Returns: {
          admin1_code: string
          admin1_name: string
          country_code: string
          country_name: string
          feature_code: string
          geoname_id: number
          latitude: number
          longitude: number
          name: string
          population: number
          provider: string
          timezone: string
        }[]
      }
      get_moment_relationship_cue: {
        Args: { p_peer_profile_id: string; p_profile_id: string }
        Returns: string
      }
      get_my_country_verification_status: { Args: never; Returns: Json }
      get_nearby_users: {
        Args: { p_limit?: number; p_radius_km?: number; p_user_id: string }
        Returns: {
          distance_km: number
          user_id: string
        }[]
      }
      get_ranked_circles_for_profile: {
        Args: { p_limit?: number; p_profile_id: string; p_scope?: string }
        Returns: {
          active_this_week_count: number
          archived_at: string
          audience_tags: string[]
          category: string
          circle_type: string
          city: string
          country_code: string
          country_name: string
          cover_image_url: string
          created_by_profile_id: string
          culture_tags: string[]
          description: string
          diaspora_tags: string[]
          faith_tags: string[]
          gathering_count: number
          icon_url: string
          id: string
          image_path: string
          image_updated_at: string
          interest_tags: string[]
          is_featured: boolean
          is_official: boolean
          is_partner: boolean
          location_insight: string
          member_count: number
          name: string
          region: string
          relevance_score: number
          requires_join_approval: boolean
          short_description: string
          slug: string
          status: string
          visibility: string
          visibility_scope: string
        }[]
      }
      get_recs_active: {
        Args: { p_user_id: string; p_window_minutes?: number }
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
      get_recs_active_scored: {
        Args: { p_user_id: string; p_window_minutes?: number }
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
          location_affinity_reason_code: string
          location_affinity_short_text: string
          location_affinity_strength: number
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
          location_affinity_reason_code: string
          location_affinity_short_text: string
          location_affinity_strength: number
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
          location_affinity_reason_code: string
          location_affinity_short_text: string
          location_affinity_strength: number
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
      get_subscription_badge_plan: {
        Args: { p_include_sandbox_preview?: boolean; p_user_id?: string }
        Returns: Database["public"]["Enums"]["subscription_type"]
      }
      get_vibes_recommendations_v2: {
        Args: {
          p_active_window_minutes?: number
          p_limit?: number
          p_segment?: string
          p_user_id: string
        }
        Returns: {
          age: number
          ai_score: number
          avatar_url: string
          bio: string
          city: string
          current_country: string
          current_country_code: string
          distance_km: number
          full_name: string
          id: string
          is_active: boolean
          last_active: string
          latitude: number
          location: string
          location_precision: string
          longitude: number
          online: boolean
          personality_type: string
          profile_video: string
          recommendation_reasons: Json
          region: string
          religion: string
          tribe: string
          user_id: string
          verification_level: number
          verified: boolean
        }[]
      }
      get_vibes_recommendations_v3: {
        Args: {
          p_active_window_minutes?: number
          p_limit?: number
          p_segment?: string
          p_user_id: string
        }
        Returns: {
          age: number
          ai_score: number
          avatar_url: string
          bio: string
          city: string
          current_country: string
          current_country_code: string
          distance_km: number
          full_name: string
          id: string
          is_active: boolean
          last_active: string
          latitude: number
          location: string
          location_precision: string
          longitude: number
          online: boolean
          personality_type: string
          profile_video: string
          recommendation_reasons: Json
          region: string
          religion: string
          tribe: string
          user_id: string
          verification_level: number
          verified: boolean
        }[]
      }
      get_vibes_recommendations_v3_private: {
        Args: {
          p_active_window_minutes?: number
          p_limit?: number
          p_segment?: string
          p_user_id: string
        }
        Returns: {
          age: number
          ai_score: number
          avatar_url: string
          bio: string
          city: string
          current_country: string
          current_country_code: string
          distance_km: number
          full_name: string
          id: string
          is_active: boolean
          last_active: string
          latitude: number
          location: string
          location_precision: string
          longitude: number
          online: boolean
          personality_type: string
          profile_video: string
          recommendation_reasons: Json
          region: string
          religion: string
          tribe: string
          user_id: string
          verification_level: number
          verified: boolean
        }[]
      }
      get_vibes_recommendations_v5: {
        Args: {
          p_active_window_minutes?: number
          p_limit?: number
          p_segment?: string
          p_user_id: string
        }
        Returns: {
          age: number
          ai_score: number
          avatar_url: string
          bio: string
          city: string
          current_country: string
          current_country_code: string
          distance_km: number
          full_name: string
          id: string
          is_active: boolean
          last_active: string
          latitude: number
          location: string
          location_precision: string
          longitude: number
          online: boolean
          personality_type: string
          profile_video: string
          recommendation_reasons: Json
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
      has_gold_entitlement: {
        Args: { p_profile_id?: string; p_user_id?: string }
        Returns: boolean
      }
      has_live_capability: {
        Args: { p_capability: string; p_session_id: string; p_user_id?: string }
        Returns: boolean
      }
      has_usable_vibes_coordinates: {
        Args: { p_latitude: number; p_longitude: number }
        Returns: boolean
      }
      infer_vibes_location_coordinates: {
        Args: {
          p_city: string
          p_country: string
          p_country_code: string
          p_region: string
        }
        Returns: {
          latitude: number
          longitude: number
        }[]
      }
      invoke_chat_attachment_retention_worker: { Args: never; Returns: number }
      is_admin_user: { Args: { p_user_id?: string }; Returns: boolean }
      is_chat_attachment_object_mutable: {
        Args: {
          p_bucket_id: string
          p_sender_id: string
          p_storage_path: string
        }
        Returns: boolean
      }
      is_circle_host: {
        Args: { p_circle_id: string; p_profile_id: string }
        Returns: boolean
      }
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
      is_trusted_boost_viewer: {
        Args: { p_target_profile_id?: string; p_viewer_profile_id: string }
        Returns: boolean
      }
      live_active_profile: {
        Args: { p_user_id?: string }
        Returns: {
          account_state: string
          account_state_updated_at: string
          age: number | null
          age_preference_confirmed_at: string | null
          ai_score: number | null
          ai_score_updated_at: string | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          country_lock_policy: string
          country_verification_started_at: string | null
          country_verification_target_code: string | null
          country_verified_at: string | null
          created_at: string
          created_via_provider: string | null
          current_country: string | null
          current_country_code: string | null
          deleted_at: string | null
          discoverable_in_vibes: boolean
          drinking: string | null
          duplicate_of_user_id: string | null
          education: string | null
          exercise_frequency: string | null
          full_name: string | null
          future_ghana_plans: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          has_children: string | null
          height: string | null
          hero_image_url: string | null
          id: string
          identity_disabled_at: string | null
          identity_finalized_at: string | null
          identity_resolution_reason: string | null
          identity_status: string
          identity_status_updated_at: string
          is_active: boolean
          languages_spoken: string[] | null
          last_active: string | null
          last_ghana_visit: string | null
          last_successful_auth_provider: string | null
          latitude: number | null
          living_situation: string | null
          locality_admin1_code: string | null
          locality_district: string | null
          locality_geoname_id: number | null
          locality_provider: string | null
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
          onboarding_completed_at: string | null
          onboarding_step: number
          onboarding_variant: string | null
          online: boolean
          origin_country: string | null
          origin_country_code: string | null
          origin_country_source: string
          pause_reason: string | null
          paused_at: string | null
          personality_type: string | null
          pets: string | null
          phone_number: string | null
          phone_verification_score: number | null
          phone_verified: boolean | null
          phone_verified_at: string | null
          photos: string[] | null
          profile_completed: boolean
          profile_video: string | null
          public_key: string | null
          recovered_to_user_id: string | null
          region: string | null
          relationship_compass: Json
          religion: Database["public"]["Enums"]["religion"] | null
          roots: string[] | null
          roots_locality: string | null
          roots_locality_geoname_id: number | null
          roots_note: string | null
          roots_region: string | null
          roots_visibility: string
          search_name: string | null
          smoking: string | null
          superlikes_left: number
          superlikes_reset_at: string | null
          tribe: string | null
          updated_at: string
          user_id: string
          username: string | null
          verification_level: number | null
          verification_refresh_reason: string | null
          verification_refresh_requested_at: string | null
          verification_refresh_requested_by: string | null
          verification_refresh_required: boolean
          verification_refresh_resolved_at: string | null
          verification_refresh_target_level: number | null
          verification_refresh_user_notified: boolean
          vibes_practice_completed_at: string | null
          vibes_practice_completed_version: number
          wants_children: string | null
          years_in_diaspora: number | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      live_audience_poll_json: {
        Args: { p_poll_id: string; p_user_id?: string }
        Returns: Json
      }
      live_build_connection_signals: {
        Args: { p_profile_a: string; p_profile_b: string }
        Returns: Json
      }
      live_build_conversation_spark: {
        Args: { p_profile_a: string; p_profile_b: string }
        Returns: Json
      }
      live_chemistry_private_projection: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      live_chemistry_profile_context: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      live_hosted_matching_snapshot: {
        Args: { p_session_id: string }
        Returns: Json
      }
      live_match_pair_is_eligible: {
        Args: { p_session_id: string; p_user_a: string; p_user_b: string }
        Returns: boolean
      }
      live_private_spark_projection: {
        Args: { p_spark_id: string }
        Returns: Json
      }
      live_profile_avatar: {
        Args: { p_profile: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: string
      }
      live_quick_connect_host_snapshot: {
        Args: { p_requesting_user_id: string; p_session_id: string }
        Returns: Json
      }
      live_quick_connect_pair_is_eligible: {
        Args: { p_session_id: string; p_user_a: string; p_user_b: string }
        Returns: boolean
      }
      live_quick_connect_sync: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      live_role_capabilities: { Args: { p_role: string }; Returns: string[] }
      longtransactionsenabled: { Args: never; Returns: boolean }
      normalize_location_key: { Args: { p_value: string }; Returns: string }
      normalize_vibes_country_code: {
        Args: { p_country: string; p_country_code: string }
        Returns: string
      }
      normalize_vibes_country_name: {
        Args: { p_country: string; p_country_code: string }
        Returns: string
      }
      normalize_vibes_v5_intention: {
        Args: { p_value: string }
        Returns: string
      }
      notify_internal_admin_queue_item: {
        Args: {
          p_metadata?: Json
          p_queue_type: string
          p_record_id: string
          p_text: string
        }
        Returns: undefined
      }
      notify_profile_gift_sender_moment: {
        Args: { p_gift_id: string; p_moment: string }
        Returns: boolean
      }
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
      profile_interest_level: {
        Args: { p_interest_score: number }
        Returns: string
      }
      profile_interest_score: {
        Args: {
          p_full_open_count?: number
          p_intent_open_count?: number
          p_intro_watch_count?: number
          p_profile_open_count?: number
          p_profile_save_count?: number
          p_repeat_visit_count?: number
        }
        Returns: number
      }
      record_profile_country_verification_observation: {
        Args: {
          p_accuracy_meters: number
          p_city?: string
          p_country_code: string
          p_country_name: string
          p_device_integrity?: string
          p_latitude: number
          p_longitude: number
          p_mocked: boolean
          p_provider?: string
          p_region?: string
          p_user_id: string
        }
        Returns: Json
      }
      refresh_chat_conversation_summary: {
        Args: { p_owner_user_id: string; p_peer_user_id: string }
        Returns: undefined
      }
      refresh_chat_conversation_summary_unchecked: {
        Args: { p_owner_user_id: string; p_peer_user_id: string }
        Returns: undefined
      }
      refresh_chat_message_media_items: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      refresh_profile_recommendation_quality_metrics: {
        Args: { p_profile_ids?: string[] }
        Returns: number
      }
      refresh_profile_visibility_entitlements: {
        Args: { p_profile_ids?: string[] }
        Returns: number
      }
      refresh_vibes_v5_viewer_taste: {
        Args: { p_viewer_profile_id: string }
        Returns: number
      }
      refresh_viewer_profile_behavior_summary: {
        Args: { p_target_profile_ids?: string[]; p_viewer_profile_id: string }
        Returns: number
      }
      reset_daily_superlikes: { Args: never; Returns: undefined }
      resolve_live_capabilities: {
        Args: { p_session_id: string; p_user_id?: string }
        Returns: string[]
      }
      rpc_abandon_stale_chat_attachment_finalizations: {
        Args: { p_limit?: number }
        Returns: number
      }
      rpc_accept_date_plan: {
        Args: { p_plan_id: string }
        Returns: {
          concierge_requested: boolean
          plan_id: string
          status: string
        }[]
      }
      rpc_ack_verification_refresh: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      rpc_ack_verification_request: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      rpc_acknowledge_messages_delivered: {
        Args: { p_message_id?: string; p_peer_user_id?: string }
        Returns: number
      }
      rpc_admin_clear_verification_refresh: {
        Args: { p_profile_id: string }
        Returns: boolean
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
      rpc_admin_get_circles_queue: {
        Args: never
        Returns: {
          active_this_week_count: number
          approved_at: string | null
          approved_by_admin_id: string | null
          archived_at: string | null
          audience_tags: string[]
          category: string | null
          circle_type: string
          city: string | null
          country_code: string | null
          country_name: string | null
          cover_image_url: string | null
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          culture_tags: string[]
          description: string | null
          diaspora_tags: string[]
          faith_tags: string[]
          gathering_count: number
          host_note: string | null
          host_note_updated_at: string | null
          host_note_updated_by_profile_id: string | null
          icon_url: string | null
          id: string
          image_path: string | null
          image_updated_at: string | null
          interest_tags: string[]
          is_featured: boolean
          is_official: boolean
          is_partner: boolean
          latitude: number | null
          longitude: number | null
          member_count: number
          name: string
          region: string | null
          rejected_reason: string | null
          report_count: number
          requires_join_approval: boolean
          rules: string | null
          safety_note: string | null
          short_description: string | null
          slug: string | null
          status: string
          updated_at: string
          visibility: string
          visibility_scope: string
        }[]
        SetofOptions: {
          from: "*"
          to: "circles"
          isOneToOne: false
          isSetofReturn: true
        }
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
      rpc_admin_get_gatherings_queue: {
        Args: never
        Returns: {
          address_visibility: string
          approved_at: string | null
          approved_by_admin_id: string | null
          attendee_count: number
          cancelled_at: string | null
          circle_id: string | null
          city: string | null
          country_code: string | null
          country_name: string | null
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          description: string | null
          ends_at: string | null
          featured_profile_id: string | null
          gathering_type: string
          host_created_for_member: boolean
          id: string
          is_official: boolean
          is_partner_venue: boolean
          latitude: number | null
          longitude: number | null
          max_attendees: number | null
          online_url: string | null
          platform: string | null
          poster_url: string | null
          presentation_mode: string
          region: string | null
          rejected_reason: string | null
          safe_first_date_space: boolean
          safety_note: string | null
          seat_context: string | null
          slug: string | null
          starts_at: string
          status: string
          tags: string[]
          timezone: string | null
          title: string
          updated_at: string
          venue_address: string | null
          venue_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "gatherings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_admin_get_relationship_gists: {
        Args: never
        Returns: {
          audience_tags: string[]
          body: string
          circle_id: string | null
          city: string | null
          country_code: string | null
          created_at: string
          created_by_admin_id: string | null
          created_by_profile_id: string | null
          culture_tags: string[]
          faith_tags: string[]
          id: string
          perspective: string
          published_at: string | null
          relationship_intent_tags: string[]
          scheduled_for: string | null
          short_body: string | null
          status: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "relationship_gists"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_admin_get_reports_queue: {
        Args: never
        Returns: {
          created_at: string
          evidence: Json
          evidence_message_created_at: string
          evidence_message_id: string
          evidence_message_sender_id: string
          evidence_message_text: string
          evidence_message_type: string
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
          auto_verification_data: Json
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
          verification_refresh_reason: string
          verification_refresh_requested_at: string
          verification_refresh_required: boolean
          verification_refresh_target_level: number
          verification_type: string
        }[]
      }
      rpc_admin_get_warm_introductions: {
        Args: never
        Returns: {
          accepted_by_a_at: string | null
          accepted_by_b_at: string | null
          circle_id: string | null
          created_at: string
          declined_by_profile_id: string | null
          expires_at: string
          id: string
          initiator_profile_id: string | null
          initiator_role: string
          profile_a_id: string
          profile_b_id: string
          reason: string
          shared_context: string[]
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "warm_introductions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_admin_preview_account_merge_case: {
        Args: { p_case_id: string }
        Returns: Json
      }
      rpc_admin_request_verification_refresh: {
        Args: {
          p_profile_id: string
          p_reason?: string
          p_target_level?: number
        }
        Returns: boolean
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
      rpc_answer_circle_prompt: {
        Args: { p_prompt_id: string; p_response: string }
        Returns: {
          circle_id: string | null
          created_at: string
          id: string
          is_deleted: boolean
          profile_id: string
          prompt_id: string
          reaction_count: number
          response: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "circle_prompt_responses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_append_chat_album_attachment: {
        Args: {
          p_attachment_id: string
          p_attachment_index: number
          p_bucket_id: string
          p_byte_size?: number
          p_client_message_id: string
          p_expected_count: number
          p_height?: number
          p_mime_type: string
          p_original_name: string
          p_receiver_id: string
          p_sender_id: string
          p_sha256?: string
          p_storage_path: string
          p_validation_details?: Json
          p_width?: number
        }
        Returns: {
          attachment_set_hash: string | null
          attachment_state: string
          attachment_state_version: number
          audio_duration: number | null
          audio_path: string | null
          audio_waveform: Json | null
          client_message_id: string | null
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
          media_caption: string | null
          media_expected_count: number | null
          media_group_id: string | null
          media_items: Json
          media_kind: string | null
          message_type: string
          read_at: string | null
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
      rpc_approve_circle: {
        Args: { p_circle_id: string }
        Returns: {
          active_this_week_count: number
          approved_at: string | null
          approved_by_admin_id: string | null
          archived_at: string | null
          audience_tags: string[]
          category: string | null
          circle_type: string
          city: string | null
          country_code: string | null
          country_name: string | null
          cover_image_url: string | null
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          culture_tags: string[]
          description: string | null
          diaspora_tags: string[]
          faith_tags: string[]
          gathering_count: number
          host_note: string | null
          host_note_updated_at: string | null
          host_note_updated_by_profile_id: string | null
          icon_url: string | null
          id: string
          image_path: string | null
          image_updated_at: string | null
          interest_tags: string[]
          is_featured: boolean
          is_official: boolean
          is_partner: boolean
          latitude: number | null
          longitude: number | null
          member_count: number
          name: string
          region: string | null
          rejected_reason: string | null
          report_count: number
          requires_join_approval: boolean
          rules: string | null
          safety_note: string | null
          short_description: string | null
          slug: string | null
          status: string
          updated_at: string
          visibility: string
          visibility_scope: string
        }
        SetofOptions: {
          from: "*"
          to: "circles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_approve_circle_member: {
        Args: { p_circle_id: string; p_member_id: string; p_profile_id: string }
        Returns: boolean
      }
      rpc_approve_gathering: {
        Args: { p_gathering_id: string }
        Returns: {
          address_visibility: string
          approved_at: string | null
          approved_by_admin_id: string | null
          attendee_count: number
          cancelled_at: string | null
          circle_id: string | null
          city: string | null
          country_code: string | null
          country_name: string | null
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          description: string | null
          ends_at: string | null
          featured_profile_id: string | null
          gathering_type: string
          host_created_for_member: boolean
          id: string
          is_official: boolean
          is_partner_venue: boolean
          latitude: number | null
          longitude: number | null
          max_attendees: number | null
          online_url: string | null
          platform: string | null
          poster_url: string | null
          presentation_mode: string
          region: string | null
          rejected_reason: string | null
          safe_first_date_space: boolean
          safety_note: string | null
          seat_context: string | null
          slug: string | null
          starts_at: string
          status: string
          tags: string[]
          timezone: string | null
          title: string
          updated_at: string
          venue_address: string | null
          venue_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gatherings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_archive_circle_pulse_item: {
        Args: { p_actor_profile_id: string; p_item_id: string }
        Returns: boolean
      }
      rpc_archive_owned_circle: {
        Args: { p_actor_profile_id: string; p_circle_id: string }
        Returns: boolean
      }
      rpc_archive_profile_gift: { Args: { p_gift_id: string }; Returns: Json }
      rpc_archive_relationship_gist_editorial: {
        Args: { p_actor_profile_id: string; p_gist_id: string }
        Returns: boolean
      }
      rpc_attend_gathering: {
        Args: {
          p_gathering_id: string
          p_status?: string
          p_visible_to_others?: boolean
        }
        Returns: {
          checked_in_at: string | null
          created_at: string
          gathering_id: string
          id: string
          profile_id: string
          status: string
          updated_at: string
          user_id: string | null
          visible_to_others: boolean
        }
        SetofOptions: {
          from: "*"
          to: "gathering_attendees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_backfill_swipe_likes_into_intent_requests: {
        Args: { p_days?: number; p_limit?: number }
        Returns: number
      }
      rpc_bump_live_rtc_token_rate_limit: {
        Args: { p_session_id: string }
        Returns: {
          allowed: boolean
          current_count: number
          window_bucket_out: number
        }[]
      }
      rpc_can_schedule_live_session: { Args: never; Returns: boolean }
      rpc_cancel_chat_attachment_batch: {
        Args: {
          p_attachments: Json
          p_client_message_id: string
          p_receiver_id: string
          p_sender_id: string
        }
        Returns: boolean
      }
      rpc_cancel_chat_media_album_item: {
        Args: {
          p_attachment_id: string
          p_client_message_id: string
          p_receiver_id: string
          p_sender_id: string
        }
        Returns: Json
      }
      rpc_cancel_circle_invitation: {
        Args: { p_actor_profile_id: string; p_invitation_id: string }
        Returns: boolean
      }
      rpc_cancel_circle_love_seat_nomination: {
        Args: { p_actor_profile_id: string; p_love_seat_id: string }
        Returns: boolean
      }
      rpc_cancel_circle_role_request: {
        Args: { p_profile_id: string; p_request_id: string }
        Returns: {
          circle_id: string
          created_at: string
          id: string
          note: string | null
          rejection_reason: string | null
          requested_role: string
          requester_profile_id: string
          requester_user_id: string | null
          reviewed_at: string | null
          reviewed_by_profile_id: string | null
          reviewed_by_user_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "circle_role_requests"
          isOneToOne: true
          isSetofReturn: false
        }
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
      rpc_cancel_my_verification_request: {
        Args: { p_cancel_reason?: string; p_request_id: string }
        Returns: boolean
      }
      rpc_cancel_signal: { Args: { p_signal_id: string }; Returns: string }
      rpc_claim_chat_attachment_cleanup: {
        Args: { p_limit?: number }
        Returns: {
          attachment_id: string
          bucket_id: string
          queue_id: number
          reason: string
          storage_path: string
        }[]
      }
      rpc_claim_chat_attachment_finalization: {
        Args: {
          p_client_message_id: string
          p_request_payload: Json
          p_sender_id: string
        }
        Returns: string
      }
      rpc_claim_verification_evidence_retention: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          bucket_id: string
          object_path: string
          request_id: string
        }[]
      }
      rpc_claim_view_once_attachment: {
        Args: { p_message_id: string }
        Returns: {
          attachment_id: string
          attachment_type: string
          bucket_id: string
          byte_size: number
          encrypted_key_nonce: string
          encrypted_key_receiver: string
          encrypted_media_alg: string
          encrypted_media_nonce: string
          mime_type: string
          sender_public_key: string
          storage_path: string
        }[]
      }
      rpc_clear_signin_provider_disconnected: {
        Args: { p_provider: string }
        Returns: boolean
      }
      rpc_close_live_audience_poll: {
        Args: { p_poll_id: string }
        Returns: Json
      }
      rpc_complete_view_once_attachment: {
        Args: { p_message_id: string }
        Returns: {
          attachment_id: string
          consumed_at: string
        }[]
      }
      rpc_configure_live_quick_connect: {
        Args: {
          p_creator_mode: string
          p_round_seconds: number
          p_session_id: string
        }
        Returns: Json
      }
      rpc_control_live_quick_connect: {
        Args: { p_action: string; p_session_id: string }
        Returns: Json
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
      rpc_create_circle_prompt: {
        Args: {
          p_circle_id: string
          p_expires_at?: string
          p_prompt: string
          p_prompt_type?: string
          p_title: string
        }
        Returns: {
          circle_id: string | null
          created_at: string
          created_by_admin_id: string | null
          created_by_profile_id: string | null
          expires_at: string | null
          id: string
          prompt: string
          prompt_type: string
          starts_at: string | null
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "circle_prompts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_circle_pulse_comment: {
        Args: {
          p_body: string
          p_parent_comment_id?: string
          p_profile_id: string
          p_pulse_item_id: string
        }
        Returns: {
          avatar_url: string
          body: string
          can_edit: boolean
          can_pin: boolean
          can_remove: boolean
          circle_id: string
          created_at: string
          display_name: string
          edited_at: string
          id: string
          is_own: boolean
          my_reaction: string
          parent_comment_id: string
          pinned_at: string
          profile_id: string
          pulse_item_id: string
          reaction_count: number
          reaction_summary: Json
          reply_preview_body: string
          reply_preview_display_name: string
          reply_preview_profile_id: string
          report_count: number
          updated_at: string
        }[]
      }
      rpc_create_circle_relationship_gist: {
        Args: {
          p_actor_profile_id: string
          p_body: string
          p_circle_id: string
          p_perspective?: string
          p_short_body: string
          p_title: string
        }
        Returns: {
          audience_tags: string[]
          body: string
          circle_id: string | null
          city: string | null
          country_code: string | null
          created_at: string
          created_by_admin_id: string | null
          created_by_profile_id: string | null
          culture_tags: string[]
          faith_tags: string[]
          id: string
          perspective: string
          published_at: string | null
          relationship_intent_tags: string[]
          scheduled_for: string | null
          short_body: string | null
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "relationship_gists"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_circle_request: {
        Args: {
          p_audience_tags?: string[]
          p_circle_type?: string
          p_city?: string
          p_country_code?: string
          p_country_name?: string
          p_culture_tags?: string[]
          p_description?: string
          p_diaspora_tags?: string[]
          p_faith_tags?: string[]
          p_interest_tags?: string[]
          p_name: string
          p_region?: string
          p_requires_join_approval?: boolean
          p_rules?: string
          p_short_description?: string
          p_visibility_scope?: string
        }
        Returns: {
          active_this_week_count: number
          approved_at: string | null
          approved_by_admin_id: string | null
          archived_at: string | null
          audience_tags: string[]
          category: string | null
          circle_type: string
          city: string | null
          country_code: string | null
          country_name: string | null
          cover_image_url: string | null
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          culture_tags: string[]
          description: string | null
          diaspora_tags: string[]
          faith_tags: string[]
          gathering_count: number
          host_note: string | null
          host_note_updated_at: string | null
          host_note_updated_by_profile_id: string | null
          icon_url: string | null
          id: string
          image_path: string | null
          image_updated_at: string | null
          interest_tags: string[]
          is_featured: boolean
          is_official: boolean
          is_partner: boolean
          latitude: number | null
          longitude: number | null
          member_count: number
          name: string
          region: string | null
          rejected_reason: string | null
          report_count: number
          requires_join_approval: boolean
          rules: string | null
          safety_note: string | null
          short_description: string | null
          slug: string | null
          status: string
          updated_at: string
          visibility: string
          visibility_scope: string
        }
        SetofOptions: {
          from: "*"
          to: "circles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_gathering_request: {
        Args: {
          p_address_visibility?: string
          p_circle_id?: string
          p_city?: string
          p_country_code?: string
          p_country_name?: string
          p_description?: string
          p_ends_at?: string
          p_featured_profile_id?: string
          p_gathering_type?: string
          p_host_created_for_member?: boolean
          p_max_attendees?: number
          p_online_url?: string
          p_platform?: string
          p_poster_url?: string
          p_presentation_mode?: string
          p_region?: string
          p_safety_note?: string
          p_seat_context?: string
          p_starts_at?: string
          p_tags?: string[]
          p_timezone?: string
          p_title?: string
          p_venue_address?: string
          p_venue_name?: string
        }
        Returns: {
          address_visibility: string
          approved_at: string | null
          approved_by_admin_id: string | null
          attendee_count: number
          cancelled_at: string | null
          circle_id: string | null
          city: string | null
          country_code: string | null
          country_name: string | null
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          description: string | null
          ends_at: string | null
          featured_profile_id: string | null
          gathering_type: string
          host_created_for_member: boolean
          id: string
          is_official: boolean
          is_partner_venue: boolean
          latitude: number | null
          longitude: number | null
          max_attendees: number | null
          online_url: string | null
          platform: string | null
          poster_url: string | null
          presentation_mode: string
          region: string | null
          rejected_reason: string | null
          safe_first_date_space: boolean
          safety_note: string | null
          seat_context: string | null
          slug: string | null
          starts_at: string
          status: string
          tags: string[]
          timezone: string | null
          title: string
          updated_at: string
          venue_address: string | null
          venue_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gatherings"
          isOneToOne: true
          isSetofReturn: false
        }
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
      rpc_create_live_comment: {
        Args: {
          p_body: string
          p_client_comment_id: string
          p_session_id: string
        }
        Returns: {
          body: string
          client_comment_id: string
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by_user_id: string | null
          profile_id: string
          session_id: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "live_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_live_match_round: {
        Args: {
          p_client_proposal_id: string
          p_participant_a_user_id: string
          p_participant_b_user_id: string
          p_session_id: string
        }
        Returns: Json
      }
      rpc_create_live_reaction: {
        Args: {
          p_client_event_id: string
          p_reaction: string
          p_session_id: string
        }
        Returns: {
          client_event_id: string
          created_at: string
          id: number
          profile_id: string
          reaction: string
          session_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "live_reactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_live_session: {
        Args: {
          p_circle_id?: string
          p_context_id?: string
          p_context_type?: string
          p_format?: string
          p_gathering_id?: string
          p_scheduled_start?: string
          p_title: string
        }
        Returns: {
          backstage_opened_at: string | null
          cancelled_at: string | null
          captions_enabled: boolean
          chemistry_first_enabled: boolean
          circle_id: string | null
          configuration: Json
          context_id: string | null
          context_type: string
          created_at: string
          created_by_profile_id: string
          created_by_user_id: string
          description: string | null
          ended_at: string | null
          format: string
          gathering_id: string | null
          id: string
          maximum_participants: number
          maximum_publishers: number
          minimum_participants: number
          provider: string
          provider_call_id: string
          provider_call_type: string
          quorum_reached_at: string | null
          recording_enabled: boolean
          scheduled_end: string | null
          scheduled_start: string | null
          stage_request_capacity: number
          stage_requests_open: boolean
          started_at: string | null
          status: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "live_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_media_moment: {
        Args: {
          p_caption?: string
          p_media_url: string
          p_metadata?: Json
          p_moment_id: string
          p_type: string
          p_visibility?: string
        }
        Returns: string
      }
      rpc_create_moment: {
        Args: {
          p_caption?: string
          p_metadata?: Json
          p_text_body?: string
          p_type: string
          p_visibility?: string
        }
        Returns: string
      }
      rpc_create_moment_comment:
        | {
            Args: { p_body: string; p_moment_id: string }
            Returns: {
              body: string
              created_at: string
              id: string
              is_deleted: boolean
              moment_id: string
              parent_comment_id: string | null
              user_id: string
            }
            SetofOptions: {
              from: "*"
              to: "moment_comments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_body: string
              p_moment_id: string
              p_parent_comment_id?: string
            }
            Returns: {
              body: string
              created_at: string
              id: string
              is_deleted: boolean
              moment_id: string
              parent_comment_id: string | null
              user_id: string
            }
            SetofOptions: {
              from: "*"
              to: "moment_comments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      rpc_create_profile_boost: { Args: never; Returns: Json }
      rpc_create_profile_boost_v2: {
        Args: {
          p_audience_mode?: string
          p_boost_type?: string
          p_focus_mode?: string
          p_metadata?: Json
        }
        Returns: Json
      }
      rpc_create_warm_introduction: {
        Args: {
          p_circle_id: string
          p_expires_at?: string
          p_profile_a_id: string
          p_profile_b_id: string
          p_reason: string
          p_shared_context?: string[]
        }
        Returns: {
          accepted_by_a_at: string | null
          accepted_by_b_at: string | null
          circle_id: string | null
          created_at: string
          declined_by_profile_id: string | null
          expires_at: string
          id: string
          initiator_profile_id: string | null
          initiator_role: string
          profile_a_id: string
          profile_b_id: string
          reason: string
          shared_context: string[]
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "warm_introductions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_debug_circle_member_moments: {
        Args: { p_circle_id: string }
        Returns: Json
      }
      rpc_debug_closure_to_clarity_pool: {
        Args: { p_intent_request_id: string }
        Returns: Json
      }
      rpc_debug_message_delivery_receipt: {
        Args: { p_message_id: string }
        Returns: Json
      }
      rpc_debug_vibes_recommendation_pool: {
        Args: { p_active_window_minutes?: number; p_profile_id: string }
        Returns: Json
      }
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
      rpc_delete_chat_message_for_everyone: {
        Args: { p_message_id: string }
        Returns: {
          bucket_id: string
          storage_path: string
        }[]
      }
      rpc_delete_circle_prompt: {
        Args: { p_circle_id: string; p_prompt_id: string }
        Returns: boolean
      }
      rpc_delete_circle_pulse_comment: {
        Args: { p_comment_id: string; p_profile_id: string }
        Returns: boolean
      }
      rpc_delete_circle_pulse_item: {
        Args: { p_actor_profile_id: string; p_item_id: string }
        Returns: boolean
      }
      rpc_delete_circle_relationship_gist: {
        Args: {
          p_actor_profile_id: string
          p_circle_id: string
          p_gist_id: string
        }
        Returns: boolean
      }
      rpc_delete_gathering_request: {
        Args: { p_gathering_id: string }
        Returns: boolean
      }
      rpc_delete_moment_comment: {
        Args: { p_comment_id: string }
        Returns: boolean
      }
      rpc_delete_owned_circle: {
        Args: { p_actor_profile_id: string; p_circle_id: string }
        Returns: boolean
      }
      rpc_end_circle_love_seat: {
        Args: { p_actor_profile_id: string; p_love_seat_id: string }
        Returns: boolean
      }
      rpc_end_live_private_spark: {
        Args: { p_private_spark_id: string; p_reason?: string }
        Returns: Json
      }
      rpc_fail_chat_attachment_cleanup: {
        Args: { p_error: string; p_queue_id: number }
        Returns: string
      }
      rpc_finalize_chat_attachment: {
        Args: {
          p_attachment_id: string
          p_attachment_type: string
          p_audio_waveform?: Json
          p_bucket_id: string
          p_byte_size?: number
          p_caption?: string
          p_client_message_id: string
          p_duration_ms?: number
          p_encrypted_key_nonce?: string
          p_encrypted_key_receiver?: string
          p_encrypted_key_sender?: string
          p_encrypted_media_alg?: string
          p_encrypted_media_nonce?: string
          p_height?: number
          p_is_view_once?: boolean
          p_mime_type: string
          p_original_name: string
          p_receiver_id: string
          p_reply_to_message_id?: string
          p_sender_id: string
          p_sender_public_key?: string
          p_sha256?: string
          p_storage_path: string
          p_validation_details?: Json
          p_width?: number
        }
        Returns: {
          attachment_set_hash: string | null
          attachment_state: string
          attachment_state_version: number
          audio_duration: number | null
          audio_path: string | null
          audio_waveform: Json | null
          client_message_id: string | null
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
          media_caption: string | null
          media_expected_count: number | null
          media_group_id: string | null
          media_items: Json
          media_kind: string | null
          message_type: string
          read_at: string | null
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
      rpc_finalize_chat_attachment_batch: {
        Args: {
          p_attachment_type: string
          p_attachments: Json
          p_caption?: string
          p_client_message_id: string
          p_expected_count: number
          p_receiver_id: string
          p_reply_to_message_id?: string
          p_sender_id: string
        }
        Returns: {
          attachment_set_hash: string | null
          attachment_state: string
          attachment_state_version: number
          audio_duration: number | null
          audio_path: string | null
          audio_waveform: Json | null
          client_message_id: string | null
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
          media_caption: string | null
          media_expected_count: number | null
          media_group_id: string | null
          media_items: Json
          media_kind: string | null
          message_type: string
          read_at: string | null
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
      rpc_finalize_chat_attachment_batch_v3: {
        Args: {
          p_attachment_type: string
          p_attachments: Json
          p_caption: string
          p_client_message_id: string
          p_expected_count: number
          p_receiver_id: string
          p_reply_to_message_id: string
          p_request_payload: Json
          p_sender_id: string
        }
        Returns: {
          attachment_set_hash: string | null
          attachment_state: string
          attachment_state_version: number
          audio_duration: number | null
          audio_path: string | null
          audio_waveform: Json | null
          client_message_id: string | null
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
          media_caption: string | null
          media_expected_count: number | null
          media_group_id: string | null
          media_items: Json
          media_kind: string | null
          message_type: string
          read_at: string | null
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
      rpc_finalize_chat_attachment_v3: {
        Args: {
          p_attachment_id: string
          p_attachment_type: string
          p_audio_waveform: Json
          p_bucket_id: string
          p_byte_size: number
          p_caption: string
          p_client_message_id: string
          p_duration_ms: number
          p_encrypted_key_nonce: string
          p_encrypted_key_receiver: string
          p_encrypted_key_sender: string
          p_encrypted_media_alg: string
          p_encrypted_media_nonce: string
          p_height: number
          p_is_view_once: boolean
          p_mime_type: string
          p_original_name: string
          p_receiver_id: string
          p_reply_to_message_id: string
          p_request_payload: Json
          p_sender_id: string
          p_sender_public_key: string
          p_sha256: string
          p_storage_path: string
          p_validation_details: Json
          p_width: number
        }
        Returns: {
          attachment_set_hash: string | null
          attachment_state: string
          attachment_state_version: number
          audio_duration: number | null
          audio_path: string | null
          audio_waveform: Json | null
          client_message_id: string | null
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
          media_caption: string | null
          media_expected_count: number | null
          media_group_id: string | null
          media_items: Json
          media_kind: string | null
          message_type: string
          read_at: string | null
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
      rpc_finalize_chat_media_album_v4: {
        Args: {
          p_attachments: Json
          p_caption: string
          p_client_message_id: string
          p_expected_count: number
          p_media_group_id: string
          p_receiver_id: string
          p_reply_to_message_id: string
          p_request_payload: Json
          p_sender_id: string
        }
        Returns: {
          attachment_set_hash: string | null
          attachment_state: string
          attachment_state_version: number
          audio_duration: number | null
          audio_path: string | null
          audio_waveform: Json | null
          client_message_id: string | null
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
          media_caption: string | null
          media_expected_count: number | null
          media_group_id: string | null
          media_items: Json
          media_kind: string | null
          message_type: string
          read_at: string | null
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
      rpc_get_account_recovery_options: {
        Args: { p_recovery_token: string }
        Returns: Json
      }
      rpc_get_account_recovery_provider_link_plan: {
        Args: { p_recovery_token: string }
        Returns: Json
      }
      rpc_get_app_version_rule: {
        Args: { p_environment?: string; p_platform: string }
        Returns: Json
      }
      rpc_get_chat_conversation_summaries: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          last_activity_at: string
          last_activity_kind: string
          last_activity_message_id: string
          last_activity_preview: string
          last_message_created_at: string
          last_message_deleted_for_all: boolean
          last_message_delivered_at: string
          last_message_edited_at: string
          last_message_id: string
          last_message_is_read: boolean
          last_message_is_view_once: boolean
          last_message_reaction_created_at: string
          last_message_reaction_emoji: string
          last_message_reaction_target_type: string
          last_message_reaction_user_id: string
          last_message_receiver_id: string
          last_message_sender_id: string
          last_message_text: string
          last_message_type: string
          other_user_id: string
          unread_count: number
        }[]
      }
      rpc_get_circle_member_moments: {
        Args: { p_circle_id: string; p_limit?: number }
        Returns: {
          caption: string
          created_at: string
          expires_at: string
          id: string
          is_deleted: boolean
          media_url: string
          text_body: string
          thumbnail_url: string
          type: string
          user_id: string
          visibility: string
        }[]
      }
      rpc_get_circle_member_moments_recovery: {
        Args: { p_circle_id: string; p_limit?: number }
        Returns: {
          caption: string
          created_at: string
          expires_at: string
          id: string
          is_deleted: boolean
          media_url: string
          text_body: string
          thumbnail_url: string
          type: string
          user_id: string
          visibility: string
        }[]
      }
      rpc_get_circle_profile_suggestions: {
        Args: { p_limit?: number; p_profile_id: string }
        Returns: {
          age: number
          avatar_url: string
          circle_id: string
          circle_name: string
          full_name: string
          profile_id: string
          reason: string
          score: number
        }[]
      }
      rpc_get_circle_pulse_comment_reactions: {
        Args: { p_pulse_item_id: string }
        Returns: {
          comment_id: string
          my_reaction: string
          reaction_count: number
        }[]
      }
      rpc_get_circle_pulse_comment_snapshot: {
        Args: { p_comment_id: string }
        Returns: {
          avatar_url: string
          body: string
          can_edit: boolean
          can_pin: boolean
          can_remove: boolean
          circle_id: string
          created_at: string
          display_name: string
          edited_at: string
          id: string
          is_own: boolean
          my_reaction: string
          parent_comment_id: string
          pinned_at: string
          profile_id: string
          pulse_item_id: string
          reaction_count: number
          reaction_summary: Json
          reply_preview_body: string
          reply_preview_display_name: string
          reply_preview_profile_id: string
          report_count: number
          updated_at: string
        }[]
      }
      rpc_get_circle_pulse_comments: {
        Args: { p_limit?: number; p_pulse_item_id: string }
        Returns: {
          avatar_url: string
          body: string
          can_remove: boolean
          circle_id: string
          created_at: string
          display_name: string
          id: string
          is_own: boolean
          parent_comment_id: string
          profile_id: string
          pulse_item_id: string
          report_count: number
          updated_at: string
        }[]
      }
      rpc_get_circle_pulse_comments_page: {
        Args: {
          p_before_created_at?: string
          p_before_id?: string
          p_limit?: number
          p_pulse_item_id: string
        }
        Returns: {
          avatar_url: string
          body: string
          can_edit: boolean
          can_pin: boolean
          can_remove: boolean
          circle_id: string
          created_at: string
          display_name: string
          edited_at: string
          id: string
          is_own: boolean
          my_reaction: string
          parent_comment_id: string
          pinned_at: string
          profile_id: string
          pulse_item_id: string
          reaction_count: number
          reaction_summary: Json
          reply_preview_body: string
          reply_preview_display_name: string
          reply_preview_profile_id: string
          report_count: number
          updated_at: string
        }[]
      }
      rpc_get_circle_pulse_discussion_read_state: {
        Args: { p_profile_id: string; p_pulse_item_id: string }
        Returns: {
          last_seen_at: string
          last_seen_comment_id: string
          pulse_item_id: string
          unread_count: number
        }[]
      }
      rpc_get_circle_pulse_discussion_reads: {
        Args: { p_circle_id: string; p_profile_id: string }
        Returns: {
          last_seen_at: string
          last_seen_comment_id: string
          pulse_item_id: string
          unread_count: number
        }[]
      }
      rpc_get_circle_pulse_items: {
        Args: { p_circle_id: string; p_include_inactive?: boolean }
        Returns: {
          body: string
          circle_id: string
          comment_count: number
          discussion_cta: string
          discussion_summary: string
          expires_at: string
          featured_profile_age: number
          featured_profile_avatar_url: string
          featured_profile_badge: string
          featured_profile_id: string
          featured_profile_location: string
          featured_profile_name: string
          gathering_attendee_count: number
          gathering_city: string
          gathering_host_created_for_member: boolean
          gathering_id: string
          gathering_is_partner_venue: boolean
          gathering_presentation_mode: string
          gathering_safe_first_date_space: boolean
          gathering_seat_context: string
          gathering_starts_at: string
          gathering_type: string
          id: string
          image_url: string
          item_type: string
          love_seat_id: string
          love_seat_quote: string
          media_type: string
          media_url: string
          moment_id: string
          priority: number
          prompt_id: string
          source_available: boolean
          starts_at: string
          status: string
          subtitle: string
          title: string
          welcome_profiles: Json
        }[]
      }
      rpc_get_closure_to_clarity_candidates: {
        Args: { p_intent_request_id: string; p_limit?: number }
        Returns: {
          active_now: boolean
          age: number
          avatar_url: string
          bio_snippet: string
          candidate_tier: number
          city: string
          closure_freshness_score: number
          closure_rank_score: number
          closure_similarity_score: number
          closure_timing_score: number
          current_country: string
          current_country_code: string
          distance_km: number
          full_name: string
          has_intro_video: boolean
          id: string
          interests: string[]
          looking_for: string
          love_language: string
          personality_type: string
          phone_verified: boolean
          prompt_answer: string
          prompt_title: string
          quality_band: number
          recently_active: boolean
          region: string
          religion: string
          same_looking_for: boolean
          same_region: boolean
          same_religion: boolean
          shared_interest_count: number
          shared_interest_names: string[]
          short_tags: string[]
          verification_level: number
          wants_children: string
        }[]
      }
      rpc_get_disconnected_signin_providers: { Args: never; Returns: string[] }
      rpc_get_intent_reflection: {
        Args: { p_intent_request_id: string }
        Returns: string[]
      }
      rpc_get_live_audience_pulse: {
        Args: { p_session_id: string }
        Returns: Json
      }
      rpc_get_live_chemistry_for_private_spark: {
        Args: { p_private_spark_id: string }
        Returns: Json
      }
      rpc_get_live_chemistry_for_quick_connect: {
        Args: { p_pairing_id: string }
        Returns: Json
      }
      rpc_get_live_member_summary: {
        Args: { p_profile_id: string; p_session_id: string }
        Returns: Json
      }
      rpc_get_live_private_spark: {
        Args: { p_spark_id: string }
        Returns: Json
      }
      rpc_get_live_private_spark_rtc_admission: {
        Args: { p_private_spark_id: string }
        Returns: {
          capabilities: string[]
          maximum_participants: number
          participant_state: string
          participant_user_ids: string[]
          primary_role: string
          private_spark_id: string
          profile_id: string
          provider: string
          provider_call_id: string
          provider_call_type: string
          roles: string[]
          session_status: string
          source_session_id: string
          user_id: string
        }[]
      }
      rpc_get_live_private_spark_snapshot: {
        Args: { p_session_id: string }
        Returns: Json
      }
      rpc_get_live_quick_connect: {
        Args: { p_session_id: string }
        Returns: Json
      }
      rpc_get_live_quick_connect_host_control: {
        Args: { p_session_id: string }
        Returns: Json
      }
      rpc_get_live_quick_connect_pool: {
        Args: { p_session_id: string }
        Returns: Json
      }
      rpc_get_live_quick_connect_rtc_admission: {
        Args: { p_pairing_id: string }
        Returns: {
          capabilities: string[]
          maximum_participants: number
          pairing_id: string
          participant_state: string
          participant_user_ids: string[]
          primary_role: string
          profile_id: string
          provider: string
          provider_call_id: string
          provider_call_type: string
          roles: string[]
          session_status: string
          source_session_id: string
          user_id: string
        }[]
      }
      rpc_get_live_room_pulse: { Args: { p_session_id: string }; Returns: Json }
      rpc_get_live_rtc_admission: {
        Args: { p_session_id: string }
        Returns: {
          capabilities: string[]
          participant_state: string
          primary_role: string
          profile_id: string
          provider: string
          provider_call_id: string
          provider_call_type: string
          roles: string[]
          session_id: string
          session_status: string
          user_id: string
        }[]
      }
      rpc_get_live_rtc_admission_v2: {
        Args: { p_session_id: string }
        Returns: {
          capabilities: string[]
          maximum_participants: number
          participant_state: string
          primary_role: string
          profile_id: string
          provider: string
          provider_call_id: string
          provider_call_type: string
          roles: string[]
          session_id: string
          session_status: string
          user_id: string
        }[]
      }
      rpc_get_live_session_snapshot: {
        Args: { p_session_id: string }
        Returns: Json
      }
      rpc_get_merged_account_redirect: { Args: never; Returns: Json }
      rpc_get_my_circle_invitation_count: {
        Args: { p_profile_id: string }
        Returns: number
      }
      rpc_get_my_circle_love_seat_nominations: {
        Args: { p_circle_id?: string; p_profile_id: string }
        Returns: {
          circle_id: string
          circle_name: string
          created_at: string
          featured_profile_id: string
          id: string
          nominated_by_profile_id: string
          nominator_name: string
          quote: string
          reason: string
          status: string
        }[]
      }
      rpc_get_my_moment_recent_viewers: {
        Args: { p_limit?: number; p_moment_id: string }
        Returns: {
          avatar_url: string
          current_country_code: string
          full_name: string
          is_match: boolean
          is_repeat_viewer: boolean
          profile_id: string
          viewed_at: string
          viewed_moment_count: number
          viewer_user_id: string
        }[]
      }
      rpc_get_my_moment_view_stats: {
        Args: { p_moment_ids?: string[] }
        Returns: {
          moment_id: string
          unique_viewers: number
        }[]
      }
      rpc_get_my_moment_view_time_insights: {
        Args: { p_days?: number; p_utc_offset_minutes?: number }
        Returns: {
          local_hour: number
          view_count: number
          weekday_bucket: number
        }[]
      }
      rpc_get_my_moment_viewer_segments: {
        Args: { p_days?: number }
        Returns: {
          abroad_viewers: number
          first_time_viewers: number
          ghana_viewers: number
          matched_viewers: number
          non_match_viewers: number
          repeat_viewers: number
          total_viewers: number
        }[]
      }
      rpc_get_my_premium_state: { Args: never; Returns: Json }
      rpc_get_my_profile_interest: { Args: never; Returns: Json }
      rpc_get_my_recent_boost_analytics: { Args: never; Returns: Json }
      rpc_get_my_saved_profiles:
        | {
            Args: never
            Returns: {
              age: number
              avatar_url: string
              city: string
              current_country: string
              current_country_code: string
              full_name: string
              is_new_here: boolean
              premium_plan: string
              profile_id: string
              region: string
              saved_at: string
            }[]
          }
        | {
            Args: { p_include_sandbox_preview?: boolean }
            Returns: {
              age: number
              avatar_url: string
              city: string
              current_country: string
              current_country_code: string
              full_name: string
              is_new_here: boolean
              premium_plan: string
              profile_id: string
              region: string
              saved_at: string
            }[]
          }
      rpc_get_phone_verification_status: { Args: never; Returns: Json }
      rpc_get_profile_boost_recommendations: { Args: never; Returns: Json }
      rpc_get_profile_card_context: {
        Args: { p_include_sandbox_preview?: boolean; p_profile_ids: string[] }
        Returns: {
          boost_ends_at: string
          has_active_boost: boolean
          interest_relevance_score: number
          is_new_here: boolean
          premium_plan: string
          profile_id: string
        }[]
      }
      rpc_get_signal_access: { Args: never; Returns: Json }
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
      rpc_get_viewed_moment_ids: {
        Args: { p_moment_ids: string[] }
        Returns: {
          moment_id: string
        }[]
      }
      rpc_heartbeat_live_quick_connect: {
        Args: { p_connected?: boolean; p_session_id: string }
        Returns: Json
      }
      rpc_heartbeat_live_session: {
        Args: { p_session_id: string }
        Returns: {
          connection_quality_state: string
          created_at: string
          id: string
          invited_at: string
          joined_at: string | null
          last_connection_change_at: string | null
          last_seen_at: string | null
          left_at: string | null
          microphone_muted_by_moderator: boolean
          open_to_introductions: boolean
          origin_context_id: string | null
          origin_context_type: string
          profile_id: string
          reconnect_state: string | null
          role: string
          rsvp_status: string
          session_id: string
          stage_joined_at: string | null
          stage_left_at: string | null
          stage_slot: number | null
          state: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "live_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_insert_request_acceptance_system_messages: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      rpc_invite_profile_to_circle: {
        Args: {
          p_actor_profile_id: string
          p_circle_id: string
          p_invited_profile_id: string
          p_message?: string
        }
        Returns: {
          circle_id: string
          created_at: string
          expires_at: string
          id: string
          invited_profile_id: string
          inviter_profile_id: string
          message: string | null
          responded_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "circle_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_is_profile_saved: {
        Args: { p_target_profile_id: string; p_viewer_profile_id: string }
        Returns: boolean
      }
      rpc_is_signin_provider_disconnected: {
        Args: { p_provider: string }
        Returns: boolean
      }
      rpc_issue_selfie_liveness_challenge: {
        Args: { p_profile_id: string }
        Returns: {
          actions: string[]
          challenge_id: string
          expires_at: string
          nonce: string
        }[]
      }
      rpc_join_circle: {
        Args: { p_circle_id: string; p_profile_id: string }
        Returns: string
      }
      rpc_join_live_quick_connect: {
        Args: { p_session_id: string }
        Returns: Json
      }
      rpc_join_live_quick_connect_uncontrolled: {
        Args: { p_session_id: string }
        Returns: Json
      }
      rpc_join_live_session: {
        Args: { p_session_id: string }
        Returns: {
          connection_quality_state: string
          created_at: string
          id: string
          invited_at: string
          joined_at: string | null
          last_connection_change_at: string | null
          last_seen_at: string | null
          left_at: string | null
          microphone_muted_by_moderator: boolean
          open_to_introductions: boolean
          origin_context_id: string | null
          origin_context_type: string
          profile_id: string
          reconnect_state: string | null
          role: string
          rsvp_status: string
          session_id: string
          stage_joined_at: string | null
          stage_left_at: string | null
          stage_slot: number | null
          state: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "live_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_leave_circle: {
        Args: { p_circle_id: string; p_profile_id: string }
        Returns: boolean
      }
      rpc_leave_live_quick_connect: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      rpc_leave_live_session: {
        Args: { p_session_id: string }
        Returns: {
          connection_quality_state: string
          created_at: string
          id: string
          invited_at: string
          joined_at: string | null
          last_connection_change_at: string | null
          last_seen_at: string | null
          left_at: string | null
          microphone_muted_by_moderator: boolean
          open_to_introductions: boolean
          origin_context_id: string | null
          origin_context_type: string
          profile_id: string
          reconnect_state: string | null
          role: string
          rsvp_status: string
          session_id: string
          stage_joined_at: string | null
          stage_left_at: string | null
          stage_slot: number | null
          state: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "live_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_leave_live_stage: {
        Args: { p_session_id: string }
        Returns: {
          connection_quality_state: string
          created_at: string
          id: string
          invited_at: string
          joined_at: string | null
          last_connection_change_at: string | null
          last_seen_at: string | null
          left_at: string | null
          microphone_muted_by_moderator: boolean
          open_to_introductions: boolean
          origin_context_id: string | null
          origin_context_type: string
          profile_id: string
          reconnect_state: string | null
          role: string
          rsvp_status: string
          session_id: string
          stage_joined_at: string | null
          stage_left_at: string | null
          stage_slot: number | null
          state: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "live_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_link_phone_verification: {
        Args: { p_signup_session_id: string }
        Returns: boolean
      }
      rpc_list_circle_love_seats_for_host: {
        Args: { p_actor_profile_id: string; p_circle_id: string }
        Returns: {
          circle_id: string
          created_at: string
          featured_profile_avatar_url: string
          featured_profile_id: string
          featured_profile_name: string
          id: string
          quote: string
          responded_at: string
          status: string
        }[]
      }
      rpc_list_circle_pulse_comment_reports: {
        Args: { p_actor_profile_id: string; p_circle_id: string }
        Returns: {
          circle_id: string
          comment_author_name: string
          comment_body: string
          comment_id: string
          comment_profile_id: string
          latest_reason: string
          latest_report_at: string
          pulse_item_id: string
          pulse_item_title: string
          pulse_item_type: string
          report_count: number
          status: string
        }[]
      }
      rpc_list_circle_reports: {
        Args: { p_circle_id: string; p_profile_id: string }
        Returns: {
          circle_id: string
          created_at: string
          details: string
          gathering_id: string
          gathering_title: string
          id: string
          prompt_response_id: string
          prompt_response_text: string
          reason: string
          reporter_profile_id: string
          status: string
        }[]
      }
      rpc_list_live_comments: {
        Args: { p_before?: string; p_limit?: number; p_session_id: string }
        Returns: Json
      }
      rpc_list_live_sessions: {
        Args: { p_before?: string; p_limit?: number }
        Returns: {
          audience_count: number
          circle_id: string
          context_id: string
          context_type: string
          created_by_profile_id: string
          description: string
          format: string
          id: string
          maximum_publishers: number
          participant_state: string
          rsvp_status: string
          scheduled_start: string
          stage_count: number
          started_at: string
          status: string
          title: string
        }[]
      }
      rpc_list_live_studio_sessions: {
        Args: { p_before?: string; p_limit?: number }
        Returns: {
          audience_count: number
          circle_id: string
          context_id: string
          context_type: string
          created_by_profile_id: string
          description: string
          ended_at: string
          format: string
          id: string
          matches_made_count: number
          maximum_publishers: number
          participant_state: string
          poster_path: string
          reservation_count: number
          rsvp_status: string
          scheduled_end: string
          scheduled_start: string
          stage_count: number
          started_at: string
          status: string
          teaser_duration_seconds: number
          teaser_video_path: string
          title: string
          total_attendee_count: number
        }[]
      }
      rpc_list_my_circle_invitations: {
        Args: { p_profile_id: string }
        Returns: {
          circle_id: string
          circle_image_path: string
          circle_image_url: string
          circle_name: string
          expires_at: string
          invitation_id: string
          inviter_name: string
          message: string
        }[]
      }
      rpc_list_sent_circle_invitations: {
        Args: { p_actor_profile_id: string; p_circle_id: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          invited_profile_age: number
          invited_profile_avatar_url: string
          invited_profile_id: string
          invited_profile_location: string
          invited_profile_name: string
          status: string
        }[]
      }
      rpc_log_profile_gift_event: {
        Args: { p_event_type: string; p_gift_id: string; p_metadata?: Json }
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
      rpc_log_vibes_event: {
        Args: {
          p_dwell_ms?: number
          p_event_type?: string
          p_metadata?: Json
          p_position?: number
          p_segment?: string
          p_target_profile_id: string
          p_viewer_profile_id: string
        }
        Returns: boolean
      }
      rpc_mark_chat_thread_read: {
        Args: { p_peer_user_id: string }
        Returns: number
      }
      rpc_mark_circle_pulse_discussion_seen: {
        Args: {
          p_last_seen_at?: string
          p_last_seen_comment_id?: string
          p_profile_id: string
          p_pulse_item_id: string
        }
        Returns: boolean
      }
      rpc_mark_expired_intent_requests: { Args: never; Returns: number }
      rpc_mark_match_celebration_seen: {
        Args: { p_event_id: string }
        Returns: boolean
      }
      rpc_mark_message_read: { Args: { p_message_id: string }; Returns: number }
      rpc_mark_messages_read: {
        Args: { p_message_ids: string[] }
        Returns: number
      }
      rpc_mark_moment_view: { Args: { p_moment_id: string }; Returns: boolean }
      rpc_mark_signin_provider_disconnected: {
        Args: { p_provider: string }
        Returns: boolean
      }
      rpc_moderate_live_comment: {
        Args: { p_comment_id: string }
        Returns: {
          body: string
          client_comment_id: string
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by_user_id: string | null
          profile_id: string
          session_id: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "live_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_moderate_live_participant: {
        Args: {
          p_action: string
          p_client_action_id: string
          p_reason?: string
          p_session_id: string
          p_target_user_id: string
        }
        Returns: {
          connection_quality_state: string
          created_at: string
          id: string
          invited_at: string
          joined_at: string | null
          last_connection_change_at: string | null
          last_seen_at: string | null
          left_at: string | null
          microphone_muted_by_moderator: boolean
          open_to_introductions: boolean
          origin_context_id: string | null
          origin_context_type: string
          profile_id: string
          reconnect_state: string | null
          role: string
          rsvp_status: string
          session_id: string
          stage_joined_at: string | null
          stage_left_at: string | null
          stage_slot: number | null
          state: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "live_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_nominate_circle_love_seat: {
        Args: {
          p_actor_profile_id: string
          p_circle_id: string
          p_featured_profile_id: string
          p_quote?: string
          p_reason?: string
        }
        Returns: {
          approved_by_profile_id: string | null
          circle_id: string
          created_at: string
          ends_at: string | null
          featured_profile_id: string
          id: string
          nominated_by_profile_id: string | null
          quote: string | null
          reason: string | null
          responded_at: string | null
          starts_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "circle_love_seats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_offer_live_chemistry_reveal: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      rpc_open_live_audience_poll: {
        Args: {
          p_client_request_id: string
          p_duration_seconds?: number
          p_session_id: string
          p_template_key: string
        }
        Returns: Json
      }
      rpc_pin_circle_pulse_comment: {
        Args: { p_comment_id: string; p_pinned?: boolean; p_profile_id: string }
        Returns: boolean
      }
      rpc_prepare_view_once_attachment: {
        Args: { p_message_id: string }
        Returns: {
          attachment_id: string
          attachment_type: string
          bucket_id: string
          byte_size: number
          encrypted_key_nonce: string
          encrypted_key_receiver: string
          encrypted_media_alg: string
          encrypted_media_nonce: string
          mime_type: string
          sender_public_key: string
          storage_path: string
        }[]
      }
      rpc_process_intent_request_jobs: {
        Args: { p_remind_before?: string; p_window?: string }
        Returns: Json
      }
      rpc_process_relationship_compass_jobs: {
        Args: { p_ready_after?: string }
        Returns: Json
      }
      rpc_process_subscription_renewal_jobs: {
        Args: {
          p_final_remind_before?: string
          p_first_remind_before?: string
          p_include_sandbox?: boolean
        }
        Returns: Json
      }
      rpc_process_vibes_v4_jobs: {
        Args: {
          p_quality_limit?: number
          p_quality_stale_after?: string
          p_viewer_limit?: number
          p_viewer_stale_after?: string
          p_visibility_limit?: number
          p_visibility_stale_after?: string
        }
        Returns: Json
      }
      rpc_process_vibes_v5_taste_jobs: {
        Args: { p_limit?: number }
        Returns: Json
      }
      rpc_publish_relationship_gist: {
        Args: { p_gist_id: string }
        Returns: {
          audience_tags: string[]
          body: string
          circle_id: string | null
          city: string | null
          country_code: string | null
          created_at: string
          created_by_admin_id: string | null
          created_by_profile_id: string | null
          culture_tags: string[]
          faith_tags: string[]
          id: string
          perspective: string
          published_at: string | null
          relationship_intent_tags: string[]
          scheduled_for: string | null
          short_body: string | null
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "relationship_gists"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_refund_undone_superlike: {
        Args: {
          p_profile_id: string
          p_target_profile_id: string
          p_window_seconds?: number
        }
        Returns: number
      }
      rpc_reject_circle: {
        Args: { p_circle_id: string; p_reason: string }
        Returns: {
          active_this_week_count: number
          approved_at: string | null
          approved_by_admin_id: string | null
          archived_at: string | null
          audience_tags: string[]
          category: string | null
          circle_type: string
          city: string | null
          country_code: string | null
          country_name: string | null
          cover_image_url: string | null
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          culture_tags: string[]
          description: string | null
          diaspora_tags: string[]
          faith_tags: string[]
          gathering_count: number
          host_note: string | null
          host_note_updated_at: string | null
          host_note_updated_by_profile_id: string | null
          icon_url: string | null
          id: string
          image_path: string | null
          image_updated_at: string | null
          interest_tags: string[]
          is_featured: boolean
          is_official: boolean
          is_partner: boolean
          latitude: number | null
          longitude: number | null
          member_count: number
          name: string
          region: string | null
          rejected_reason: string | null
          report_count: number
          requires_join_approval: boolean
          rules: string | null
          safety_note: string | null
          short_description: string | null
          slug: string | null
          status: string
          updated_at: string
          visibility: string
          visibility_scope: string
        }
        SetofOptions: {
          from: "*"
          to: "circles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_reject_gathering: {
        Args: { p_gathering_id: string; p_reason: string }
        Returns: {
          address_visibility: string
          approved_at: string | null
          approved_by_admin_id: string | null
          attendee_count: number
          cancelled_at: string | null
          circle_id: string | null
          city: string | null
          country_code: string | null
          country_name: string | null
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          description: string | null
          ends_at: string | null
          featured_profile_id: string | null
          gathering_type: string
          host_created_for_member: boolean
          id: string
          is_official: boolean
          is_partner_venue: boolean
          latitude: number | null
          longitude: number | null
          max_attendees: number | null
          online_url: string | null
          platform: string | null
          poster_url: string | null
          presentation_mode: string
          region: string | null
          rejected_reason: string | null
          safe_first_date_space: boolean
          safety_note: string | null
          seat_context: string | null
          slug: string | null
          starts_at: string
          status: string
          tags: string[]
          timezone: string | null
          title: string
          updated_at: string
          venue_address: string | null
          venue_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gatherings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_remove_circle_member: {
        Args: { p_circle_id: string; p_member_id: string; p_profile_id: string }
        Returns: boolean
      }
      rpc_remove_circle_prompt_response: {
        Args: { p_profile_id: string; p_response_id: string }
        Returns: boolean
      }
      rpc_reorder_circle_pulse_items: {
        Args: {
          p_actor_profile_id: string
          p_circle_id: string
          p_item_ids: string[]
        }
        Returns: number
      }
      rpc_report_circle_pulse_comment: {
        Args: { p_comment_id: string; p_profile_id: string; p_reason?: string }
        Returns: boolean
      }
      rpc_report_live_content: {
        Args: {
          p_client_report_id: string
          p_details?: string
          p_reason: string
          p_session_id: string
          p_target_comment_id?: string
          p_target_user_id?: string
        }
        Returns: {
          client_report_id: string
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_profile_id: string
          reporter_user_id: string
          resolved_at: string | null
          session_id: string
          status: string
          target_comment_id: string | null
          target_user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "live_reports"
          isOneToOne: true
          isSetofReturn: false
        }
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
      rpc_request_circle_role: {
        Args: {
          p_circle_id: string
          p_note?: string
          p_profile_id: string
          p_requested_role: string
        }
        Returns: {
          circle_id: string
          created_at: string
          id: string
          note: string | null
          rejection_reason: string | null
          requested_role: string
          requester_profile_id: string
          requester_user_id: string | null
          reviewed_at: string | null
          reviewed_by_profile_id: string | null
          reviewed_by_user_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "circle_role_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_request_date_plan_concierge: {
        Args: { p_note?: string; p_plan_id: string }
        Returns: {
          concierge_requested: boolean
          plan_id: string
          request_id: string
        }[]
      }
      rpc_request_live_seat: {
        Args: { p_session_id: string }
        Returns: {
          id: string
          profile_id: string
          requested_at: string
          resolved_at: string | null
          resolved_by_user_id: string | null
          session_id: string
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "live_seat_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_resolve_live_seat_request: {
        Args: { p_approve: boolean; p_request_id: string }
        Returns: {
          connection_quality_state: string
          created_at: string
          id: string
          invited_at: string
          joined_at: string | null
          last_connection_change_at: string | null
          last_seen_at: string | null
          left_at: string | null
          microphone_muted_by_moderator: boolean
          open_to_introductions: boolean
          origin_context_id: string | null
          origin_context_type: string
          profile_id: string
          reconnect_state: string | null
          role: string
          rsvp_status: string
          session_id: string
          stage_joined_at: string | null
          stage_left_at: string | null
          stage_slot: number | null
          state: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "live_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_resolve_recovered_duplicate_shell: {
        Args: { p_recovery_token: string }
        Returns: Json
      }
      rpc_respond_circle_invitation: {
        Args: { p_accept: boolean; p_circle_id: string; p_profile_id: string }
        Returns: string
      }
      rpc_respond_circle_love_seat: {
        Args: {
          p_accept: boolean
          p_love_seat_id: string
          p_profile_id: string
        }
        Returns: {
          approved_by_profile_id: string | null
          circle_id: string
          created_at: string
          ends_at: string | null
          featured_profile_id: string
          id: string
          nominated_by_profile_id: string | null
          quote: string | null
          reason: string | null
          responded_at: string | null
          starts_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "circle_love_seats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_respond_live_match_round: {
        Args: { p_accept: boolean; p_match_round_id: string }
        Returns: Json
      }
      rpc_respond_live_private_spark: {
        Args: { p_accept: boolean; p_private_spark_id: string }
        Returns: Json
      }
      rpc_respond_warm_introduction: {
        Args: { p_decision: string; p_intro_id: string }
        Returns: {
          accepted_by_a_at: string | null
          accepted_by_b_at: string | null
          circle_id: string | null
          created_at: string
          declined_by_profile_id: string | null
          expires_at: string
          id: string
          initiator_profile_id: string | null
          initiator_role: string
          profile_a_id: string
          profile_b_id: string
          reason: string
          shared_context: string[]
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "warm_introductions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_reveal_profile_gift: { Args: { p_gift_id: string }; Returns: Json }
      rpc_review_circle_pulse_comment_report: {
        Args: {
          p_action: string
          p_actor_profile_id: string
          p_comment_id: string
        }
        Returns: boolean
      }
      rpc_review_circle_report: {
        Args: { p_profile_id: string; p_report_id: string; p_status: string }
        Returns: {
          circle_id: string | null
          created_at: string
          details: string | null
          gathering_id: string | null
          id: string
          prompt_response_id: string | null
          reason: string
          reporter_profile_id: string
          reporter_user_id: string | null
          reviewed_at: string | null
          reviewed_by_admin_id: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "circle_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_review_circle_role_request: {
        Args: {
          p_decision: string
          p_profile_id: string
          p_rejection_reason?: string
          p_request_id: string
        }
        Returns: {
          circle_id: string
          created_at: string
          id: string
          note: string | null
          rejection_reason: string | null
          requested_role: string
          requester_profile_id: string
          requester_user_id: string | null
          reviewed_at: string | null
          reviewed_by_profile_id: string | null
          reviewed_by_user_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "circle_role_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_rsvp_live_session: {
        Args: {
          p_attending: boolean
          p_open_to_introductions?: boolean
          p_session_id: string
        }
        Returns: {
          connection_quality_state: string
          created_at: string
          id: string
          invited_at: string
          joined_at: string | null
          last_connection_change_at: string | null
          last_seen_at: string | null
          left_at: string | null
          microphone_muted_by_moderator: boolean
          open_to_introductions: boolean
          origin_context_id: string | null
          origin_context_type: string
          profile_id: string
          reconnect_state: string | null
          role: string
          rsvp_status: string
          session_id: string
          stage_joined_at: string | null
          stage_left_at: string | null
          stage_slot: number | null
          state: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "live_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_save_intent_reflection: {
        Args: {
          p_intent_request_id: string
          p_selected_reasons: string[]
          p_source: string
          p_target_profile_id: string
        }
        Returns: string[]
      }
      rpc_schedule_live_session: {
        Args: {
          p_description: string
          p_scheduled_start: string
          p_title: string
        }
        Returns: {
          backstage_opened_at: string | null
          cancelled_at: string | null
          captions_enabled: boolean
          chemistry_first_enabled: boolean
          circle_id: string | null
          configuration: Json
          context_id: string | null
          context_type: string
          created_at: string
          created_by_profile_id: string
          created_by_user_id: string
          description: string | null
          ended_at: string | null
          format: string
          gathering_id: string | null
          id: string
          maximum_participants: number
          maximum_publishers: number
          minimum_participants: number
          provider: string
          provider_call_id: string
          provider_call_type: string
          quorum_reached_at: string | null
          recording_enabled: boolean
          scheduled_end: string | null
          scheduled_start: string | null
          stage_request_capacity: number
          stage_requests_open: boolean
          started_at: string | null
          status: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "live_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_schedule_live_session_v2: {
        Args: {
          p_chemistry_first_enabled?: boolean
          p_description: string
          p_format?: string
          p_scheduled_start: string
          p_title: string
        }
        Returns: {
          backstage_opened_at: string | null
          cancelled_at: string | null
          captions_enabled: boolean
          chemistry_first_enabled: boolean
          circle_id: string | null
          configuration: Json
          context_id: string | null
          context_type: string
          created_at: string
          created_by_profile_id: string
          created_by_user_id: string
          description: string | null
          ended_at: string | null
          format: string
          gathering_id: string | null
          id: string
          maximum_participants: number
          maximum_publishers: number
          minimum_participants: number
          provider: string
          provider_call_id: string
          provider_call_type: string
          quorum_reached_at: string | null
          recording_enabled: boolean
          scheduled_end: string | null
          scheduled_start: string | null
          stage_request_capacity: number
          stage_requests_open: boolean
          started_at: string | null
          status: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "live_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_schedule_orphaned_chat_attachments: {
        Args: { p_limit?: number }
        Returns: number
      }
      rpc_search_circle_invite_candidates: {
        Args: {
          p_actor_profile_id: string
          p_circle_id: string
          p_country?: string
          p_interest?: string
          p_limit?: number
          p_max_age?: number
          p_min_age?: number
          p_search?: string
        }
        Returns: {
          age: number
          avatar_url: string
          country: string
          full_name: string
          interests: string[]
          location: string
          profile_id: string
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
      rpc_send_profile_gift: {
        Args: {
          p_gift_type: string
          p_include_sandbox_preview?: boolean
          p_recipient_profile_id: string
        }
        Returns: Json
      }
      rpc_send_signal: {
        Args: {
          p_note?: string
          p_reason_key: string
          p_receiver_profile_id: string
          p_source?: string
          p_source_moment_id?: string
        }
        Returns: Json
      }
      rpc_set_chat_typing_state: {
        Args: {
          p_peer_user_id: string
          p_typing: boolean
          p_typing_for_ms?: number
        }
        Returns: number
      }
      rpc_set_circle_host_note: {
        Args: { p_circle_id: string; p_note?: string; p_profile_id: string }
        Returns: {
          active_this_week_count: number
          approved_at: string | null
          approved_by_admin_id: string | null
          archived_at: string | null
          audience_tags: string[]
          category: string | null
          circle_type: string
          city: string | null
          country_code: string | null
          country_name: string | null
          cover_image_url: string | null
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          culture_tags: string[]
          description: string | null
          diaspora_tags: string[]
          faith_tags: string[]
          gathering_count: number
          host_note: string | null
          host_note_updated_at: string | null
          host_note_updated_by_profile_id: string | null
          icon_url: string | null
          id: string
          image_path: string | null
          image_updated_at: string | null
          interest_tags: string[]
          is_featured: boolean
          is_official: boolean
          is_partner: boolean
          latitude: number | null
          longitude: number | null
          member_count: number
          name: string
          region: string | null
          rejected_reason: string | null
          report_count: number
          requires_join_approval: boolean
          rules: string | null
          safety_note: string | null
          short_description: string | null
          slug: string | null
          status: string
          updated_at: string
          visibility: string
          visibility_scope: string
        }
        SetofOptions: {
          from: "*"
          to: "circles"
          isOneToOne: true
          isSetofReturn: false
        }
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
      rpc_set_live_chemistry_ready: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      rpc_set_live_introduction_availability: {
        Args: { p_open: boolean; p_session_id: string }
        Returns: {
          connection_quality_state: string
          created_at: string
          id: string
          invited_at: string
          joined_at: string | null
          last_connection_change_at: string | null
          last_seen_at: string | null
          left_at: string | null
          microphone_muted_by_moderator: boolean
          open_to_introductions: boolean
          origin_context_id: string | null
          origin_context_type: string
          profile_id: string
          reconnect_state: string | null
          role: string
          rsvp_status: string
          session_id: string
          stage_joined_at: string | null
          stage_left_at: string | null
          stage_slot: number | null
          state: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "live_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_set_live_stage_participant: {
        Args: {
          p_on_stage: boolean
          p_session_id: string
          p_target_user_id: string
        }
        Returns: {
          connection_quality_state: string
          created_at: string
          id: string
          invited_at: string
          joined_at: string | null
          last_connection_change_at: string | null
          last_seen_at: string | null
          left_at: string | null
          microphone_muted_by_moderator: boolean
          open_to_introductions: boolean
          origin_context_id: string | null
          origin_context_type: string
          profile_id: string
          reconnect_state: string | null
          role: string
          rsvp_status: string
          session_id: string
          stage_joined_at: string | null
          stage_left_at: string | null
          stage_slot: number | null
          state: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "live_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_set_live_stage_request_capacity: {
        Args: { p_capacity: number; p_session_id: string }
        Returns: {
          backstage_opened_at: string | null
          cancelled_at: string | null
          captions_enabled: boolean
          chemistry_first_enabled: boolean
          circle_id: string | null
          configuration: Json
          context_id: string | null
          context_type: string
          created_at: string
          created_by_profile_id: string
          created_by_user_id: string
          description: string | null
          ended_at: string | null
          format: string
          gathering_id: string | null
          id: string
          maximum_participants: number
          maximum_publishers: number
          minimum_participants: number
          provider: string
          provider_call_id: string
          provider_call_type: string
          quorum_reached_at: string | null
          recording_enabled: boolean
          scheduled_end: string | null
          scheduled_start: string | null
          stage_request_capacity: number
          stage_requests_open: boolean
          started_at: string | null
          status: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "live_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_set_live_stage_requests_open: {
        Args: { p_open: boolean; p_session_id: string }
        Returns: {
          backstage_opened_at: string | null
          cancelled_at: string | null
          captions_enabled: boolean
          chemistry_first_enabled: boolean
          circle_id: string | null
          configuration: Json
          context_id: string | null
          context_type: string
          created_at: string
          created_by_profile_id: string
          created_by_user_id: string
          description: string | null
          ended_at: string | null
          format: string
          gathering_id: string | null
          id: string
          maximum_participants: number
          maximum_publishers: number
          minimum_participants: number
          provider: string
          provider_call_id: string
          provider_call_type: string
          quorum_reached_at: string | null
          recording_enabled: boolean
          scheduled_end: string | null
          scheduled_start: string | null
          stage_request_capacity: number
          stage_requests_open: boolean
          started_at: string | null
          status: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "live_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_set_profile_saved: {
        Args: {
          p_saved: boolean
          p_target_profile_id: string
          p_viewer_profile_id: string
        }
        Returns: boolean
      }
      rpc_set_user_presence: { Args: { p_online: boolean }; Returns: number }
      rpc_signal_live_quick_connect_interest: {
        Args: { p_session_id: string; p_target_profile_id: string }
        Returns: Json
      }
      rpc_submit_live_private_spark_exit: {
        Args: { p_decision: string; p_private_spark_id: string }
        Returns: Json
      }
      rpc_submit_live_quick_connect_decision: {
        Args: { p_decision: string; p_pairing_id: string }
        Returns: Json
      }
      rpc_submit_manual_verification_request: {
        Args: {
          p_auto_verification_reason?: string
          p_auto_verification_score?: number
          p_document_path?: string
          p_profile_id: string
          p_reference_asset_path?: string
          p_social_handle?: string
          p_social_platform?: string
          p_social_profile_url?: string
          p_verification_type: string
        }
        Returns: {
          already_pending: boolean
          created_at: string
          request_id: string
          status: string
        }[]
      }
      rpc_submit_report: {
        Args: {
          p_client_evidence?: Json
          p_evidence_message_id?: string
          p_reason: string
          p_reported_id: string
        }
        Returns: string
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
      rpc_submit_selfie_liveness_verification_v2: {
        Args: {
          p_challenge_id: string
          p_document_path: string
          p_evidence: Json
          p_profile_id: string
        }
        Returns: {
          already_pending: boolean
          created_at: string
          request_id: string
          status: string
        }[]
      }
      rpc_sync_moment_comment_reaction: {
        Args: { p_comment_id: string; p_reaction?: string }
        Returns: boolean
      }
      rpc_sync_moment_reaction: {
        Args: { p_emoji?: string; p_moment_id: string }
        Returns: boolean
      }
      rpc_toggle_circle_pulse_comment_reaction: {
        Args: {
          p_comment_id: string
          p_profile_id: string
          p_reaction?: string
        }
        Returns: boolean
      }
      rpc_transition_live_match_round: {
        Args: { p_match_round_id: string; p_target_state: string }
        Returns: Json
      }
      rpc_transition_live_session: {
        Args: {
          p_expected_version: number
          p_session_id: string
          p_target_status: string
        }
        Returns: {
          backstage_opened_at: string | null
          cancelled_at: string | null
          captions_enabled: boolean
          chemistry_first_enabled: boolean
          circle_id: string | null
          configuration: Json
          context_id: string | null
          context_type: string
          created_at: string
          created_by_profile_id: string
          created_by_user_id: string
          description: string | null
          ended_at: string | null
          format: string
          gathering_id: string | null
          id: string
          maximum_participants: number
          maximum_publishers: number
          minimum_participants: number
          provider: string
          provider_call_id: string
          provider_call_type: string
          quorum_reached_at: string | null
          recording_enabled: boolean
          scheduled_end: string | null
          scheduled_start: string | null
          stage_request_capacity: number
          stage_requests_open: boolean
          started_at: string | null
          status: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "live_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_circle_image: {
        Args: {
          p_actor_profile_id: string
          p_circle_id: string
          p_image_path: string
        }
        Returns: {
          active_this_week_count: number
          approved_at: string | null
          approved_by_admin_id: string | null
          archived_at: string | null
          audience_tags: string[]
          category: string | null
          circle_type: string
          city: string | null
          country_code: string | null
          country_name: string | null
          cover_image_url: string | null
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          culture_tags: string[]
          description: string | null
          diaspora_tags: string[]
          faith_tags: string[]
          gathering_count: number
          host_note: string | null
          host_note_updated_at: string | null
          host_note_updated_by_profile_id: string | null
          icon_url: string | null
          id: string
          image_path: string | null
          image_updated_at: string | null
          interest_tags: string[]
          is_featured: boolean
          is_official: boolean
          is_partner: boolean
          latitude: number | null
          longitude: number | null
          member_count: number
          name: string
          region: string | null
          rejected_reason: string | null
          report_count: number
          requires_join_approval: boolean
          rules: string | null
          safety_note: string | null
          short_description: string | null
          slug: string | null
          status: string
          updated_at: string
          visibility: string
          visibility_scope: string
        }
        SetofOptions: {
          from: "*"
          to: "circles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_circle_name: {
        Args: {
          p_actor_profile_id: string
          p_circle_id: string
          p_name: string
        }
        Returns: {
          active_this_week_count: number
          approved_at: string | null
          approved_by_admin_id: string | null
          archived_at: string | null
          audience_tags: string[]
          category: string | null
          circle_type: string
          city: string | null
          country_code: string | null
          country_name: string | null
          cover_image_url: string | null
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          culture_tags: string[]
          description: string | null
          diaspora_tags: string[]
          faith_tags: string[]
          gathering_count: number
          host_note: string | null
          host_note_updated_at: string | null
          host_note_updated_by_profile_id: string | null
          icon_url: string | null
          id: string
          image_path: string | null
          image_updated_at: string | null
          interest_tags: string[]
          is_featured: boolean
          is_official: boolean
          is_partner: boolean
          latitude: number | null
          longitude: number | null
          member_count: number
          name: string
          region: string | null
          rejected_reason: string | null
          report_count: number
          requires_join_approval: boolean
          rules: string | null
          safety_note: string | null
          short_description: string | null
          slug: string | null
          status: string
          updated_at: string
          visibility: string
          visibility_scope: string
        }
        SetofOptions: {
          from: "*"
          to: "circles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_circle_prompt: {
        Args: {
          p_circle_id: string
          p_expires_at?: string
          p_prompt: string
          p_prompt_id: string
          p_prompt_type?: string
          p_title: string
        }
        Returns: {
          circle_id: string | null
          created_at: string
          created_by_admin_id: string | null
          created_by_profile_id: string | null
          expires_at: string | null
          id: string
          prompt: string
          prompt_type: string
          starts_at: string | null
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "circle_prompts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_circle_pulse_comment: {
        Args: { p_body: string; p_comment_id: string; p_profile_id: string }
        Returns: {
          avatar_url: string
          body: string
          can_edit: boolean
          can_pin: boolean
          can_remove: boolean
          circle_id: string
          created_at: string
          display_name: string
          edited_at: string
          id: string
          is_own: boolean
          my_reaction: string
          parent_comment_id: string
          pinned_at: string
          profile_id: string
          pulse_item_id: string
          reaction_count: number
          reaction_summary: Json
          reply_preview_body: string
          reply_preview_display_name: string
          reply_preview_profile_id: string
          report_count: number
          updated_at: string
        }[]
      }
      rpc_update_circle_relationship_gist: {
        Args: {
          p_actor_profile_id: string
          p_body: string
          p_circle_id: string
          p_gist_id: string
          p_perspective?: string
          p_short_body: string
          p_title: string
        }
        Returns: {
          audience_tags: string[]
          body: string
          circle_id: string | null
          city: string | null
          country_code: string | null
          created_at: string
          created_by_admin_id: string | null
          created_by_profile_id: string | null
          culture_tags: string[]
          faith_tags: string[]
          id: string
          perspective: string
          published_at: string | null
          relationship_intent_tags: string[]
          scheduled_for: string | null
          short_body: string | null
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "relationship_gists"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_circle_request: {
        Args: {
          p_audience_tags?: string[]
          p_circle_id: string
          p_circle_type?: string
          p_city?: string
          p_country_code?: string
          p_country_name?: string
          p_culture_tags?: string[]
          p_description?: string
          p_diaspora_tags?: string[]
          p_faith_tags?: string[]
          p_interest_tags?: string[]
          p_name: string
          p_region?: string
          p_requires_join_approval?: boolean
          p_rules?: string
          p_short_description?: string
          p_visibility_scope?: string
        }
        Returns: {
          active_this_week_count: number
          approved_at: string | null
          approved_by_admin_id: string | null
          archived_at: string | null
          audience_tags: string[]
          category: string | null
          circle_type: string
          city: string | null
          country_code: string | null
          country_name: string | null
          cover_image_url: string | null
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          culture_tags: string[]
          description: string | null
          diaspora_tags: string[]
          faith_tags: string[]
          gathering_count: number
          host_note: string | null
          host_note_updated_at: string | null
          host_note_updated_by_profile_id: string | null
          icon_url: string | null
          id: string
          image_path: string | null
          image_updated_at: string | null
          interest_tags: string[]
          is_featured: boolean
          is_official: boolean
          is_partner: boolean
          latitude: number | null
          longitude: number | null
          member_count: number
          name: string
          region: string | null
          rejected_reason: string | null
          report_count: number
          requires_join_approval: boolean
          rules: string | null
          safety_note: string | null
          short_description: string | null
          slug: string | null
          status: string
          updated_at: string
          visibility: string
          visibility_scope: string
        }
        SetofOptions: {
          from: "*"
          to: "circles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_gathering_request: {
        Args: {
          p_address_visibility?: string
          p_circle_id?: string
          p_city?: string
          p_country_code?: string
          p_country_name?: string
          p_description?: string
          p_ends_at?: string
          p_featured_profile_id?: string
          p_gathering_id: string
          p_gathering_type?: string
          p_host_created_for_member?: boolean
          p_max_attendees?: number
          p_online_url?: string
          p_platform?: string
          p_poster_url?: string
          p_presentation_mode?: string
          p_region?: string
          p_safety_note?: string
          p_seat_context?: string
          p_starts_at?: string
          p_tags?: string[]
          p_timezone?: string
          p_title?: string
          p_venue_address?: string
          p_venue_name?: string
        }
        Returns: {
          address_visibility: string
          approved_at: string | null
          approved_by_admin_id: string | null
          attendee_count: number
          cancelled_at: string | null
          circle_id: string | null
          city: string | null
          country_code: string | null
          country_name: string | null
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          description: string | null
          ends_at: string | null
          featured_profile_id: string | null
          gathering_type: string
          host_created_for_member: boolean
          id: string
          is_official: boolean
          is_partner_venue: boolean
          latitude: number | null
          longitude: number | null
          max_attendees: number | null
          online_url: string | null
          platform: string | null
          poster_url: string | null
          presentation_mode: string
          region: string | null
          rejected_reason: string | null
          safe_first_date_space: boolean
          safety_note: string | null
          seat_context: string | null
          slug: string | null
          starts_at: string
          status: string
          tags: string[]
          timezone: string | null
          title: string
          updated_at: string
          venue_address: string | null
          venue_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gatherings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_live_event_media: {
        Args: {
          p_poster_path?: string
          p_session_id: string
          p_teaser_duration_seconds?: number
          p_teaser_video_path?: string
        }
        Returns: {
          backstage_opened_at: string | null
          cancelled_at: string | null
          captions_enabled: boolean
          chemistry_first_enabled: boolean
          circle_id: string | null
          configuration: Json
          context_id: string | null
          context_type: string
          created_at: string
          created_by_profile_id: string
          created_by_user_id: string
          description: string | null
          ended_at: string | null
          format: string
          gathering_id: string | null
          id: string
          maximum_participants: number
          maximum_publishers: number
          minimum_participants: number
          provider: string
          provider_call_id: string
          provider_call_type: string
          quorum_reached_at: string | null
          recording_enabled: boolean
          scheduled_end: string | null
          scheduled_start: string | null
          stage_request_capacity: number
          stage_requests_open: boolean
          started_at: string | null
          status: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "live_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_moment_comment: {
        Args: { p_body: string; p_comment_id: string }
        Returns: {
          body: string
          created_at: string
          id: string
          is_deleted: boolean
          moment_id: string
          parent_comment_id: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "moment_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_upsert_circle_pulse_item: {
        Args: {
          p_actor_profile_id: string
          p_body?: string
          p_circle_id: string
          p_expires_at?: string
          p_gathering_id?: string
          p_image_url?: string
          p_item_id?: string
          p_item_type: string
          p_media_type?: string
          p_media_url?: string
          p_moment_id?: string
          p_priority?: number
          p_prompt_id?: string
          p_starts_at?: string
          p_status?: string
          p_subtitle?: string
          p_title?: string
        }
        Returns: {
          body: string | null
          circle_id: string
          comment_count: number
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          discussion_cta: string | null
          discussion_summary: string | null
          expires_at: string | null
          gathering_id: string | null
          id: string
          image_url: string | null
          item_type: string
          love_seat_id: string | null
          media_type: string | null
          media_url: string | null
          moment_id: string | null
          priority: number
          prompt_id: string | null
          starts_at: string | null
          status: string
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "circle_pulse_items"
          isOneToOne: true
          isSetofReturn: false
        }
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
      rpc_upsert_relationship_gist_editorial: {
        Args: {
          p_actor_profile_id?: string
          p_body?: string
          p_gist_id?: string
          p_perspective?: string
          p_short_body?: string
          p_status?: string
          p_title?: string
        }
        Returns: {
          audience_tags: string[]
          body: string
          circle_id: string | null
          city: string | null
          country_code: string | null
          created_at: string
          created_by_admin_id: string | null
          created_by_profile_id: string | null
          culture_tags: string[]
          faith_tags: string[]
          id: string
          perspective: string
          published_at: string | null
          relationship_intent_tags: string[]
          scheduled_for: string | null
          short_body: string | null
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "relationship_gists"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_vote_live_audience_poll: {
        Args: {
          p_client_vote_id: string
          p_option_id: string
          p_poll_id: string
        }
        Returns: Json
      }
      rpc_withdraw_live_seat_request: {
        Args: { p_session_id: string }
        Returns: {
          id: string
          profile_id: string
          requested_at: string
          resolved_at: string | null
          resolved_by_user_id: string | null
          session_id: string
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "live_seat_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      run_live_maintenance: { Args: never; Returns: Json }
      search_ghana_localities: {
        Args: { p_limit?: number; p_query?: string; p_region?: string }
        Returns: {
          district: string
          feature_code: string
          geoname_id: number
          latitude: number
          longitude: number
          name: string
          population: number
          region: string
        }[]
      }
      set_my_precise_location: {
        Args: {
          p_accuracy_meters?: number
          p_latitude: number
          p_longitude: number
        }
        Returns: {
          latitude: number
          location_precision: string
          longitude: number
          profile_id: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      signal_limit_for_plan: {
        Args: { p_plan: Database["public"]["Enums"]["subscription_type"] }
        Returns: number
      }
      signal_reason_label: { Args: { p_reason_key: string }; Returns: string }
      slugify: { Args: { p_value: string }; Returns: string }
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
      sync_circle_pulse_item_comment_count: {
        Args: { p_pulse_item_id: string }
        Returns: undefined
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
      upsert_chat_conversation_summary_from_message: {
        Args: {
          p_message_id: string
          p_owner_user_id: string
          p_peer_user_id: string
          p_unread_increment?: number
        }
        Returns: undefined
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
      vibes_real_distance_km: {
        Args: { p_lat1: number; p_lat2: number; p_lon1: number; p_lon2: number }
        Returns: number
      }
    }
    Enums: {
      gender: "MALE" | "FEMALE" | "NON_BINARY" | "OTHER"
      location_precision: "EXACT" | "CITY" | "REGION" | "COUNTRY"
      match_status: "PENDING" | "ACCEPTED" | "REJECTED"
      religion:
        | "CHRISTIAN"
        | "MUSLIM"
        | "TRADITIONALIST"
        | "OTHER"
        | "JEWISH"
        | "HINDU"
        | "BUDDHIST"
        | "SPIRITUAL"
        | "NONE"
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
      location_precision: ["EXACT", "CITY", "REGION", "COUNTRY"],
      match_status: ["PENDING", "ACCEPTED", "REJECTED"],
      religion: [
        "CHRISTIAN",
        "MUSLIM",
        "TRADITIONALIST",
        "OTHER",
        "JEWISH",
        "HINDU",
        "BUDDHIST",
        "SPIRITUAL",
        "NONE",
      ],
      subscription_type: ["FREE", "SILVER", "GOLD"],
      swipe_action: ["LIKE", "PASS", "SUPERLIKE"],
    },
  },
} as const
