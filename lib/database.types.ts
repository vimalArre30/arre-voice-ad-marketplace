export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      episodes: {
        Row: {
          id: string
          creator_name: string
          title: string
          category: 'finance' | 'business' | 'tech' | 'health' | 'travel' | 'food' | 'culture' | 'sports' | 'entertainment' | 'education'
          audience_tier: 'metro' | 'tier1' | 'tier2' | 'national'
          geography: string
          age_group: '18-24' | '25-34' | '35-44' | '45-54' | '55+'
          gender: 'male' | 'female' | 'mixed'
          audio_url: string | null
          duration_seconds: number | null
          transcript: Json | null
          status: 'uploaded' | 'transcribing' | 'transcribed' | 'detecting' | 'ready' | 'error'
          created_at: string
        }
        Insert: {
          id?: string
          creator_name: string
          title: string
          category: 'finance' | 'business' | 'tech' | 'health' | 'travel' | 'food' | 'culture' | 'sports' | 'entertainment' | 'education'
          audience_tier: 'metro' | 'tier1' | 'tier2' | 'national'
          geography: string
          age_group: '18-24' | '25-34' | '35-44' | '45-54' | '55+'
          gender: 'male' | 'female' | 'mixed'
          audio_url?: string | null
          duration_seconds?: number | null
          transcript?: Json | null
          status?: 'uploaded' | 'transcribing' | 'transcribed' | 'detecting' | 'ready' | 'error'
          created_at?: string
        }
        Update: {
          id?: string
          creator_name?: string
          title?: string
          category?: 'finance' | 'business' | 'tech' | 'health' | 'travel' | 'food' | 'culture' | 'sports' | 'entertainment' | 'education'
          audience_tier?: 'metro' | 'tier1' | 'tier2' | 'national'
          geography?: string
          age_group?: '18-24' | '25-34' | '35-44' | '45-54' | '55+'
          gender?: 'male' | 'female' | 'mixed'
          audio_url?: string | null
          duration_seconds?: number | null
          transcript?: Json | null
          status?: 'uploaded' | 'transcribing' | 'transcribed' | 'detecting' | 'ready' | 'error'
          created_at?: string
        }
      }
      moments: {
        Row: {
          id: string
          episode_id: string
          timestamp_seconds: number
          context_snippet: string
          ad_category: string
          confidence_score: number | null
          status: 'pending' | 'approved' | 'rejected'
          created_at: string
        }
        Insert: {
          id?: string
          episode_id: string
          timestamp_seconds: number
          context_snippet: string
          ad_category: string
          confidence_score?: number | null
          status?: 'pending' | 'approved' | 'rejected'
          created_at?: string
        }
        Update: {
          id?: string
          episode_id?: string
          timestamp_seconds?: number
          context_snippet?: string
          ad_category?: string
          confidence_score?: number | null
          status?: 'pending' | 'approved' | 'rejected'
          created_at?: string
        }
      }
      ads: {
        Row: {
          id: string
          title: string
          brand_name: string
          category: string
          audio_url: string
          duration_seconds: number
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          brand_name: string
          category: string
          audio_url: string
          duration_seconds: number
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          brand_name?: string
          category?: string
          audio_url?: string
          duration_seconds?: number
          created_at?: string
        }
      }
      ad_slots: {
        Row: {
          id: string
          moment_id: string
          ad_id: string | null
          final_audio_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          moment_id: string
          ad_id?: string | null
          final_audio_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          moment_id?: string
          ad_id?: string | null
          final_audio_url?: string | null
          created_at?: string
        }
      }
      brands: {
        Row: {
          id: string
          name: string
          target_categories: string[] | null
          target_audience: string | null
          target_geography: string[] | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          target_categories?: string[] | null
          target_audience?: string | null
          target_geography?: string[] | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          target_categories?: string[] | null
          target_audience?: string | null
          target_geography?: string[] | null
          created_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

// Convenience row types
export type Episode  = Database['public']['Tables']['episodes']['Row']
export type Moment   = Database['public']['Tables']['moments']['Row']
export type Ad       = Database['public']['Tables']['ads']['Row']
export type AdSlot   = Database['public']['Tables']['ad_slots']['Row']
export type Brand    = Database['public']['Tables']['brands']['Row']

// Transcript segment shape stored in episodes.transcript jsonb
export interface TranscriptSegment {
  timestamp_seconds: number
  text: string
}
