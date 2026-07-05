// GENERATED FILE — do not edit by hand. Regenerate with: npm run db:types (requires a running local Supabase stack: supabase start)
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
      cover_letters: {
        Row: {
          content: string
          external_id: string
          generated_at: string
          id: string
          job_hash: string
          source: string
          user_id: string
        }
        Insert: {
          content: string
          external_id: string
          generated_at?: string
          id?: string
          job_hash: string
          source: string
          user_id: string
        }
        Update: {
          content?: string
          external_id?: string
          generated_at?: string
          id?: string
          job_hash?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      cv_profiles: {
        Row: {
          content_type: string
          created_at: string
          email: string | null
          experience_highlights: string[]
          extracted_at: string
          file_name: string
          file_size: number
          full_name: string | null
          links: string[]
          phone: string | null
          role_hints: string[]
          skills: string[]
          storage_bucket: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_type?: string
          created_at?: string
          email?: string | null
          experience_highlights?: string[]
          extracted_at?: string
          file_name: string
          file_size: number
          full_name?: string | null
          links?: string[]
          phone?: string | null
          role_hints?: string[]
          skills?: string[]
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_type?: string
          created_at?: string
          email?: string | null
          experience_highlights?: string[]
          extracted_at?: string
          file_name?: string
          file_size?: number
          full_name?: string | null
          links?: string[]
          phone?: string | null
          role_hints?: string[]
          skills?: string[]
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_preferences: {
        Row: {
          created_at: string
          include_unknown_salary: boolean
          locations: string | null
          min_salary_amount: number | null
          salary_currency: string
          target_roles: string[]
          technologies: string[]
          updated_at: string
          user_id: string
          work_modes: string[]
        }
        Insert: {
          created_at?: string
          include_unknown_salary?: boolean
          locations?: string | null
          min_salary_amount?: number | null
          salary_currency?: string
          target_roles?: string[]
          technologies?: string[]
          updated_at?: string
          user_id: string
          work_modes?: string[]
        }
        Update: {
          created_at?: string
          include_unknown_salary?: boolean
          locations?: string | null
          min_salary_amount?: number | null
          salary_currency?: string
          target_roles?: string[]
          technologies?: string[]
          updated_at?: string
          user_id?: string
          work_modes?: string[]
        }
        Relationships: []
      }
      job_scores: {
        Row: {
          explanation: string
          external_id: string
          id: string
          job_hash: string
          matched_skills: string[]
          missing_skills: string[]
          score: number
          scored_at: string
          source: string
          user_id: string
        }
        Insert: {
          explanation: string
          external_id: string
          id?: string
          job_hash: string
          matched_skills?: string[]
          missing_skills?: string[]
          score: number
          scored_at?: string
          source: string
          user_id: string
        }
        Update: {
          explanation?: string
          external_id?: string
          id?: string
          job_hash?: string
          matched_skills?: string[]
          missing_skills?: string[]
          score?: number
          scored_at?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_jobs: {
        Row: {
          company: string
          created_at: string
          external_id: string
          id: string
          notes: string | null
          snapshot: Json
          source: string
          status: string
          title: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          company: string
          created_at?: string
          external_id: string
          id?: string
          notes?: string | null
          snapshot?: Json
          source: string
          status?: string
          title: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          company?: string
          created_at?: string
          external_id?: string
          id?: string
          notes?: string | null
          snapshot?: Json
          source?: string
          status?: string
          title?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

