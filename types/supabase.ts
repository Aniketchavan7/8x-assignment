export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action_type: string
          admin_user_id: string
          created_at: string
          id: string
          metadata: Json | null
          target_brand_id: string | null
        }
        Insert: {
          action_type: string
          admin_user_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_brand_id?: string | null
        }
        Update: {
          action_type?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_brand_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_impersonation_tokens: {
        Row: {
          admin_id: string
          created_at: string
          expires_at: string
          id: number
          ip_address: string | null
          otp: string
          reason: string | null
          target_email: string
          token: string
          used_at: string | null
        }
        Insert: {
          admin_id: string
          created_at?: string
          expires_at: string
          id?: never
          ip_address?: string | null
          otp: string
          reason?: string | null
          target_email: string
          token?: string
          used_at?: string | null
        }
        Update: {
          admin_id?: string
          created_at?: string
          expires_at?: string
          id?: never
          ip_address?: string | null
          otp?: string
          reason?: string | null
          target_email?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_impersonation_tokens_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_members: {
        Row: {
          admin_role: Database["public"]["Enums"]["admin_role"]
          created_at: string | null
          id: string
          job_ids: string[]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_role?: Database["public"]["Enums"]["admin_role"]
          created_at?: string | null
          id?: string
          job_ids?: string[]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_role?: Database["public"]["Enums"]["admin_role"]
          created_at?: string | null
          id?: string
          job_ids?: string[]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_otp_attempts: {
        Row: {
          created_at: string
          email: string
          id: number
          ip_address: string | null
          success: boolean
        }
        Insert: {
          created_at?: string
          email: string
          id?: never
          ip_address?: string | null
          success?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          id?: never
          ip_address?: string | null
          success?: boolean
        }
        Relationships: []
      }
      api_call_logs: {
        Row: {
          account_id: string | null
          account_username: string | null
          created_at: string
          endpoint: string
          error_message: string | null
          error_type: string | null
          function_name: string
          http_method: string
          id: string
          latency_ms: number
          platform: string
          rate_limit_limit: number | null
          rate_limit_remaining: number | null
          rate_limit_reset_seconds: number | null
          source: string | null
          status_code: number | null
          success: boolean
          sync_job_id: string | null
        }
        Insert: {
          account_id?: string | null
          account_username?: string | null
          created_at?: string
          endpoint: string
          error_message?: string | null
          error_type?: string | null
          function_name: string
          http_method?: string
          id?: string
          latency_ms: number
          platform: string
          rate_limit_limit?: number | null
          rate_limit_remaining?: number | null
          rate_limit_reset_seconds?: number | null
          source?: string | null
          status_code?: number | null
          success: boolean
          sync_job_id?: string | null
        }
        Update: {
          account_id?: string | null
          account_username?: string | null
          created_at?: string
          endpoint?: string
          error_message?: string | null
          error_type?: string | null
          function_name?: string
          http_method?: string
          id?: string
          latency_ms?: number
          platform?: string
          rate_limit_limit?: number | null
          rate_limit_remaining?: number | null
          rate_limit_reset_seconds?: number | null
          source?: string | null
          status_code?: number | null
          success?: boolean
          sync_job_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_call_logs_sync_job_id_fkey"
            columns: ["sync_job_id"]
            isOneToOne: false
            referencedRelation: "sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      applications_videos: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          file_size: number | null
          filename: string
          id: string
          video_type: string
          video_url: string
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          file_size?: number | null
          filename: string
          id?: string
          video_type?: string
          video_url: string
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          file_size?: number | null
          filename?: string
          id?: string
          video_type?: string
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_videos_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_videos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      backfill_audit_managed_creator_history: {
        Row: {
          case_classification: string
          confidence: string
          created_at: string
          id: string
          managed_creator_id: string | null
          notes: string | null
          platform: string
          rows_inserted: number
        }
        Insert: {
          case_classification: string
          confidence: string
          created_at?: string
          id?: string
          managed_creator_id?: string | null
          notes?: string | null
          platform: string
          rows_inserted?: number
        }
        Update: {
          case_classification?: string
          confidence?: string
          created_at?: string
          id?: string
          managed_creator_id?: string | null
          notes?: string | null
          platform?: string
          rows_inserted?: number
        }
        Relationships: [
          {
            foreignKeyName: "backfill_audit_mc_history_managed_creator_id_fkey"
            columns: ["managed_creator_id"]
            isOneToOne: false
            referencedRelation: "managed_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_action_items: {
        Row: {
          brand_organization_id: string
          created_at: string | null
          feedback_text: string | null
          id: string
          post_id: string
          rating: number | null
          reviewed_at: string | null
          status: string
        }
        Insert: {
          brand_organization_id: string
          created_at?: string | null
          feedback_text?: string | null
          id?: string
          post_id: string
          rating?: number | null
          reviewed_at?: string | null
          status?: string
        }
        Update: {
          brand_organization_id?: string
          created_at?: string | null
          feedback_text?: string | null
          id?: string
          post_id?: string
          rating?: number | null
          reviewed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_action_items_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_action_items_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_campaigns: {
        Row: {
          base_pay_per_video_cents: number | null
          bonus_milestones: Json | null
          brand_organization_id: string
          budget_cents: number | null
          country: string | null
          created_at: string
          end_date: string | null
          id: string
          job_id: string | null
          min_views_pay_cents: number | null
          min_views_threshold: number | null
          monthly_cap_cents: number | null
          name: string
          notes: string | null
          platforms: string[]
          posting_frequency: string | null
          referral_bonus_cents: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["brand_campaign_status"]
          target_video_count: number | null
          updated_at: string
        }
        Insert: {
          base_pay_per_video_cents?: number | null
          bonus_milestones?: Json | null
          brand_organization_id: string
          budget_cents?: number | null
          country?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          job_id?: string | null
          min_views_pay_cents?: number | null
          min_views_threshold?: number | null
          monthly_cap_cents?: number | null
          name: string
          notes?: string | null
          platforms?: string[]
          posting_frequency?: string | null
          referral_bonus_cents?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["brand_campaign_status"]
          target_video_count?: number | null
          updated_at?: string
        }
        Update: {
          base_pay_per_video_cents?: number | null
          bonus_milestones?: Json | null
          brand_organization_id?: string
          budget_cents?: number | null
          country?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          job_id?: string | null
          min_views_pay_cents?: number | null
          min_views_threshold?: number | null
          monthly_cap_cents?: number | null
          name?: string
          notes?: string | null
          platforms?: string[]
          posting_frequency?: string | null
          referral_bonus_cents?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["brand_campaign_status"]
          target_video_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_campaigns_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_campaigns_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cpm_campaign_stats"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "brand_campaigns_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "brand_campaigns_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_ga4_connections: {
        Row: {
          access_token: string
          brand_organization_id: string
          created_at: string
          display_order: number
          ga4_property_id: string
          ga4_property_name: string | null
          google_account_email: string | null
          id: string
          is_primary: boolean
          last_synced_at: string | null
          refresh_token: string
          sync_error: string | null
          sync_status: string
          token_expires_at: string
          updated_at: string
        }
        Insert: {
          access_token: string
          brand_organization_id: string
          created_at?: string
          display_order?: number
          ga4_property_id: string
          ga4_property_name?: string | null
          google_account_email?: string | null
          id?: string
          is_primary?: boolean
          last_synced_at?: string | null
          refresh_token: string
          sync_error?: string | null
          sync_status?: string
          token_expires_at: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          brand_organization_id?: string
          created_at?: string
          display_order?: number
          ga4_property_id?: string
          ga4_property_name?: string | null
          google_account_email?: string | null
          id?: string
          is_primary?: boolean
          last_synced_at?: string | null
          refresh_token?: string
          sync_error?: string | null
          sync_status?: string
          token_expires_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_ga4_connections_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_ga4_daily_countries: {
        Row: {
          brand_organization_id: string
          connection_id: string | null
          country_code: string
          country_name: string
          created_at: string
          date: string
          ga4_property_id: string | null
          id: string
          sessions: number
          users: number
        }
        Insert: {
          brand_organization_id: string
          connection_id?: string | null
          country_code: string
          country_name: string
          created_at?: string
          date: string
          ga4_property_id?: string | null
          id?: string
          sessions?: number
          users?: number
        }
        Update: {
          brand_organization_id?: string
          connection_id?: string | null
          country_code?: string
          country_name?: string
          created_at?: string
          date?: string
          ga4_property_id?: string | null
          id?: string
          sessions?: number
          users?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_ga4_daily_countries_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ga4_daily_countries_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "brand_ga4_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_ga4_daily_metrics: {
        Row: {
          android_users: number
          avg_session_duration_seconds: number | null
          bounce_rate: number | null
          brand_organization_id: string
          connection_id: string | null
          created_at: string
          date: string
          desktop_users: number
          engaged_sessions: number
          engagement_rate: number | null
          ga4_property_id: string | null
          id: string
          ios_users: number
          macos_users: number
          mobile_users: number
          new_users: number
          other_os_users: number
          pages_per_session: number | null
          pageviews: number
          sessions: number
          sessions_per_user: number | null
          tablet_users: number
          users: number
          windows_users: number
        }
        Insert: {
          android_users?: number
          avg_session_duration_seconds?: number | null
          bounce_rate?: number | null
          brand_organization_id: string
          connection_id?: string | null
          created_at?: string
          date: string
          desktop_users?: number
          engaged_sessions?: number
          engagement_rate?: number | null
          ga4_property_id?: string | null
          id?: string
          ios_users?: number
          macos_users?: number
          mobile_users?: number
          new_users?: number
          other_os_users?: number
          pages_per_session?: number | null
          pageviews?: number
          sessions?: number
          sessions_per_user?: number | null
          tablet_users?: number
          users?: number
          windows_users?: number
        }
        Update: {
          android_users?: number
          avg_session_duration_seconds?: number | null
          bounce_rate?: number | null
          brand_organization_id?: string
          connection_id?: string | null
          created_at?: string
          date?: string
          desktop_users?: number
          engaged_sessions?: number
          engagement_rate?: number | null
          ga4_property_id?: string | null
          id?: string
          ios_users?: number
          macos_users?: number
          mobile_users?: number
          new_users?: number
          other_os_users?: number
          pages_per_session?: number | null
          pageviews?: number
          sessions?: number
          sessions_per_user?: number | null
          tablet_users?: number
          users?: number
          windows_users?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_ga4_daily_metrics_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ga4_daily_metrics_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "brand_ga4_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_invites: {
        Row: {
          brand_organization_id: string
          created_at: string | null
          decline_reason: string | null
          declined_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["brand_member_role"] | null
          support_contacted_at: string | null
          token: string
          updated_at: string | null
          used_at: string | null
        }
        Insert: {
          brand_organization_id: string
          created_at?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["brand_member_role"] | null
          support_contacted_at?: string | null
          token: string
          updated_at?: string | null
          used_at?: string | null
        }
        Update: {
          brand_organization_id?: string
          created_at?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["brand_member_role"] | null
          support_contacted_at?: string | null
          token?: string
          updated_at?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_invites_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_members: {
        Row: {
          brand_organization_id: string
          created_at: string | null
          department: string | null
          first_name: string | null
          id: string
          invitation_status:
            | Database["public"]["Enums"]["invitation_status"]
            | null
          invited_by: string | null
          job_title: string | null
          joined_at: string | null
          last_name: string | null
          permissions: Json | null
          phone: string | null
          profile_picture: string | null
          role: Database["public"]["Enums"]["brand_member_role"] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          brand_organization_id: string
          created_at?: string | null
          department?: string | null
          first_name?: string | null
          id?: string
          invitation_status?:
            | Database["public"]["Enums"]["invitation_status"]
            | null
          invited_by?: string | null
          job_title?: string | null
          joined_at?: string | null
          last_name?: string | null
          permissions?: Json | null
          phone?: string | null
          profile_picture?: string | null
          role?: Database["public"]["Enums"]["brand_member_role"] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          brand_organization_id?: string
          created_at?: string | null
          department?: string | null
          first_name?: string | null
          id?: string
          invitation_status?:
            | Database["public"]["Enums"]["invitation_status"]
            | null
          invited_by?: string | null
          job_title?: string | null
          joined_at?: string | null
          last_name?: string | null
          permissions?: Json | null
          phone?: string | null
          profile_picture?: string | null
          role?: Database["public"]["Enums"]["brand_member_role"] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_members_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_organizations: {
        Row: {
          account_status:
            | Database["public"]["Enums"]["brand_account_status"]
            | null
          activity_status:
            | Database["public"]["Enums"]["brand_activity_status"]
            | null
          admin_notes: string | null
          admin_slack_channel_id: string | null
          admin_status: string | null
          billing_email: string | null
          budget: number | null
          budget_by_market: Json | null
          company_logo: string | null
          company_size: string | null
          contact_email: string | null
          contact_phone: string | null
          contract_start_date: string | null
          created_at: string | null
          currency: Database["public"]["Enums"]["accepted_currency"]
          default_listening_passive: boolean | null
          description: string | null
          dynamic_pricing_enabled: boolean | null
          eight_x_managed: boolean
          guide_url_overrides: Json | null
          headquarters_location: string | null
          hygiene_checks: Json | null
          id: string
          industry: string | null
          main_user_id: string | null
          network_access_enabled: boolean
          notification_settings: Json | null
          onboarding_call_link: string | null
          onboarding_completed_at: string | null
          onboarding_status:
            | Database["public"]["Enums"]["brand_onboarding_status"]
            | null
          organization_name: string
          organization_slug: string
          platform_fee_percentage: number | null
          stripe_customer_id: string | null
          subscription_plan_id: string | null
          target_creators_by_market: Json | null
          target_markets: string[] | null
          tracked_creator_accounts: Json | null
          updated_at: string | null
          use_cases: Json | null
          website: string | null
        }
        Insert: {
          account_status?:
            | Database["public"]["Enums"]["brand_account_status"]
            | null
          activity_status?:
            | Database["public"]["Enums"]["brand_activity_status"]
            | null
          admin_notes?: string | null
          admin_slack_channel_id?: string | null
          admin_status?: string | null
          billing_email?: string | null
          budget?: number | null
          budget_by_market?: Json | null
          company_logo?: string | null
          company_size?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          currency?: Database["public"]["Enums"]["accepted_currency"]
          default_listening_passive?: boolean | null
          description?: string | null
          dynamic_pricing_enabled?: boolean | null
          eight_x_managed?: boolean
          guide_url_overrides?: Json | null
          headquarters_location?: string | null
          hygiene_checks?: Json | null
          id?: string
          industry?: string | null
          main_user_id?: string | null
          network_access_enabled?: boolean
          notification_settings?: Json | null
          onboarding_call_link?: string | null
          onboarding_completed_at?: string | null
          onboarding_status?:
            | Database["public"]["Enums"]["brand_onboarding_status"]
            | null
          organization_name: string
          organization_slug: string
          platform_fee_percentage?: number | null
          stripe_customer_id?: string | null
          subscription_plan_id?: string | null
          target_creators_by_market?: Json | null
          target_markets?: string[] | null
          tracked_creator_accounts?: Json | null
          updated_at?: string | null
          use_cases?: Json | null
          website?: string | null
        }
        Update: {
          account_status?:
            | Database["public"]["Enums"]["brand_account_status"]
            | null
          activity_status?:
            | Database["public"]["Enums"]["brand_activity_status"]
            | null
          admin_notes?: string | null
          admin_slack_channel_id?: string | null
          admin_status?: string | null
          billing_email?: string | null
          budget?: number | null
          budget_by_market?: Json | null
          company_logo?: string | null
          company_size?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          currency?: Database["public"]["Enums"]["accepted_currency"]
          default_listening_passive?: boolean | null
          description?: string | null
          dynamic_pricing_enabled?: boolean | null
          eight_x_managed?: boolean
          guide_url_overrides?: Json | null
          headquarters_location?: string | null
          hygiene_checks?: Json | null
          id?: string
          industry?: string | null
          main_user_id?: string | null
          network_access_enabled?: boolean
          notification_settings?: Json | null
          onboarding_call_link?: string | null
          onboarding_completed_at?: string | null
          onboarding_status?:
            | Database["public"]["Enums"]["brand_onboarding_status"]
            | null
          organization_name?: string
          organization_slug?: string
          platform_fee_percentage?: number | null
          stripe_customer_id?: string | null
          subscription_plan_id?: string | null
          target_creators_by_market?: Json | null
          target_markets?: string[] | null
          tracked_creator_accounts?: Json | null
          updated_at?: string | null
          use_cases?: Json | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_organizations_main_user_id_fkey"
            columns: ["main_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_organizations_subscription_plan_id_fkey"
            columns: ["subscription_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_reference_videos: {
        Row: {
          adaptation: string | null
          ai_transcript: string | null
          ai_transcript_segments: Json | null
          brand_organization_id: string
          category: string
          created_at: string | null
          disclaimer: string | null
          file_hash: string | null
          id: string
          job_ids: string[] | null
          matching_summary: string | null
          music: string | null
          notes: string | null
          onscreen_text: string | null
          pdf_storage_path: string | null
          promoted_brief: boolean
          promoted_job_listing: boolean
          promoted_onboarding: boolean
          sort_order: number
          storage_path: string | null
          transcript: string | null
          video_processed_at: string | null
          video_processing_error: string | null
          video_processing_status: string | null
          video_summary: string | null
          video_url: string | null
        }
        Insert: {
          adaptation?: string | null
          ai_transcript?: string | null
          ai_transcript_segments?: Json | null
          brand_organization_id: string
          category?: string
          created_at?: string | null
          disclaimer?: string | null
          file_hash?: string | null
          id?: string
          job_ids?: string[] | null
          matching_summary?: string | null
          music?: string | null
          notes?: string | null
          onscreen_text?: string | null
          pdf_storage_path?: string | null
          promoted_brief?: boolean
          promoted_job_listing?: boolean
          promoted_onboarding?: boolean
          sort_order?: number
          storage_path?: string | null
          transcript?: string | null
          video_processed_at?: string | null
          video_processing_error?: string | null
          video_processing_status?: string | null
          video_summary?: string | null
          video_url?: string | null
        }
        Update: {
          adaptation?: string | null
          ai_transcript?: string | null
          ai_transcript_segments?: Json | null
          brand_organization_id?: string
          category?: string
          created_at?: string | null
          disclaimer?: string | null
          file_hash?: string | null
          id?: string
          job_ids?: string[] | null
          matching_summary?: string | null
          music?: string | null
          notes?: string | null
          onscreen_text?: string | null
          pdf_storage_path?: string | null
          promoted_brief?: boolean
          promoted_job_listing?: boolean
          promoted_onboarding?: boolean
          sort_order?: number
          storage_path?: string | null
          transcript?: string | null
          video_processed_at?: string | null
          video_processing_error?: string | null
          video_processing_status?: string | null
          video_summary?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_reference_videos_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_resources: {
        Row: {
          brand_organization_id: string
          created_at: string | null
          description: string | null
          from_template_id: string | null
          icon: string | null
          id: string
          is_required: boolean | null
          order_index: number | null
          resource_type: string
          slot_number: number | null
          title: string
          unlock_after_task: string | null
          updated_at: string | null
          url: string
        }
        Insert: {
          brand_organization_id: string
          created_at?: string | null
          description?: string | null
          from_template_id?: string | null
          icon?: string | null
          id?: string
          is_required?: boolean | null
          order_index?: number | null
          resource_type?: string
          slot_number?: number | null
          title: string
          unlock_after_task?: string | null
          updated_at?: string | null
          url: string
        }
        Update: {
          brand_organization_id?: string
          created_at?: string | null
          description?: string | null
          from_template_id?: string | null
          icon?: string | null
          id?: string
          is_required?: boolean | null
          order_index?: number | null
          resource_type?: string
          slot_number?: number | null
          title?: string
          unlock_after_task?: string | null
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_resources_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_resources_from_template_id_fkey"
            columns: ["from_template_id"]
            isOneToOne: false
            referencedRelation: "platform_resource_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_tracked_social_accounts: {
        Row: {
          brand_organization_id: string
          campaign: string
          created_at: string | null
          frozen: boolean
          id: string
          social_account_connector_id: string
          updated_at: string | null
        }
        Insert: {
          brand_organization_id: string
          campaign?: string
          created_at?: string | null
          frozen?: boolean
          id?: string
          social_account_connector_id: string
          updated_at?: string | null
        }
        Update: {
          brand_organization_id?: string
          campaign?: string
          created_at?: string | null
          frozen?: boolean
          id?: string
          social_account_connector_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_tracked_social_accounts_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_tracked_social_accounts_social_account_connector_id_fkey"
            columns: ["social_account_connector_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_transactions: {
        Row: {
          amount: number
          balance_after: number
          brand_organization_id: string
          brand_wallet_id: string
          created_at: string | null
          created_by: string | null
          creator_amount: number | null
          customer_paid: number | null
          description: string | null
          id: string
          platform_fee: number | null
          platform_surplus: number | null
          related_job_id: string | null
          stripe_fee: number | null
          stripe_payment_intent_id: string | null
          transaction_type: Database["public"]["Enums"]["brand_transaction_type"]
        }
        Insert: {
          amount: number
          balance_after: number
          brand_organization_id: string
          brand_wallet_id: string
          created_at?: string | null
          created_by?: string | null
          creator_amount?: number | null
          customer_paid?: number | null
          description?: string | null
          id?: string
          platform_fee?: number | null
          platform_surplus?: number | null
          related_job_id?: string | null
          stripe_fee?: number | null
          stripe_payment_intent_id?: string | null
          transaction_type: Database["public"]["Enums"]["brand_transaction_type"]
        }
        Update: {
          amount?: number
          balance_after?: number
          brand_organization_id?: string
          brand_wallet_id?: string
          created_at?: string | null
          created_by?: string | null
          creator_amount?: number | null
          customer_paid?: number | null
          description?: string | null
          id?: string
          platform_fee?: number | null
          platform_surplus?: number | null
          related_job_id?: string | null
          stripe_fee?: number | null
          stripe_payment_intent_id?: string | null
          transaction_type?: Database["public"]["Enums"]["brand_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "brand_transactions_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_transactions_brand_wallet_id_fkey"
            columns: ["brand_wallet_id"]
            isOneToOne: false
            referencedRelation: "brand_wallet"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_transactions_related_job_id_fkey"
            columns: ["related_job_id"]
            isOneToOne: false
            referencedRelation: "cpm_campaign_stats"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "brand_transactions_related_job_id_fkey"
            columns: ["related_job_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "brand_transactions_related_job_id_fkey"
            columns: ["related_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_wallet: {
        Row: {
          available_balance: number | null
          brand_organization_id: string
          created_at: string | null
          currency: string | null
          id: string
          pending_balance: number | null
          total_deposited: number | null
          total_spent: number | null
          updated_at: string | null
        }
        Insert: {
          available_balance?: number | null
          brand_organization_id: string
          created_at?: string | null
          currency?: string | null
          id?: string
          pending_balance?: number | null
          total_deposited?: number | null
          total_spent?: number | null
          updated_at?: string | null
        }
        Update: {
          available_balance?: number | null
          brand_organization_id?: string
          created_at?: string | null
          currency?: string | null
          id?: string
          pending_balance?: number | null
          total_deposited?: number | null
          total_spent?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_wallet_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: true
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      burner_accounts: {
        Row: {
          assigned_campaign: string | null
          created_at: string
          creator_profile_id: string | null
          followers_count: number
          handle: string
          id: string
          platform: Database["public"]["Enums"]["burner_platform"]
          posts_count: number
          status: Database["public"]["Enums"]["burner_status"]
          updated_at: string
          user_id: string
          warmup_score: number
        }
        Insert: {
          assigned_campaign?: string | null
          created_at?: string
          creator_profile_id?: string | null
          followers_count?: number
          handle: string
          id?: string
          platform?: Database["public"]["Enums"]["burner_platform"]
          posts_count?: number
          status?: Database["public"]["Enums"]["burner_status"]
          updated_at?: string
          user_id: string
          warmup_score?: number
        }
        Update: {
          assigned_campaign?: string | null
          created_at?: string
          creator_profile_id?: string | null
          followers_count?: number
          handle?: string
          id?: string
          platform?: Database["public"]["Enums"]["burner_platform"]
          posts_count?: number
          status?: Database["public"]["Enums"]["burner_status"]
          updated_at?: string
          user_id?: string
          warmup_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "burner_accounts_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "burner_accounts_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "burner_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      country_iso_lookup: {
        Row: {
          country_name: string
          iso_code: string
        }
        Insert: {
          country_name: string
          iso_code: string
        }
        Update: {
          country_name?: string
          iso_code?: string
        }
        Relationships: []
      }
      country_pricing_tiers: {
        Row: {
          active: boolean
          bonus_milestones: Json | null
          country_code: string
          country_name: string
          created_at: string
          creator_base_pay_cents: number
          gni_per_capita_ppp: number | null
          max_monthly_per_campaign_cents: number | null
          notes: string | null
          suggested_brand_charge_cents: number
          tier: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          bonus_milestones?: Json | null
          country_code: string
          country_name: string
          created_at?: string
          creator_base_pay_cents: number
          gni_per_capita_ppp?: number | null
          max_monthly_per_campaign_cents?: number | null
          notes?: string | null
          suggested_brand_charge_cents: number
          tier: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          bonus_milestones?: Json | null
          country_code?: string
          country_name?: string
          created_at?: string
          creator_base_pay_cents?: number
          gni_per_capita_ppp?: number | null
          max_monthly_per_campaign_cents?: number | null
          notes?: string | null
          suggested_brand_charge_cents?: number
          tier?: number
          updated_at?: string
        }
        Relationships: []
      }
      cpm_submissions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          base_pay_earned: number
          cpm_earnings: number
          created_at: string
          creator_profile_id: string
          earnings_paid: number
          earnings_total: number
          fetch_attempts: number | null
          fetched_at: string | null
          id: string
          ineligibility_reason: string | null
          job_application_id: string
          job_id: string
          last_fetch_error: string | null
          last_synced_at: string | null
          platform: string
          post_id: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["cpm_submission_status"]
          submitted_at: string
          updated_at: string
          video_url: string
          views_approved: number
          views_at_submission: number
          views_current: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          base_pay_earned?: number
          cpm_earnings?: number
          created_at?: string
          creator_profile_id: string
          earnings_paid?: number
          earnings_total?: number
          fetch_attempts?: number | null
          fetched_at?: string | null
          id?: string
          ineligibility_reason?: string | null
          job_application_id: string
          job_id: string
          last_fetch_error?: string | null
          last_synced_at?: string | null
          platform: string
          post_id?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["cpm_submission_status"]
          submitted_at?: string
          updated_at?: string
          video_url: string
          views_approved?: number
          views_at_submission?: number
          views_current?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          base_pay_earned?: number
          cpm_earnings?: number
          created_at?: string
          creator_profile_id?: string
          earnings_paid?: number
          earnings_total?: number
          fetch_attempts?: number | null
          fetched_at?: string | null
          id?: string
          ineligibility_reason?: string | null
          job_application_id?: string
          job_id?: string
          last_fetch_error?: string | null
          last_synced_at?: string | null
          platform?: string
          post_id?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["cpm_submission_status"]
          submitted_at?: string
          updated_at?: string
          video_url?: string
          views_approved?: number
          views_at_submission?: number
          views_current?: number
        }
        Relationships: [
          {
            foreignKeyName: "cpm_submissions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cpm_submissions_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "cpm_submissions_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cpm_submissions_job_application_id_fkey"
            columns: ["job_application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cpm_submissions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cpm_campaign_stats"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "cpm_submissions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "cpm_submissions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cpm_submissions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_instagram_connections: {
        Row: {
          access_token: string
          account_type: string | null
          avatar_url: string | null
          biography: string | null
          created_at: string | null
          creator_profile_id: string
          display_name: string | null
          follower_count: number | null
          following_count: number | null
          granted_scopes: string[] | null
          id: string
          instagram_account_id: string | null
          instagram_user_id: string
          instagram_username: string | null
          is_verified: boolean | null
          last_synced_at: string | null
          media_count: number | null
          sync_error: string | null
          sync_status: string | null
          token_expires_at: string
          updated_at: string | null
        }
        Insert: {
          access_token: string
          account_type?: string | null
          avatar_url?: string | null
          biography?: string | null
          created_at?: string | null
          creator_profile_id: string
          display_name?: string | null
          follower_count?: number | null
          following_count?: number | null
          granted_scopes?: string[] | null
          id?: string
          instagram_account_id?: string | null
          instagram_user_id: string
          instagram_username?: string | null
          is_verified?: boolean | null
          last_synced_at?: string | null
          media_count?: number | null
          sync_error?: string | null
          sync_status?: string | null
          token_expires_at: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          account_type?: string | null
          avatar_url?: string | null
          biography?: string | null
          created_at?: string | null
          creator_profile_id?: string
          display_name?: string | null
          follower_count?: number | null
          following_count?: number | null
          granted_scopes?: string[] | null
          id?: string
          instagram_account_id?: string | null
          instagram_user_id?: string
          instagram_username?: string | null
          is_verified?: boolean | null
          last_synced_at?: string | null
          media_count?: number | null
          sync_error?: string | null
          sync_status?: string | null
          token_expires_at?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_instagram_connections_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "creator_instagram_connections_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_instagram_connections_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_profiles: {
        Row: {
          account_status:
            | Database["public"]["Enums"]["creator_account_status"]
            | null
          age: number | null
          auto_withdraw_day: number | null
          auto_withdraw_enabled: boolean | null
          average_communication_rating: number | null
          average_professionalism_rating: number | null
          average_quality_rating: number | null
          average_rating: number | null
          average_timeliness_rating: number | null
          bio: string | null
          content_types: Database["public"]["Enums"]["content_type"][] | null
          created_at: string | null
          currency: Database["public"]["Enums"]["accepted_currency"]
          cv_url: string | null
          date_of_birth: string | null
          display_name: string
          email: string | null
          ethnicity: string | null
          first_name: string | null
          gender: string | null
          has_experience: boolean | null
          id: string
          interests: Database["public"]["Enums"]["interest"][] | null
          intro_video_url: string | null
          invite_expires_at: string | null
          invite_notes: string | null
          invite_token: string | null
          invited_by: string | null
          is_8x_employee: boolean | null
          is_test_account: boolean
          languages_spoken: Database["public"]["Enums"]["language"][] | null
          last_name: string | null
          location: string | null
          onboarding_completed_at: string | null
          onboarding_status:
            | Database["public"]["Enums"]["creator_onboarding_status"]
            | null
          phone: string | null
          profile_picture: string | null
          social_links: Json | null
          stripe_account_id: string | null
          stripe_charges_enabled: boolean | null
          stripe_onboarding_complete: boolean | null
          stripe_payouts_enabled: boolean | null
          stripe_region: string | null
          stripe_us_migration_required: boolean | null
          top_posts: Json | null
          total_jobs_active: number | null
          total_jobs_completed: number | null
          trust_gate_completed_at: string | null
          university: string | null
          updated_at: string | null
          user_id: string | null
          work_status: Database["public"]["Enums"]["work_status"] | null
        }
        Insert: {
          account_status?:
            | Database["public"]["Enums"]["creator_account_status"]
            | null
          age?: number | null
          auto_withdraw_day?: number | null
          auto_withdraw_enabled?: boolean | null
          average_communication_rating?: number | null
          average_professionalism_rating?: number | null
          average_quality_rating?: number | null
          average_rating?: number | null
          average_timeliness_rating?: number | null
          bio?: string | null
          content_types?: Database["public"]["Enums"]["content_type"][] | null
          created_at?: string | null
          currency?: Database["public"]["Enums"]["accepted_currency"]
          cv_url?: string | null
          date_of_birth?: string | null
          display_name: string
          email?: string | null
          ethnicity?: string | null
          first_name?: string | null
          gender?: string | null
          has_experience?: boolean | null
          id?: string
          interests?: Database["public"]["Enums"]["interest"][] | null
          intro_video_url?: string | null
          invite_expires_at?: string | null
          invite_notes?: string | null
          invite_token?: string | null
          invited_by?: string | null
          is_8x_employee?: boolean | null
          is_test_account?: boolean
          languages_spoken?: Database["public"]["Enums"]["language"][] | null
          last_name?: string | null
          location?: string | null
          onboarding_completed_at?: string | null
          onboarding_status?:
            | Database["public"]["Enums"]["creator_onboarding_status"]
            | null
          phone?: string | null
          profile_picture?: string | null
          social_links?: Json | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean | null
          stripe_onboarding_complete?: boolean | null
          stripe_payouts_enabled?: boolean | null
          stripe_region?: string | null
          stripe_us_migration_required?: boolean | null
          top_posts?: Json | null
          total_jobs_active?: number | null
          total_jobs_completed?: number | null
          trust_gate_completed_at?: string | null
          university?: string | null
          updated_at?: string | null
          user_id?: string | null
          work_status?: Database["public"]["Enums"]["work_status"] | null
        }
        Update: {
          account_status?:
            | Database["public"]["Enums"]["creator_account_status"]
            | null
          age?: number | null
          auto_withdraw_day?: number | null
          auto_withdraw_enabled?: boolean | null
          average_communication_rating?: number | null
          average_professionalism_rating?: number | null
          average_quality_rating?: number | null
          average_rating?: number | null
          average_timeliness_rating?: number | null
          bio?: string | null
          content_types?: Database["public"]["Enums"]["content_type"][] | null
          created_at?: string | null
          currency?: Database["public"]["Enums"]["accepted_currency"]
          cv_url?: string | null
          date_of_birth?: string | null
          display_name?: string
          email?: string | null
          ethnicity?: string | null
          first_name?: string | null
          gender?: string | null
          has_experience?: boolean | null
          id?: string
          interests?: Database["public"]["Enums"]["interest"][] | null
          intro_video_url?: string | null
          invite_expires_at?: string | null
          invite_notes?: string | null
          invite_token?: string | null
          invited_by?: string | null
          is_8x_employee?: boolean | null
          is_test_account?: boolean
          languages_spoken?: Database["public"]["Enums"]["language"][] | null
          last_name?: string | null
          location?: string | null
          onboarding_completed_at?: string | null
          onboarding_status?:
            | Database["public"]["Enums"]["creator_onboarding_status"]
            | null
          phone?: string | null
          profile_picture?: string | null
          social_links?: Json | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean | null
          stripe_onboarding_complete?: boolean | null
          stripe_payouts_enabled?: boolean | null
          stripe_region?: string | null
          stripe_us_migration_required?: boolean | null
          top_posts?: Json | null
          total_jobs_active?: number | null
          total_jobs_completed?: number | null
          trust_gate_completed_at?: string | null
          university?: string | null
          updated_at?: string | null
          user_id?: string | null
          work_status?: Database["public"]["Enums"]["work_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_snapshots: {
        Row: {
          creator_id: string
          follower_count: number | null
          following_count: number | null
          id: string
          total_hearts: number | null
          tracked_at: string | null
          video_count: number | null
        }
        Insert: {
          creator_id: string
          follower_count?: number | null
          following_count?: number | null
          id?: string
          total_hearts?: number | null
          tracked_at?: string | null
          video_count?: number | null
        }
        Update: {
          creator_id?: string
          follower_count?: number | null
          following_count?: number | null
          id?: string
          total_hearts?: number | null
          tracked_at?: string | null
          video_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_snapshots_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "creator_snapshots_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_tiktok_connections: {
        Row: {
          access_token: string
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          creator_profile_id: string
          display_name: string | null
          follower_count: number | null
          granted_scopes: string[] | null
          id: string
          is_verified: boolean | null
          last_synced_at: string | null
          refresh_token: string
          refresh_token_expires_at: string
          sync_error: string | null
          sync_status: string | null
          tiktok_account_id: string | null
          tiktok_open_id: string
          tiktok_username: string | null
          token_expires_at: string
          updated_at: string | null
          video_count: number | null
        }
        Insert: {
          access_token: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          creator_profile_id: string
          display_name?: string | null
          follower_count?: number | null
          granted_scopes?: string[] | null
          id?: string
          is_verified?: boolean | null
          last_synced_at?: string | null
          refresh_token: string
          refresh_token_expires_at: string
          sync_error?: string | null
          sync_status?: string | null
          tiktok_account_id?: string | null
          tiktok_open_id: string
          tiktok_username?: string | null
          token_expires_at: string
          updated_at?: string | null
          video_count?: number | null
        }
        Update: {
          access_token?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          creator_profile_id?: string
          display_name?: string | null
          follower_count?: number | null
          granted_scopes?: string[] | null
          id?: string
          is_verified?: boolean | null
          last_synced_at?: string | null
          refresh_token?: string
          refresh_token_expires_at?: string
          sync_error?: string | null
          sync_status?: string | null
          tiktok_account_id?: string | null
          tiktok_open_id?: string
          tiktok_username?: string | null
          token_expires_at?: string
          updated_at?: string | null
          video_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_tiktok_connections_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "creator_tiktok_connections_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_tiktok_connections_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_transactions: {
        Row: {
          amount: number
          balance_after: number
          completed_at: string | null
          created_at: string | null
          creator_profile_id: string
          creator_wallet_id: string | null
          description: string | null
          id: string
          job_id: string | null
          managed_creator_post_id: string | null
          offplatform_method: string | null
          payout_amount_cents: number | null
          payout_currency: string | null
          related_cpm_submission_id: string | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          stripe_payout_id: string | null
          stripe_transfer_id: string | null
          stripe_transfer_status: string
          transaction_type: Database["public"]["Enums"]["creator_transaction_type"]
          triggered_by_admin_id: string | null
          views_at_payment: number | null
        }
        Insert: {
          amount: number
          balance_after: number
          completed_at?: string | null
          created_at?: string | null
          creator_profile_id: string
          creator_wallet_id?: string | null
          description?: string | null
          id?: string
          job_id?: string | null
          managed_creator_post_id?: string | null
          offplatform_method?: string | null
          payout_amount_cents?: number | null
          payout_currency?: string | null
          related_cpm_submission_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          stripe_transfer_status?: string
          transaction_type: Database["public"]["Enums"]["creator_transaction_type"]
          triggered_by_admin_id?: string | null
          views_at_payment?: number | null
        }
        Update: {
          amount?: number
          balance_after?: number
          completed_at?: string | null
          created_at?: string | null
          creator_profile_id?: string
          creator_wallet_id?: string | null
          description?: string | null
          id?: string
          job_id?: string | null
          managed_creator_post_id?: string | null
          offplatform_method?: string | null
          payout_amount_cents?: number | null
          payout_currency?: string | null
          related_cpm_submission_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          stripe_transfer_status?: string
          transaction_type?: Database["public"]["Enums"]["creator_transaction_type"]
          triggered_by_admin_id?: string | null
          views_at_payment?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_transactions_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "creator_transactions_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_transactions_creator_wallet_id_fkey"
            columns: ["creator_wallet_id"]
            isOneToOne: false
            referencedRelation: "creator_wallet"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_transactions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cpm_campaign_stats"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "creator_transactions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "creator_transactions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_transactions_managed_creator_post_id_fkey"
            columns: ["managed_creator_post_id"]
            isOneToOne: false
            referencedRelation: "managed_creator_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_transactions_related_cpm_submission_id_fkey"
            columns: ["related_cpm_submission_id"]
            isOneToOne: false
            referencedRelation: "cpm_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_transactions_triggered_by_admin_id_fkey"
            columns: ["triggered_by_admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_wallet: {
        Row: {
          created_at: string | null
          creator_profile_id: string
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          creator_profile_id: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          creator_profile_id?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_wallet_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: true
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "creator_wallet_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: true
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_runs: {
        Row: {
          accounts_failed: number
          accounts_found: number
          accounts_processed: number
          accounts_skipped: number
          accounts_succeeded: number
          completed_at: string | null
          created_at: string
          cron_name: string
          duration_ms: number | null
          error: string | null
          id: string
          metadata: Json | null
          started_at: string
          status: string
          total_deleted_posts: number
          total_new_posts: number
          total_updated_posts: number
        }
        Insert: {
          accounts_failed?: number
          accounts_found?: number
          accounts_processed?: number
          accounts_skipped?: number
          accounts_succeeded?: number
          completed_at?: string | null
          created_at?: string
          cron_name: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          metadata?: Json | null
          started_at?: string
          status?: string
          total_deleted_posts?: number
          total_new_posts?: number
          total_updated_posts?: number
        }
        Update: {
          accounts_failed?: number
          accounts_found?: number
          accounts_processed?: number
          accounts_skipped?: number
          accounts_succeeded?: number
          completed_at?: string | null
          created_at?: string
          cron_name?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          metadata?: Json | null
          started_at?: string
          status?: string
          total_deleted_posts?: number
          total_new_posts?: number
          total_updated_posts?: number
        }
        Relationships: []
      }
      feedback: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"] | null
          created_at: string | null
          feedback_text: string
          id: string
          page_url: string | null
          updated_at: string | null
          user_agent: string | null
          user_city: string | null
          user_country: string | null
          user_email: string | null
          user_id: string
          user_region: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          created_at?: string | null
          feedback_text: string
          id?: string
          page_url?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_city?: string | null
          user_country?: string | null
          user_email?: string | null
          user_id: string
          user_region?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          created_at?: string | null
          feedback_text?: string
          id?: string
          page_url?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_city?: string | null
          user_country?: string | null
          user_email?: string | null
          user_id?: string
          user_region?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      inspector_actions: {
        Row: {
          action_type: string
          admin_user_id: string | null
          created_at: string | null
          execution_result: Json | null
          id: string
          preview_payload: Json
          target_ids: string[]
          target_table: string
        }
        Insert: {
          action_type: string
          admin_user_id?: string | null
          created_at?: string | null
          execution_result?: Json | null
          id?: string
          preview_payload: Json
          target_ids: string[]
          target_table: string
        }
        Update: {
          action_type?: string
          admin_user_id?: string | null
          created_at?: string | null
          execution_result?: Json | null
          id?: string
          preview_payload?: Json
          target_ids?: string[]
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspector_actions_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_accounts: {
        Row: {
          application_id: string | null
          backfill_attempts: number | null
          backfill_cursor: string | null
          backfill_status: string | null
          biography: string | null
          consecutive_sync_failures: number
          created_at: string | null
          creator_profile_id: string | null
          deleted_at: string | null
          follower_count: number | null
          following_count: number | null
          full_name: string | null
          id: string
          instagram_user_id: string | null
          instagram_username: string
          is_accounts_center_sibling: boolean
          is_active: boolean | null
          is_verified: boolean | null
          last_full_sync_at: string | null
          last_full_synced_at: string | null
          last_posts_fetched_at: string | null
          last_quick_sync_at: string | null
          last_synced_at: string | null
          media_count: number | null
          profile_pic_url: string | null
          profile_url: string | null
          source: string
          status: Database["public"]["Enums"]["social_account_status"]
          sync_completed_at: string | null
          sync_cursor: string | null
          sync_error: string | null
          sync_started_at: string | null
          sync_status: string | null
          tracking_disabled: boolean | null
          tracking_status: Database["public"]["Enums"]["account_sync_status"]
          updated_at: string | null
        }
        Insert: {
          application_id?: string | null
          backfill_attempts?: number | null
          backfill_cursor?: string | null
          backfill_status?: string | null
          biography?: string | null
          consecutive_sync_failures?: number
          created_at?: string | null
          creator_profile_id?: string | null
          deleted_at?: string | null
          follower_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id?: string
          instagram_user_id?: string | null
          instagram_username: string
          is_accounts_center_sibling?: boolean
          is_active?: boolean | null
          is_verified?: boolean | null
          last_full_sync_at?: string | null
          last_full_synced_at?: string | null
          last_posts_fetched_at?: string | null
          last_quick_sync_at?: string | null
          last_synced_at?: string | null
          media_count?: number | null
          profile_pic_url?: string | null
          profile_url?: string | null
          source: string
          status?: Database["public"]["Enums"]["social_account_status"]
          sync_completed_at?: string | null
          sync_cursor?: string | null
          sync_error?: string | null
          sync_started_at?: string | null
          sync_status?: string | null
          tracking_disabled?: boolean | null
          tracking_status?: Database["public"]["Enums"]["account_sync_status"]
          updated_at?: string | null
        }
        Update: {
          application_id?: string | null
          backfill_attempts?: number | null
          backfill_cursor?: string | null
          backfill_status?: string | null
          biography?: string | null
          consecutive_sync_failures?: number
          created_at?: string | null
          creator_profile_id?: string | null
          deleted_at?: string | null
          follower_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id?: string
          instagram_user_id?: string | null
          instagram_username?: string
          is_accounts_center_sibling?: boolean
          is_active?: boolean | null
          is_verified?: boolean | null
          last_full_sync_at?: string | null
          last_full_synced_at?: string | null
          last_posts_fetched_at?: string | null
          last_quick_sync_at?: string | null
          last_synced_at?: string | null
          media_count?: number | null
          profile_pic_url?: string | null
          profile_url?: string | null
          source?: string
          status?: Database["public"]["Enums"]["social_account_status"]
          sync_completed_at?: string | null
          sync_cursor?: string | null
          sync_error?: string | null
          sync_started_at?: string | null
          sync_status?: string | null
          tracking_disabled?: boolean | null
          tracking_status?: Database["public"]["Enums"]["account_sync_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_accounts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_accounts_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "instagram_accounts_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          accounts_verified_at: string | null
          application_status:
            | Database["public"]["Enums"]["application_status"]
            | null
          applied_at: string | null
          burner_account_id: string | null
          contract_accepted_at: string | null
          contract_signer_name: string | null
          contract_version: string | null
          cover_letter: string | null
          created_at: string | null
          creator_profile_id: string
          id: string
          job_id: string
          media: Json | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string | null
          warmup_checklist: Json | null
          warmup_completed_at: string | null
          warmup_instagram_handle: string | null
          warmup_tiktok_handle: string | null
        }
        Insert: {
          accounts_verified_at?: string | null
          application_status?:
            | Database["public"]["Enums"]["application_status"]
            | null
          applied_at?: string | null
          burner_account_id?: string | null
          contract_accepted_at?: string | null
          contract_signer_name?: string | null
          contract_version?: string | null
          cover_letter?: string | null
          created_at?: string | null
          creator_profile_id: string
          id?: string
          job_id: string
          media?: Json | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string | null
          warmup_checklist?: Json | null
          warmup_completed_at?: string | null
          warmup_instagram_handle?: string | null
          warmup_tiktok_handle?: string | null
        }
        Update: {
          accounts_verified_at?: string | null
          application_status?:
            | Database["public"]["Enums"]["application_status"]
            | null
          applied_at?: string | null
          burner_account_id?: string | null
          contract_accepted_at?: string | null
          contract_signer_name?: string | null
          contract_version?: string | null
          cover_letter?: string | null
          created_at?: string | null
          creator_profile_id?: string
          id?: string
          job_id?: string
          media?: Json | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string | null
          warmup_checklist?: Json | null
          warmup_completed_at?: string | null
          warmup_instagram_handle?: string | null
          warmup_tiktok_handle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_burner_account_id_fkey"
            columns: ["burner_account_id"]
            isOneToOne: false
            referencedRelation: "burner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "job_applications_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cpm_campaign_stats"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_requirements: {
        Row: {
          account_type_needed: string | null
          created_at: string | null
          id: string
          job_id: string
          max_age: number | null
          min_age: number | null
          min_average_rating: number | null
          min_engagement_rate: number | null
          min_followers_instagram: number | null
          min_followers_tiktok: number | null
          min_followers_youtube: number | null
          min_jobs_completed: number | null
          platforms_required: string[] | null
          preferred_ethnicity: string[] | null
          preferred_gender: string[] | null
          preferred_locations: string[] | null
          requires_business_account: boolean | null
          requires_face_showing: boolean | null
          requires_verified_account: boolean | null
          updated_at: string | null
        }
        Insert: {
          account_type_needed?: string | null
          created_at?: string | null
          id?: string
          job_id: string
          max_age?: number | null
          min_age?: number | null
          min_average_rating?: number | null
          min_engagement_rate?: number | null
          min_followers_instagram?: number | null
          min_followers_tiktok?: number | null
          min_followers_youtube?: number | null
          min_jobs_completed?: number | null
          platforms_required?: string[] | null
          preferred_ethnicity?: string[] | null
          preferred_gender?: string[] | null
          preferred_locations?: string[] | null
          requires_business_account?: boolean | null
          requires_face_showing?: boolean | null
          requires_verified_account?: boolean | null
          updated_at?: string | null
        }
        Update: {
          account_type_needed?: string | null
          created_at?: string | null
          id?: string
          job_id?: string
          max_age?: number | null
          min_age?: number | null
          min_average_rating?: number | null
          min_engagement_rate?: number | null
          min_followers_instagram?: number | null
          min_followers_tiktok?: number | null
          min_followers_youtube?: number | null
          min_jobs_completed?: number | null
          platforms_required?: string[] | null
          preferred_ethnicity?: string[] | null
          preferred_gender?: string[] | null
          preferred_locations?: string[] | null
          requires_business_account?: boolean | null
          requires_face_showing?: boolean | null
          requires_verified_account?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_requirements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "cpm_campaign_stats"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_requirements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_requirements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          application_deadline: string | null
          approved_at: string | null
          auto_approve_applications: boolean
          bonus_milestones: Json | null
          brand_organization_id: string
          budget_cents: number | null
          budget_per_creator: number | null
          budget_spent_cents: number | null
          closed_at: string | null
          content_guidelines: string | null
          cpm_base_pay: number | null
          cpm_cap: number | null
          cpm_payout_threshold: number | null
          cpm_platforms_allowed: string[] | null
          cpm_rate: number | null
          created_at: string | null
          created_by: string | null
          currency: Database["public"]["Enums"]["accepted_currency"]
          description: string
          end_date: string | null
          estimated_duration: string | null
          exclusivity_terms: string | null
          id: string
          industry: string | null
          job_slug: string
          job_title: string
          job_type: string
          max_pay_cents: number | null
          media: Json | null
          monthly_payout_cap: number | null
          payment_frequency:
            | Database["public"]["Enums"]["payment_frequency"]
            | null
          payout_status: string | null
          portal_config: Json | null
          priority: number
          published_at: string | null
          slack_channel_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["job_status"] | null
          target_country: string | null
          total_budget: number | null
          transcript: string | null
          updated_at: string | null
          usage_rights: string | null
          visibility: Database["public"]["Enums"]["job_visibility"] | null
        }
        Insert: {
          application_deadline?: string | null
          approved_at?: string | null
          auto_approve_applications?: boolean
          bonus_milestones?: Json | null
          brand_organization_id: string
          budget_cents?: number | null
          budget_per_creator?: number | null
          budget_spent_cents?: number | null
          closed_at?: string | null
          content_guidelines?: string | null
          cpm_base_pay?: number | null
          cpm_cap?: number | null
          cpm_payout_threshold?: number | null
          cpm_platforms_allowed?: string[] | null
          cpm_rate?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: Database["public"]["Enums"]["accepted_currency"]
          description: string
          end_date?: string | null
          estimated_duration?: string | null
          exclusivity_terms?: string | null
          id?: string
          industry?: string | null
          job_slug: string
          job_title: string
          job_type?: string
          max_pay_cents?: number | null
          media?: Json | null
          monthly_payout_cap?: number | null
          payment_frequency?:
            | Database["public"]["Enums"]["payment_frequency"]
            | null
          payout_status?: string | null
          portal_config?: Json | null
          priority?: number
          published_at?: string | null
          slack_channel_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["job_status"] | null
          target_country?: string | null
          total_budget?: number | null
          transcript?: string | null
          updated_at?: string | null
          usage_rights?: string | null
          visibility?: Database["public"]["Enums"]["job_visibility"] | null
        }
        Update: {
          application_deadline?: string | null
          approved_at?: string | null
          auto_approve_applications?: boolean
          bonus_milestones?: Json | null
          brand_organization_id?: string
          budget_cents?: number | null
          budget_per_creator?: number | null
          budget_spent_cents?: number | null
          closed_at?: string | null
          content_guidelines?: string | null
          cpm_base_pay?: number | null
          cpm_cap?: number | null
          cpm_payout_threshold?: number | null
          cpm_platforms_allowed?: string[] | null
          cpm_rate?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: Database["public"]["Enums"]["accepted_currency"]
          description?: string
          end_date?: string | null
          estimated_duration?: string | null
          exclusivity_terms?: string | null
          id?: string
          industry?: string | null
          job_slug?: string
          job_title?: string
          job_type?: string
          max_pay_cents?: number | null
          media?: Json | null
          monthly_payout_cap?: number | null
          payment_frequency?:
            | Database["public"]["Enums"]["payment_frequency"]
            | null
          payout_status?: string | null
          portal_config?: Json | null
          priority?: number
          published_at?: string | null
          slack_channel_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["job_status"] | null
          target_country?: string | null
          total_budget?: number | null
          transcript?: string | null
          updated_at?: string | null
          usage_rights?: string | null
          visibility?: Database["public"]["Enums"]["job_visibility"] | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      managed_creator_audit_log: {
        Row: {
          action: string
          batch_id: string
          brand_organization_id: string
          changed_at: string | null
          changed_by: string
          field_name: string | null
          id: string
          managed_creator_id: string | null
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          action: string
          batch_id: string
          brand_organization_id: string
          changed_at?: string | null
          changed_by: string
          field_name?: string | null
          id?: string
          managed_creator_id?: string | null
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          action?: string
          batch_id?: string
          brand_organization_id?: string
          changed_at?: string | null
          changed_by?: string
          field_name?: string | null
          id?: string
          managed_creator_id?: string | null
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "managed_creator_audit_log_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managed_creator_audit_log_managed_creator_id_fkey"
            columns: ["managed_creator_id"]
            isOneToOne: false
            referencedRelation: "managed_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      managed_creator_posts: {
        Row: {
          base_pay_cents: number
          bonus_cents: number
          bonus_milestones: Json | null
          calculated_pay_cents: number
          cpm_rate: number | null
          created_at: string | null
          id: string
          managed_creator_id: string
          max_pay_cents: number | null
          offplatform_method: string | null
          payment_status: string
          platform_count: number
          post_id: string
          review_status: Database["public"]["Enums"]["post_review_status"]
          review_status_updated_at: string | null
          total_owed_cents: number
          total_paid_cents: number
          updated_at: string | null
        }
        Insert: {
          base_pay_cents?: number
          bonus_cents?: number
          bonus_milestones?: Json | null
          calculated_pay_cents?: number
          cpm_rate?: number | null
          created_at?: string | null
          id?: string
          managed_creator_id: string
          max_pay_cents?: number | null
          offplatform_method?: string | null
          payment_status?: string
          platform_count?: number
          post_id: string
          review_status?: Database["public"]["Enums"]["post_review_status"]
          review_status_updated_at?: string | null
          total_owed_cents?: number
          total_paid_cents?: number
          updated_at?: string | null
        }
        Update: {
          base_pay_cents?: number
          bonus_cents?: number
          bonus_milestones?: Json | null
          calculated_pay_cents?: number
          cpm_rate?: number | null
          created_at?: string | null
          id?: string
          managed_creator_id?: string
          max_pay_cents?: number | null
          offplatform_method?: string | null
          payment_status?: string
          platform_count?: number
          post_id?: string
          review_status?: Database["public"]["Enums"]["post_review_status"]
          review_status_updated_at?: string | null
          total_owed_cents?: number
          total_paid_cents?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "managed_creator_posts_managed_creator_id_fkey"
            columns: ["managed_creator_id"]
            isOneToOne: false
            referencedRelation: "managed_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managed_creator_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      managed_creator_transcripts: {
        Row: {
          call_date: string | null
          created_at: string | null
          id: string
          managed_creator_id: string
          storage_path: string | null
          transcript: string
          updated_at: string | null
        }
        Insert: {
          call_date?: string | null
          created_at?: string | null
          id?: string
          managed_creator_id: string
          storage_path?: string | null
          transcript: string
          updated_at?: string | null
        }
        Update: {
          call_date?: string | null
          created_at?: string | null
          id?: string
          managed_creator_id?: string
          storage_path?: string | null
          transcript?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "managed_creator_transcripts_managed_creator_id_fkey"
            columns: ["managed_creator_id"]
            isOneToOne: false
            referencedRelation: "managed_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      managed_creator_videos: {
        Row: {
          created_at: string | null
          file_hash: string | null
          hygiene_result: Json | null
          id: string
          managed_creator_id: string
          replaced_at: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          slot_number: number
          storage_path: string
          transcript: string | null
          video_summary: string | null
        }
        Insert: {
          created_at?: string | null
          file_hash?: string | null
          hygiene_result?: Json | null
          id?: string
          managed_creator_id: string
          replaced_at?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slot_number: number
          storage_path: string
          transcript?: string | null
          video_summary?: string | null
        }
        Update: {
          created_at?: string | null
          file_hash?: string | null
          hygiene_result?: Json | null
          id?: string
          managed_creator_id?: string
          replaced_at?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slot_number?: number
          storage_path?: string
          transcript?: string | null
          video_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "managed_creator_videos_managed_creator_id_fkey"
            columns: ["managed_creator_id"]
            isOneToOne: false
            referencedRelation: "managed_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      managed_creators: {
        Row: {
          accepted_at: string | null
          advance_balance_cents: number
          base_course_status: string | null
          base_pay: number | null
          bonus_milestones: Json | null
          brand_organization_id: string | null
          collected_instagram_url: string | null
          collected_tiktok_url: string | null
          contract_accepted_at: string | null
          contract_signer_name: string | null
          contract_version: string | null
          country: string | null
          cpm_rate: number | null
          created_at: string | null
          deadline_extensions: Json | null
          email: string | null
          first_post_completed_at: string | null
          handles_complete: boolean | null
          handles_completed_at: string | null
          id: string
          instagram_account_id: string | null
          instagram_added_at: string | null
          instagram_handle_completed_at: string | null
          instagram_performance: number | null
          instagram_username: string | null
          invite_expires_at: string | null
          invite_token: string | null
          is_active: boolean | null
          job_id: string | null
          last_payment_date: string | null
          linked_creator_profile_id: string | null
          linked_user_id: string | null
          location: string | null
          max_pay_cents: number | null
          name: string
          notes: string | null
          onboarded_at: string | null
          onboarding_call_complete: boolean | null
          onboarding_call_completed_at: string | null
          onboarding_started_at: string | null
          payment: string | null
          payment_method:
            | Database["public"]["Enums"]["managed_payment_method"]
            | null
          payment_outstanding: number | null
          payout_frequency:
            | Database["public"]["Enums"]["managed_payout_frequency"]
            | null
          pending_payout: number | null
          phone: string | null
          read_about_company_completed_at: string | null
          screening_result: Json | null
          screening_stage: string | null
          screening_status: string | null
          slack_user_id: string | null
          sourced: string | null
          status: string
          status_changed_at: string
          tiktok_account_id: string | null
          tiktok_added_at: string | null
          tiktok_handle_completed_at: string | null
          tiktok_performance: number | null
          tiktok_username: string | null
          total_paid: number | null
          updated_at: string | null
          video_urls: string[] | null
          videos_complete: boolean | null
          videos_completed_at: string | null
          warmup_day_1_completed_at: string | null
          warmup_day_2_completed_at: string | null
          warmup_day_3_completed_at: string | null
          warmup_day_4_completed_at: string | null
          youtube_account_id: string | null
          youtube_added_at: string | null
          youtube_username: string | null
        }
        Insert: {
          accepted_at?: string | null
          advance_balance_cents?: number
          base_course_status?: string | null
          base_pay?: number | null
          bonus_milestones?: Json | null
          brand_organization_id?: string | null
          collected_instagram_url?: string | null
          collected_tiktok_url?: string | null
          contract_accepted_at?: string | null
          contract_signer_name?: string | null
          contract_version?: string | null
          country?: string | null
          cpm_rate?: number | null
          created_at?: string | null
          deadline_extensions?: Json | null
          email?: string | null
          first_post_completed_at?: string | null
          handles_complete?: boolean | null
          handles_completed_at?: string | null
          id?: string
          instagram_account_id?: string | null
          instagram_added_at?: string | null
          instagram_handle_completed_at?: string | null
          instagram_performance?: number | null
          instagram_username?: string | null
          invite_expires_at?: string | null
          invite_token?: string | null
          is_active?: boolean | null
          job_id?: string | null
          last_payment_date?: string | null
          linked_creator_profile_id?: string | null
          linked_user_id?: string | null
          location?: string | null
          max_pay_cents?: number | null
          name: string
          notes?: string | null
          onboarded_at?: string | null
          onboarding_call_complete?: boolean | null
          onboarding_call_completed_at?: string | null
          onboarding_started_at?: string | null
          payment?: string | null
          payment_method?:
            | Database["public"]["Enums"]["managed_payment_method"]
            | null
          payment_outstanding?: number | null
          payout_frequency?:
            | Database["public"]["Enums"]["managed_payout_frequency"]
            | null
          pending_payout?: number | null
          phone?: string | null
          read_about_company_completed_at?: string | null
          screening_result?: Json | null
          screening_stage?: string | null
          screening_status?: string | null
          slack_user_id?: string | null
          sourced?: string | null
          status?: string
          status_changed_at?: string
          tiktok_account_id?: string | null
          tiktok_added_at?: string | null
          tiktok_handle_completed_at?: string | null
          tiktok_performance?: number | null
          tiktok_username?: string | null
          total_paid?: number | null
          updated_at?: string | null
          video_urls?: string[] | null
          videos_complete?: boolean | null
          videos_completed_at?: string | null
          warmup_day_1_completed_at?: string | null
          warmup_day_2_completed_at?: string | null
          warmup_day_3_completed_at?: string | null
          warmup_day_4_completed_at?: string | null
          youtube_account_id?: string | null
          youtube_added_at?: string | null
          youtube_username?: string | null
        }
        Update: {
          accepted_at?: string | null
          advance_balance_cents?: number
          base_course_status?: string | null
          base_pay?: number | null
          bonus_milestones?: Json | null
          brand_organization_id?: string | null
          collected_instagram_url?: string | null
          collected_tiktok_url?: string | null
          contract_accepted_at?: string | null
          contract_signer_name?: string | null
          contract_version?: string | null
          country?: string | null
          cpm_rate?: number | null
          created_at?: string | null
          deadline_extensions?: Json | null
          email?: string | null
          first_post_completed_at?: string | null
          handles_complete?: boolean | null
          handles_completed_at?: string | null
          id?: string
          instagram_account_id?: string | null
          instagram_added_at?: string | null
          instagram_handle_completed_at?: string | null
          instagram_performance?: number | null
          instagram_username?: string | null
          invite_expires_at?: string | null
          invite_token?: string | null
          is_active?: boolean | null
          job_id?: string | null
          last_payment_date?: string | null
          linked_creator_profile_id?: string | null
          linked_user_id?: string | null
          location?: string | null
          max_pay_cents?: number | null
          name?: string
          notes?: string | null
          onboarded_at?: string | null
          onboarding_call_complete?: boolean | null
          onboarding_call_completed_at?: string | null
          onboarding_started_at?: string | null
          payment?: string | null
          payment_method?:
            | Database["public"]["Enums"]["managed_payment_method"]
            | null
          payment_outstanding?: number | null
          payout_frequency?:
            | Database["public"]["Enums"]["managed_payout_frequency"]
            | null
          pending_payout?: number | null
          phone?: string | null
          read_about_company_completed_at?: string | null
          screening_result?: Json | null
          screening_stage?: string | null
          screening_status?: string | null
          slack_user_id?: string | null
          sourced?: string | null
          status?: string
          status_changed_at?: string
          tiktok_account_id?: string | null
          tiktok_added_at?: string | null
          tiktok_handle_completed_at?: string | null
          tiktok_performance?: number | null
          tiktok_username?: string | null
          total_paid?: number | null
          updated_at?: string | null
          video_urls?: string[] | null
          videos_complete?: boolean | null
          videos_completed_at?: string | null
          warmup_day_1_completed_at?: string | null
          warmup_day_2_completed_at?: string | null
          warmup_day_3_completed_at?: string | null
          warmup_day_4_completed_at?: string | null
          youtube_account_id?: string | null
          youtube_added_at?: string | null
          youtube_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "managed_creators_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managed_creators_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managed_creators_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cpm_campaign_stats"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "managed_creators_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "managed_creators_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managed_creators_linked_creator_profile_id_fkey"
            columns: ["linked_creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "managed_creators_linked_creator_profile_id_fkey"
            columns: ["linked_creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managed_creators_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managed_creators_youtube_account_id_fkey"
            columns: ["youtube_account_id"]
            isOneToOne: false
            referencedRelation: "youtube_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          brand_organization_id: string | null
          created_at: string
          data: Json
          event_type: string | null
          id: string
          metadata: Json
          read_at: string | null
          sender_user_id: string | null
          user_id: string
        }
        Insert: {
          body: string
          brand_organization_id?: string | null
          created_at?: string
          data?: Json
          event_type?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          sender_user_id?: string | null
          user_id: string
        }
        Update: {
          body?: string
          brand_organization_id?: string | null
          created_at?: string
          data?: Json
          event_type?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          sender_user_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_verification_attempts: {
        Row: {
          attempt_type: string
          country: string | null
          created_at: string
          id: number
          ip_address: string | null
          phone: string
          user_id: string
        }
        Insert: {
          attempt_type?: string
          country?: string | null
          created_at?: string
          id?: never
          ip_address?: string | null
          phone: string
          user_id: string
        }
        Update: {
          attempt_type?: string
          country?: string | null
          created_at?: string
          id?: never
          ip_address?: string | null
          phone?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_verification_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_resource_templates: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          order_index: number | null
          requires_brand_override: boolean | null
          resource_type: string
          slot_number: number | null
          title: string
          unlock_after_task: string | null
          updated_at: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          order_index?: number | null
          requires_brand_override?: boolean | null
          resource_type?: string
          slot_number?: number | null
          title: string
          unlock_after_task?: string | null
          updated_at?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          order_index?: number | null
          requires_brand_override?: boolean | null
          resource_type?: string
          slot_number?: number | null
          title?: string
          unlock_after_task?: string | null
          updated_at?: string | null
          url?: string
        }
        Relationships: []
      }
      post_engagement_metrics: {
        Row: {
          comment_rate: number | null
          comments: number | null
          created_at: string | null
          engagement_rate: number | null
          id: string
          impressions: number | null
          likes: number | null
          post_id: string
          reach: number | null
          save_rate: number | null
          saves: number | null
          share_rate: number | null
          shares: number | null
          tracked_at: string
          video_duration: number | null
          video_quality_score: number | null
          views: number | null
        }
        Insert: {
          comment_rate?: number | null
          comments?: number | null
          created_at?: string | null
          engagement_rate?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          post_id: string
          reach?: number | null
          save_rate?: number | null
          saves?: number | null
          share_rate?: number | null
          shares?: number | null
          tracked_at: string
          video_duration?: number | null
          video_quality_score?: number | null
          views?: number | null
        }
        Update: {
          comment_rate?: number | null
          comments?: number | null
          created_at?: string | null
          engagement_rate?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          post_id?: string
          reach?: number | null
          save_rate?: number | null
          saves?: number | null
          share_rate?: number | null
          shares?: number | null
          tracked_at?: string
          video_duration?: number | null
          video_quality_score?: number | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_engagement_metrics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_metadata: {
        Row: {
          content_categories: string[] | null
          created_at: string | null
          id: string
          is_ad: boolean | null
          is_original_sound: boolean | null
          is_reviewing: boolean | null
          location_country_code: string | null
          location_name: string | null
          location_poi_id: string | null
          post_id: string
          suggested_search_terms: string[] | null
          updated_at: string | null
          video_bitrate: number | null
          video_format: string | null
          video_height: number | null
          video_width: number | null
        }
        Insert: {
          content_categories?: string[] | null
          created_at?: string | null
          id?: string
          is_ad?: boolean | null
          is_original_sound?: boolean | null
          is_reviewing?: boolean | null
          location_country_code?: string | null
          location_name?: string | null
          location_poi_id?: string | null
          post_id: string
          suggested_search_terms?: string[] | null
          updated_at?: string | null
          video_bitrate?: number | null
          video_format?: string | null
          video_height?: number | null
          video_width?: number | null
        }
        Update: {
          content_categories?: string[] | null
          created_at?: string | null
          id?: string
          is_ad?: boolean | null
          is_original_sound?: boolean | null
          is_reviewing?: boolean | null
          location_country_code?: string | null
          location_name?: string | null
          location_poi_id?: string | null
          post_id?: string
          suggested_search_terms?: string[] | null
          updated_at?: string | null
          video_bitrate?: number | null
          video_format?: string | null
          video_height?: number | null
          video_width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_metadata_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reviews: {
        Row: {
          created_at: string
          feedback: string | null
          id: string
          managed_creator_post_id: string
          metadata: Json | null
          reviewer_id: string | null
          reviewer_type: Database["public"]["Enums"]["post_reviewer_type"]
          status: Database["public"]["Enums"]["post_review_status"]
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          id?: string
          managed_creator_post_id: string
          metadata?: Json | null
          reviewer_id?: string | null
          reviewer_type: Database["public"]["Enums"]["post_reviewer_type"]
          status: Database["public"]["Enums"]["post_review_status"]
        }
        Update: {
          created_at?: string
          feedback?: string | null
          id?: string
          managed_creator_post_id?: string
          metadata?: Json | null
          reviewer_id?: string | null
          reviewer_type?: Database["public"]["Enums"]["post_reviewer_type"]
          status?: Database["public"]["Enums"]["post_review_status"]
        }
        Relationships: [
          {
            foreignKeyName: "post_reviews_managed_creator_post_id_fkey"
            columns: ["managed_creator_post_id"]
            isOneToOne: false
            referencedRelation: "managed_creator_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          ad_code: string | null
          ad_code_added_at: string | null
          ad_spend: number | null
          caption: string | null
          cost: number | null
          created_at: string | null
          deleted_at: string | null
          hashtags: string[] | null
          hygiene_checks: Json | null
          id: string
          instagram_account_id: string | null
          instagram_username: string | null
          is_excluded: boolean
          is_sponsored: boolean | null
          last_fetched_at: string | null
          latest_comment_rate: number | null
          latest_comments: number | null
          latest_engagement_rate: number | null
          latest_impressions: number | null
          latest_likes: number | null
          latest_metrics_tracked_at: string | null
          latest_reach: number | null
          latest_save_rate: number | null
          latest_saves: number | null
          latest_share_rate: number | null
          latest_shares: number | null
          latest_video_duration: number | null
          latest_video_quality_score: number | null
          latest_views: number | null
          lifecycle_status: Database["public"]["Enums"]["post_lifecycle_status"]
          media_urls: string[] | null
          paid_views: number | null
          platform: Database["public"]["Enums"]["platform"]
          post_id: string | null
          post_type: Database["public"]["Enums"]["post_type"]
          post_url: string
          posted_at: string
          raw_data: Json | null
          social_account_connector_id: string | null
          status: Database["public"]["Enums"]["post_status"] | null
          status_updated_at: string | null
          thumbnail_url: string | null
          tiktok_account_id: string | null
          tiktok_username: string | null
          tracking_status: Database["public"]["Enums"]["post_tracking_status"]
          transcript: string | null
          transcript_segments: Json | null
          unavailable_detected_at: string | null
          unavailable_reason: string | null
          updated_at: string | null
          video_processed_at: string | null
          video_processing_error: string | null
          video_processing_retry_count: number
          video_processing_status: string | null
          video_storage_error: string | null
          video_storage_retry_count: number
          video_storage_url: string | null
          video_stored_at: string | null
          video_summary: string | null
          youtube_account_id: string | null
          youtube_username: string | null
        }
        Insert: {
          ad_code?: string | null
          ad_code_added_at?: string | null
          ad_spend?: number | null
          caption?: string | null
          cost?: number | null
          created_at?: string | null
          deleted_at?: string | null
          hashtags?: string[] | null
          hygiene_checks?: Json | null
          id?: string
          instagram_account_id?: string | null
          instagram_username?: string | null
          is_excluded?: boolean
          is_sponsored?: boolean | null
          last_fetched_at?: string | null
          latest_comment_rate?: number | null
          latest_comments?: number | null
          latest_engagement_rate?: number | null
          latest_impressions?: number | null
          latest_likes?: number | null
          latest_metrics_tracked_at?: string | null
          latest_reach?: number | null
          latest_save_rate?: number | null
          latest_saves?: number | null
          latest_share_rate?: number | null
          latest_shares?: number | null
          latest_video_duration?: number | null
          latest_video_quality_score?: number | null
          latest_views?: number | null
          lifecycle_status?: Database["public"]["Enums"]["post_lifecycle_status"]
          media_urls?: string[] | null
          paid_views?: number | null
          platform: Database["public"]["Enums"]["platform"]
          post_id?: string | null
          post_type: Database["public"]["Enums"]["post_type"]
          post_url: string
          posted_at: string
          raw_data?: Json | null
          social_account_connector_id?: string | null
          status?: Database["public"]["Enums"]["post_status"] | null
          status_updated_at?: string | null
          thumbnail_url?: string | null
          tiktok_account_id?: string | null
          tiktok_username?: string | null
          tracking_status?: Database["public"]["Enums"]["post_tracking_status"]
          transcript?: string | null
          transcript_segments?: Json | null
          unavailable_detected_at?: string | null
          unavailable_reason?: string | null
          updated_at?: string | null
          video_processed_at?: string | null
          video_processing_error?: string | null
          video_processing_retry_count?: number
          video_processing_status?: string | null
          video_storage_error?: string | null
          video_storage_retry_count?: number
          video_storage_url?: string | null
          video_stored_at?: string | null
          video_summary?: string | null
          youtube_account_id?: string | null
          youtube_username?: string | null
        }
        Update: {
          ad_code?: string | null
          ad_code_added_at?: string | null
          ad_spend?: number | null
          caption?: string | null
          cost?: number | null
          created_at?: string | null
          deleted_at?: string | null
          hashtags?: string[] | null
          hygiene_checks?: Json | null
          id?: string
          instagram_account_id?: string | null
          instagram_username?: string | null
          is_excluded?: boolean
          is_sponsored?: boolean | null
          last_fetched_at?: string | null
          latest_comment_rate?: number | null
          latest_comments?: number | null
          latest_engagement_rate?: number | null
          latest_impressions?: number | null
          latest_likes?: number | null
          latest_metrics_tracked_at?: string | null
          latest_reach?: number | null
          latest_save_rate?: number | null
          latest_saves?: number | null
          latest_share_rate?: number | null
          latest_shares?: number | null
          latest_video_duration?: number | null
          latest_video_quality_score?: number | null
          latest_views?: number | null
          lifecycle_status?: Database["public"]["Enums"]["post_lifecycle_status"]
          media_urls?: string[] | null
          paid_views?: number | null
          platform?: Database["public"]["Enums"]["platform"]
          post_id?: string | null
          post_type?: Database["public"]["Enums"]["post_type"]
          post_url?: string
          posted_at?: string
          raw_data?: Json | null
          social_account_connector_id?: string | null
          status?: Database["public"]["Enums"]["post_status"] | null
          status_updated_at?: string | null
          thumbnail_url?: string | null
          tiktok_account_id?: string | null
          tiktok_username?: string | null
          tracking_status?: Database["public"]["Enums"]["post_tracking_status"]
          transcript?: string | null
          transcript_segments?: Json | null
          unavailable_detected_at?: string | null
          unavailable_reason?: string | null
          updated_at?: string | null
          video_processed_at?: string | null
          video_processing_error?: string | null
          video_processing_retry_count?: number
          video_processing_status?: string | null
          video_storage_error?: string | null
          video_storage_retry_count?: number
          video_storage_url?: string | null
          video_stored_at?: string | null
          video_summary?: string | null
          youtube_account_id?: string | null
          youtube_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_social_account_connector_id_fkey"
            columns: ["social_account_connector_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_youtube_account_id_fkey"
            columns: ["youtube_account_id"]
            isOneToOne: false
            referencedRelation: "youtube_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_codes: {
        Row: {
          active: boolean | null
          applicable_plans: string[] | null
          code: string
          created_at: string | null
          current_uses: number | null
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          max_uses: number | null
          min_amount_cents: number | null
          stripe_coupon_id: string | null
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          active?: boolean | null
          applicable_plans?: string[] | null
          code: string
          created_at?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          max_uses?: number | null
          min_amount_cents?: number | null
          stripe_coupon_id?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          active?: boolean | null
          applicable_plans?: string[] | null
          code?: string
          created_at?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          max_uses?: number | null
          min_amount_cents?: number | null
          stripe_coupon_id?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          active: boolean
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          account_type: string
          created_at: string | null
          creator_profile_id: string | null
          ended_at: string | null
          ended_reason: string | null
          id: string
          instagram_account_id: string | null
          is_active: boolean | null
          managed_creator_id: string | null
          replaced_by: string | null
          status: string
          submitted_at: string | null
          tiktok_account_id: string | null
          updated_at: string | null
          verified_at: string | null
          youtube_account_id: string | null
        }
        Insert: {
          account_type?: string
          created_at?: string | null
          creator_profile_id?: string | null
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          instagram_account_id?: string | null
          is_active?: boolean | null
          managed_creator_id?: string | null
          replaced_by?: string | null
          status?: string
          submitted_at?: string | null
          tiktok_account_id?: string | null
          updated_at?: string | null
          verified_at?: string | null
          youtube_account_id?: string | null
        }
        Update: {
          account_type?: string
          created_at?: string | null
          creator_profile_id?: string | null
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          instagram_account_id?: string | null
          is_active?: boolean | null
          managed_creator_id?: string | null
          replaced_by?: string | null
          status?: string
          submitted_at?: string | null
          tiktok_account_id?: string | null
          updated_at?: string | null
          verified_at?: string | null
          youtube_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_creator_profile_id_fkey1"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "social_accounts_creator_profile_id_fkey1"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_managed_creator_id_fkey"
            columns: ["managed_creator_id"]
            isOneToOne: false
            referencedRelation: "managed_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_youtube_account_id_fkey"
            columns: ["youtube_account_id"]
            isOneToOne: false
            referencedRelation: "youtube_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          account_limit: number | null
          active: boolean | null
          addons: number | null
          amount_cents: number
          created_at: string | null
          currency: string
          display_order: number | null
          display_price: string
          features: Json | null
          id: string
          interval: string
          interval_count: number
          name: string
          note: string | null
          popular: boolean | null
          product_name: string
          promo_code_only: boolean | null
          required_promo_code: string | null
          subtitle: string | null
          trial_period_days: number | null
          updated_at: string | null
        }
        Insert: {
          account_limit?: number | null
          active?: boolean | null
          addons?: number | null
          amount_cents: number
          created_at?: string | null
          currency?: string
          display_order?: number | null
          display_price: string
          features?: Json | null
          id: string
          interval?: string
          interval_count?: number
          name: string
          note?: string | null
          popular?: boolean | null
          product_name: string
          promo_code_only?: boolean | null
          required_promo_code?: string | null
          subtitle?: string | null
          trial_period_days?: number | null
          updated_at?: string | null
        }
        Update: {
          account_limit?: number | null
          active?: boolean | null
          addons?: number | null
          amount_cents?: number
          created_at?: string | null
          currency?: string
          display_order?: number | null
          display_price?: string
          features?: Json | null
          id?: string
          interval?: string
          interval_count?: number
          name?: string
          note?: string | null
          popular?: boolean | null
          product_name?: string
          promo_code_only?: boolean | null
          required_promo_code?: string | null
          subtitle?: string | null
          trial_period_days?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          account_id: string
          completed_at: string | null
          created_at: string | null
          cron_name: string | null
          error: string | null
          id: string
          job_type: string | null
          run_id: string | null
          started_at: string | null
          status: string
          sync_mode: string | null
        }
        Insert: {
          account_id: string
          completed_at?: string | null
          created_at?: string | null
          cron_name?: string | null
          error?: string | null
          id?: string
          job_type?: string | null
          run_id?: string | null
          started_at?: string | null
          status?: string
          sync_mode?: string | null
        }
        Update: {
          account_id?: string
          completed_at?: string | null
          created_at?: string | null
          cron_name?: string | null
          error?: string | null
          id?: string
          job_type?: string | null
          run_id?: string | null
          started_at?: string | null
          status?: string
          sync_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_accounts: {
        Row: {
          application_id: string | null
          backfill_attempts: number | null
          backfill_cursor: string | null
          backfill_status: string | null
          consecutive_empty_returns: number
          consecutive_sync_failures: number
          created_at: string | null
          creator_profile_id: string | null
          deleted_at: string | null
          follower_count: number | null
          id: string
          is_active: boolean | null
          is_private: boolean
          last_full_sync_at: string | null
          last_full_synced_at: string | null
          last_posts_fetched_at: string | null
          last_quick_sync_at: string | null
          last_synced_at: string | null
          profile_pic_url: string | null
          profile_url: string
          source: string
          status: Database["public"]["Enums"]["social_account_status"]
          sync_completed_at: string | null
          sync_cursor: string | null
          sync_error: string | null
          sync_started_at: string | null
          sync_status: string | null
          tiktok_username: string
          tracking_disabled: boolean | null
          tracking_status: Database["public"]["Enums"]["account_sync_status"]
          updated_at: string | null
        }
        Insert: {
          application_id?: string | null
          backfill_attempts?: number | null
          backfill_cursor?: string | null
          backfill_status?: string | null
          consecutive_empty_returns?: number
          consecutive_sync_failures?: number
          created_at?: string | null
          creator_profile_id?: string | null
          deleted_at?: string | null
          follower_count?: number | null
          id?: string
          is_active?: boolean | null
          is_private?: boolean
          last_full_sync_at?: string | null
          last_full_synced_at?: string | null
          last_posts_fetched_at?: string | null
          last_quick_sync_at?: string | null
          last_synced_at?: string | null
          profile_pic_url?: string | null
          profile_url: string
          source: string
          status?: Database["public"]["Enums"]["social_account_status"]
          sync_completed_at?: string | null
          sync_cursor?: string | null
          sync_error?: string | null
          sync_started_at?: string | null
          sync_status?: string | null
          tiktok_username: string
          tracking_disabled?: boolean | null
          tracking_status?: Database["public"]["Enums"]["account_sync_status"]
          updated_at?: string | null
        }
        Update: {
          application_id?: string | null
          backfill_attempts?: number | null
          backfill_cursor?: string | null
          backfill_status?: string | null
          consecutive_empty_returns?: number
          consecutive_sync_failures?: number
          created_at?: string | null
          creator_profile_id?: string | null
          deleted_at?: string | null
          follower_count?: number | null
          id?: string
          is_active?: boolean | null
          is_private?: boolean
          last_full_sync_at?: string | null
          last_full_synced_at?: string | null
          last_posts_fetched_at?: string | null
          last_quick_sync_at?: string | null
          last_synced_at?: string | null
          profile_pic_url?: string | null
          profile_url?: string
          source?: string
          status?: Database["public"]["Enums"]["social_account_status"]
          sync_completed_at?: string | null
          sync_cursor?: string | null
          sync_error?: string | null
          sync_started_at?: string | null
          sync_status?: string | null
          tiktok_username?: string
          tracking_disabled?: boolean | null
          tracking_status?: Database["public"]["Enums"]["account_sync_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_accounts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiktok_accounts_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "tiktok_accounts_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_daily_activity: {
        Row: {
          activity_date: string
          first_seen_at: string
          last_seen_at: string
          user_id: string
        }
        Insert: {
          activity_date: string
          first_seen_at: string
          last_seen_at: string
          user_id: string
        }
        Update: {
          activity_date?: string
          first_seen_at?: string
          last_seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_daily_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_identities: {
        Row: {
          created_at: string
          id: string
          internal_user_id: string
          provider: string
          provider_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          internal_user_id: string
          provider: string
          provider_id: string
        }
        Update: {
          created_at?: string
          id?: string
          internal_user_id?: string
          provider?: string
          provider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_identities_internal_user_id_fkey"
            columns: ["internal_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"] | null
          city: string | null
          country: string | null
          course_completed_at: string | null
          course_completed_steps: string[] | null
          course_time_spent_seconds: number | null
          created_at: string | null
          discovery_source:
            | Database["public"]["Enums"]["discovery_source"]
            | null
          discovery_source_other: string | null
          email: string
          email_marketing_consent: boolean | null
          email_updates_consent: boolean | null
          gclid: string | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          job_referral_source: string | null
          last_active_at: string | null
          last_login: string | null
          marketing_source_page: string | null
          message_notifications_consent: boolean | null
          password_hash: string
          phone: string | null
          phone_verified: boolean | null
          referral_bonus_paid_cents: number
          referrer_source: string | null
          referrer_source_set_at: string | null
          region: string | null
          share_code: string
          sms_notifications_consent: boolean | null
          terms_accepted: boolean | null
          terms_accepted_at: string | null
          updated_at: string | null
          utm_campaign: string | null
          utm_captured_at: string | null
          utm_content: string | null
          utm_id: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          city?: string | null
          country?: string | null
          course_completed_at?: string | null
          course_completed_steps?: string[] | null
          course_time_spent_seconds?: number | null
          created_at?: string | null
          discovery_source?:
            | Database["public"]["Enums"]["discovery_source"]
            | null
          discovery_source_other?: string | null
          email: string
          email_marketing_consent?: boolean | null
          email_updates_consent?: boolean | null
          gclid?: string | null
          id: string
          is_active?: boolean | null
          is_verified?: boolean | null
          job_referral_source?: string | null
          last_active_at?: string | null
          last_login?: string | null
          marketing_source_page?: string | null
          message_notifications_consent?: boolean | null
          password_hash: string
          phone?: string | null
          phone_verified?: boolean | null
          referral_bonus_paid_cents?: number
          referrer_source?: string | null
          referrer_source_set_at?: string | null
          region?: string | null
          share_code: string
          sms_notifications_consent?: boolean | null
          terms_accepted?: boolean | null
          terms_accepted_at?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_captured_at?: string | null
          utm_content?: string | null
          utm_id?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          city?: string | null
          country?: string | null
          course_completed_at?: string | null
          course_completed_steps?: string[] | null
          course_time_spent_seconds?: number | null
          created_at?: string | null
          discovery_source?:
            | Database["public"]["Enums"]["discovery_source"]
            | null
          discovery_source_other?: string | null
          email?: string
          email_marketing_consent?: boolean | null
          email_updates_consent?: boolean | null
          gclid?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          job_referral_source?: string | null
          last_active_at?: string | null
          last_login?: string | null
          marketing_source_page?: string | null
          message_notifications_consent?: boolean | null
          password_hash?: string
          phone?: string | null
          phone_verified?: boolean | null
          referral_bonus_paid_cents?: number
          referrer_source?: string | null
          referrer_source_set_at?: string | null
          region?: string | null
          share_code?: string
          sms_notifications_consent?: boolean | null
          terms_accepted?: boolean | null
          terms_accepted_at?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_captured_at?: string | null
          utm_content?: string | null
          utm_id?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_job_referral_source_fkey"
            columns: ["job_referral_source"]
            isOneToOne: false
            referencedRelation: "cpm_campaign_stats"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "users_job_referral_source_fkey"
            columns: ["job_referral_source"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "users_job_referral_source_fkey"
            columns: ["job_referral_source"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_daily_activity: {
        Row: {
          activity_date: string
          created_at: string
          id: string
          managed_creator_id: string
          niche_video_urls: string[]
          scrolled_platforms: Database["public"]["Enums"]["warmup_platform"][]
          updated_at: string
        }
        Insert: {
          activity_date: string
          created_at?: string
          id?: string
          managed_creator_id: string
          niche_video_urls?: string[]
          scrolled_platforms?: Database["public"]["Enums"]["warmup_platform"][]
          updated_at?: string
        }
        Update: {
          activity_date?: string
          created_at?: string
          id?: string
          managed_creator_id?: string
          niche_video_urls?: string[]
          scrolled_platforms?: Database["public"]["Enums"]["warmup_platform"][]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_daily_activity_managed_creator_id_fkey"
            columns: ["managed_creator_id"]
            isOneToOne: false
            referencedRelation: "managed_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_screenshot_submissions: {
        Row: {
          ai_reported_minutes_spent: number | null
          ai_status: Database["public"]["Enums"]["warmup_ai_status"]
          ai_verdict: Json | null
          created_at: string
          created_by: string | null
          id: string
          managed_creator_id: string
          period_end: string
          period_start: string
          platform: Database["public"]["Enums"]["warmup_platform"]
          review_note: string | null
          review_status: Database["public"]["Enums"]["warmup_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          screenshot_bucket: string
          screenshot_key: string
          updated_at: string
          window_index: number
        }
        Insert: {
          ai_reported_minutes_spent?: number | null
          ai_status?: Database["public"]["Enums"]["warmup_ai_status"]
          ai_verdict?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          managed_creator_id: string
          period_end: string
          period_start: string
          platform: Database["public"]["Enums"]["warmup_platform"]
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["warmup_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_bucket: string
          screenshot_key: string
          updated_at?: string
          window_index: number
        }
        Update: {
          ai_reported_minutes_spent?: number | null
          ai_status?: Database["public"]["Enums"]["warmup_ai_status"]
          ai_verdict?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          managed_creator_id?: string
          period_end?: string
          period_start?: string
          platform?: Database["public"]["Enums"]["warmup_platform"]
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["warmup_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_bucket?: string
          screenshot_key?: string
          updated_at?: string
          window_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "warmup_screenshot_submissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_screenshot_submissions_managed_creator_id_fkey"
            columns: ["managed_creator_id"]
            isOneToOne: false
            referencedRelation: "managed_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_screenshot_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_accounts: {
        Row: {
          application_id: string | null
          backfill_attempts: number | null
          backfill_cursor: string | null
          backfill_status: string | null
          channel_title: string | null
          consecutive_sync_failures: number | null
          created_at: string | null
          creator_profile_id: string | null
          deleted_at: string | null
          follower_count: number | null
          id: string
          is_active: boolean | null
          is_private: boolean | null
          last_full_synced_at: string | null
          last_posts_fetched_at: string | null
          last_quick_sync_at: string | null
          last_synced_at: string | null
          profile_pic_url: string | null
          profile_url: string | null
          source: string
          status: Database["public"]["Enums"]["social_account_status"] | null
          sync_completed_at: string | null
          sync_cursor: string | null
          sync_error: string | null
          sync_started_at: string | null
          sync_status: string | null
          tracking_disabled: boolean | null
          tracking_status: Database["public"]["Enums"]["account_sync_status"]
          updated_at: string | null
          video_count: number | null
          youtube_channel_id: string | null
          youtube_username: string
        }
        Insert: {
          application_id?: string | null
          backfill_attempts?: number | null
          backfill_cursor?: string | null
          backfill_status?: string | null
          channel_title?: string | null
          consecutive_sync_failures?: number | null
          created_at?: string | null
          creator_profile_id?: string | null
          deleted_at?: string | null
          follower_count?: number | null
          id?: string
          is_active?: boolean | null
          is_private?: boolean | null
          last_full_synced_at?: string | null
          last_posts_fetched_at?: string | null
          last_quick_sync_at?: string | null
          last_synced_at?: string | null
          profile_pic_url?: string | null
          profile_url?: string | null
          source?: string
          status?: Database["public"]["Enums"]["social_account_status"] | null
          sync_completed_at?: string | null
          sync_cursor?: string | null
          sync_error?: string | null
          sync_started_at?: string | null
          sync_status?: string | null
          tracking_disabled?: boolean | null
          tracking_status?: Database["public"]["Enums"]["account_sync_status"]
          updated_at?: string | null
          video_count?: number | null
          youtube_channel_id?: string | null
          youtube_username: string
        }
        Update: {
          application_id?: string | null
          backfill_attempts?: number | null
          backfill_cursor?: string | null
          backfill_status?: string | null
          channel_title?: string | null
          consecutive_sync_failures?: number | null
          created_at?: string | null
          creator_profile_id?: string | null
          deleted_at?: string | null
          follower_count?: number | null
          id?: string
          is_active?: boolean | null
          is_private?: boolean | null
          last_full_synced_at?: string | null
          last_posts_fetched_at?: string | null
          last_quick_sync_at?: string | null
          last_synced_at?: string | null
          profile_pic_url?: string | null
          profile_url?: string | null
          source?: string
          status?: Database["public"]["Enums"]["social_account_status"] | null
          sync_completed_at?: string | null
          sync_cursor?: string | null
          sync_error?: string | null
          sync_started_at?: string | null
          sync_status?: string | null
          tracking_disabled?: boolean | null
          tracking_status?: Database["public"]["Enums"]["account_sync_status"]
          updated_at?: string | null
          video_count?: number | null
          youtube_channel_id?: string | null
          youtube_username?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_accounts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "youtube_accounts_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_cpm_earnings"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "youtube_accounts_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      api_call_logs_current_quota: {
        Row: {
          last_call_at: string | null
          platform: string | null
          quota_remaining_pct: number | null
          rate_limit_limit: number | null
          rate_limit_remaining: number | null
          rate_limit_reset_seconds: number | null
        }
        Relationships: []
      }
      api_call_logs_daily_summary: {
        Row: {
          avg_latency_ms: number | null
          date: string | null
          failed_calls: number | null
          min_quota_remaining: number | null
          p95_latency_ms: number | null
          platform: string | null
          quota_limit: number | null
          rate_limited_calls: number | null
          successful_calls: number | null
          total_calls: number | null
        }
        Relationships: []
      }
      api_call_logs_hourly_summary: {
        Row: {
          avg_latency_ms: number | null
          failed_calls: number | null
          hour: string | null
          min_quota_remaining: number | null
          platform: string | null
          rate_limited_calls: number | null
          total_calls: number | null
        }
        Relationships: []
      }
      cpm_campaign_stats: {
        Row: {
          active_submissions: number | null
          brand_organization_id: string | null
          job_id: string | null
          job_title: string | null
          pending_submissions: number | null
          total_creators: number | null
          total_earnings: number | null
          total_paid: number | null
          total_submissions: number | null
          total_views_earned: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "brand_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cpm_global_stats: {
        Row: {
          active_count: number | null
          pending_approval_count: number | null
          rejected_count: number | null
          total_campaigns: number | null
          total_creators: number | null
          total_earnings_cents: number | null
          total_paid_cents: number | null
          total_submissions: number | null
          total_views: number | null
        }
        Relationships: []
      }
      cpm_submission_status_stats: {
        Row: {
          status: Database["public"]["Enums"]["cpm_submission_status"] | null
          submission_count: number | null
          unique_creators: number | null
        }
        Relationships: []
      }
      creator_cpm_earnings: {
        Row: {
          creator_profile_id: string | null
          display_name: string | null
          job_id: string | null
          job_title: string | null
          submission_count: number | null
          total_earned_cents: number | null
          total_paid_cents: number | null
          total_views: number | null
          unpaid_balance_cents: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_message_threads: {
        Args: { filter?: string; thread_limit?: number }
        Returns: {
          body: string
          brand_organization_id: string
          created_at: string
          event_type: string
          message_id: string
          read_at: string
          sender_user_id: string
          user_id: string
        }[]
      }
      append_video_url: {
        Args: {
          p_creator_id: string
          p_required_count?: number
          p_video_path: string
        }
        Returns: {
          is_complete: boolean
          total_videos: number
        }[]
      }
      atomic_wallet_deposit: {
        Args: { p_amount: number; p_currency: string; p_wallet_id: string }
        Returns: undefined
      }
      backfill_active_lifecycle_for_platform: {
        Args: { p_platform: string }
        Returns: {
          action: string
          mc_id: string
          notes: string
        }[]
      }
      backfill_managed_creator_account_history: {
        Args: {
          p_dry_run?: boolean
          p_limit?: number
          p_only_mc_id?: string
          p_only_platform?: string
        }
        Returns: {
          audit_rows_written: number
          clean_swaps: number
          current_state: number
          dangling_history: number
          mcs_processed: number
          silent_overwrites: number
          social_account_rows_inserted: number
        }[]
      }
      backfill_posts_for_managed_creator: {
        Args: { p_managed_creator_id: string }
        Returns: number
      }
      cascade_pay_config_to_posts: {
        Args: { p_managed_creator_id: string }
        Returns: Json
      }
      claim_creator_invite: {
        Args: { p_token: string }
        Returns: {
          display_name: string
          first_name: string
          id: string
          last_name: string
        }[]
      }
      deduct_cpm_campaign_budget: {
        Args: {
          p_amount_cents: number
          p_job_id: string
          p_submission_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      ensure_disclosure_review: {
        Args: { p_is_sponsored: boolean; p_mcp_id: string }
        Returns: undefined
      }
      fund_cpm_campaign: {
        Args: { p_amount_cents: number; p_job_id: string; p_user_id: string }
        Returns: Json
      }
      generate_share_code: { Args: { len?: number }; Returns: string }
      get_account_post_metrics:
        | {
            Args: {
              p_instagram_ids?: string[]
              p_tiktok_ids?: string[]
              p_youtube_ids?: string[]
            }
            Returns: {
              account_id: string
              average_video_views: number
              engagement_rates: number[]
              last_post_date: string
              platform: string
              posts_count: number
              posts_last_7_days: number
              recent_post_days: number[]
              total_comments: number
              total_likes: number
              total_views: number
            }[]
          }
        | {
            Args: { p_instagram_ids?: string[]; p_tiktok_ids?: string[] }
            Returns: {
              account_id: string
              average_video_views: number
              engagement_rates: number[]
              last_post_date: string
              platform: string
              posts_count: number
              posts_last_7_days: number
              recent_post_days: number[]
              total_comments: number
              total_likes: number
              total_views: number
            }[]
          }
      get_active_video_count: {
        Args: { p_managed_creator_id: string }
        Returns: number
      }
      get_admin_available_countries: { Args: never; Returns: string[] }
      get_admin_creators: {
        Args: {
          p_country?: string
          p_limit?: number
          p_page?: number
          p_search?: string
        }
        Returns: Json
      }
      get_admin_dashboard_buckets: {
        Args: {
          d120_ago: string
          d30_ago: string
          d7_ago: string
          h24_ago: string
        }
        Returns: Json
      }
      get_admin_stats: { Args: never; Returns: Json }
      get_brand_org_id_from_path: { Args: { path: string }; Returns: string }
      get_cpm_campaign_budget: { Args: { p_job_id: string }; Returns: Json }
      get_creator_balance: {
        Args: { p_creator_profile_id: string }
        Returns: {
          available_cents: number
          pending_stripe_cents: number
          total_earned_cents: number
          total_withdrawn_cents: number
        }[]
      }
      get_creator_balances_batch: {
        Args: { p_ids: string[] }
        Returns: {
          available_cents: number
          creator_profile_id: string
          pending_stripe_cents: number
          total_earned_cents: number
          total_withdrawn_cents: number
        }[]
      }
      get_creator_earnings_by_job: {
        Args: { p_creator_profile_id: string; p_job_id?: string }
        Returns: {
          job_id: string
          total_earned_cents: number
          transaction_count: number
        }[]
      }
      get_grouped_post_payments: {
        Args: {
          p_brand_id?: string
          p_hide_settled?: boolean
          p_job_id?: string
          p_review_status?: string[]
          p_search?: string
          p_status?: string[]
        }
        Returns: {
          ad_code_count: number
          base_pay_cents: number
          bonus_cents: number
          brand_name: string
          creator_name: string
          creator_profile_id: string
          job_id: string
          job_title: string
          managed_creator_id: string
          managed_creator_status: string
          outstanding_cents: number
          payment_status: string
          post_count: number
          stripe_account_id: string
          stripe_payouts_enabled: boolean
          total_owed_cents: number
          total_paid_cents: number
        }[]
      }
      get_managed_creator_countries: {
        Args: never
        Returns: {
          country: string
        }[]
      }
      get_managed_creator_id_from_path: {
        Args: { path: string }
        Returns: string
      }
      get_managed_creator_metrics: {
        Args: {
          p_brand_id?: string
          p_country?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_statuses?: string[]
        }
        Returns: {
          base_pay: number
          brand_name: string
          brand_organization_id: string
          country: string
          instagram_avg_views: number
          instagram_connected: boolean
          instagram_post_count: number
          job_id: string
          last_posted_at: string
          linked_creator_profile_id: string
          linked_user_id: string
          location: string
          managed_creator_id: string
          name: string
          outstanding_cents: number
          overall_avg_views: number
          overall_post_count: number
          spark_code_count: number
          status: string
          tiktok_avg_views: number
          tiktok_connected: boolean
          tiktok_post_count: number
          total_count: number
          youtube_avg_views: number
          youtube_connected: boolean
          youtube_post_count: number
        }[]
      }
      get_managed_creator_status_counts: {
        Args: {
          p_brand_id?: string
          p_country_code?: string
          p_country_name?: string
          p_job_id?: string
          p_search?: string
        }
        Returns: {
          count: number
          status: string
        }[]
      }
      get_post_snapshots: {
        Args: {
          p_brand_organization_id: string
          p_end_date: string
          p_post_ids: string[]
          p_start_date: string
        }
        Returns: {
          bucket_date: string
          comments_gained: number
          likes_gained: number
          shares_gained: number
          views_gained: number
        }[]
      }
      get_post_stats_by_connectors: {
        Args: { p_connector_ids: string[] }
        Returns: {
          post_count: number
          social_account_connector_id: string
          total_views: number
        }[]
      }
      get_posts_needing_video_storage: {
        Args: { max_posts?: number }
        Returns: {
          creator_country: string
          id: string
          post_id: string
          post_type: Database["public"]["Enums"]["post_type"]
          raw_data: Json
          tiktok_username: string
          video_storage_error: string
          video_storage_retry_count: number
          video_storage_url: string
        }[]
      }
      get_posts_with_snapshots_in_range: {
        Args: {
          p_brand_organization_id: string
          p_end_date: string
          p_post_ids: string[]
          p_start_date: string
        }
        Returns: {
          post_id: string
        }[]
      }
      get_storage_usage: { Args: { p_bucket_id?: string }; Returns: Json }
      get_user_brand_org_ids:
        | {
            Args: { check_user_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.get_user_brand_org_ids(check_user_id => text), public.get_user_brand_org_ids(check_user_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { check_user_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.get_user_brand_org_ids(check_user_id => text), public.get_user_brand_org_ids(check_user_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      get_video_storage_backlog_by_month: {
        Args: never
        Returns: {
          month: string
          pending: number
        }[]
      }
      get_video_storage_daily_throughput: {
        Args: { p_since: string }
        Returns: {
          date: string
          stored: number
        }[]
      }
      get_video_storage_error_breakdown: {
        Args: never
        Returns: {
          avg_retries: number
          count: number
          error: string
        }[]
      }
      is_admin: { Args: { check_user_id: string }; Returns: boolean }
      is_brand_member:
        | {
            Args: { check_brand_org_id: string; check_user_id: string }
            Returns: boolean
          }
        | {
            Args: { check_brand_org_id: string; check_user_id: string }
            Returns: boolean
          }
      is_brand_owner:
        | {
            Args: { check_brand_org_id: string; check_user_id: string }
            Returns: boolean
          }
        | {
            Args: { check_brand_org_id: string; check_user_id: string }
            Returns: boolean
          }
      is_brand_owner_or_admin: {
        Args: { check_brand_org_id: string; check_user_id: string }
        Returns: boolean
      }
      is_post_disclosed: {
        Args: { p_caption: string; p_platform: string; p_raw_data: Json }
        Returns: boolean
      }
      list_history_backfill_candidate_mcs: {
        Args: never
        Returns: {
          id: string
        }[]
      }
      me_inbox_threads: {
        Args: never
        Returns: {
          brand_organization_id: string
          last_message_at: string
          last_message_body: string
          last_message_event_type: string
          last_message_id: string
          last_sender_user_id: string
          unread_count: number
        }[]
      }
      mobile_inbox_threads: {
        Args: { p_user_id: string }
        Returns: {
          brand_organization_id: string
          last_message_at: string
          last_message_body: string
          last_message_event_type: string
          last_message_id: string
          last_sender_user_id: string
          unread_count: number
        }[]
      }
      mobile_update_post_ad_code: {
        Args: {
          p_ad_code: string
          p_connector_ids?: string[]
          p_instagram_username?: string
          p_post_id: string
          p_tiktok_username?: string
          p_youtube_username?: string
        }
        Returns: string
      }
      normalize_legacy_handle: {
        Args: { p_platform: string; p_raw: string }
        Returns: string
      }
      preview_reassign_managed_creator_job: {
        Args: { p_mc_id: string; p_target_job_id: string }
        Returns: Json
      }
      process_cpm_payout: {
        Args: { p_admin_id: string; p_submission_id: string }
        Returns: Json
      }
      process_post_payment: {
        Args: {
          p_admin_id: string
          p_mcp_id: string
          p_offplatform_method?: string
          p_override_disclosure?: boolean
        }
        Returns: Json
      }
      publish_funded_campaign: {
        Args: { p_job_id: string; p_user_id: string }
        Returns: Json
      }
      reassign_managed_creator_job: {
        Args: { p_mc_id: string; p_target_job_id: string }
        Returns: Json
      }
      record_earning_atomic: {
        Args: {
          p_amount: number
          p_cpm_submission_id?: string
          p_created_by?: string
          p_creator_profile_id: string
          p_description?: string
          p_job_id?: string
          p_stripe_transfer_status?: string
          p_type: Database["public"]["Enums"]["creator_transaction_type"]
          p_wallet_id?: string
        }
        Returns: Json
      }
      record_withdrawal_atomic: {
        Args: {
          p_amount: number
          p_creator_profile_id: string
          p_description?: string
          p_stripe_payout_id?: string
          p_stripe_transfer_id?: string
          p_wallet_id?: string
        }
        Returns: Json
      }
      refund_cpm_campaign_budget: {
        Args: {
          p_amount_cents: number
          p_job_id: string
          p_submission_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      requesting_user_id: { Args: never; Returns: string }
      trigger_disclosure_check_hook: {
        Args: { p_post_id: string }
        Returns: undefined
      }
      unpublish_cpm_campaign: {
        Args: { p_job_id: string; p_user_id: string }
        Returns: Json
      }
      upload_or_replace_video: {
        Args: {
          p_managed_creator_id: string
          p_required_count?: number
          p_slot_number: number
          p_storage_path: string
        }
        Returns: {
          is_complete: boolean
          replaced_video_path: string
          total_active_videos: number
          video_id: string
        }[]
      }
      user_can_see_platform_account: {
        Args: {
          p_instagram_id: string
          p_tiktok_id: string
          p_youtube_id: string
        }
        Returns: boolean
      }
      user_exists: { Args: { user_id_text: string }; Returns: boolean }
      verify_creator_invite: {
        Args: { p_token: string }
        Returns: {
          display_name: string
          first_name: string
          id: string
          last_name: string
          status: string
        }[]
      }
      withdraw_cpm_campaign_budget: {
        Args: { p_amount_cents: number; p_job_id: string; p_user_id: string }
        Returns: Json
      }
    }
    Enums: {
      accepted_currency: "GBP" | "USD" | "EUR"
      account_preference:
        | "personal_only"
        | "create_new"
        | "manage_existing"
        | "any"
      account_sync_status: "active" | "reduced" | "disabled"
      account_type: "brand_member" | "creator" | "admin"
      admin_role:
        | "super_admin"
        | "senior_account_manager"
        | "account_manager"
        | "sales_rep"
      application_status:
        | "pending"
        | "under_review"
        | "accepted"
        | "rejected"
        | "withdrawn"
        | "messaged"
      brand_account_status: "active" | "suspended" | "cancelled"
      brand_activity_status: "onboarding" | "active_hiring" | "idle" | "dormant"
      brand_campaign_status: "active" | "paused" | "completed"
      brand_member_role: "owner" | "admin" | "manager" | "member"
      brand_onboarding_status:
        | "started"
        | "profile_completed"
        | "payment_setup"
        | "completed"
      brand_transaction_type:
        | "deposit"
        | "allocation"
        | "payment_with_fee"
        | "refund"
        | "campaign_fund"
        | "campaign_withdrawal"
      burner_platform: "TikTok" | "Instagram" | "YouTube"
      burner_status: "active" | "warming" | "cold"
      content_type: "ugc" | "ai_generated" | "clipping"
      cpm_submission_status:
        | "pending_approval"
        | "approved"
        | "rejected"
        | "tracking"
        | "completed"
        | "paid"
        | "pending_fetch"
        | "fetch_failed"
        | "ineligible"
      creator_account_status: "active" | "suspended" | "deactivated"
      creator_onboarding_status:
        | "started"
        | "profile_completed"
        | "socials_linked"
        | "portfolio_added"
        | "payment_setup"
        | "completed"
        | "intro_video_uploaded"
        | "education_completed"
        | "profile_photo_uploaded"
      creator_transaction_type:
        | "earning"
        | "withdrawal"
        | "bonus"
        | "refund"
        | "cpm_earning"
        | "flat_fee"
        | "adjustment"
      discovery_source:
        | "tiktok"
        | "instagram"
        | "google_seo"
        | "ai_search"
        | "friend"
        | "other"
      experience_source_type: "manual" | "linkedin" | "platform_job"
      interest:
        | "Fitness"
        | "Tech"
        | "Fashion"
        | "Food"
        | "Travel"
        | "Education"
        | "Sports"
        | "Art"
        | "Gaming"
        | "Music"
      invitation_status: "pending" | "accepted" | "declined"
      job_status:
        | "draft"
        | "open"
        | "in_progress"
        | "closed"
        | "completed"
        | "cancelled"
        | "pending_funding"
      job_visibility:
        | "public"
        | "private"
        | "invite_only"
        | "country_restricted"
      language:
        | "Afrikaans"
        | "Albanian"
        | "Amharic"
        | "Arabic"
        | "Armenian"
        | "Azerbaijani"
        | "Basque"
        | "Belarusian"
        | "Bengali"
        | "Bosnian"
        | "Bulgarian"
        | "Catalan"
        | "Cebuano"
        | "Chinese"
        | "Corsican"
        | "Croatian"
        | "Czech"
        | "Danish"
        | "Dutch"
        | "English"
        | "Esperanto"
        | "Estonian"
        | "Filipino"
        | "Finnish"
        | "French"
        | "Galician"
        | "Georgian"
        | "German"
        | "Greek"
        | "Gujarati"
        | "Haitian_Creole"
        | "Hausa"
        | "Hawaiian"
        | "Hebrew"
        | "Hindi"
        | "Hmong"
        | "Hungarian"
        | "Icelandic"
        | "Igbo"
        | "Indonesian"
        | "Irish"
        | "Italian"
        | "Japanese"
        | "Javanese"
        | "Kannada"
        | "Kazakh"
        | "Khmer"
        | "Korean"
        | "Kurdish"
        | "Kyrgyz"
        | "Lao"
        | "Latin"
        | "Latvian"
        | "Lithuanian"
        | "Luxembourgish"
        | "Macedonian"
        | "Malagasy"
        | "Malay"
        | "Malayalam"
        | "Maltese"
        | "Maori"
        | "Marathi"
        | "Mongolian"
        | "Myanmar"
        | "Nepali"
        | "Norwegian"
        | "Nyanja"
        | "Pashto"
        | "Persian"
        | "Polish"
        | "Portuguese"
        | "Punjabi"
        | "Romanian"
        | "Russian"
        | "Samoan"
        | "Scots_Gaelic"
        | "Serbian"
        | "Sesotho"
        | "Shona"
        | "Sindhi"
        | "Sinhala"
        | "Slovak"
        | "Slovenian"
        | "Somali"
        | "Spanish"
        | "Sundanese"
        | "Swahili"
        | "Swedish"
        | "Tagalog"
        | "Tajik"
        | "Tamil"
        | "Telugu"
        | "Thai"
        | "Turkish"
        | "Ukrainian"
        | "Urdu"
        | "Uzbek"
        | "Vietnamese"
        | "Welsh"
        | "Xhosa"
        | "Yiddish"
        | "Yoruba"
        | "Zulu"
      managed_payment_method:
        | "stripe_connect"
        | "sideshift"
        | "whop"
        | "binance"
        | "paypal"
        | "bank_transfer"
        | "pending"
      managed_payout_frequency: "weekly" | "biweekly" | "monthly"
      payment_frequency: "post" | "week" | "month" | "year"
      platform:
        | "instagram"
        | "tiktok"
        | "youtube"
        | "twitter"
        | "facebook"
        | "linkedin"
      post_lifecycle_status: "active" | "deleted" | "frozen"
      post_review_status: "pending" | "approved" | "needs_changes" | "rejected"
      post_reviewer_type: "admin" | "brand_member" | "ai"
      post_status: "draft" | "scheduled" | "published" | "deleted"
      post_tracking_status: "active" | "excluded" | "untracked" | "deleted"
      post_type: "feed" | "story" | "reel" | "video" | "carousel" | "short"
      proficiency_level: "beginner" | "intermediate" | "expert"
      reviewee_type: "brand" | "creator"
      sentiment: "positive" | "negative" | "neutral"
      social_account_status: "active" | "inactive" | "suspended" | "deleted"
      social_account_type: "personal" | "job_specific"
      transaction_status: "pending" | "completed" | "failed"
      warmup_ai_status: "pending" | "pass" | "fail" | "needs_review"
      warmup_platform: "tiktok" | "instagram" | "youtube"
      warmup_review_status: "unreviewed" | "approved" | "rejected"
      willing_to_show_face: "yes" | "no" | "depends"
      work_status: "available" | "busy" | "unavailable" | "on_break"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      accepted_currency: ["GBP", "USD", "EUR"],
      account_preference: [
        "personal_only",
        "create_new",
        "manage_existing",
        "any",
      ],
      account_sync_status: ["active", "reduced", "disabled"],
      account_type: ["brand_member", "creator", "admin"],
      admin_role: [
        "super_admin",
        "senior_account_manager",
        "account_manager",
        "sales_rep",
      ],
      application_status: [
        "pending",
        "under_review",
        "accepted",
        "rejected",
        "withdrawn",
        "messaged",
      ],
      brand_account_status: ["active", "suspended", "cancelled"],
      brand_activity_status: ["onboarding", "active_hiring", "idle", "dormant"],
      brand_campaign_status: ["active", "paused", "completed"],
      brand_member_role: ["owner", "admin", "manager", "member"],
      brand_onboarding_status: [
        "started",
        "profile_completed",
        "payment_setup",
        "completed",
      ],
      brand_transaction_type: [
        "deposit",
        "allocation",
        "payment_with_fee",
        "refund",
        "campaign_fund",
        "campaign_withdrawal",
      ],
      burner_platform: ["TikTok", "Instagram", "YouTube"],
      burner_status: ["active", "warming", "cold"],
      content_type: ["ugc", "ai_generated", "clipping"],
      cpm_submission_status: [
        "pending_approval",
        "approved",
        "rejected",
        "tracking",
        "completed",
        "paid",
        "pending_fetch",
        "fetch_failed",
        "ineligible",
      ],
      creator_account_status: ["active", "suspended", "deactivated"],
      creator_onboarding_status: [
        "started",
        "profile_completed",
        "socials_linked",
        "portfolio_added",
        "payment_setup",
        "completed",
        "intro_video_uploaded",
        "education_completed",
        "profile_photo_uploaded",
      ],
      creator_transaction_type: [
        "earning",
        "withdrawal",
        "bonus",
        "refund",
        "cpm_earning",
        "flat_fee",
        "adjustment",
      ],
      discovery_source: [
        "tiktok",
        "instagram",
        "google_seo",
        "ai_search",
        "friend",
        "other",
      ],
      experience_source_type: ["manual", "linkedin", "platform_job"],
      interest: [
        "Fitness",
        "Tech",
        "Fashion",
        "Food",
        "Travel",
        "Education",
        "Sports",
        "Art",
        "Gaming",
        "Music",
      ],
      invitation_status: ["pending", "accepted", "declined"],
      job_status: [
        "draft",
        "open",
        "in_progress",
        "closed",
        "completed",
        "cancelled",
        "pending_funding",
      ],
      job_visibility: [
        "public",
        "private",
        "invite_only",
        "country_restricted",
      ],
      language: [
        "Afrikaans",
        "Albanian",
        "Amharic",
        "Arabic",
        "Armenian",
        "Azerbaijani",
        "Basque",
        "Belarusian",
        "Bengali",
        "Bosnian",
        "Bulgarian",
        "Catalan",
        "Cebuano",
        "Chinese",
        "Corsican",
        "Croatian",
        "Czech",
        "Danish",
        "Dutch",
        "English",
        "Esperanto",
        "Estonian",
        "Filipino",
        "Finnish",
        "French",
        "Galician",
        "Georgian",
        "German",
        "Greek",
        "Gujarati",
        "Haitian_Creole",
        "Hausa",
        "Hawaiian",
        "Hebrew",
        "Hindi",
        "Hmong",
        "Hungarian",
        "Icelandic",
        "Igbo",
        "Indonesian",
        "Irish",
        "Italian",
        "Japanese",
        "Javanese",
        "Kannada",
        "Kazakh",
        "Khmer",
        "Korean",
        "Kurdish",
        "Kyrgyz",
        "Lao",
        "Latin",
        "Latvian",
        "Lithuanian",
        "Luxembourgish",
        "Macedonian",
        "Malagasy",
        "Malay",
        "Malayalam",
        "Maltese",
        "Maori",
        "Marathi",
        "Mongolian",
        "Myanmar",
        "Nepali",
        "Norwegian",
        "Nyanja",
        "Pashto",
        "Persian",
        "Polish",
        "Portuguese",
        "Punjabi",
        "Romanian",
        "Russian",
        "Samoan",
        "Scots_Gaelic",
        "Serbian",
        "Sesotho",
        "Shona",
        "Sindhi",
        "Sinhala",
        "Slovak",
        "Slovenian",
        "Somali",
        "Spanish",
        "Sundanese",
        "Swahili",
        "Swedish",
        "Tagalog",
        "Tajik",
        "Tamil",
        "Telugu",
        "Thai",
        "Turkish",
        "Ukrainian",
        "Urdu",
        "Uzbek",
        "Vietnamese",
        "Welsh",
        "Xhosa",
        "Yiddish",
        "Yoruba",
        "Zulu",
      ],
      managed_payment_method: [
        "stripe_connect",
        "sideshift",
        "whop",
        "binance",
        "paypal",
        "bank_transfer",
        "pending",
      ],
      managed_payout_frequency: ["weekly", "biweekly", "monthly"],
      payment_frequency: ["post", "week", "month", "year"],
      platform: [
        "instagram",
        "tiktok",
        "youtube",
        "twitter",
        "facebook",
        "linkedin",
      ],
      post_lifecycle_status: ["active", "deleted", "frozen"],
      post_review_status: ["pending", "approved", "needs_changes", "rejected"],
      post_reviewer_type: ["admin", "brand_member", "ai"],
      post_status: ["draft", "scheduled", "published", "deleted"],
      post_tracking_status: ["active", "excluded", "untracked", "deleted"],
      post_type: ["feed", "story", "reel", "video", "carousel", "short"],
      proficiency_level: ["beginner", "intermediate", "expert"],
      reviewee_type: ["brand", "creator"],
      sentiment: ["positive", "negative", "neutral"],
      social_account_status: ["active", "inactive", "suspended", "deleted"],
      social_account_type: ["personal", "job_specific"],
      transaction_status: ["pending", "completed", "failed"],
      warmup_ai_status: ["pending", "pass", "fail", "needs_review"],
      warmup_platform: ["tiktok", "instagram", "youtube"],
      warmup_review_status: ["unreviewed", "approved", "rejected"],
      willing_to_show_face: ["yes", "no", "depends"],
      work_status: ["available", "busy", "unavailable", "on_break"],
    },
  },
} as const

