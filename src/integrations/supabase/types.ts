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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      smfta_chat_sessions: {
        Row: {
          created_at: string
          data: Json
          draft: string | null
          pinned: boolean
          session_id: number
          title: string
          title_source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          draft?: string | null
          pinned?: boolean
          session_id: number
          title?: string
          title_source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          draft?: string | null
          pinned?: boolean
          session_id?: number
          title?: string
          title_source?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      smfta_profiles: {
        Row: {
          avatar_data_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          legacy_user_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_data_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          legacy_user_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_data_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          legacy_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      smfta_published_previews: {
        Row: {
          created_at: string
          files: Json
          html: string
          id: string
          owner_key: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          files?: Json
          html: string
          id: string
          owner_key: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          files?: Json
          html?: string
          id?: string
          owner_key?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      smfta_user_state: {
        Row: {
          active_project: Json | null
          autonomy: string | null
          connections: Json | null
          custom_prompts: Json
          memory: Json
          notes: Json
          saved_profiles: Json
          settings: Json
          skills: Json
          updated_at: string
          user_id: string
          widgets: Json
          workspace: Json | null
        }
        Insert: {
          active_project?: Json | null
          autonomy?: string | null
          connections?: Json | null
          custom_prompts?: Json
          memory?: Json
          notes?: Json
          saved_profiles?: Json
          settings?: Json
          skills?: Json
          updated_at?: string
          user_id: string
          widgets?: Json
          workspace?: Json | null
        }
        Update: {
          active_project?: Json | null
          autonomy?: string | null
          connections?: Json | null
          custom_prompts?: Json
          memory?: Json
          notes?: Json
          saved_profiles?: Json
          settings?: Json
          skills?: Json
          updated_at?: string
          user_id?: string
          widgets?: Json
          workspace?: Json | null
        }
        Relationships: []
      }
      smfta_v2_document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          doc_id: string
          embedding: string | null
          file_name: string
          id: string
          metadata: Json
          mime_type: string | null
          user_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          doc_id: string
          embedding?: string | null
          file_name: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          user_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          doc_id?: string
          embedding?: string | null
          file_name?: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      smfta_v2_memories: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          pinned: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          pinned?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          pinned?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      smfta_v2_quota_config: {
        Row: {
          config_json: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          config_json?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          config_json?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      smfta_v2_usage: {
        Row: {
          date_riyadh: string
          testing_used_by_model: Json
          updated_at: string
          used_by_model: Json
          user_id: string
        }
        Insert: {
          date_riyadh: string
          testing_used_by_model?: Json
          updated_at?: string
          used_by_model?: Json
          user_id: string
        }
        Update: {
          date_riyadh?: string
          testing_used_by_model?: Json
          updated_at?: string
          used_by_model?: Json
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_v2_document_chunks: {
        Args: {
          match_count?: number
          match_user_id: string
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          doc_id: string
          file_name: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      match_v2_memories: {
        Args: {
          match_count?: number
          match_user_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          pinned: boolean
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
