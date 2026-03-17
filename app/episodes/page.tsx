'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────

type EpisodeStatus = 'uploaded' | 'transcribing' | 'transcribed' | 'detecting' | 'ready' | 'error'

interface Episode {
  id: string
  title: string
  creator_name: string
  category: string
  audience_tier: string
  geography: string
  age_group: string
  status: EpisodeStatus
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<EpisodeStatus, { bg: string; text: string; label: string }> = {
  uploaded:    { bg: 'bg-stone-100',   text: 'text-stone-500',  label: 'Uploaded' },
  transcribing:{ bg: 'bg-blue-50',     text: 'text-blue-600',   label: 'Transcribing' },
  transcribed: { bg: 'bg-sky-50',      text: 'text-sky-600',    label: 'Transcribed' },
  detecting:   { bg: 'bg-violet-50',   text: 'text-violet-600', label: 'Detecting' },
  ready:       { bg: 'bg-[#f0faf7]',   text: 'text-[#1A6B5A]', label: 'Ready' },
  error:       { bg: 'bg-red-50',      text: 'text-red-600',    label: 'Error' },
}

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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: EpisodeStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.uploaded
  const isProcessing = status === 'transcribing' || status === 'detecting'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}>
      {isProcessing && (
        <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {status === 'ready' && (
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
      {s.label}
    </span>
  )
}

function EpisodeCard({ episode }: { episode: Episode }) {
  const cat = CATEGORY_COLOURS[episode.category] ?? DEFAULT_COLOUR

  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <p className="text-sm font-semibold text-stone-900 leading-snug line-clamp-2">
            {episode.title || 'Untitled episode'}
          </p>
          <StatusBadge status={episode.status} />
        </div>

        <p className="text-xs text-stone-400 mb-2.5">{episode.creator_name}</p>

        {/* Metadata pills */}
        <div className="flex flex-wrap gap-1.5">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cat.bg} ${cat.text}`}>
            {capitalize(episode.category)}
          </span>
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
      </div>

      {/* Right column: date + CTA */}
      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 shrink-0">
        <p className="text-[11px] text-stone-400 whitespace-nowrap">{fmtDate(episode.created_at)}</p>
        <Link
          href={`/episodes/${episode.id}`}
          className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white whitespace-nowrap transition-colors"
          style={{ backgroundColor: '#1A6B5A' }}
          onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#155a4a')}
          onMouseOut={(e)  => ((e.currentTarget as HTMLElement).style.backgroundColor = '#1A6B5A')}
        >
          View Episode
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function EpisodesPage() {
  const supabase = createClient()

  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from('episodes')
        .select('id, title, creator_name, category, audience_tier, geography, age_group, status, created_at')
        .order('created_at', { ascending: false })

      if (err) { setError(err.message); setLoading(false); return }
      setEpisodes((data ?? []) as Episode[])
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-[#F8F7F4] px-4 pt-10 pb-20">
      <div className="w-full max-w-[720px] mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900 mb-1">My Episodes</h1>
            <p className="text-sm text-stone-500">All your uploaded episodes</p>
          </div>
          <Link
            href="/upload"
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: '#1A6B5A' }}
            onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#155a4a')}
            onMouseOut={(e)  => ((e.currentTarget as HTMLElement).style.backgroundColor = '#1A6B5A')}
          >
            + Upload New
          </Link>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            Could not load episodes: {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="flex flex-col gap-3 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-stone-100 px-5 py-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="h-4 bg-stone-200 rounded w-2/3" />
                  <div className="h-5 w-16 bg-stone-100 rounded-full shrink-0" />
                </div>
                <div className="h-3 bg-stone-100 rounded w-1/4" />
                <div className="flex gap-2">
                  <div className="h-5 w-16 bg-stone-200 rounded-full" />
                  <div className="h-5 w-12 bg-stone-100 rounded-full" />
                  <div className="h-5 w-14 bg-stone-100 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && episodes.length === 0 && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-12 text-center flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-stone-700 mb-1">No episodes yet.</p>
              <Link
                href="/upload"
                className="text-sm text-[#1A6B5A] font-semibold hover:underline"
              >
                Upload your first episode →
              </Link>
            </div>
          </div>
        )}

        {/* Episode list */}
        {!loading && episodes.length > 0 && (
          <>
            <p className="text-xs text-stone-400 -mb-3">
              {episodes.length} episode{episodes.length !== 1 ? 's' : ''}
            </p>
            <div className="flex flex-col gap-3">
              {episodes.map((ep) => (
                <EpisodeCard key={ep.id} episode={ep} />
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
