'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────

interface EpisodeData {
  id: string
  title: string
  creator_name: string
  category: string
  audience_tier: string
  geography: string
  age_group: string
  gender: string
  final_audio_url: string | null
  duration_seconds: number | null
}

interface MarkerData {
  slotId: string
  timestamp_seconds: number   // insertion point in original episode
  actualTimeSeconds: number   // actual position in assembled audio (accounts for prior ad durations)
  adTitle: string
  brandName: string
  adCategory: string
  adDuration: number
}

// ── Constants ─────────────────────────────────────────────────────────────

const CATEGORY_COLOURS: Record<string, string> = {
  finance:       '#3b82f6',
  business:      '#8b5cf6',
  tech:          '#0ea5e9',
  health:        '#22c55e',
  travel:        '#14b8a6',
  food:          '#f97316',
  culture:       '#f43f5e',
  sports:        '#84cc16',
  entertainment: '#ec4899',
  education:     '#6366f1',
  // legacy
  insurance:     '#a855f7',
  ecommerce:     '#eab308',
  'real-estate': '#f59e0b',
  'ed-tech':     '#6366f1',
  fintech:       '#06b6d4',
  auto:          '#94a3b8',
  lifestyle:     '#ec4899',
}
const DEFAULT_COLOUR = '#a8a29e'

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtTime(s: number) {
  if (!isFinite(s) || isNaN(s)) return '00:00'
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Sub-components ────────────────────────────────────────────────────────

function MetaPill({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600 font-medium">
      {label}
    </span>
  )
}

function Spinner({ size = 6 }: { size?: number }) {
  return (
    <svg
      className={`w-${size} h-${size} animate-spin shrink-0`}
      style={{ color: '#1A6B5A' }}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function PreviewPage() {
  const { id: episodeId } = useParams<{ id: string }>()
  const supabase = createClient()

  // ── Data state ────────────────────────────────────────────────────────
  const [episode, setEpisode]   = useState<EpisodeData | null>(null)
  const [markers, setMarkers]   = useState<MarkerData[]>([])
  const [loading, setLoading]   = useState(true)
  const [dataError, setDataError] = useState<string | null>(null)

  // ── Player state ──────────────────────────────────────────────────────
  const audioRef       = useRef<HTMLAudioElement>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying]       = useState(false)
  const [currentTime, setCurrentTime]   = useState(0)
  const [duration, setDuration]         = useState(0)
  const [volume, setVolume]             = useState(1)
  const [isBuffering, setIsBuffering]   = useState(false)

  // ── Tooltip state ─────────────────────────────────────────────────────
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null)

  // ── 1. Fetch data ─────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const { data: ep, error: epErr } = await supabase
          .from('episodes')
          .select('id, title, creator_name, category, audience_tier, geography, age_group, gender, final_audio_url, duration_seconds')
          .eq('id', episodeId)
          .single()

        if (epErr || !ep) throw new Error(epErr?.message ?? 'Episode not found')
        setEpisode(ep as EpisodeData)

        // Approved moments for this episode
        const { data: moments, error: mErr } = await supabase
          .from('moments')
          .select('id, timestamp_seconds, ad_category')
          .eq('episode_id', episodeId)
          .eq('status', 'approved')
          .order('timestamp_seconds', { ascending: true })

        if (mErr) throw new Error(mErr.message)
        if (!moments || moments.length === 0) { setLoading(false); return }

        const momentIds = moments.map((m) => m.id)

        // ad_slots for these moments
        const { data: adSlotRows, error: sErr } = await supabase
          .from('ad_slots')
          .select('id, moment_id, ad_id')
          .in('moment_id', momentIds)

        if (sErr) throw new Error(sErr.message)
        if (!adSlotRows || adSlotRows.length === 0) { setLoading(false); return }

        // Ads
        const adIds = Array.from(new Set(adSlotRows.map((s) => s.ad_id).filter(Boolean)))
        const { data: adRows, error: aErr } = await supabase
          .from('ads')
          .select('id, title, brand_name, category, duration_seconds')
          .in('id', adIds)

        if (aErr) throw new Error(aErr.message)

        const adMap     = new Map((adRows ?? []).map((a) => [a.id, a]))
        const momentMap = new Map(moments.map((m) => [m.id, m]))

        // Build + sort by original timestamp
        const built: MarkerData[] = adSlotRows
          .map((slot): MarkerData | null => {
            const moment = momentMap.get(slot.moment_id)
            const ad     = adMap.get(slot.ad_id)
            if (!moment || !ad) return null
            return {
              slotId:            slot.id,
              timestamp_seconds: moment.timestamp_seconds,
              actualTimeSeconds: 0,          // calculated below
              adTitle:           ad.title,
              brandName:         ad.brand_name,
              adCategory:        moment.ad_category,
              adDuration:        ad.duration_seconds,
            }
          })
          .filter((m): m is MarkerData => m !== null)
          .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)

        // Actual positions in assembled audio:
        // each earlier ad shifts subsequent timestamps forward by its duration
        let offset = 0
        const withPositions = built.map((m) => {
          const actual = m.timestamp_seconds + offset
          offset += m.adDuration
          return { ...m, actualTimeSeconds: actual }
        })

        setMarkers(withPositions)
        setLoading(false)
      } catch (err) {
        setDataError(err instanceof Error ? err.message : 'Failed to load data')
        setLoading(false)
      }
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId])

  // ── 2. Wire audio events ──────────────────────────────────────────────

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTime    = () => setCurrentTime(audio.currentTime)
    const onMeta    = () => setDuration(audio.duration)
    const onPlay    = () => setIsPlaying(true)
    const onPause   = () => setIsPlaying(false)
    const onEnded   = () => setIsPlaying(false)
    const onWait    = () => setIsBuffering(true)
    const onCanPlay = () => setIsBuffering(false)

    audio.addEventListener('timeupdate',     onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('play',           onPlay)
    audio.addEventListener('pause',          onPause)
    audio.addEventListener('ended',          onEnded)
    audio.addEventListener('waiting',        onWait)
    audio.addEventListener('canplay',        onCanPlay)

    return () => {
      audio.removeEventListener('timeupdate',     onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('play',           onPlay)
      audio.removeEventListener('pause',          onPause)
      audio.removeEventListener('ended',          onEnded)
      audio.removeEventListener('waiting',        onWait)
      audio.removeEventListener('canplay',        onCanPlay)
    }
  }, [episode?.final_audio_url])

  // ── Player handlers ───────────────────────────────────────────────────

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) audio.pause()
    else audio.play().catch(() => {})
  }

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current
    const bar   = progressBarRef.current
    if (!audio || !bar || !duration) return
    const rect     = bar.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audio.currentTime = fraction * duration
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseFloat(e.target.value)
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = v
  }

  function seekToMarker(actualTime: number) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = actualTime
    audio.play().catch(() => {})
  }

  // ── Derived ───────────────────────────────────────────────────────────

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

  // ── Early states ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center">
        <Spinner size={8} />
      </div>
    )
  }

  if (dataError) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center px-4">
        <p className="text-sm text-red-500">{dataError}</p>
      </div>
    )
  }

  if (!episode?.final_audio_url) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-start justify-center px-4 pt-20">
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-10 text-center w-full max-w-sm">
          <p className="text-sm font-semibold text-stone-700 mb-1">No assembled audio yet</p>
          <p className="text-xs text-stone-400 mb-5">Complete the assembly step to generate the final audio.</p>
          <Link
            href={`/episodes/${episodeId}/assemble`}
            className="text-sm font-medium text-[#1A6B5A] hover:underline"
          >
            → Go to Assemble
          </Link>
        </div>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F8F7F4] px-4 pt-10 pb-24">
      <div className="w-full max-w-[640px] mx-auto flex flex-col gap-6">

        {/* Breadcrumb + title */}
        <div>
          <p className="text-xs text-stone-400 mb-1">
            <Link href={`/episodes/${episodeId}`} className="hover:text-[#1A6B5A]">← Episode</Link>
          </p>
          <h1 className="text-2xl font-semibold text-stone-900 mb-1">Preview</h1>
          <p className="text-sm text-stone-500">Assembled episode with mid-roll ads</p>
        </div>

        {/* ── Episode summary ── */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-stone-900 leading-snug mb-0.5">
                {episode.title || 'Untitled episode'}
              </h2>
              <p className="text-sm text-stone-500 mb-3">{episode.creator_name}</p>
              <div className="flex flex-wrap gap-1.5">
                <MetaPill label={capitalize(episode.category)} />
                <MetaPill label={capitalize(episode.audience_tier)} />
                <MetaPill label={episode.geography} />
                <MetaPill label={episode.age_group} />
                <MetaPill label={capitalize(episode.gender)} />
              </div>
            </div>
            {markers.length > 0 && (
              <div
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
                style={{ backgroundColor: '#1A6B5A1a' }}
              >
                <svg
                  className="w-3.5 h-3.5"
                  style={{ color: '#1A6B5A' }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
                <span className="text-xs font-semibold" style={{ color: '#1A6B5A' }}>
                  {markers.length} ad{markers.length !== 1 ? 's' : ''} inserted
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Audio player ── */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-5 flex flex-col gap-4">

          {/* Hidden native audio */}
          <audio ref={audioRef} src={episode.final_audio_url} preload="metadata" />

          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">Player</p>

          {/* Controls row: play · time · volume */}
          <div className="flex items-center gap-3">

            {/* Play / Pause */}
            <button
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white transition-colors"
              style={{ backgroundColor: '#1A6B5A' }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#155a4a')}
              onMouseOut={(e)  => (e.currentTarget.style.backgroundColor = '#1A6B5A')}
            >
              {isBuffering ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : isPlaying ? (
                /* Pause icon */
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                /* Play icon */
                <svg className="w-4 h-4 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Time */}
            <span className="text-sm tabular-nums font-mono text-stone-700 shrink-0">
              {fmtTime(currentTime)}{' '}
              <span className="text-stone-300">/</span>{' '}
              {fmtTime(duration)}
            </span>

            {/* Volume */}
            <div className="ml-auto flex items-center gap-2">
              <svg
                className="w-4 h-4 text-stone-400 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={
                    volume === 0
                      ? 'M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z'
                      : 'M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z'
                  }
                />
              </svg>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 cursor-pointer"
                style={{ accentColor: '#1A6B5A' }}
              />
            </div>
          </div>

          {/* Seekable progress bar */}
          <div
            ref={progressBarRef}
            onClick={handleProgressClick}
            className="relative w-full h-2 bg-stone-100 rounded-full cursor-pointer group"
            role="slider"
            aria-valuenow={Math.round(currentTime)}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
          >
            {/* Filled portion */}
            <div
              className="absolute left-0 top-0 h-full rounded-full"
              style={{ width: `${progressPct}%`, backgroundColor: '#1A6B5A' }}
            />
            {/* Hover thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ left: `calc(${progressPct}% - 7px)`, backgroundColor: '#1A6B5A' }}
            />
          </div>

          {/* ── Ad marker timeline ── */}
          {markers.length > 0 && (
            <div className="mt-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-300 mb-2.5">
                Ad Insertions
              </p>

              {/* Timeline track */}
              {duration > 0 ? (
                <div className="relative w-full select-none" style={{ height: 58, overflow: 'visible' }}>

                  {/* Background track */}
                  <div
                    className="absolute left-0 right-0 bg-stone-100 rounded-full"
                    style={{ top: 18, height: 4 }}
                  />

                  {/* Playback fill on timeline */}
                  <div
                    className="absolute left-0 rounded-full"
                    style={{
                      top: 18,
                      height: 4,
                      width: `${progressPct}%`,
                      backgroundColor: '#1A6B5A',
                      opacity: 0.2,
                    }}
                  />

                  {/* Playhead line */}
                  <div
                    className="absolute top-0 bottom-0 w-px pointer-events-none"
                    style={{
                      left: `${progressPct}%`,
                      backgroundColor: '#1A6B5A',
                      opacity: 0.35,
                    }}
                  />

                  {/* Markers */}
                  {markers.map((marker) => {
                    const pct       = Math.max(0, Math.min(100, (marker.actualTimeSeconds / duration) * 100))
                    const colour    = CATEGORY_COLOURS[marker.adCategory] ?? DEFAULT_COLOUR
                    const isPassed  = currentTime >= marker.actualTimeSeconds
                    // "just crossed" window — 4 seconds
                    const isNear    = isPassed && currentTime < marker.actualTimeSeconds + 4
                    const isHovered = hoveredMarkerId === marker.slotId

                    // Anchor tooltip to avoid edge overflow
                    const tooltipStyle: React.CSSProperties =
                      pct < 18
                        ? { left: 0, transform: 'none' }
                        : pct > 82
                        ? { right: 0, left: 'auto', transform: 'none' }
                        : { left: '50%', transform: 'translateX(-50%)' }

                    return (
                      <div
                        key={marker.slotId}
                        className="absolute"
                        style={{ left: `${pct}%`, top: 0, transform: 'translateX(-50%)', overflow: 'visible' }}
                        onMouseEnter={() => setHoveredMarkerId(marker.slotId)}
                        onMouseLeave={() => setHoveredMarkerId(null)}
                      >
                        {/* Tooltip */}
                        {isHovered && (
                          <div
                            className="absolute z-50 bg-stone-900 text-white rounded-lg px-3 py-2 text-[11px] whitespace-nowrap shadow-xl pointer-events-none"
                            style={{ bottom: '100%', marginBottom: 8, ...tooltipStyle }}
                          >
                            <p className="font-semibold">{marker.brandName} — {marker.adTitle}</p>
                            <p className="text-stone-400 text-[10px] mt-0.5">
                              inserted at {fmtTime(marker.timestamp_seconds)}
                            </p>
                            {/* Caret */}
                            <div
                              className="absolute top-full w-0 h-0"
                              style={{
                                left: pct < 18 ? 12 : pct > 82 ? 'auto' : '50%',
                                right: pct > 82 ? 12 : 'auto',
                                transform: pct < 18 || pct > 82 ? 'none' : 'translateX(-50%)',
                                borderLeft: '5px solid transparent',
                                borderRight: '5px solid transparent',
                                borderTop: '5px solid #1c1917',
                              }}
                            />
                          </div>
                        )}

                        {/* Pulse ring when playhead just crossed */}
                        {isNear && (
                          <div
                            className="absolute rounded-full animate-ping pointer-events-none"
                            style={{
                              width: 14, height: 14,
                              top: 13,
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              backgroundColor: colour,
                              opacity: 0.35,
                            }}
                          />
                        )}

                        {/* Clickable marker — line + label */}
                        <button
                          onClick={() => seekToMarker(marker.actualTimeSeconds)}
                          className="flex flex-col items-center"
                          title={`${marker.brandName} — ${marker.adTitle} at ${fmtTime(marker.actualTimeSeconds)}`}
                        >
                          {/* Vertical line */}
                          <div
                            className="rounded-full transition-all duration-200"
                            style={{
                              width:           isHovered ? 3 : 2,
                              height:          isPassed ? 26 : 20,
                              backgroundColor: colour,
                              opacity:         isPassed ? 1 : 0.4,
                              marginTop:       isPassed ? 5 : 8,
                            }}
                          />
                          {/* Category label */}
                          <p
                            className="text-[9px] font-semibold mt-1 leading-none transition-opacity duration-200"
                            style={{ color: colour, opacity: isPassed ? 1 : 0.5 }}
                          >
                            {marker.adCategory}
                          </p>
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* Duration not yet loaded */
                <div className="flex items-center gap-2 py-2">
                  <Spinner size={3} />
                  <p className="text-xs text-stone-400">Loading timeline…</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Download & navigation ── */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <a
            href={episode.final_audio_url}
            download={`${episode.title ?? 'episode'}-assembled.mp3`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: '#1A6B5A' }}
            onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#155a4a')}
            onMouseOut={(e)  => ((e.currentTarget as HTMLElement).style.backgroundColor = '#1A6B5A')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download Final Audio
          </a>
          <Link
            href={`/episodes/${episodeId}`}
            className="text-sm text-stone-500 hover:text-stone-900 transition-colors"
          >
            ← Back to Episode
          </Link>
        </div>

      </div>
    </div>
  )
}
