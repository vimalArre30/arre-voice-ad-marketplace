import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import type { TranscriptSegment } from '@/lib/database.types'

export const maxDuration = 120

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DetectedMoment {
  timestamp_seconds: number
  context_snippet: string
  ad_category: string
  reasoning: string
  confidence_score: number
}

interface EpisodeRow {
  transcript: unknown
  category: string
  audience_tier: string
  geography: string
  age_group: string
  gender: string
  title: string
  creator_name: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function buildTranscriptBlock(segments: TranscriptSegment[]): string {
  return segments
    .map((seg) => `[${formatTimestamp(seg.timestamp_seconds)}] ${seg.text}`)
    .join('\n')
}

/** Extract a JSON array from Claude's response, tolerating markdown code fences. */
function extractJson(raw: string): string {
  // Strip ```json ... ``` or ``` ... ``` wrappers
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()

  // Find first '[' and last ']' as fallback
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start !== -1 && end !== -1 && end > start) return raw.slice(start, end + 1)

  return raw.trim()
}

function buildPrompt(episode: EpisodeRow, transcriptBlock: string): { system: string; user: string } {
  const system = `You are an expert podcast advertising strategist. Your job is to identify the most natural, contextually relevant moments in a podcast episode where a brand advertisement would fit organically — without interrupting the listener's experience.`

  const user = `Analyse the following podcast transcript and identify exactly 4 contextual ad insertion moments.

Episode context:
- Title: ${episode.title}
- Creator: ${episode.creator_name}
- Category: ${episode.category}
- Audience: ${episode.gender}, ${episode.age_group}, ${episode.audience_tier}, ${episode.geography}

Rules for selecting moments:
1. The moment must feel natural — a pause in topic, a transition, or where the host finishes a thought
2. The surrounding content must be thematically relevant to a real ad category (see categories below)
3. Do NOT select moments where the host is mid-sentence, mid-story, or mid-argument
4. Do NOT select moments where the creator is criticising or speaking negatively about a brand, product category, or company
5. Space moments at least 5 minutes apart
6. Do not place a moment in the first 2 minutes or last 2 minutes

Ad categories: finance, insurance, travel, food, health, ecommerce, real-estate, ed-tech, fintech, auto, lifestyle

For each moment, return:
- timestamp_seconds: the exact second where the ad should be inserted
- context_snippet: 80–100 words of surrounding transcript text for this moment (so a brand can understand the context)
- ad_category: the single best-fit ad category from the list above
- reasoning: one sentence explaining why this moment is contextually relevant
- confidence_score: a number from 0.50 to 1.00

Transcript:
${transcriptBlock}

Return your response as a valid JSON array only. No other text. Format:
[
  {
    "timestamp_seconds": 847,
    "context_snippet": "...",
    "ad_category": "finance",
    "reasoning": "...",
    "confidence_score": 0.91
  }
]`

  return { system, user }
}

async function callClaude(system: string, user: string): Promise<DetectedMoment[]> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: user }],
  })

  const block = response.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') {
    throw new Error('Claude returned no text content')
  }

  const jsonString = extractJson(block.text)
  const parsed = JSON.parse(jsonString) as DetectedMoment[]

  if (!Array.isArray(parsed)) {
    throw new Error('Claude response is not an array')
  }

  return parsed
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  let episodeId: string | undefined

  try {
    const body = await req.json()
    episodeId = body.episode_id as string | undefined

    if (!episodeId) {
      return NextResponse.json({ error: 'episode_id is required' }, { status: 400 })
    }

    // ── 1. Fetch episode ───────────────────────────────────────────────────
    const { data: raw, error: fetchErr } = await supabase
      .from('episodes')
      .select('transcript, category, audience_tier, geography, age_group, gender, title, creator_name')
      .eq('id', episodeId)
      .single()

    if (fetchErr || !raw) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
    }

    const episode = raw as EpisodeRow

    if (!episode.transcript) {
      return NextResponse.json({ error: 'Episode has no transcript' }, { status: 400 })
    }

    // ── 2. Build transcript block ──────────────────────────────────────────
    const segments = episode.transcript as TranscriptSegment[]
    const transcriptBlock = buildTranscriptBlock(segments)

    // ── 3. Call Claude with one retry on JSON parse failure ────────────────
    const { system, user } = buildPrompt(episode, transcriptBlock)

    let moments: DetectedMoment[]
    try {
      moments = await callClaude(system, user)
    } catch (firstErr) {
      console.warn('[detect-moments] first attempt failed, retrying:', firstErr)
      try {
        moments = await callClaude(system, user)
      } catch (secondErr) {
        console.error('[detect-moments] retry also failed:', secondErr)
        await supabase
          .from('episodes')
          .update({ status: 'error' })
          .eq('id', episodeId)
        return NextResponse.json(
          { error: 'Claude returned malformed JSON after retry' },
          { status: 500 }
        )
      }
    }

    // ── 4. Insert moments rows ─────────────────────────────────────────────
    const rows = moments.map((m) => ({
      episode_id: episodeId!,
      timestamp_seconds: Math.round(m.timestamp_seconds),
      context_snippet: m.context_snippet,
      ad_category: m.ad_category,
      confidence_score: m.confidence_score,
      status: 'pending' as const,
    }))

    const { error: insertErr } = await supabase.from('moments').insert(rows)
    if (insertErr) throw new Error(insertErr.message)

    // ── 5. Update episode status → 'ready' ────────────────────────────────
    const { error: updateErr } = await supabase
      .from('episodes')
      .update({ status: 'ready' })
      .eq('id', episodeId)

    if (updateErr) throw new Error(updateErr.message)

    return NextResponse.json({ ok: true, moments_created: rows.length })
  } catch (err) {
    console.error('[detect-moments] error:', err)

    if (episodeId) {
      try {
        await supabase
          .from('episodes')
          .update({ status: 'error' })
          .eq('id', episodeId)
      } catch { /* best-effort */ }
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Moment detection failed' },
      { status: 500 }
    )
  }
}
