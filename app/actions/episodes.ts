'use server'

import { createClient } from '@/lib/supabase/server'

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
