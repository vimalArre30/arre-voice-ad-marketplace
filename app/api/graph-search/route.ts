import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'

// ── Types ─────────────────────────────────────────────────────────────────

export interface ExtractedFilters {
  categories:     string[] | null
  audience_tiers: string[] | null
  geographies:    string[] | null
  age_groups:     string[] | null
  gender:         string | null
  ad_category:    string | null
}

interface MomentRow {
  id: string
  episode_id: string
  timestamp_seconds: number
  ad_category: string
  context_snippet: string
}

interface EpisodeResult {
  id: string
  title: string
  creator_name: string
  category: string
  audience_tier: string
  geography: string
  age_group: string
  gender: string
  moments: MomentRow[]
}

export interface GraphSearchResponse {
  filters:  ExtractedFilters
  episodes: EpisodeResult[]
  allNull:  boolean  // true when Claude couldn't extract any usable filters
  error?:   string
}

// ── Claude prompt ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a media planning tool. Extract structured search filters from a natural language query about podcast audiences.`

function buildUserPrompt(query: string): string {
  return `Extract the following fields from this search query. If a field is not mentioned or cannot be inferred, return null for that field.

Fields to extract:
- categories: array of values from [finance, business, tech, health, travel, food, culture, sports, entertainment, education]
- audience_tiers: array of values from [metro, tier1, tier2, national]
- geographies: array of place names (e.g. Mumbai, Delhi, Pan-India)
- age_groups: array of values from [18-24, 25-34, 35-44, 45-54, 55+]
- gender: one of [male, female, mixed] or null
- ad_category: the most relevant ad category from [finance, insurance, travel, food, health, ecommerce, real-estate, ed-tech, fintech, auto, lifestyle] or null

Return ONLY a JSON object. No other text.

Query: ${query}`
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let query: string
  try {
    const body = await req.json()
    query = (body.query ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 })
  }

  // ── 1. Extract filters with Claude ──────────────────────────────────────

  let filters: ExtractedFilters
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 512,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: buildUserPrompt(query) }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text.trim()

    // Extract JSON block in case Claude wraps it in ```json ... ```
    const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw

    filters = JSON.parse(jsonText) as ExtractedFilters
  } catch (err) {
    console.error('[graph-search] Claude error:', err)
    return NextResponse.json(
      { error: 'Failed to extract filters from query' },
      { status: 502 },
    )
  }

  // ── 2. Check if anything was extracted ────────────────────────────────

  const hasFilters =
    (filters.categories?.length     ?? 0) > 0 ||
    (filters.audience_tiers?.length ?? 0) > 0 ||
    (filters.geographies?.length    ?? 0) > 0 ||
    (filters.age_groups?.length     ?? 0) > 0 ||
    filters.gender != null

  if (!hasFilters) {
    return NextResponse.json({
      filters,
      episodes: [],
      allNull: true,
    } satisfies GraphSearchResponse)
  }

  // ── 3. Query Supabase ─────────────────────────────────────────────────

  const supabase = createServiceClient()

  let dbQuery = supabase
    .from('episodes')
    .select('id, title, creator_name, category, audience_tier, geography, age_group, gender')
    .eq('status', 'ready')

  if ((filters.categories?.length     ?? 0) > 0) dbQuery = dbQuery.in('category',     filters.categories!)
  if ((filters.audience_tiers?.length ?? 0) > 0) dbQuery = dbQuery.in('audience_tier', filters.audience_tiers!)
  if ((filters.geographies?.length    ?? 0) > 0) dbQuery = dbQuery.in('geography',     filters.geographies!)
  if ((filters.age_groups?.length     ?? 0) > 0) dbQuery = dbQuery.in('age_group',     filters.age_groups!)
  if (filters.gender)                             dbQuery = dbQuery.eq('gender',        filters.gender)

  const { data: episodes, error: epErr } = await dbQuery
  if (epErr) {
    console.error('[graph-search] episodes query error:', epErr)
    return NextResponse.json({ error: epErr.message }, { status: 500 })
  }

  if (!episodes?.length) {
    return NextResponse.json({ filters, episodes: [], allNull: false } satisfies GraphSearchResponse)
  }

  // ── 4. Fetch approved moments for matched episodes ────────────────────

  const episodeIds = episodes.map((e) => e.id)

  const { data: moments, error: mErr } = await supabase
    .from('moments')
    .select('id, episode_id, timestamp_seconds, ad_category, context_snippet')
    .in('episode_id', episodeIds)
    .eq('status', 'approved')
    .order('timestamp_seconds', { ascending: true })

  if (mErr) {
    console.error('[graph-search] moments query error:', mErr)
    return NextResponse.json({ error: mErr.message }, { status: 500 })
  }

  // ── 5. Join and sort ──────────────────────────────────────────────────

  const momentsByEp = new Map<string, MomentRow[]>()
  for (const m of moments ?? []) {
    const list = momentsByEp.get(m.episode_id) ?? []
    momentsByEp.set(m.episode_id, [...list, m as MomentRow])
  }

  const results: EpisodeResult[] = episodes
    .map((ep) => ({ ...ep, moments: momentsByEp.get(ep.id) ?? [] }))
    .filter((ep) => ep.moments.length > 0)
    .sort((a, b) => b.moments.length - a.moments.length)

  return NextResponse.json({
    filters,
    episodes: results,
    allNull: false,
  } satisfies GraphSearchResponse)
}
