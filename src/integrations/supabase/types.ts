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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          document_type: Database["public"]["Enums"]["document_type"]
          file_url: string | null
          id: string
          is_verified: boolean | null
          project_id: string
          rejection_reason: string | null
          text_value: string | null
          updated_at: string
          uploaded_at: string
          uploaded_by_user_id: string
        }
        Insert: {
          document_type: Database["public"]["Enums"]["document_type"]
          file_url?: string | null
          id?: string
          is_verified?: boolean | null
          project_id: string
          rejection_reason?: string | null
          text_value?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by_user_id: string
        }
        Update: {
          document_type?: Database["public"]["Enums"]["document_type"]
          file_url?: string | null
          id?: string
          is_verified?: boolean | null
          project_id?: string
          rejection_reason?: string | null
          text_value?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string
          alt_mobile: string | null
          assigned_to_user_id: string | null
          cancelled_reason:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancelled_reason_other: string | null
          created_at: string
          created_by_user_id: string
          customer_name: string
          district: string
          follow_up_date: string | null
          id: string
          is_in_bin: boolean
          kw_interest: number | null
          mobile: string
          notes: string | null
          reference_name: string | null
          source: Database["public"]["Enums"]["lead_source"]
          state: string
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          village_city: string
        }
        Insert: {
          address: string
          alt_mobile?: string | null
          assigned_to_user_id?: string | null
          cancelled_reason?:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancelled_reason_other?: string | null
          created_at?: string
          created_by_user_id: string
          customer_name: string
          district: string
          follow_up_date?: string | null
          id?: string
          is_in_bin?: boolean
          kw_interest?: number | null
          mobile: string
          notes?: string | null
          reference_name?: string | null
          source: Database["public"]["Enums"]["lead_source"]
          state: string
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          village_city: string
        }
        Update: {
          address?: string
          alt_mobile?: string | null
          assigned_to_user_id?: string | null
          cancelled_reason?:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancelled_reason_other?: string | null
          created_at?: string
          created_by_user_id?: string
          customer_name?: string
          district?: string
          follow_up_date?: string | null
          id?: string
          is_in_bin?: boolean
          kw_interest?: number | null
          mobile?: string
          notes?: string | null
          reference_name?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          state?: string
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          village_city?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          assigned_electrician_id: string | null
          assigned_sales_person_id: string | null
          assigned_welder_id: string | null
          capacity_kw: number
          completed_at: string | null
          consumer_name: string | null
          created_at: string
          created_by_user_id: string
          discount: number | null
          documents_submitted_at: string | null
          documents_submitted_by_sales: boolean
          expected_install_date: string | null
          final_amount: number
          id: string
          inspection_date: string | null
          inspection_notes: string | null
          inverter_brand: string
          inverter_capacity: number
          k_number: string | null
          lead_id: string
          loan_bank: string | null
          net_meter_number: string | null
          net_metering_file_number: string | null
          panel_brand: string
          panel_qty: number
          panel_watt: number
          payment_type: Database["public"]["Enums"]["payment_type"]
          project_code: string
          special_notes: string | null
          status: Database["public"]["Enums"]["project_status"]
          structure_type: Database["public"]["Enums"]["structure_type"]
          updated_at: string
        }
        Insert: {
          assigned_electrician_id?: string | null
          assigned_sales_person_id?: string | null
          assigned_welder_id?: string | null
          capacity_kw: number
          completed_at?: string | null
          consumer_name?: string | null
          created_at?: string
          created_by_user_id: string
          discount?: number | null
          documents_submitted_at?: string | null
          documents_submitted_by_sales?: boolean
          expected_install_date?: string | null
          final_amount: number
          id?: string
          inspection_date?: string | null
          inspection_notes?: string | null
          inverter_brand: string
          inverter_capacity: number
          k_number?: string | null
          lead_id: string
          loan_bank?: string | null
          net_meter_number?: string | null
          net_metering_file_number?: string | null
          panel_brand: string
          panel_qty: number
          panel_watt: number
          payment_type: Database["public"]["Enums"]["payment_type"]
          project_code: string
          special_notes?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          structure_type: Database["public"]["Enums"]["structure_type"]
          updated_at?: string
        }
        Update: {
          assigned_electrician_id?: string | null
          assigned_sales_person_id?: string | null
          assigned_welder_id?: string | null
          capacity_kw?: number
          completed_at?: string | null
          consumer_name?: string | null
          created_at?: string
          created_by_user_id?: string
          discount?: number | null
          documents_submitted_at?: string | null
          documents_submitted_by_sales?: boolean
          expected_install_date?: string | null
          final_amount?: number
          id?: string
          inspection_date?: string | null
          inspection_notes?: string | null
          inverter_brand?: string
          inverter_capacity?: number
          k_number?: string | null
          lead_id?: string
          loan_bank?: string | null
          net_meter_number?: string | null
          net_metering_file_number?: string | null
          panel_brand?: string
          panel_qty?: number
          panel_watt?: number
          payment_type?: Database["public"]["Enums"]["payment_type"]
          project_code?: string
          special_notes?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          structure_type?: Database["public"]["Enums"]["structure_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          capacity_kw: number
          created_at: string
          created_by_user_id: string
          customer_address: string | null
          customer_mobile: string | null
          customer_name: string
          id: string
          project_code: string
          project_id: string
          quotation_number: string
          total_amount: number
        }
        Insert: {
          capacity_kw: number
          created_at?: string
          created_by_user_id: string
          customer_address?: string | null
          customer_mobile?: string | null
          customer_name: string
          id?: string
          project_code: string
          project_id: string
          quotation_number: string
          total_amount: number
        }
        Update: {
          capacity_kw?: number
          created_at?: string
          created_by_user_id?: string
          customer_address?: string | null
          customer_mobile?: string | null
          customer_name?: string
          id?: string
          project_code?: string
          project_id?: string
          quotation_number?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      serial_numbers: {
        Row: {
          created_at: string
          entered_by_user_id: string
          id: string
          inverter_serial: string
          panel_serial: string
          project_id: string
        }
        Insert: {
          created_at?: string
          entered_by_user_id: string
          id?: string
          inverter_serial: string
          panel_serial: string
          project_id: string
        }
        Update: {
          created_at?: string
          entered_by_user_id?: string
          id?: string
          inverter_serial?: string
          panel_serial?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "serial_numbers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          staff_id: string
          status_updated_to: Database["public"]["Enums"]["lead_status"] | null
          visit_date: string
          visit_notes: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          staff_id: string
          status_updated_to?: Database["public"]["Enums"]["lead_status"] | null
          visit_date?: string
          visit_notes?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          staff_id?: string
          status_updated_to?: Database["public"]["Enums"]["lead_status"] | null
          visit_date?: string
          visit_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_visits_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          last_login: string | null
          mobile: string
          must_change_password: boolean
          pin_expiry: string | null
          temp_pin_hash: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          last_login?: string | null
          mobile: string
          must_change_password?: boolean
          pin_expiry?: string | null
          temp_pin_hash?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          last_login?: string | null
          mobile?: string
          must_change_password?: boolean
          pin_expiry?: string | null
          temp_pin_hash?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_duplicate_lead: {
        Args: { _mobile: string }
        Returns: {
          created_at: string
          customer_name: string
          id: string
          status: Database["public"]["Enums"]["lead_status"]
        }[]
      }
      complete_staff_password_setup: { Args: never; Returns: undefined }
      count_admins: { Args: never; Returns: number }
      generate_project_code: { Args: never; Returns: string }
      generate_quotation_number: { Args: never; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "telecaller"
        | "sales_person"
        | "operator"
        | "welder"
        | "electrician"
      cancellation_reason:
        | "price_too_high"
        | "already_installed"
        | "not_interested_now"
        | "renting_property"
        | "false_wrong_number"
        | "duplicate_lead"
        | "other"
      document_type:
        | "electricity_bill"
        | "aadhaar_front"
        | "aadhaar_back"
        | "passport_photo"
        | "bank_passbook"
        | "customer_email"
        | "customer_mobile"
      lead_source: "phone_call" | "walk_in" | "reference" | "camp" | "online"
      lead_status:
        | "new"
        | "visited"
        | "follow_up"
        | "interested"
        | "not_interested"
        | "cancelled"
        | "final"
      payment_type: "cash" | "loan"
      project_status:
        | "pending_documents"
        | "pending_operator_review"
        | "registration_pending"
        | "registration_done"
        | "loan_process"
        | "loan_done"
        | "cash_file"
        | "material_ordered"
        | "material_dispatched"
        | "material_delivered"
        | "installation_pending"
        | "installation_done"
        | "wiring_pending"
        | "wiring_done"
        | "net_metering_submitted"
        | "inspection_scheduled"
        | "inspection_completed"
        | "inspection_failed"
        | "net_meter_installed"
        | "project_completed"
      structure_type: "rcc_roof" | "tin_shed_roof" | "ground_mount"
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
        "telecaller",
        "sales_person",
        "operator",
        "welder",
        "electrician",
      ],
      cancellation_reason: [
        "price_too_high",
        "already_installed",
        "not_interested_now",
        "renting_property",
        "false_wrong_number",
        "duplicate_lead",
        "other",
      ],
      document_type: [
        "electricity_bill",
        "aadhaar_front",
        "aadhaar_back",
        "passport_photo",
        "bank_passbook",
        "customer_email",
        "customer_mobile",
      ],
      lead_source: ["phone_call", "walk_in", "reference", "camp", "online"],
      lead_status: [
        "new",
        "visited",
        "follow_up",
        "interested",
        "not_interested",
        "cancelled",
        "final",
      ],
      payment_type: ["cash", "loan"],
      project_status: [
        "pending_documents",
        "pending_operator_review",
        "registration_pending",
        "registration_done",
        "loan_process",
        "loan_done",
        "cash_file",
        "material_ordered",
        "material_dispatched",
        "material_delivered",
        "installation_pending",
        "installation_done",
        "wiring_pending",
        "wiring_done",
        "net_metering_submitted",
        "inspection_scheduled",
        "inspection_completed",
        "inspection_failed",
        "net_meter_installed",
        "project_completed",
      ],
      structure_type: ["rcc_roof", "tin_shed_roof", "ground_mount"],
    },
  },
} as const
