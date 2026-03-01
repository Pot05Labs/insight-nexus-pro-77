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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      campaign_data: {
        Row: {
          ad_group: string | null
          campaign_name: string | null
          clicks: number | null
          conversions: number | null
          created_at: string
          created_by: string | null
          date: string
          deleted_at: string | null
          id: string
          impressions: number | null
          platform: string
          revenue: number | null
          spend: number | null
          updated_at: string | null
          upload_id: string | null
          user_id: string
        }
        Insert: {
          ad_group?: string | null
          campaign_name?: string | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          created_by?: string | null
          date: string
          deleted_at?: string | null
          id?: string
          impressions?: number | null
          platform: string
          revenue?: number | null
          spend?: number | null
          updated_at?: string | null
          upload_id?: string | null
          user_id: string
        }
        Update: {
          ad_group?: string | null
          campaign_name?: string | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          id?: string
          impressions?: number | null
          platform?: string
          revenue?: number | null
          spend?: number | null
          updated_at?: string | null
          upload_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_data_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "data_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_data_v2: {
        Row: {
          campaign_name: string | null
          channel: string | null
          clicks: number | null
          conversions: number | null
          cpm: number | null
          created_at: string | null
          created_by: string | null
          ctr: number | null
          deleted_at: string | null
          extraction_confidence: number | null
          flight_end: string | null
          flight_start: string | null
          id: string
          impressions: number | null
          platform: string | null
          project_id: string
          revenue: number | null
          source_format: string | null
          spend: number | null
          spend_by_period: Json | null
          total_sales_attributed: number | null
          total_units_attributed: number | null
          updated_at: string | null
          upload_id: string | null
          user_id: string
        }
        Insert: {
          campaign_name?: string | null
          channel?: string | null
          clicks?: number | null
          conversions?: number | null
          cpm?: number | null
          created_at?: string | null
          created_by?: string | null
          ctr?: number | null
          deleted_at?: string | null
          extraction_confidence?: number | null
          flight_end?: string | null
          flight_start?: string | null
          id?: string
          impressions?: number | null
          platform?: string | null
          project_id: string
          revenue?: number | null
          source_format?: string | null
          spend?: number | null
          spend_by_period?: Json | null
          total_sales_attributed?: number | null
          total_units_attributed?: number | null
          updated_at?: string | null
          upload_id?: string | null
          user_id: string
        }
        Update: {
          campaign_name?: string | null
          channel?: string | null
          clicks?: number | null
          conversions?: number | null
          cpm?: number | null
          created_at?: string | null
          created_by?: string | null
          ctr?: number | null
          deleted_at?: string | null
          extraction_confidence?: number | null
          flight_end?: string | null
          flight_start?: string | null
          id?: string
          impressions?: number | null
          platform?: string | null
          project_id?: string
          revenue?: number | null
          source_format?: string | null
          spend?: number | null
          spend_by_period?: Json | null
          total_sales_attributed?: number | null
          total_units_attributed?: number | null
          updated_at?: string | null
          upload_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_data_v2_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_data_v2_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "data_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          deleted_at: string | null
          id: string
          project_id: string | null
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          project_id?: string | null
          role: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          project_id?: string | null
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_intelligence: {
        Row: {
          id: string
          user_id: string
          project_id: string
          intelligence_type: string
          content: Json
          confidence: number | null
          data_points_used: number | null
          last_updated_at: string | null
          created_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          project_id: string
          intelligence_type: string
          content?: Json
          confidence?: number | null
          data_points_used?: number | null
          last_updated_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          project_id?: string
          intelligence_type?: string
          content?: Json
          confidence?: number | null
          data_points_used?: number | null
          last_updated_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_intelligence_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      computed_metrics: {
        Row: {
          computed_at: string | null
          created_by: string | null
          deleted_at: string | null
          dimensions: Json | null
          id: string
          metric_name: string
          metric_value: number | null
          project_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          computed_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          dimensions?: Json | null
          id?: string
          metric_name: string
          metric_value?: number | null
          project_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          computed_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          dimensions?: Json | null
          id?: string
          metric_name?: string
          metric_value?: number | null
          project_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "computed_metrics_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      data_uploads: {
        Row: {
          column_mapping: Json | null
          column_names: Json | null
          created_at: string
          data_type: string | null
          date_range_end: string | null
          date_range_start: string | null
          error_message: string | null
          file_name: string
          file_size: number
          file_type: string
          id: string
          project_id: string | null
          row_count: number | null
          source_name: string | null
          source_type: string | null
          status: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          column_mapping?: Json | null
          column_names?: Json | null
          created_at?: string
          data_type?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          error_message?: string | null
          file_name: string
          file_size?: number
          file_type: string
          id?: string
          project_id?: string | null
          row_count?: number | null
          source_name?: string | null
          source_type?: string | null
          status?: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          column_mapping?: Json | null
          column_names?: Json | null
          created_at?: string
          data_type?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          error_message?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          project_id?: string | null
          row_count?: number | null
          source_name?: string | null
          source_type?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_uploads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_matches: {
        Row: {
          campaign_product: string | null
          canonical_product: string | null
          confidence: number | null
          created_at: string | null
          id: string
          match_tier: number | null
          project_id: string
          reasoning: string | null
          sell_out_sku: string | null
          user_confirmed: boolean | null
          user_id: string
        }
        Insert: {
          campaign_product?: string | null
          canonical_product?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          match_tier?: number | null
          project_id: string
          reasoning?: string | null
          sell_out_sku?: string | null
          user_confirmed?: boolean | null
          user_id: string
        }
        Update: {
          campaign_product?: string | null
          canonical_product?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          match_tier?: number | null
          project_id?: string
          reasoning?: string | null
          sell_out_sku?: string | null
          user_confirmed?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_matches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      file_uploads: {
        Row: {
          classification: Json | null
          created_at: string | null
          data_type: string | null
          deleted_at: string | null
          file_format: string | null
          filename: string
          id: string
          project_id: string
          status: string | null
          storage_path: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          classification?: Json | null
          created_at?: string | null
          data_type?: string | null
          deleted_at?: string | null
          file_format?: string | null
          filename: string
          id?: string
          project_id: string
          status?: string | null
          storage_path: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          classification?: Json | null
          created_at?: string | null
          data_type?: string | null
          deleted_at?: string | null
          file_format?: string | null
          filename?: string
          id?: string
          project_id?: string
          status?: string | null
          storage_path?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_uploads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      harmonized_sales: {
        Row: {
          channel: string | null
          cost: number | null
          created_at: string
          date: string
          id: string
          product_name: string | null
          returns: number | null
          revenue: number | null
          sku: string | null
          units_sold: number | null
          upload_id: string | null
          user_id: string
        }
        Insert: {
          channel?: string | null
          cost?: number | null
          created_at?: string
          date: string
          id?: string
          product_name?: string | null
          returns?: number | null
          revenue?: number | null
          sku?: string | null
          units_sold?: number | null
          upload_id?: string | null
          user_id: string
        }
        Update: {
          channel?: string | null
          cost?: number | null
          created_at?: string
          date?: string
          id?: string
          product_name?: string | null
          returns?: number | null
          revenue?: number | null
          sku?: string | null
          units_sold?: number | null
          upload_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "harmonized_sales_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "data_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_reports: {
        Row: {
          content: Json | null
          created_at: string | null
          deleted_at: string | null
          id: string
          project_id: string
          report_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          project_id: string
          report_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          project_id?: string
          report_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "narrative_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      pipeline_runs: {
        Row: {
          completed_at: string | null
          current_stage: number | null
          deleted_at: string | null
          id: string
          project_id: string
          stage_details: Json | null
          started_at: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          current_stage?: number | null
          deleted_at?: string | null
          id?: string
          project_id: string
          stage_details?: Json | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          current_stage?: number | null
          deleted_at?: string | null
          id?: string
          project_id?: string
          stage_details?: Json | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          full_name: string | null
          id: string
          stripe_customer_id: string | null
          subscription_period_end: string | null
          subscription_plan: string | null
          subscription_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          stripe_customer_id?: string | null
          subscription_period_end?: string | null
          subscription_plan?: string | null
          subscription_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          stripe_customer_id?: string | null
          subscription_period_end?: string | null
          subscription_plan?: string | null
          subscription_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          brand: string | null
          created_at: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      sell_out_data: {
        Row: {
          brand: string | null
          category: string | null
          cost: number | null
          created_at: string | null
          created_by: string | null
          date: string | null
          deleted_at: string | null
          format_size: string | null
          id: string
          product_name_raw: string | null
          project_id: string
          region: string | null
          retailer: string | null
          revenue: number | null
          sku: string | null
          store_location: string | null
          sub_brand: string | null
          units_sold: number | null
          units_supplied: number | null
          updated_at: string | null
          upload_id: string | null
          user_id: string
        }
        Insert: {
          brand?: string | null
          category?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          format_size?: string | null
          id?: string
          product_name_raw?: string | null
          project_id: string
          region?: string | null
          retailer?: string | null
          revenue?: number | null
          sku?: string | null
          store_location?: string | null
          sub_brand?: string | null
          units_sold?: number | null
          units_supplied?: number | null
          updated_at?: string | null
          upload_id?: string | null
          user_id: string
        }
        Update: {
          brand?: string | null
          category?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          format_size?: string | null
          id?: string
          product_name_raw?: string | null
          project_id?: string
          region?: string | null
          retailer?: string | null
          revenue?: number | null
          sku?: string | null
          store_location?: string | null
          sub_brand?: string | null
          units_sold?: number | null
          units_supplied?: number | null
          updated_at?: string | null
          upload_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sell_out_data_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sell_out_data_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "data_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string | null
          id: string
          last_project_id: string | null
          sidebar_collapsed: boolean | null
          theme: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_project_id?: string | null
          sidebar_collapsed?: boolean | null
          theme?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_project_id?: string | null
          sidebar_collapsed?: boolean | null
          theme?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_last_project_id_fkey"
            columns: ["last_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waitlist_leads: {
        Row: {
          company_name: string
          created_at: string
          email: string
          full_name: string
          id: string
          message: string | null
          selected_plan: string
        }
        Insert: {
          company_name: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          message?: string | null
          selected_plan: string
        }
        Update: {
          company_name?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          message?: string | null
          selected_plan?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "analyst" | "viewer"
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
      app_role: ["admin", "analyst", "viewer"],
    },
  },
} as const
