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
      attendance: {
        Row: {
          check_in_at: string | null
          check_out_at: string | null
          created_at: string
          date: string
          id: string
          notes: string | null
          overtime_minutes: number
          staff_user_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          worked_minutes: number
        }
        Insert: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          overtime_minutes?: number
          staff_user_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          worked_minutes?: number
        }
        Update: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          overtime_minutes?: number
          staff_user_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          worked_minutes?: number
        }
        Relationships: []
      }
      attendance_events: {
        Row: {
          accuracy_m: number | null
          attendance_id: string | null
          bike_meter_image_path: string | null
          bike_meter_reading: number | null
          captured_at: string
          created_at: string
          id: string
          is_rejected: boolean
          kind: Database["public"]["Enums"]["attendance_kind"]
          latitude: number | null
          longitude: number | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          replaced_by_event_id: string | null
          staff_user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          attendance_id?: string | null
          bike_meter_image_path?: string | null
          bike_meter_reading?: number | null
          captured_at?: string
          created_at?: string
          id?: string
          is_rejected?: boolean
          kind: Database["public"]["Enums"]["attendance_kind"]
          latitude?: number | null
          longitude?: number | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          replaced_by_event_id?: string | null
          staff_user_id: string
        }
        Update: {
          accuracy_m?: number | null
          attendance_id?: string | null
          bike_meter_image_path?: string | null
          bike_meter_reading?: number | null
          captured_at?: string
          created_at?: string
          id?: string
          is_rejected?: boolean
          kind?: Database["public"]["Enums"]["attendance_kind"]
          latitude?: number | null
          longitude?: number | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          replaced_by_event_id?: string | null
          staff_user_id?: string
        }
        Relationships: []
      }
      attendance_geofences: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          latitude: number
          longitude: number
          name: string
          radius_m: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          latitude: number
          longitude: number
          name: string
          radius_m?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          latitude?: number
          longitude?: number
          name?: string
          radius_m?: number
        }
        Relationships: []
      }
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
      field_visits: {
        Row: {
          accuracy_m: number | null
          bike_meter_image_path: string | null
          bike_meter_reading: number | null
          created_at: string
          id: string
          latitude: number
          lead_id: string | null
          longitude: number
          notes: string | null
          outcome: Database["public"]["Enums"]["visit_outcome"]
          project_id: string | null
          staff_user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          bike_meter_image_path?: string | null
          bike_meter_reading?: number | null
          created_at?: string
          id?: string
          latitude: number
          lead_id?: string | null
          longitude: number
          notes?: string | null
          outcome?: Database["public"]["Enums"]["visit_outcome"]
          project_id?: string | null
          staff_user_id: string
        }
        Update: {
          accuracy_m?: number | null
          bike_meter_image_path?: string | null
          bike_meter_reading?: number | null
          created_at?: string
          id?: string
          latitude?: number
          lead_id?: string | null
          longitude?: number
          notes?: string | null
          outcome?: Database["public"]["Enums"]["visit_outcome"]
          project_id?: string | null
          staff_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_visits_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_assignments: {
        Row: {
          changed_by: string | null
          created_at: string
          from_user_id: string | null
          id: string
          lead_id: string
          to_user_id: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_user_id?: string | null
          id?: string
          lead_id: string
          to_user_id?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_user_id?: string | null
          id?: string
          lead_id?: string
          to_user_id?: string | null
        }
        Relationships: []
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
      notification_preferences: {
        Row: {
          in_app_enabled: boolean
          push_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          in_app_enabled?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          in_app_enabled?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id?: string
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
      password_reset_logs: {
        Row: {
          created_at: string
          id: string
          meta: Json | null
          reset_by_user_id: string
          staff_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meta?: Json | null
          reset_by_user_id: string
          staff_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meta?: Json | null
          reset_by_user_id?: string
          staff_user_id?: string
        }
        Relationships: []
      }
      project_assignments: {
        Row: {
          changed_by: string | null
          created_at: string
          from_user_id: string | null
          id: string
          project_id: string
          role_column: string
          to_user_id: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_user_id?: string | null
          id?: string
          project_id: string
          role_column: string
          to_user_id?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_user_id?: string | null
          id?: string
          project_id?: string
          role_column?: string
          to_user_id?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          assigned_electrician_id: string | null
          assigned_operator_id: string | null
          assigned_sales_person_id: string | null
          assigned_telecaller_id: string | null
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
          home_latitude: number | null
          home_location_saved_at: string | null
          home_location_saved_by: string | null
          home_longitude: number | null
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
          assigned_operator_id?: string | null
          assigned_sales_person_id?: string | null
          assigned_telecaller_id?: string | null
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
          home_latitude?: number | null
          home_location_saved_at?: string | null
          home_location_saved_by?: string | null
          home_longitude?: number | null
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
          assigned_operator_id?: string | null
          assigned_sales_person_id?: string | null
          assigned_telecaller_id?: string | null
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
          home_latitude?: number | null
          home_location_saved_at?: string | null
          home_location_saved_by?: string | null
          home_longitude?: number | null
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
      punch_out_requests: {
        Row: {
          created_at: string
          id: string
          latitude: number
          longitude: number
          reason: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_user_id: string
          status: Database["public"]["Enums"]["punch_out_request_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          reason: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_user_id: string
          status?: Database["public"]["Enums"]["punch_out_request_status"]
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          reason?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_user_id?: string
          status?: Database["public"]["Enums"]["punch_out_request_status"]
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quotation_terms_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          is_active: boolean
          section_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_active?: boolean
          section_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_active?: boolean
          section_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      quotations: {
        Row: {
          bank_account_id: string | null
          capacity_kw: number
          created_at: string
          created_by_user_id: string
          customer_address: string | null
          customer_mobile: string | null
          customer_name: string
          id: string
          payment_schedule: Json | null
          project_code: string
          project_id: string
          quotation_number: string
          quotation_type: string
          total_amount: number
        }
        Insert: {
          bank_account_id?: string | null
          capacity_kw: number
          created_at?: string
          created_by_user_id: string
          customer_address?: string | null
          customer_mobile?: string | null
          customer_name: string
          id?: string
          payment_schedule?: Json | null
          project_code: string
          project_id: string
          quotation_number: string
          quotation_type?: string
          total_amount: number
        }
        Update: {
          bank_account_id?: string | null
          capacity_kw?: number
          created_at?: string
          created_by_user_id?: string
          customer_address?: string | null
          customer_mobile?: string | null
          customer_name?: string
          id?: string
          payment_schedule?: Json | null
          project_code?: string
          project_id?: string
          quotation_number?: string
          quotation_type?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotations_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "vendor_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_advances: {
        Row: {
          amount: number
          created_at: string
          deducted_run_id: string | null
          given_by: string | null
          given_on: string
          id: string
          note: string | null
          staff_user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          deducted_run_id?: string | null
          given_by?: string | null
          given_on?: string
          id?: string
          note?: string | null
          staff_user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          deducted_run_id?: string | null
          given_by?: string | null
          given_on?: string
          id?: string
          note?: string | null
          staff_user_id?: string
        }
        Relationships: []
      }
      salary_profiles: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          monthly_salary: number
          overtime_hourly_rate: number
          staff_user_id: string
          updated_at: string
          working_days_per_month: number
        }
        Insert: {
          created_at?: string
          effective_from?: string
          id?: string
          monthly_salary?: number
          overtime_hourly_rate?: number
          staff_user_id: string
          updated_at?: string
          working_days_per_month?: number
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          monthly_salary?: number
          overtime_hourly_rate?: number
          staff_user_id?: string
          updated_at?: string
          working_days_per_month?: number
        }
        Relationships: []
      }
      salary_runs: {
        Row: {
          absent_days: number
          advance_deduction: number
          deductions: number
          generated_at: string
          generated_by: string | null
          gross: number
          half_days: number
          id: string
          late_days: number
          month: number
          net: number
          overtime_minutes: number
          paid_amount: number
          paid_at: string | null
          paid_by: string | null
          present_days: number
          staff_user_id: string
          status: string
          year: number
        }
        Insert: {
          absent_days?: number
          advance_deduction?: number
          deductions?: number
          generated_at?: string
          generated_by?: string | null
          gross?: number
          half_days?: number
          id?: string
          late_days?: number
          month: number
          net?: number
          overtime_minutes?: number
          paid_amount?: number
          paid_at?: string | null
          paid_by?: string | null
          present_days?: number
          staff_user_id: string
          status?: string
          year: number
        }
        Update: {
          absent_days?: number
          advance_deduction?: number
          deductions?: number
          generated_at?: string
          generated_by?: string | null
          gross?: number
          half_days?: number
          id?: string
          late_days?: number
          month?: number
          net?: number
          overtime_minutes?: number
          paid_amount?: number
          paid_at?: string | null
          paid_by?: string | null
          present_days?: number
          staff_user_id?: string
          status?: string
          year?: number
        }
        Relationships: []
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
          temp_password_issued_at: string | null
          temp_password_issued_by: string | null
          temp_password_plain: string | null
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
          temp_password_issued_at?: string | null
          temp_password_issued_by?: string | null
          temp_password_plain?: string | null
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
          temp_password_issued_at?: string | null
          temp_password_issued_by?: string | null
          temp_password_plain?: string | null
          temp_pin_hash?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_by_user_id: string
          assigned_to_user_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          proof_image_path: string | null
          staff_notes: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_by_user_id: string
          assigned_to_user_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          proof_image_path?: string | null
          staff_notes?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_by_user_id?: string
          assigned_to_user_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          proof_image_path?: string | null
          staff_notes?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
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
      vendor_bank_accounts: {
        Row: {
          account_no: string
          bank_name: string
          branch_name: string | null
          created_at: string
          holder_name: string
          id: string
          ifsc: string
          is_active: boolean
          is_default: boolean
          updated_at: string
          upi_image_url: string | null
        }
        Insert: {
          account_no: string
          bank_name: string
          branch_name?: string | null
          created_at?: string
          holder_name: string
          id?: string
          ifsc: string
          is_active?: boolean
          is_default?: boolean
          updated_at?: string
          upi_image_url?: string | null
        }
        Update: {
          account_no?: string
          bank_name?: string
          branch_name?: string | null
          created_at?: string
          holder_name?: string
          id?: string
          ifsc?: string
          is_active?: boolean
          is_default?: boolean
          updated_at?: string
          upi_image_url?: string | null
        }
        Relationships: []
      }
      vendor_profiles: {
        Row: {
          account_no: string | null
          account_type: string | null
          address: string | null
          bank_name: string | null
          created_at: string
          email: string | null
          firm_name: string
          gstin: string | null
          id: string
          ifsc: string | null
          is_default: boolean
          license_no: string | null
          mobile: string | null
          raw_text: string | null
          updated_at: string
        }
        Insert: {
          account_no?: string | null
          account_type?: string | null
          address?: string | null
          bank_name?: string | null
          created_at?: string
          email?: string | null
          firm_name: string
          gstin?: string | null
          id?: string
          ifsc?: string | null
          is_default?: boolean
          license_no?: string | null
          mobile?: string | null
          raw_text?: string | null
          updated_at?: string
        }
        Update: {
          account_no?: string | null
          account_type?: string | null
          address?: string | null
          bank_name?: string | null
          created_at?: string
          email?: string | null
          firm_name?: string
          gstin?: string | null
          id?: string
          ifsc?: string | null
          is_default?: boolean
          license_no?: string | null
          mobile?: string | null
          raw_text?: string | null
          updated_at?: string
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
      compute_salary: {
        Args: { _month: number; _user: string; _year: number }
        Returns: {
          absent_days: number
          advance_deduction: number
          deductions: number
          generated_at: string
          generated_by: string | null
          gross: number
          half_days: number
          id: string
          late_days: number
          month: number
          net: number
          overtime_minutes: number
          paid_amount: number
          paid_at: string | null
          paid_by: string | null
          present_days: number
          staff_user_id: string
          status: string
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "salary_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      count_admins: { Args: never; Returns: number }
      generate_project_code: { Args: never; Returns: string }
      generate_quotation_number: { Args: never; Returns: string }
      get_assignable_sales_persons: {
        Args: never
        Returns: {
          email: string
          full_name: string
          mobile: string
          user_id: string
        }[]
      }
      get_lead_people: { Args: { _lead_id: string }; Returns: Json }
      get_staff_public: {
        Args: { _user_id: string }
        Returns: {
          email: string
          full_name: string
          mobile: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
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
      log_user_event: {
        Args: { _action: string; _meta?: Json }
        Returns: undefined
      }
      mark_salary_paid: {
        Args: { _amount: number; _run_id: string }
        Returns: {
          absent_days: number
          advance_deduction: number
          deductions: number
          generated_at: string
          generated_by: string | null
          gross: number
          half_days: number
          id: string
          late_days: number
          month: number
          net: number
          overtime_minutes: number
          paid_amount: number
          paid_at: string | null
          paid_by: string | null
          present_days: number
          staff_user_id: string
          status: string
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "salary_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      punch_attendance: {
        Args: {
          _accuracy?: number
          _image_path?: string
          _kind: string
          _lat?: number
          _lng?: number
          _reading?: number
        }
        Returns: string
      }
      quotation_totals: {
        Args: never
        Returns: {
          project_count: number
          total_kw: number
          total_value: number
        }[]
      }
      request_special_punch_out: {
        Args: { _lat: number; _lng: number; _reason: string }
        Returns: string
      }
      reupload_event_image: {
        Args: {
          _accuracy?: number
          _event_id: string
          _new_lat: number
          _new_lng: number
          _new_path: string
          _reading?: number
        }
        Returns: string
      }
      review_punch_out_request: {
        Args: { _approve: boolean; _id: string; _notes?: string }
        Returns: {
          created_at: string
          id: string
          latitude: number
          longitude: number
          reason: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_user_id: string
          status: Database["public"]["Enums"]["punch_out_request_status"]
        }
        SetofOptions: {
          from: "*"
          to: "punch_out_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_performance: {
        Args: { _from: string; _to: string }
        Returns: {
          absent_days: number
          attendance_pct: number
          full_name: string
          leads_assigned: number
          leads_created: number
          present_days: number
          projects_completed: number
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
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
      attendance_kind: "check_in" | "field_visit" | "check_out"
      attendance_status: "present" | "absent" | "half_day" | "late"
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
      punch_out_request_status: "pending" | "approved" | "rejected" | "consumed"
      structure_type: "rcc_roof" | "tin_shed_roof" | "ground_mount"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "pending" | "in_progress" | "completed"
      visit_outcome:
        | "interested"
        | "unavailable"
        | "docs_pending"
        | "site_issue"
        | "payment_discussion"
        | "bank_followup"
        | "other"
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
      attendance_kind: ["check_in", "field_visit", "check_out"],
      attendance_status: ["present", "absent", "half_day", "late"],
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
      punch_out_request_status: ["pending", "approved", "rejected", "consumed"],
      structure_type: ["rcc_roof", "tin_shed_roof", "ground_mount"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["pending", "in_progress", "completed"],
      visit_outcome: [
        "interested",
        "unavailable",
        "docs_pending",
        "site_issue",
        "payment_discussion",
        "bank_followup",
        "other",
      ],
    },
  },
} as const
