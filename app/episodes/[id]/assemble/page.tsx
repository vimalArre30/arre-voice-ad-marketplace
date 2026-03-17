'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────

interface EpisodeData {
  id: string
  title: string
  audio_url: string | null
  duration_seconds: number | null
}

interface SlotData {
  slotId: string
  momentId: string
  timestamp_seconds: number
  adTitle: string
  brandName: string
  adAudioUrl: string
  adDuration: number
}

type EngineStatus = 'loading' | 'ready' | 'error'
type DataStatus   = 'loading' | 'ready' | 'error'
type AssembleStatus = 'idle' | 'fetching' | 'splitting' | 'combining' | 'uploading' | 'done' | 'error'

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtTimestamp(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function fmtDuration(s: number) {
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Fetches a resource and creates a Blob URL, reporting download progress.
 * Used to load ffmpeg-core.js / .wasm / .worker.js from CDN.
 */
async function fetchBlobURL(
  url: string,
  mimeType: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`CDN fetch failed (${resp.status}): ${url}`)
  const total  = Number(resp.headers.get('Content-Length') ?? 0)
  const reader = resp.body!.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (total > 0 && onProgress) onProgress(Math.round((received / total) * 100))
  }
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: mimeType }))
}

/** Fetches a URL and returns it as a Uint8Array. */
async function fetchBytes(url: string): Promise<Uint8Array> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Asset fetch failed (${resp.status}): ${url}`)
  return new Uint8Array(await resp.arrayBuffer())
}

// ── Small components ──────────────────────────────────────────────────────

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

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${value}%`, backgroundColor: '#1A6B5A' }}
      />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function AssemblePage() {
  const { id: episodeId } = useParams<{ id: string }>()
  const router   = useRouter()
  const supabase = createClient()

  // ── Engine ────────────────────────────────────────────────────────────
  const ffmpegRef         = useRef<FFmpeg | null>(null)
  const [engineStatus, setEngineStatus]     = useState<EngineStatus>('loading')
  const [engineProgress, setEngineProgress] = useState(0)   // wasm download %
  const [engineError, setEngineError]       = useState<string | null>(null)

  // ── Data ──────────────────────────────────────────────────────────────
  const [dataStatus, setDataStatus]   = useState<DataStatus>('loading')
  const [dataError, setDataError]     = useState<string | null>(null)
  const [episode, setEpisode]         = useState<EpisodeData | null>(null)
  const [slots, setSlots]             = useState<SlotData[]>([])

  // ── Assembly ──────────────────────────────────────────────────────────
  const [assembleStatus, setAssembleStatus]   = useState<AssembleStatus>('idle')
  const [assembleStep, setAssembleStep]       = useState('')
  const [assembleProgress, setAssembleProgress] = useState(0)  // ffmpeg encode %
  const [assembleError, setAssembleError]     = useState<string | null>(null)
  const [blobUrl, setBlobUrl]                 = useState<string | null>(null)
  const [finalPublicUrl, setFinalPublicUrl]   = useState<string | null>(null)

  // ── 1. Load FFmpeg engine ─────────────────────────────────────────────

  const [engineKey, setEngineKey] = useState(0) // increment to retry
  const attemptedRef = useRef(false)

  useEffect(() => {
    // Prevent re-running on Fast Refresh or StrictMode double-invoke
    if (attemptedRef.current) return
    attemptedRef.current = true

    let cancelled = false

    async function loadEngine() {
      setEngineStatus('loading')
      setEngineError(null)
      setEngineProgress(0)

      const TIMEOUT_MS = 30_000

      // Reject after 30 s so a stalled CDN fetch doesn't hang indefinitely
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timed out after 30 s')), TIMEOUT_MS)
      )

      try {
        await Promise.race([doLoad(), timeout])
      } catch (err) {
        if (!cancelled) {
          setEngineError(err instanceof Error ? err.message : 'Failed to load audio engine')
          setEngineStatus('error')
        }
      }

      async function doLoad() {
        console.log('[ffmpeg] Starting ffmpeg load...')

        const ffmpeg = new FFmpeg()

        ffmpeg.on('progress', ({ progress }) => {
          setAssembleProgress(Math.round(Math.min(progress, 1) * 100))
        })
        ffmpeg.on('log', ({ message }) => {
          if (process.env.NODE_ENV === 'development') console.debug('[ffmpeg]', message)
        })

        // Single-threaded core — no SharedArrayBuffer / COOP+COEP headers required
        const BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'

        console.log('[ffmpeg] Fetching core JS...')
        const coreURL = await fetchBlobURL(`${BASE}/ffmpeg-core.js`, 'text/javascript')
        if (cancelled) return

        console.log('[ffmpeg] Fetching core WASM...')
        const wasmURL = await fetchBlobURL(`${BASE}/ffmpeg-core.wasm`, 'application/wasm', (pct) => {
          if (!cancelled) setEngineProgress(pct)
        })
        if (cancelled) return

        console.log('[ffmpeg] All files fetched, loading ffmpeg...')
        await ffmpeg.load({ coreURL, wasmURL })

        if (cancelled) return
        console.log('[ffmpeg] ffmpeg loaded successfully')
        ffmpegRef.current = ffmpeg
        setEngineStatus('ready')
      }
    }

    loadEngine()
    return () => { cancelled = true }
  }, [engineKey]) // re-runs when retry button is clicked

  // ── 2. Fetch data ─────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        // Episode
        const { data: ep, error: epErr } = await supabase
          .from('episodes')
          .select('id, title, audio_url, duration_seconds')
          .eq('id', episodeId)
          .single()

        if (epErr || !ep) throw new Error(epErr?.message ?? 'Episode not found')
        setEpisode(ep as EpisodeData)

        // Approved moments for this episode
        const { data: moments, error: mErr } = await supabase
          .from('moments')
          .select('id, timestamp_seconds')
          .eq('episode_id', episodeId)
          .eq('status', 'approved')
          .order('timestamp_seconds', { ascending: true })

        if (mErr) throw new Error(mErr.message)

        if (!moments || moments.length === 0) {
          setSlots([])
          setDataStatus('ready')
          return
        }

        const momentIds = moments.map((m) => m.id)

        // ad_slots for these moments
        const { data: adSlotRows, error: sErr } = await supabase
          .from('ad_slots')
          .select('id, moment_id, ad_id')
          .in('moment_id', momentIds)

        if (sErr) throw new Error(sErr.message)
        if (!adSlotRows || adSlotRows.length === 0) {
          setSlots([])
          setDataStatus('ready')
          return
        }

        // Ads for these slots
        const adIds = Array.from(new Set(adSlotRows.map((s) => s.ad_id).filter(Boolean)))
        const { data: adRows, error: aErr } = await supabase
          .from('ads')
          .select('id, title, brand_name, audio_url, duration_seconds')
          .in('id', adIds)

        if (aErr) throw new Error(aErr.message)
        const adMap = new Map((adRows ?? []).map((a) => [a.id, a]))
        const momentMap = new Map(moments.map((m) => [m.id, m]))

        const built: SlotData[] = adSlotRows
          .map((slot) => {
            const moment = momentMap.get(slot.moment_id)
            const ad     = adMap.get(slot.ad_id)
            if (!moment || !ad) return null
            return {
              slotId:            slot.id,
              momentId:          slot.moment_id,
              timestamp_seconds: moment.timestamp_seconds,
              adTitle:           ad.title,
              brandName:         ad.brand_name,
              adAudioUrl:        ad.audio_url,
              adDuration:        ad.duration_seconds,
            } satisfies SlotData
          })
          .filter((s): s is SlotData => s !== null)
          .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)

        setSlots(built)
        setDataStatus('ready')
      } catch (err) {
        setDataError(err instanceof Error ? err.message : 'Failed to load data')
        setDataStatus('error')
      }
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId])

  // ── 3. Assembly ───────────────────────────────────────────────────────

  async function handleAssemble() {
    const ffmpeg = ffmpegRef.current
    if (!ffmpeg || !episode?.audio_url) return

    setAssembleStatus('fetching')
    setAssembleError(null)
    setAssembleStep('Fetching audio files…')
    setAssembleProgress(0)
    setBlobUrl(null)
    setFinalPublicUrl(null)

    try {
      // ── a. Fetch all audio as bytes ──────────────────────────────────
      const [episodeBytes, ...adBytesArray] = await Promise.all([
        fetchBytes(episode.audio_url),
        ...slots.map((s) => fetchBytes(s.adAudioUrl)),
      ])

      // ── b. Write files to ffmpeg virtual FS ─────────────────────────
      setAssembleStatus('splitting')
      setAssembleStep('Splitting episode at insertion points…')

      await ffmpeg.writeFile('episode.mp3', episodeBytes)
      for (let i = 0; i < slots.length; i++) {
        await ffmpeg.writeFile(`ad_${i}.mp3`, adBytesArray[i])
      }

      // ── c. Split episode into segments ───────────────────────────────
      // Sorted timestamps (already sorted, but be safe)
      const timestamps = slots.map((s) => s.timestamp_seconds)

      const segmentCount = timestamps.length + 1  // one more segment than cuts

      for (let i = 0; i < segmentCount; i++) {
        const start = i === 0 ? 0 : timestamps[i - 1]
        const end   = i < timestamps.length ? timestamps[i] : null
        const duration = end !== null ? end - start : undefined

        const args = [
          '-ss', String(start),
          '-i', 'episode.mp3',
          ...(duration !== undefined ? ['-t', String(duration)] : []),
          '-c', 'copy',
          '-avoid_negative_ts', '1',
          `segment_${i}.mp3`,
        ]

        const exitCode = await ffmpeg.exec(args)
        if (exitCode !== 0) throw new Error(`Segment ${i} extraction failed (exit ${exitCode})`)
      }

      // ── d. Build concat list and combine ────────────────────────────
      setAssembleStatus('combining')
      setAssembleStep('Combining segments…')

      const concatLines: string[] = []
      for (let i = 0; i < segmentCount; i++) {
        concatLines.push(`file 'segment_${i}.mp3'`)
        if (i < slots.length) {
          concatLines.push(`file 'ad_${i}.mp3'`)
        }
      }
      await ffmpeg.writeFile('concat.txt', concatLines.join('\n'))

      const exitCode = await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        'final_output.mp3',
      ])
      if (exitCode !== 0) throw new Error(`Concat failed (exit ${exitCode})`)

      // ── e. Read output ───────────────────────────────────────────────
      setAssembleStep('Saving output…')
      const outputData = await ffmpeg.readFile('final_output.mp3') as Uint8Array
      const blob       = new Blob([outputData as BlobPart], { type: 'audio/mpeg' })
      const url        = URL.createObjectURL(blob)
      setBlobUrl(url)

      // ── f. Upload to Supabase Storage ────────────────────────────────
      setAssembleStatus('uploading')
      setAssembleStep('Uploading to cloud…')

      const path = `assembled/${episodeId}/${Date.now()}_final.mp3`
      const { error: uploadErr } = await supabase.storage
        .from('final-audio')
        .upload(path, blob, { contentType: 'audio/mpeg', upsert: true })

      if (!uploadErr) {
        const { data: { publicUrl } } = supabase.storage
          .from('final-audio')
          .getPublicUrl(path)
        setFinalPublicUrl(publicUrl)

        // Persist final_audio_url on the episode row
        await supabase
          .from('episodes')
          .update({ final_audio_url: publicUrl } as Record<string, unknown>)
          .eq('id', episodeId)

        // Redirect to preview — final_audio_url is now in the DB
        setAssembleStatus('done')
        setAssembleStep('Done! Redirecting to preview…')
        setTimeout(() => router.push(`/episodes/${episodeId}/preview`), 1200)
        return
      }

      // Upload failed — audio is still playable via blob URL, no redirect
      setAssembleStatus('done')
      setAssembleStep('Done! (cloud upload failed — use the player below)')
    } catch (err) {
      setAssembleError(err instanceof Error ? err.message : 'Assembly failed')
      setAssembleStatus('error')
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────

  const engineReady = engineStatus === 'ready'
  const dataReady   = dataStatus === 'ready'
  const canAssemble = engineReady && dataReady && episode?.audio_url && slots.length > 0
  const isRunning   = ['fetching', 'splitting', 'combining', 'uploading'].includes(assembleStatus)

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F8F7F4] px-4 pt-10 pb-24">
      <div className="w-full max-w-[640px] mx-auto flex flex-col gap-6">

        {/* Header */}
        <div>
          <p className="text-xs text-stone-400 mb-1">
            <Link href={`/episodes/${episodeId}/ads`} className="hover:text-[#1A6B5A]">
              ← Ad Placement
            </Link>
          </p>
          <h1 className="text-2xl font-semibold text-stone-900 mb-1">Assemble Final Audio</h1>
          <p className="text-sm text-stone-500">Combine episode audio with inserted ads in the browser</p>
        </div>

        {/* ── Engine loading card ── */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">Audio Engine</p>
            {engineStatus === 'ready' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1A6B5A]">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Ready
              </span>
            )}
          </div>

          {engineStatus === 'loading' && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Spinner size={4} />
                <p className="text-sm text-stone-600">
                  Loading audio engine… {engineProgress > 0 ? `${engineProgress}%` : '(one-time, ~30 MB)'}
                </p>
              </div>
              {engineProgress > 0 && <ProgressBar value={engineProgress} />}
            </div>
          )}

          {engineStatus === 'error' && (
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-sm text-red-500">
                {engineError ?? 'Failed to load audio engine. Try refreshing.'}
              </p>
              <button
                onClick={() => { attemptedRef.current = false; setEngineKey((k) => k + 1) }}
                className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                style={{ backgroundColor: '#1A6B5A' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#155a4a')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1A6B5A')}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Retry
              </button>
            </div>
          )}

          {engineStatus === 'ready' && (
            <p className="mt-1 text-xs text-stone-400">ffmpeg.wasm loaded and ready.</p>
          )}
        </div>

        {/* ── Data / assembly plan card ── */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-3">Assembly Plan</p>

          {dataStatus === 'loading' && (
            <div className="flex items-center gap-2 py-2">
              <Spinner size={4} />
              <p className="text-sm text-stone-500">Loading episode data…</p>
            </div>
          )}

          {dataStatus === 'error' && (
            <p className="text-sm text-red-500">{dataError}</p>
          )}

          {dataStatus === 'ready' && (
            <div className="flex flex-col gap-2">
              {/* Episode row */}
              {episode && (
                <div className="flex items-center gap-3 py-2.5 border-b border-stone-50">
                  <div className="w-7 h-7 rounded-full bg-[#1A6B5A]/10 flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5" style={{ color: '#1A6B5A' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-stone-900 truncate">
                      Episode: {episode.title || 'Untitled'}
                    </p>
                    {episode.duration_seconds && (
                      <p className="text-[11px] text-stone-400 mt-0.5">{fmtDuration(episode.duration_seconds)}</p>
                    )}
                  </div>
                  {!episode.audio_url && (
                    <span className="text-[11px] text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">No audio URL</span>
                  )}
                </div>
              )}

              {/* Slot rows */}
              {slots.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-sm text-stone-400">No ads assigned to slots yet.</p>
                  <Link href={`/episodes/${episodeId}/ads`} className="mt-2 inline-block text-xs text-[#1A6B5A] hover:underline">
                    ← Go to Ad Placement
                  </Link>
                </div>
              ) : (
                slots.map((slot, i) => (
                  <div key={slot.slotId} className="flex items-center gap-3 py-2">
                    <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center shrink-0 text-[11px] font-semibold text-stone-500">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-stone-900 truncate">
                        {slot.brandName} — {slot.adTitle}
                      </p>
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        at {fmtTimestamp(slot.timestamp_seconds)} · {fmtDuration(slot.adDuration)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ── Assembly trigger / progress card ── */}
        {dataStatus === 'ready' && slots.length > 0 && episode?.audio_url && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-5 flex flex-col gap-4">

            {/* Progress / step */}
            {isRunning && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Spinner size={4} />
                  <p className="text-sm text-stone-700 font-medium">{assembleStep}</p>
                </div>
                {assembleStatus === 'combining' && assembleProgress > 0 && (
                  <div>
                    <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                      <span>Processing…</span><span>{assembleProgress}%</span>
                    </div>
                    <ProgressBar value={assembleProgress} />
                  </div>
                )}
              </div>
            )}

            {/* Done state */}
            {assembleStatus === 'done' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: '#1A6B5A' }}>
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-stone-900">Assembly complete!</p>
                </div>
                {finalPublicUrl && (
                  <p className="text-[11px] text-stone-400">Uploaded to Supabase Storage.</p>
                )}
              </div>
            )}

            {/* Error state */}
            {assembleStatus === 'error' && (
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-red-600">Assembly failed</p>
                  <p className="text-xs text-stone-400 mt-0.5">{assembleError}</p>
                </div>
              </div>
            )}

            {/* Assemble / retry button */}
            {!isRunning && assembleStatus !== 'done' && (
              <button
                onClick={handleAssemble}
                disabled={!canAssemble}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#1A6B5A' }}
                onMouseOver={(e) => { if (canAssemble) e.currentTarget.style.backgroundColor = '#155a4a' }}
                onMouseOut={(e)  => { if (canAssemble) e.currentTarget.style.backgroundColor = '#1A6B5A' }}
              >
                {assembleStatus === 'error' ? 'Try Again' : 'Assemble Audio'}
              </button>
            )}
          </div>
        )}

        {/* ── Final audio player ── */}
        {blobUrl && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">Final Audio</p>
              <a
                href={blobUrl}
                download={`${episode?.title ?? 'episode'}-assembled.mp3`}
                className="text-xs font-medium text-[#1A6B5A] hover:underline flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download
              </a>
            </div>
            <audio
              key={blobUrl}
              src={blobUrl}
              controls
              className="w-full"
              style={{ accentColor: '#1A6B5A' } as React.CSSProperties}
            />
            {finalPublicUrl && (
              <p className="text-[11px] text-stone-400 break-all">
                <span className="font-medium text-stone-600">Cloud URL: </span>
                {finalPublicUrl}
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
