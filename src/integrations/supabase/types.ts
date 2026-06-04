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
      banners: {
        Row: {
          clicks: number
          created_at: string
          ends_at: string | null
          id: string
          image_url: string
          impressions: number
          is_active: boolean
          link_url: string | null
          name: string
          position: Database["public"]["Enums"]["banner_position"] | null
          sponsor: string | null
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          clicks?: number
          created_at?: string
          ends_at?: string | null
          id?: string
          image_url: string
          impressions?: number
          is_active?: boolean
          link_url?: string | null
          name: string
          position?: Database["public"]["Enums"]["banner_position"] | null
          sponsor?: string | null
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          clicks?: number
          created_at?: string
          ends_at?: string | null
          id?: string
          image_url?: string
          impressions?: number
          is_active?: boolean
          link_url?: string | null
          name?: string
          position?: Database["public"]["Enums"]["banner_position"] | null
          sponsor?: string | null
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          default_cover_image_url: string | null
          description: string | null
          id: string
          name: string
          position: number
          slug: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          default_cover_image_url?: string | null
          description?: string | null
          id?: string
          name: string
          position?: number
          slug: string
        }
        Update: {
          color?: string | null
          created_at?: string
          default_cover_image_url?: string | null
          description?: string | null
          id?: string
          name?: string
          position?: number
          slug?: string
        }
        Relationships: []
      }
      denuncias: {
        Row: {
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          description: string
          id: string
          is_anonymous: boolean
          status: Database["public"]["Enums"]["denuncia_status"]
          title: string
        }
        Insert: {
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          description: string
          id?: string
          is_anonymous?: boolean
          status?: Database["public"]["Enums"]["denuncia_status"]
          title: string
        }
        Update: {
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string
          id?: string
          is_anonymous?: boolean
          status?: Database["public"]["Enums"]["denuncia_status"]
          title?: string
        }
        Relationships: []
      }
      duplicate_decisions: {
        Row: {
          created_at: string
          decided_by: string | null
          decision: string
          id: string
          note: string | null
          post_id: string
          reference_post_id: string | null
          similarity_score: number | null
        }
        Insert: {
          created_at?: string
          decided_by?: string | null
          decision: string
          id?: string
          note?: string | null
          post_id: string
          reference_post_id?: string | null
          similarity_score?: number | null
        }
        Update: {
          created_at?: string
          decided_by?: string | null
          decision?: string
          id?: string
          note?: string | null
          post_id?: string
          reference_post_id?: string | null
          similarity_score?: number | null
        }
        Relationships: []
      }
      financial_budgets: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          id: string
          period: string
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          id?: string
          period?: string
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          id?: string
          period?: string
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          date: string
          description: string | null
          id: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      home_audit: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          id: string
          position: string | null
          post_id: string | null
          reason: string | null
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          id?: string
          position?: string | null
          post_id?: string | null
          reason?: string | null
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          position?: string | null
          post_id?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      instagram_posts: {
        Row: {
          caption: string
          created_at: string
          created_by: string | null
          editoria: string | null
          error_message: string | null
          hashtags: string[]
          id: string
          image_url: string | null
          post_id: string | null
          published_at: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["instagram_post_status"]
          texto_arte: Json | null
          updated_at: string
        }
        Insert: {
          caption?: string
          created_at?: string
          created_by?: string | null
          editoria?: string | null
          error_message?: string | null
          hashtags?: string[]
          id?: string
          image_url?: string | null
          post_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["instagram_post_status"]
          texto_arte?: Json | null
          updated_at?: string
        }
        Update: {
          caption?: string
          created_at?: string
          created_by?: string | null
          editoria?: string | null
          error_message?: string | null
          hashtags?: string[]
          id?: string
          image_url?: string | null
          post_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["instagram_post_status"]
          texto_arte?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      news_sources: {
        Row: {
          created_at: string
          default_category_id: string | null
          frequency_minutes: number
          id: string
          is_active: boolean
          last_run_at: string | null
          last_run_message: string | null
          last_run_status: string | null
          max_items_per_run: number
          name: string
          source_type: string
          total_captured: number
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          default_category_id?: string | null
          frequency_minutes?: number
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_run_message?: string | null
          last_run_status?: string | null
          max_items_per_run?: number
          name: string
          source_type: string
          total_captured?: number
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          default_category_id?: string | null
          frequency_minutes?: number
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_run_message?: string | null
          last_run_status?: string | null
          max_items_per_run?: number
          name?: string
          source_type?: string
          total_captured?: number
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_sources_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      post_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["post_status"] | null
          id: string
          note: string | null
          post_id: string
          to_status: Database["public"]["Enums"]["post_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["post_status"] | null
          id?: string
          note?: string | null
          post_id: string
          to_status: Database["public"]["Enums"]["post_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["post_status"] | null
          id?: string
          note?: string | null
          post_id?: string
          to_status?: Database["public"]["Enums"]["post_status"]
        }
        Relationships: [
          {
            foreignKeyName: "post_status_history_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          ai_review_status: string
          ai_rewrite_quality: string
          ai_rewritten_at: string | null
          ai_suggested_placement: string | null
          ai_suggestion_decided_at: string | null
          ai_suggestion_decided_by: string | null
          ai_suggestion_status: string
          ai_version_used: string
          archived_at: string | null
          archived_reason: string | null
          author_id: string | null
          category_id: string | null
          content: string
          conteudo_gerado: string | null
          conteudo_original: string | null
          cover_image_original: string | null
          cover_image_source: string | null
          cover_image_url: string | null
          created_at: string
          duplicate_match_reason: string | null
          duplicate_of: string | null
          excerpt: string | null
          external_id: string | null
          home_expires_at: string | null
          id: string
          instagram_headline: string | null
          is_denuncia: boolean
          is_evergreen: boolean
          is_featured: boolean
          is_main_featured: boolean
          is_urgent: boolean
          main_featured_expires_at: string | null
          manual_image_url: string | null
          meta_description: string | null
          meta_keywords: string[]
          meta_title: string | null
          previous_status: Database["public"]["Enums"]["post_status"] | null
          published_at: string | null
          relevance_analyzed_at: string | null
          relevance_factors: Json | null
          relevance_level: string | null
          relevance_reason: string | null
          relevance_score: number | null
          resumo_gerado: string | null
          scheduled_at: string | null
          similar_to: string | null
          similarity_score: number | null
          slug: string
          source_id: string | null
          source_published_at: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["post_status"]
          subtitle: string | null
          tags: string[] | null
          title: string
          titulo_gerado: string | null
          titulo_original: string | null
          updated_at: string
          video_url_principal: string | null
          videos_relacionados: string[]
          views: number
        }
        Insert: {
          ai_review_status?: string
          ai_rewrite_quality?: string
          ai_rewritten_at?: string | null
          ai_suggested_placement?: string | null
          ai_suggestion_decided_at?: string | null
          ai_suggestion_decided_by?: string | null
          ai_suggestion_status?: string
          ai_version_used?: string
          archived_at?: string | null
          archived_reason?: string | null
          author_id?: string | null
          category_id?: string | null
          content: string
          conteudo_gerado?: string | null
          conteudo_original?: string | null
          cover_image_original?: string | null
          cover_image_source?: string | null
          cover_image_url?: string | null
          created_at?: string
          duplicate_match_reason?: string | null
          duplicate_of?: string | null
          excerpt?: string | null
          external_id?: string | null
          home_expires_at?: string | null
          id?: string
          instagram_headline?: string | null
          is_denuncia?: boolean
          is_evergreen?: boolean
          is_featured?: boolean
          is_main_featured?: boolean
          is_urgent?: boolean
          main_featured_expires_at?: string | null
          manual_image_url?: string | null
          meta_description?: string | null
          meta_keywords?: string[]
          meta_title?: string | null
          previous_status?: Database["public"]["Enums"]["post_status"] | null
          published_at?: string | null
          relevance_analyzed_at?: string | null
          relevance_factors?: Json | null
          relevance_level?: string | null
          relevance_reason?: string | null
          relevance_score?: number | null
          resumo_gerado?: string | null
          scheduled_at?: string | null
          similar_to?: string | null
          similarity_score?: number | null
          slug: string
          source_id?: string | null
          source_published_at?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          subtitle?: string | null
          tags?: string[] | null
          title: string
          titulo_gerado?: string | null
          titulo_original?: string | null
          updated_at?: string
          video_url_principal?: string | null
          videos_relacionados?: string[]
          views?: number
        }
        Update: {
          ai_review_status?: string
          ai_rewrite_quality?: string
          ai_rewritten_at?: string | null
          ai_suggested_placement?: string | null
          ai_suggestion_decided_at?: string | null
          ai_suggestion_decided_by?: string | null
          ai_suggestion_status?: string
          ai_version_used?: string
          archived_at?: string | null
          archived_reason?: string | null
          author_id?: string | null
          category_id?: string | null
          content?: string
          conteudo_gerado?: string | null
          conteudo_original?: string | null
          cover_image_original?: string | null
          cover_image_source?: string | null
          cover_image_url?: string | null
          created_at?: string
          duplicate_match_reason?: string | null
          duplicate_of?: string | null
          excerpt?: string | null
          external_id?: string | null
          home_expires_at?: string | null
          id?: string
          instagram_headline?: string | null
          is_denuncia?: boolean
          is_evergreen?: boolean
          is_featured?: boolean
          is_main_featured?: boolean
          is_urgent?: boolean
          main_featured_expires_at?: string | null
          manual_image_url?: string | null
          meta_description?: string | null
          meta_keywords?: string[]
          meta_title?: string | null
          previous_status?: Database["public"]["Enums"]["post_status"] | null
          published_at?: string | null
          relevance_analyzed_at?: string | null
          relevance_factors?: Json | null
          relevance_level?: string | null
          relevance_reason?: string | null
          relevance_score?: number | null
          resumo_gerado?: string | null
          scheduled_at?: string | null
          similar_to?: string | null
          similarity_score?: number | null
          slug?: string
          source_id?: string | null
          source_published_at?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          subtitle?: string | null
          tags?: string[] | null
          title?: string
          titulo_gerado?: string | null
          titulo_original?: string | null
          updated_at?: string
          video_url_principal?: string | null
          videos_relacionados?: string[]
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      posts_public: {
        Row: {
          author_id: string | null
          category_id: string | null
          content: string
          cover_image_url: string | null
          created_at: string
          excerpt: string | null
          home_expires_at: string | null
          id: string
          is_denuncia: boolean
          is_editorial: boolean
          is_evergreen: boolean
          is_featured: boolean
          is_main_featured: boolean
          is_urgent: boolean
          main_featured_expires_at: string | null
          manual_image_url: string | null
          meta_description: string | null
          meta_title: string | null
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["post_status"]
          subtitle: string | null
          tags: string[] | null
          title: string
          updated_at: string
          video_url_principal: string | null
          videos_relacionados: string[]
          views: number
        }
        Insert: {
          author_id?: string | null
          category_id?: string | null
          content: string
          cover_image_url?: string | null
          created_at: string
          excerpt?: string | null
          home_expires_at?: string | null
          id: string
          is_denuncia?: boolean
          is_editorial?: boolean
          is_evergreen?: boolean
          is_featured?: boolean
          is_main_featured?: boolean
          is_urgent?: boolean
          main_featured_expires_at?: string | null
          manual_image_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          slug: string
          status: Database["public"]["Enums"]["post_status"]
          subtitle?: string | null
          tags?: string[] | null
          title: string
          updated_at: string
          video_url_principal?: string | null
          videos_relacionados?: string[]
          views?: number
        }
        Update: {
          author_id?: string | null
          category_id?: string | null
          content?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          home_expires_at?: string | null
          id?: string
          is_denuncia?: boolean
          is_editorial?: boolean
          is_evergreen?: boolean
          is_featured?: boolean
          is_main_featured?: boolean
          is_urgent?: boolean
          main_featured_expires_at?: string | null
          manual_image_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["post_status"]
          subtitle?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          video_url_principal?: string | null
          videos_relacionados?: string[]
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "posts_public_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_public_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
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
    }
    Views: {
      banners_public: {
        Row: {
          id: string | null
          image_url: string | null
          link_url: string | null
          name: string | null
          position: Database["public"]["Enums"]["banner_position"] | null
        }
        Insert: {
          id?: string | null
          image_url?: string | null
          link_url?: string | null
          name?: string | null
          position?: Database["public"]["Enums"]["banner_position"] | null
        }
        Update: {
          id?: string | null
          image_url?: string | null
          link_url?: string | null
          name?: string | null
          position?: Database["public"]["Enums"]["banner_position"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      archive_post: {
        Args: { _post_id: string; _reason?: string }
        Returns: undefined
      }
      auto_archive_posts: {
        Args: never
        Returns: {
          archived_count: number
        }[]
      }
      can_approve_publish: { Args: { _user_id: string }; Returns: boolean }
      find_duplicate_post: {
        Args: {
          _exclude_id?: string
          _slug?: string
          _source_url?: string
          _title: string
        }
        Returns: {
          id: string
          match_reason: string
          similarity: number
          slug: string
          source_url: string
          status: Database["public"]["Enums"]["post_status"]
          title: string
        }[]
      }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { _role: string; _user_id: string }; Returns: boolean }
      increment_post_views: { Args: { _post_id: string }; Returns: undefined }
      is_main_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      restore_post: { Args: { _post_id: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "editor" | "redator"
      banner_position:
        | "topo_home"
        | "entre_noticias"
        | "dentro_materia"
        | "final_materia"
        | "lateral"
        | "mobile_banner"
        | "footer"
      denuncia_status: "nova" | "em_apuracao" | "publicada" | "arquivada"
      instagram_post_status:
        | "pendente"
        | "aprovado"
        | "publicado"
        | "erro"
        | "pronto_manual"
      post_status:
        | "rascunho"
        | "revisao"
        | "publicado"
        | "captada"
        | "em_revisao"
        | "aprovada"
        | "rejeitada"
        | "publicada"
        | "duplicada"
        | "arquivada"
        | "pronta_para_revisao"
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
      app_role: ["admin", "editor", "redator"],
      banner_position: [
        "topo_home",
        "entre_noticias",
        "dentro_materia",
        "final_materia",
        "lateral",
        "mobile_banner",
        "footer",
      ],
      denuncia_status: ["nova", "em_apuracao", "publicada", "arquivada"],
      instagram_post_status: [
        "pendente",
        "aprovado",
        "publicado",
        "erro",
        "pronto_manual",
      ],
      post_status: [
        "rascunho",
        "revisao",
        "publicado",
        "captada",
        "em_revisao",
        "aprovada",
        "rejeitada",
        "publicada",
        "duplicada",
        "arquivada",
        "pronta_para_revisao",
      ],
    },
  },
} as const
