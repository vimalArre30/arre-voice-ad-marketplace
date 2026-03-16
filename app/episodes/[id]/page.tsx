'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EpisodeStatus = 'uploaded' | 'transcribing' | 'transcribed' | 'detecting' | 'ready' | 'error'
type MomentStatus = 'pending' | 'approved' | 'rejected'

interface Episode {
  id: string
  title: string
  creator_name: string
  category: string
  audience_tier: string
  geography: string
  age_group: string
  gender: string
  status: EpisodeStatus
}

interface Moment {
  id: string
  timestamp_seconds: number
  context_snippet: string
  ad_category: string
  confidence_score: number | null
  status: MomentStatus
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface StepDef { key: EpisodeStatus[]; label: string }
const STEPS: StepDef[] = [
  { key: ['uploaded'],                 label: 'Uploaded' },
  { key: ['transcribing'],             label: 'Transcribing' },
  { key: ['transcribed', 'detecting'], label: 'Detecting moments' },
  { key: ['ready'],                    label: 'Ready' },
]
const TERMINAL: EpisodeStatus[] = ['ready', 'error']
const POLL_MS = 3000

// Fixed colour map — full Tailwind class names so the purger keeps them
const CATEGORY_COLOURS: Record<string, { bg: string; text: string }> = {
  finance:     { bg: 'bg-blue-100',   text: 'text-blue-700' },
  insurance:   { bg: 'bg-purple-100', text: 'text-purple-700' },
  travel:      { bg: 'bg-teal-100',   text: 'text-teal-700' },
  food:        { bg: 'bg-orange-100', text: 'text-orange-700' },
  health:      { bg: 'bg-green-100',  text: 'text-green-700' },
  ecommerce:   { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  'real-estate':{ bg: 'bg-amber-100', text: 'text-amber-800' },
  'ed-tech':   { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  fintech:     { bg: 'bg-cyan-100',   text: 'text-cyan-700' },
  auto:        { bg: 'bg-slate-200',  text: 'text-slate-600' },
  lifestyle:   { bg: 'bg-pink-100',   text: 'text-pink-700' },
}
const DEFAULT_COLOUR = { bg: 'bg-stone-100', text: 'text-stone-600' }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTimestamp(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function stepIndex(status: EpisodeStatus): number {
  return STEPS.findIndex((s) => s.key.includes(status))
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner({ size = 8 }: { size?: number }) {
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

function MetaPill({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600 font-medium">
      {label}
    </span>
  )
}

function CategoryBadge({ category }: { category: string }) {
  const c = CATEGORY_COLOURS[category] ?? DEFAULT_COLOUR
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>
      {category}
    </span>
  )
}

function ConfidenceBar({ score }: { score: number | null }) {
  const pct = score != null ? Math.round(score * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: '#1A6B5A' }}
        />
      </div>
      <span className="text-xs text-stone-400 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  )
}

function StatusStepper({ status }: { status: EpisodeStatus }) {
  const current = stepIndex(status)
  const isReady = status === 'ready'

  return (
    <ol className="flex flex-col gap-0">
      {STEPS.map((step, i) => {
        const done   = i < current
        const active = i === current
        const ahead  = i > current

        return (
          <li key={step.label} className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <div
                className={[
                  'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold',
                  done   ? 'bg-[#1A6B5A] text-white' : '',
                  active ? 'border-2 border-[#1A6B5A] bg-white text-[#1A6B5A]' : '',
                  ahead  ? 'bg-stone-100 text-stone-400' : '',
                ].join(' ')}
              >
                {done ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : active && !isReady ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  String(i + 1)
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-px my-1 ${i < current ? 'bg-[#1A6B5A]' : 'bg-stone-200'}`}
                  style={{ minHeight: 24 }}
                />
              )}
            </div>
            <div className="pb-6 pt-0.5">
              <p className={`text-sm font-medium ${done ? 'text-[#1A6B5A]' : active ? 'text-stone-900' : 'text-stone-400'}`}>
                {step.label}
                {active && !isReady && <span className="ml-2 text-xs font-normal text-stone-400">In progress…</span>}
                {done && <span className="ml-2 text-xs font-normal text-stone-400">Done</span>}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function MomentCard({
  moment,
  onApprove,
  onReject,
}: {
  moment: Moment
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  const isApproved = moment.status === 'approved'
  const isRejected = moment.status === 'rejected'
  const isPending  = moment.status === 'pending'

  return (
    <div className={`bg-white rounded-xl border p-4 sm:p-5 flex flex-col gap-3 transition-opacity ${isRejected ? 'opacity-50' : 'opacity-100'} ${isApproved ? 'border-[#1A6B5A]/30' : 'border-stone-100'}`}>
      {/* Top row: timestamp + category */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-lg font-mono font-semibold text-stone-900">
          {fmtTimestamp(moment.timestamp_seconds)}
        </span>
        <CategoryBadge category={moment.ad_category} />
      </div>

      {/* Context snippet */}
      <blockquote className="bg-stone-50 border-l-4 border-stone-200 rounded-r-lg px-3 py-2.5 text-xs text-stone-600 leading-relaxed italic">
        {moment.context_snippet}
      </blockquote>

      {/* Confidence bar */}
      <div>
        <p className="text-xs text-stone-400 mb-1">Confidence</p>
        <ConfidenceBar score={moment.confidence_score} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {isPending && (
          <>
            <button
              onClick={() => onApprove(moment.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
              style={{ backgroundColor: '#1A6B5A' }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#155a4a')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1A6B5A')}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Approve
            </button>
            <button
              onClick={() => onReject(moment.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-stone-500 bg-stone-100 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reject
            </button>
          </>
        )}
        {isApproved && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#1A6B5A] bg-[#f0faf7]">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Approved
          </span>
        )}
        {isRejected && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-stone-400 bg-stone-100">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Rejected
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EpisodeDetailPage() {
  const { id: episodeId } = useParams<{ id: string }>()
  const supabase = createClient()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [episode, setEpisode] = useState<Episode | null>(null)
  const [moments, setMoments] = useState<Moment[]>([])
  const [pageError, setPageError] = useState<string | null>(null)
  const [momentsFetched, setMomentsFetched] = useState(false)

  // ── Fetch moments (called once when status becomes 'ready') ──────────────
  const fetchMoments = useCallback(async () => {
    const { data, error } = await supabase
      .from('moments')
      .select('id, timestamp_seconds, context_snippet, ad_category, confidence_score, status')
      .eq('episode_id', episodeId)
      .order('timestamp_seconds', { ascending: true })

    if (error) {
      console.error('[moments] fetch error:', error)
      return
    }
    setMoments((data ?? []) as Moment[])
    setMomentsFetched(true)
  }, [episodeId, supabase])

  // ── Poll episode status ──────────────────────────────────────────────────
  const fetchEpisode = useCallback(async () => {
    const { data, error } = await supabase
      .from('episodes')
      .select('id, title, creator_name, category, audience_tier, geography, age_group, gender, status')
      .eq('id', episodeId)
      .single()

    if (error || !data) {
      setPageError('Could not load episode.')
      return
    }

    const ep = data as Episode
    setEpisode(ep)

    if (TERMINAL.includes(ep.status)) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (ep.status === 'ready' && !momentsFetched) {
        fetchMoments()
      }
    }
  }, [episodeId, supabase, momentsFetched, fetchMoments])

  useEffect(() => {
    fetchEpisode()
    intervalRef.current = setInterval(fetchEpisode, POLL_MS)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId])

  // ── Approve / Reject ─────────────────────────────────────────────────────
  async function updateMomentStatus(momentId: string, next: MomentStatus) {
    // Optimistic update
    setMoments((prev) =>
      prev.map((m) => (m.id === momentId ? { ...m, status: next } : m))
    )

    const { error } = await supabase
      .from('moments')
      .update({ status: next })
      .eq('id', momentId)

    if (error) {
      console.error('[moments] update error:', error)
      // Revert
      setMoments((prev) =>
        prev.map((m) => (m.id === momentId ? { ...m, status: 'pending' } : m))
      )
    }
  }

  // ── Derived state ────────────────────────────────────────────────────────
  const approvedCount = moments.filter((m) => m.status === 'approved').length
  const isReady  = episode?.status === 'ready'
  const isError  = episode?.status === 'error'

  // ── Render ───────────────────────────────────────────────────────────────
  if (pageError) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center px-4">
        <p className="text-sm text-red-500">{pageError}</p>
      </div>
    )
  }

  if (!episode) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center px-4">
        <Spinner size={8} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4] px-4 pt-10 pb-20">
      <div className="w-full max-w-[680px] mx-auto flex flex-col gap-6">

        {/* ── Episode header ────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-semibold text-stone-900 leading-snug mb-1">
            {episode.title || 'Untitled episode'}
          </h1>
          <p className="text-sm text-stone-500 mb-3">{episode.creator_name}</p>
          <div className="flex flex-wrap gap-1.5">
            <MetaPill label={capitalize(episode.category)} />
            <MetaPill label={capitalize(episode.audience_tier)} />
            <MetaPill label={episode.geography} />
            <MetaPill label={episode.age_group} />
            <MetaPill label={capitalize(episode.gender)} />
          </div>
        </div>

        {/* ── Processing stepper (non-ready, non-error) ─────────────────── */}
        {!isReady && !isError && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6">
            <p className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-5">Processing</p>
            <StatusStepper status={episode.status} />
          </div>
        )}

        {/* ── Error state ───────────────────────────────────────────────── */}
        {isError && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-stone-900">Processing failed</p>
              <p className="text-xs text-stone-500 mt-1">There was an error. Please try uploading again.</p>
            </div>
          </div>
        )}

        {/* ── Moments list ──────────────────────────────────────────────── */}
        {isReady && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-900">
                AI-detected Ad Moments
                <span className="ml-2 text-stone-400 font-normal">({moments.length})</span>
              </h2>
            </div>

            {moments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 text-center">
                <Spinner size={6} />
                <p className="text-sm text-stone-400 mt-3">Loading moments…</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {moments.map((m) => (
                  <MomentCard
                    key={m.id}
                    moment={m}
                    onApprove={(id) => updateMomentStatus(id, 'approved')}
                    onReject={(id) => updateMomentStatus(id, 'rejected')}
                  />
                ))}
              </div>
            )}

            {/* Footer */}
            {moments.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-sm text-stone-600">
                  <span className="font-semibold text-stone-900">{approvedCount}</span>
                  {' '}of {moments.length} moments approved
                </p>
                {approvedCount >= 1 && (
                  <Link
                    href={`/episodes/${episodeId}/ads`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                    style={{ backgroundColor: '#1A6B5A' }}
                    onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#155a4a')}
                    onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#1A6B5A')}
                  >
                    Continue to Ad Placement
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
