'use server'

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/database.types'

type EpisodeUpdate = Database['public']['Tables']['episodes']['Update']

export async function updateEpisodeMetadata(
  episodeId: string,
  fields: Omit<EpisodeUpdate, 'id' | 'audio_url' | 'duration_seconds' | 'transcript' | 'created_at'>
): Promise<{ error?: string }> {
  const supabase = createClient()

  const { error } = await supabase
    .from('episodes')
    .update({ ...fields, status: 'transcribing' })
    .eq('id', episodeId)

  if (error) return { error: error.message }
  return {}
}

export async function createEpisodeRow(params: {
  audioUrl: string
  durationSeconds: number
  storagePath: string
}): Promise<{ episodeId: string; error?: never } | { episodeId?: never; error: string }> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('episodes')
    .insert({
      creator_name: '',
      title: '',
      category: 'tech',
      audience_tier: 'metro',
      geography: '',
      age_group: '25-34',
      gender: 'mixed',
      audio_url: params.audioUrl,
      duration_seconds: params.durationSeconds,
      status: 'uploaded',
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { episodeId: data.id }
}
