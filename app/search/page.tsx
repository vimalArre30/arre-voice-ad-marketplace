'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ExtractedFilters, GraphSearchResponse } from '@/app/api/graph-search/route'

// ── Types ─────────────────────────────────────────────────────────────────

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

type SearchState = 'idle' | 'searching' | 'results' | 'error'
type ActiveTab   = 'filter' | 'ai'

// ── Constants ─────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { label: 'Finance',       value: 'finance' },
  { label: 'Business',      value: 'business' },
  { label: 'Tech',          value: 'tech' },
  { label: 'Health',        value: 'health' },
  { label: 'Travel',        value: 'travel' },
  { label: 'Food',          value: 'food' },
  { label: 'Culture',       value: 'culture' },
  { label: 'Sports',        value: 'sports' },
  { label: 'Entertainment', value: 'entertainment' },
  { label: 'Education',     value: 'education' },
]

const TIER_OPTIONS = [
  { label: 'Metro',    value: 'metro' },
  { label: 'Tier 1',  value: 'tier1' },
  { label: 'Tier 2',  value: 'tier2' },
  { label: 'National', value: 'national' },
]

const GEO_OPTIONS = [
  { label: 'Mumbai',     value: 'Mumbai' },
  { label: 'Delhi',      value: 'Delhi' },
  { label: 'Bengaluru',  value: 'Bengaluru' },
  { label: 'Chennai',    value: 'Chennai' },
  { label: 'Hyderabad',  value: 'Hyderabad' },
  { label: 'Pan-India',  value: 'Pan-India' },
]

const AGE_OPTIONS = [
  { label: '18–24', value: '18-24' },
  { label: '25–34', value: '25-34' },
  { label: '35–44', value: '35-44' },
  { label: '45–54', value: '45-54' },
  { label: '55+',   value: '55+' },
]

const CATEGORY_COLOURS: Record<string, { bg: string; text: string }> = {
  finance:       { bg: 'bg-blue-100',   text: 'text-blue-700' },
  business:      { bg: 'bg-violet-100', text: 'text-violet-700' },
  tech:          { bg: 'bg-sky-100',    text: 'text-sky-700' },
  health:        { bg: 'bg-green-100',  text: 'text-green-700' },
  travel:        { bg: 'bg-teal-100',   text: 'text-teal-700' },
  food:          { bg: 'bg-orange-100', text: 'text-orange-700' },
  culture:       { bg: 'bg-rose-100',   text: 'text-rose-700' },
  sports:        { bg: 'bg-lime-100',   text: 'text-lime-700' },
  entertainment: { bg: 'bg-pink-100',   text: 'text-pink-700' },
  education:     { bg: 'bg-indigo-100', text: 'text-indigo-700' },
}
const DEFAULT_COLOUR = { bg: 'bg-stone-100', text: 'text-stone-600' }

const TIER_LABELS: Record<string, string> = {
  metro: 'Metro', tier1: 'Tier 1', tier2: 'Tier 2', national: 'National',
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtTimestamp(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function CategoryBadge({ category }: { category: string }) {
  const c = CATEGORY_COLOURS[category] ?? DEFAULT_COLOUR
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>
      {category}
    </span>
  )
}

// ── MultiSelect dropdown ──────────────────────────────────────────────────

function MultiSelect({
  heading,
  options,
  selected,
  onChange,
}: {
  heading: string
  options: { label: string; value: string }[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    )
  }

  const displayText =
    selected.length === 0
      ? `All`
      : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
      : `${selected.length} selected`

  const hasSelection = selected.length > 0

  return (
    <div ref={ref} className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-stone-500 tracking-wide">{heading}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={[
            'w-full flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm text-left transition-colors',
            open
              ? 'border-[#1A6B5A] ring-2 ring-[#1A6B5A]/20 bg-white'
              : 'border-stone-200 bg-white hover:border-stone-300',
          ].join(' ')}
        >
          <span className={hasSelection ? 'text-stone-900 font-medium' : 'text-stone-400'}>
            {displayText}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasSelection && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange([]) }}
                className="text-stone-300 hover:text-stone-500 transition-colors"
                aria-label="Clear selection"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <svg
              className={`w-4 h-4 text-stone-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {open && (
          <div className="absolute top-full mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-xl z-30 py-1 max-h-56 overflow-y-auto">
            {options.map((opt) => {
              const checked = selected.includes(opt.value)
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-stone-50 cursor-pointer"
                  onClick={() => toggle(opt.value)}
                >
                  <span
                    className={[
                      'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                      checked
                        ? 'border-[#1A6B5A] bg-[#1A6B5A]'
                        : 'border-stone-300 bg-white',
                    ].join(' ')}
                  >
                    {checked && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </span>
                  <span className={`text-sm ${checked ? 'text-stone-900 font-medium' : 'text-stone-600'}`}>
                    {opt.label}
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── AI search constants ───────────────────────────────────────────────────

const EXAMPLE_QUERIES = [
  'Fintech conversations, Tier 1 cities, 25–34',
  'Travel episodes, metro audience, 25–44',
  'Health and fitness, female audience, 18–34',
]

const AGE_LABELS: Record<string, string> = {
  '18-24': '18–24', '25-34': '25–34', '35-44': '35–44', '45-54': '45–54', '55+': '55+',
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Pill showing one extracted filter dimension
function FilterPill({ label, values }: { label: string; values: string[] }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: '#1A6B5A1a', color: '#1A6B5A' }}
    >
      <span className="opacity-60">{label}:</span>
      <span>{values.join(', ')}</span>
    </span>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────

function Spinner({ size = 5 }: { size?: number }) {
  return (
    <svg
      className={`w-${size} h-${size} animate-spin`}
      style={{ color: '#1A6B5A' }}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ── Inventory card ────────────────────────────────────────────────────────

function EpisodeCard({
  episode,
  expanded,
  onToggle,
  onRequestPlacement,
}: {
  episode: EpisodeResult
  expanded: boolean
  onToggle: () => void
  onRequestPlacement: (title: string) => void
}) {
  const slotCount = episode.moments.length

  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-stone-900 leading-snug truncate">
              {episode.title || 'Untitled episode'}
            </p>
            <p className="text-xs text-stone-400 mt-0.5">{episode.creator_name}</p>
          </div>

          {/* Slot count pill */}
          <div
            className="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              backgroundColor: slotCount > 0 ? '#1A6B5A1a' : '#f5f5f4',
              color:           slotCount > 0 ? '#1A6B5A'   : '#a8a29e',
            }}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
            {slotCount} slot{slotCount !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <CategoryBadge category={episode.category} />
          <span className="inline-block rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600 font-medium">
            {TIER_LABELS[episode.audience_tier] ?? episode.audience_tier}
          </span>
          <span className="inline-block rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600 font-medium">
            {episode.geography}
          </span>
          <span className="inline-block rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600 font-medium">
            {episode.age_group}
          </span>
        </div>

        {/* Action row */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-stone-50">
          <button
            onClick={onToggle}
            className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800 transition-colors font-medium"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            {expanded ? 'Hide moments' : `View ${slotCount} moment${slotCount !== 1 ? 's' : ''}`}
          </button>

          <button
            onClick={() => onRequestPlacement(episode.title || 'Untitled episode')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
            style={{ backgroundColor: '#1A6B5A' }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#155a4a')}
            onMouseOut={(e)  => (e.currentTarget.style.backgroundColor = '#1A6B5A')}
          >
            Request Placement
          </button>
        </div>
      </div>

      {/* Expanded moments */}
      {expanded && (
        <div className="border-t border-stone-100 bg-stone-50/60 px-5 py-3 flex flex-col gap-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-1">
            Available moments
          </p>
          {episode.moments.map((moment) => {
            const mc = CATEGORY_COLOURS[moment.ad_category] ?? DEFAULT_COLOUR
            return (
              <div
                key={moment.id}
                className="bg-white rounded-xl border border-stone-100 px-3.5 py-3 flex flex-col gap-1.5"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-semibold text-stone-700">
                    {fmtTimestamp(moment.timestamp_seconds)}
                  </span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${mc.bg} ${mc.text}`}>
                    {moment.ad_category}
                  </span>
                </div>
                <p className="text-xs text-stone-500 leading-relaxed italic line-clamp-2">
                  &ldquo;{moment.context_snippet}&rdquo;
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="flex items-center gap-2 bg-stone-900 text-white rounded-xl px-4 py-3 shadow-2xl text-sm font-medium animate-in fade-in slide-in-from-bottom-2 duration-200">
        <svg className="w-4 h-4 text-[#4ade80] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        {message}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const supabase = createClient()

  // ── Tabs ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('filter')

  // ── Filters ───────────────────────────────────────────────────────────
  const [selCategories, setSelCategories] = useState<string[]>([])
  const [selTiers,      setSelTiers]      = useState<string[]>([])
  const [selGeos,       setSelGeos]       = useState<string[]>([])
  const [selAgeGroups,  setSelAgeGroups]  = useState<string[]>([])

  // ── Filter search state ───────────────────────────────────────────────
  const [searchState, setSearchState]   = useState<SearchState>('idle')
  const [searchError, setSearchError]   = useState<string | null>(null)
  const [results,     setResults]       = useState<EpisodeResult[]>([])

  // ── AI search state ───────────────────────────────────────────────────
  const [aiQuery,        setAiQuery]        = useState('')
  const [aiState,        setAiState]        = useState<SearchState>('idle')
  const [aiResults,      setAiResults]      = useState<EpisodeResult[]>([])
  const [aiFilters,      setAiFilters]      = useState<ExtractedFilters | null>(null)
  const [aiAllNull,      setAiAllNull]      = useState(false)
  const [aiError,        setAiError]        = useState<string | null>(null)
  const [aiHistory,      setAiHistory]      = useState<string[]>([])
  const [aiExpandedIds,  setAiExpandedIds]  = useState<Set<string>>(new Set())

  // ── Expanded cards ────────────────────────────────────────────────────
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // ── Toast ─────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Search ────────────────────────────────────────────────────────────

  async function runSearch() {
    setSearchState('searching')
    setSearchError(null)
    setExpandedIds(new Set())

    try {
      // Build episode query — only 'ready' episodes; each selected filter narrows results
      let query = supabase
        .from('episodes')
        .select('id, title, creator_name, category, audience_tier, geography, age_group, gender')
        .eq('status', 'ready')

      if (selCategories.length > 0) query = query.in('category',     selCategories)
      if (selTiers.length > 0)      query = query.in('audience_tier', selTiers)
      if (selGeos.length > 0)       query = query.in('geography',     selGeos)
      if (selAgeGroups.length > 0)  query = query.in('age_group',     selAgeGroups)

      const { data: episodes, error: epErr } = await query
      if (epErr) throw new Error(epErr.message)

      if (!episodes || episodes.length === 0) {
        setResults([])
        setSearchState('results')
        return
      }

      // Fetch approved moments for all matched episodes in one query
      const episodeIds = episodes.map((e) => e.id)
      const { data: moments, error: mErr } = await supabase
        .from('moments')
        .select('id, episode_id, timestamp_seconds, ad_category, context_snippet')
        .in('episode_id', episodeIds)
        .eq('status', 'approved')
        .order('timestamp_seconds', { ascending: true })

      if (mErr) throw new Error(mErr.message)

      // Group moments by episode
      const momentsByEp = new Map<string, MomentRow[]>()
      for (const m of moments ?? []) {
        const list = momentsByEp.get(m.episode_id) ?? []
        momentsByEp.set(m.episode_id, [...list, m as MomentRow])
      }

      // Combine and filter to episodes with at least 1 available slot
      const combined: EpisodeResult[] = episodes
        .map((ep) => ({ ...ep, moments: momentsByEp.get(ep.id) ?? [] }))
        .filter((ep) => ep.moments.length > 0)
        .sort((a, b) => b.moments.length - a.moments.length)

      setResults(combined)
      setSearchState('results')
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
      setSearchState('error')
    }
  }

  // ── AI search ─────────────────────────────────────────────────────────

  async function runAiSearch(queryOverride?: string) {
    const q = (queryOverride ?? aiQuery).trim()
    if (!q) return

    // Sync input field if triggered from a history chip
    if (queryOverride) setAiQuery(queryOverride)

    setAiState('searching')
    setAiError(null)
    setAiAllNull(false)
    setAiFilters(null)
    setAiResults([])
    setAiExpandedIds(new Set())

    // Add to history (most-recent first, deduplicated, max 5)
    setAiHistory((prev) => [q, ...prev.filter((h) => h !== q)].slice(0, 5))

    try {
      const res = await fetch('/api/graph-search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: q }),
      })

      const data: GraphSearchResponse = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? `Server error ${res.status}`)
      }

      setAiFilters(data.filters)
      setAiAllNull(data.allNull)
      setAiResults(data.episodes)
      setAiState('results')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI search failed')
      setAiState('error')
    }
  }

  function toggleAiExpanded(id: string) {
    setAiExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Derived counts ────────────────────────────────────────────────────

  const totalSlots = results.reduce((sum, ep) => sum + ep.moments.length, 0)

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F8F7F4] px-4 pt-10 pb-24">
      <div className="w-full max-w-[760px] mx-auto flex flex-col gap-7">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-semibold text-stone-900 mb-2 tracking-tight">
            Find the Right Moment
          </h1>
          <p className="text-sm text-stone-500">
            Search podcast inventory by category, audience, and geography
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-stone-100 rounded-xl p-1 w-fit">
          {(['filter', 'ai'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                activeTab === tab
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700',
              ].join(' ')}
            >
              {tab === 'filter' ? 'Filter Search' : 'AI Search'}
            </button>
          ))}
        </div>

        {/* ── Filter Search tab ── */}
        {activeTab === 'filter' && (
          <>
            {/* Filter row */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-5 flex flex-col gap-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
                Filters
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MultiSelect
                  heading="Category"
                  options={CATEGORY_OPTIONS}
                  selected={selCategories}
                  onChange={setSelCategories}
                />
                <MultiSelect
                  heading="Audience Tier"
                  options={TIER_OPTIONS}
                  selected={selTiers}
                  onChange={setSelTiers}
                />
                <MultiSelect
                  heading="Geography"
                  options={GEO_OPTIONS}
                  selected={selGeos}
                  onChange={setSelGeos}
                />
                <MultiSelect
                  heading="Age Group"
                  options={AGE_OPTIONS}
                  selected={selAgeGroups}
                  onChange={setSelAgeGroups}
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                {/* Clear all link */}
                {(selCategories.length + selTiers.length + selGeos.length + selAgeGroups.length) > 0 && (
                  <button
                    onClick={() => {
                      setSelCategories([]); setSelTiers([])
                      setSelGeos([]);       setSelAgeGroups([])
                    }}
                    className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    Clear all filters
                  </button>
                )}
                <div className="ml-auto">
                  <button
                    onClick={runSearch}
                    disabled={searchState === 'searching'}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
                    style={{ backgroundColor: '#1A6B5A' }}
                    onMouseOver={(e) => { if (searchState !== 'searching') e.currentTarget.style.backgroundColor = '#155a4a' }}
                    onMouseOut={(e)  => { if (searchState !== 'searching') e.currentTarget.style.backgroundColor = '#1A6B5A' }}
                  >
                    {searchState === 'searching' ? (
                      <>
                        <Spinner size={4} />
                        Searching…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        Search
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Idle state ── */}
            {searchState === 'idle' && (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-8 py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-stone-700 mb-1">
                  Use the filters above to find contextually matched podcast inventory
                </p>
                <p className="text-xs text-stone-400">
                  Leave filters empty to search all available episodes
                </p>
              </div>
            )}

            {/* ── Error ── */}
            {searchState === 'error' && (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 text-center">
                <p className="text-sm text-red-500">{searchError ?? 'Search failed. Please try again.'}</p>
                <button
                  onClick={runSearch}
                  className="mt-3 text-xs text-[#1A6B5A] font-medium hover:underline"
                >
                  Try again
                </button>
              </div>
            )}

            {/* ── Results ── */}
            {searchState === 'results' && (
              <div className="flex flex-col gap-4">
                {/* Summary row */}
                <div className="flex items-center justify-between">
                  {results.length === 0 ? (
                    <p className="text-sm text-stone-500">
                      No inventory matched your filters.{' '}
                      <button
                        onClick={() => {
                          setSelCategories([]); setSelTiers([])
                          setSelGeos([]);       setSelAgeGroups([])
                          setSearchState('idle')
                        }}
                        className="text-[#1A6B5A] font-medium hover:underline"
                      >
                        Try broadening your search.
                      </button>
                    </p>
                  ) : (
                    <p className="text-sm text-stone-600">
                      <span className="font-semibold text-stone-900">{results.length}</span>{' '}
                      episode{results.length !== 1 ? 's' : ''} found
                      {' · '}
                      <span className="font-semibold text-stone-900">{totalSlots}</span>{' '}
                      available moment{totalSlots !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>

                {/* Cards */}
                {results.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {results.map((ep) => (
                      <EpisodeCard
                        key={ep.id}
                        episode={ep}
                        expanded={expandedIds.has(ep.id)}
                        onToggle={() => toggleExpanded(ep.id)}
                        onRequestPlacement={(title) =>
                          showToast(`Placement request sent for "${title}"`)
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── AI Search tab ── */}
        {activeTab === 'ai' && (
          <>
            {/* Input card */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" style={{ color: '#1A6B5A' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
                  AI Search
                </p>
              </div>

              {/* Large text input */}
              <div className="flex gap-3">
                <input
                  type="text"
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runAiSearch()}
                  placeholder="e.g. personal finance conversations about term insurance, metro audience, male 25–40"
                  className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#1A6B5A]/30 focus:border-[#1A6B5A] transition-colors"
                />
                <button
                  onClick={() => runAiSearch()}
                  disabled={aiState === 'searching' || !aiQuery.trim()}
                  className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#1A6B5A' }}
                  onMouseOver={(e) => { if (aiState !== 'searching' && aiQuery.trim()) e.currentTarget.style.backgroundColor = '#155a4a' }}
                  onMouseOut={(e)  => { if (aiState !== 'searching' && aiQuery.trim()) e.currentTarget.style.backgroundColor = '#1A6B5A' }}
                >
                  {aiState === 'searching' ? (
                    <>
                      <Spinner size={4} />
                      <span className="hidden sm:inline">Searching…</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                      <span className="hidden sm:inline">Search</span>
                    </>
                  )}
                </button>
              </div>

              {/* Example chips */}
              <div className="flex flex-wrap gap-2">
                <span className="text-[11px] text-stone-400 self-center shrink-0">Try:</span>
                {EXAMPLE_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => runAiSearch(q)}
                    className="inline-flex items-center rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-600 hover:border-[#1A6B5A]/50 hover:text-[#1A6B5A] hover:bg-[#1A6B5A]/5 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Search history chips */}
              {aiHistory.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1 border-t border-stone-50">
                  <span className="text-[11px] text-stone-400 self-center shrink-0">Recent:</span>
                  {aiHistory.map((h) => (
                    <button
                      key={h}
                      onClick={() => runAiSearch(h)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-500 hover:bg-stone-200 hover:text-stone-700 transition-colors max-w-[220px] truncate"
                      title={h}
                    >
                      <svg className="w-3 h-3 shrink-0 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="truncate">{h}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Idle ── */}
            {aiState === 'idle' && (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-8 py-12 text-center">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: '#1A6B5A1a' }}
                >
                  <svg className="w-6 h-6" style={{ color: '#1A6B5A' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-stone-700 mb-1">
                  Describe your ideal audience in plain language
                </p>
                <p className="text-xs text-stone-400">
                  Claude will extract the relevant filters and find matching inventory
                </p>
              </div>
            )}

            {/* ── Error ── */}
            {aiState === 'error' && (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 text-center">
                <p className="text-sm text-red-500">{aiError ?? 'AI search failed. Please try again.'}</p>
                <button
                  onClick={() => runAiSearch()}
                  className="mt-3 text-xs text-[#1A6B5A] font-medium hover:underline"
                >
                  Try again
                </button>
              </div>
            )}

            {/* ── Results ── */}
            {aiState === 'results' && (
              <div className="flex flex-col gap-4">

                {/* Extracted filter pills */}
                {aiFilters && !aiAllNull && (
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-xs text-stone-400 shrink-0">Understood:</span>
                    {(aiFilters.categories?.length ?? 0) > 0 && (
                      <FilterPill
                        label="Category"
                        values={aiFilters.categories!.map(capitalize)}
                      />
                    )}
                    {(aiFilters.audience_tiers?.length ?? 0) > 0 && (
                      <FilterPill
                        label="Audience"
                        values={aiFilters.audience_tiers!.map((t) => TIER_LABELS[t] ?? t)}
                      />
                    )}
                    {(aiFilters.geographies?.length ?? 0) > 0 && (
                      <FilterPill
                        label="Geography"
                        values={aiFilters.geographies!}
                      />
                    )}
                    {(aiFilters.age_groups?.length ?? 0) > 0 && (
                      <FilterPill
                        label="Age"
                        values={aiFilters.age_groups!.map((a) => AGE_LABELS[a] ?? a)}
                      />
                    )}
                    {aiFilters.gender && (
                      <FilterPill label="Gender" values={[capitalize(aiFilters.gender)]} />
                    )}
                    {aiFilters.ad_category && (
                      <FilterPill label="Ad type" values={[aiFilters.ad_category]} />
                    )}
                  </div>
                )}

                {/* All-null / no-match messages */}
                {aiAllNull ? (
                  <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-6 py-8 text-center">
                    <p className="text-sm font-medium text-stone-700 mb-1">
                      We couldn&apos;t extract specific filters from your search.
                    </p>
                    <p className="text-xs text-stone-400 max-w-sm mx-auto">
                      Try being more specific, or use{' '}
                      <button
                        onClick={() => setActiveTab('filter')}
                        className="text-[#1A6B5A] font-medium hover:underline"
                      >
                        Filter Search
                      </button>{' '}
                      to set filters manually.
                    </p>
                  </div>
                ) : aiResults.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-6 py-8 text-center">
                    <p className="text-sm text-stone-500">
                      No inventory matched the extracted filters.{' '}
                      <button
                        onClick={() => setAiState('idle')}
                        className="text-[#1A6B5A] font-medium hover:underline"
                      >
                        Try a different query.
                      </button>
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Count */}
                    <p className="text-sm text-stone-600">
                      <span className="font-semibold text-stone-900">{aiResults.length}</span>{' '}
                      episode{aiResults.length !== 1 ? 's' : ''} found
                      {' · '}
                      <span className="font-semibold text-stone-900">
                        {aiResults.reduce((s, ep) => s + ep.moments.length, 0)}
                      </span>{' '}
                      available moments
                    </p>

                    {/* Cards */}
                    <div className="flex flex-col gap-3">
                      {aiResults.map((ep) => (
                        <EpisodeCard
                          key={ep.id}
                          episode={ep}
                          expanded={aiExpandedIds.has(ep.id)}
                          onToggle={() => toggleAiExpanded(ep.id)}
                          onRequestPlacement={(title) =>
                            showToast(`Placement request sent for "${title}"`)
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

      </div>

      {/* Toast */}
      {toast && <Toast message={toast} />}
    </div>
  )
}
