'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────

interface MomentRow {
  id: string
  timestamp_seconds: number
  context_snippet: string
  ad_category: string
  confidence_score: number | null
}

interface AdRow {
  id: string
  title: string
  brand_name: string
  category: string
  audio_url: string
  duration_seconds: number
}

interface SlotData {
  moment: MomentRow
  ads: AdRow[]           // ads available for this category
  assignedAdId: string | null
  adSlotId: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/aac', 'audio/x-aac']
const ACCEPTED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.aac']

const CATEGORY_COLOURS: Record<string, { bg: string; text: string }> = {
  finance:       { bg: 'bg-blue-100',   text: 'text-blue-700' },
  insurance:     { bg: 'bg-purple-100', text: 'text-purple-700' },
  travel:        { bg: 'bg-teal-100',   text: 'text-teal-700' },
  food:          { bg: 'bg-orange-100', text: 'text-orange-700' },
  health:        { bg: 'bg-green-100',  text: 'text-green-700' },
  ecommerce:     { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  'real-estate': { bg: 'bg-amber-100',  text: 'text-amber-800' },
  'ed-tech':     { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  fintech:       { bg: 'bg-cyan-100',   text: 'text-cyan-700' },
  auto:          { bg: 'bg-slate-200',  text: 'text-slate-600' },
  lifestyle:     { bg: 'bg-pink-100',   text: 'text-pink-700' },
}
const DEFAULT_COLOUR = { bg: 'bg-stone-100', text: 'text-stone-600' }

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtTimestamp(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
function fmtDuration(s: number) {
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
function isAudioFile(file: File) {
  if (ACCEPTED_TYPES.includes(file.type)) return true
  return ACCEPTED_EXTENSIONS.includes('.' + file.name.split('.').pop()?.toLowerCase())
}
function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(audio.duration) }
    audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')) }
    audio.src = url
  })
}
function uploadWithProgress(
  url: string, file: File, headers: Record<string, string>,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(file)
  })
}

// ── Small shared components ───────────────────────────────────────────────

function Spinner({ size = 6 }: { size?: number }) {
  return (
    <svg className={`w-${size} h-${size} animate-spin`} style={{ color: '#1A6B5A' }} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
function CategoryBadge({ category }: { category: string }) {
  const c = CATEGORY_COLOURS[category] ?? DEFAULT_COLOUR
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>{category}</span>
}

// ── SlotCard ──────────────────────────────────────────────────────────────

type UploadPhase = 'idle' | 'validating' | 'ready' | 'uploading'

function SlotCard({
  index,
  slot,
  playingAdId,
  onPreview,
  onAssigned,
  onNewAdCreated,
}: {
  index: number
  slot: SlotData
  playingAdId: string | null
  onPreview: (adId: string, url: string) => void
  onAssigned: (momentId: string, adId: string, slotId: string) => void
  onNewAdCreated: (category: string, ad: AdRow) => void
}) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Local state only for upload form + UI toggles
  const [assigning, setAssigning]         = useState(false)
  const [snippetOpen, setSnippetOpen]     = useState(false)
  const [showForm, setShowForm]           = useState(slot.ads.length === 0)

  const [adTitle, setAdTitle]             = useState('')
  const [brandName, setBrandName]         = useState('')
  const [uploadFile, setUploadFile]       = useState<File | null>(null)
  const [uploadDuration, setUploadDuration] = useState<number | null>(null)
  const [phase, setPhase]                 = useState<UploadPhase>('idle')
  const [progress, setProgress]           = useState(0)
  const [uploadError, setUploadError]     = useState<string | null>(null)

  function resetForm() {
    setAdTitle(''); setBrandName(''); setUploadFile(null); setUploadDuration(null)
    setPhase('idle'); setProgress(0); setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Assign an existing ad to this slot ──────────────────────────────────
  async function assignAd(adId: string) {
    setAssigning(true)
    const currentSlotId = slot.adSlotId
    const prevAdId      = slot.assignedAdId

    if (currentSlotId) {
      // Optimistic update first
      onAssigned(slot.moment.id, adId, currentSlotId)
      const { error } = await supabase.from('ad_slots').update({ ad_id: adId }).eq('id', currentSlotId)
      if (error) {
        console.error('[assign] update error:', error)
        // Revert
        if (prevAdId) onAssigned(slot.moment.id, prevAdId, currentSlotId)
      }
    } else {
      const { data, error } = await supabase
        .from('ad_slots')
        .insert({ moment_id: slot.moment.id, ad_id: adId })
        .select('id')
        .single()
      if (!error && data) {
        onAssigned(slot.moment.id, adId, (data as { id: string }).id)
      } else {
        console.error('[assign] insert error:', error)
      }
    }
    setAssigning(false)
  }

  // ── Handle file input ────────────────────────────────────────────────────
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setPhase('validating')

    if (!isAudioFile(file)) {
      setUploadError('Please upload an MP3, M4A, WAV, or AAC file.')
      setPhase('idle'); return
    }
    try {
      const dur = await getAudioDuration(file)
      if (dur > 60) { setUploadError('Ad audio must be 60 seconds or less.'); setPhase('idle'); return }
      setUploadFile(file); setUploadDuration(Math.round(dur)); setPhase('ready')
    } catch {
      setUploadError('Could not read audio file.'); setPhase('idle')
    }
  }

  // ── Upload & create ads row ──────────────────────────────────────────────
  async function handleUpload() {
    if (!uploadFile || uploadDuration === null) return
    if (!adTitle.trim())    { setUploadError('Ad title is required.'); return }
    if (!brandName.trim())  { setUploadError('Brand name is required.'); return }

    setPhase('uploading'); setProgress(0); setUploadError(null)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const uuid        = crypto.randomUUID()
    const storagePath = `ads/${uuid}/${uploadFile.name}`
    const uploadUrl   = `${supabaseUrl}/storage/v1/object/ad-audio/${storagePath}`

    try {
      await uploadWithProgress(
        uploadUrl, uploadFile,
        { Authorization: `Bearer ${anonKey}`, 'Content-Type': uploadFile.type || 'audio/mpeg', 'x-upsert': 'false' },
        setProgress,
      )
    } catch {
      setUploadError('Upload failed. Please try again.'); setPhase('ready'); return
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/ad-audio/${storagePath}`

    const { data: newAd, error } = await supabase
      .from('ads')
      .insert({ title: adTitle.trim(), brand_name: brandName.trim(), category: slot.moment.ad_category, audio_url: publicUrl, duration_seconds: uploadDuration })
      .select()
      .single()

    if (error || !newAd) {
      setUploadError('Failed to save ad. Please try again.'); setPhase('ready'); return
    }

    const ad = newAd as AdRow
    onNewAdCreated(slot.moment.ad_category, ad) // tell parent → other same-category slots get it too
    await assignAd(ad.id)
    setShowForm(false); resetForm()
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const snippet = slot.moment.context_snippet
  const SNIP_MAX = 140
  const isAssigned = slot.assignedAdId !== null

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-colors ${isAssigned ? 'border-[#1A6B5A]/25' : 'border-stone-100'}`}>

      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-4 border-b border-stone-50">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold tracking-widest text-stone-400 uppercase">Slot {index}</span>
          {isAssigned && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1A6B5A]">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Assigned
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xl font-mono font-semibold text-stone-900">{fmtTimestamp(slot.moment.timestamp_seconds)}</span>
          <CategoryBadge category={slot.moment.ad_category} />
        </div>
        {/* Context snippet — collapsible */}
        <p className="text-xs text-stone-500 leading-relaxed italic">
          {snippetOpen || snippet.length <= SNIP_MAX ? snippet : snippet.slice(0, SNIP_MAX) + '…'}
          {snippet.length > SNIP_MAX && (
            <button onClick={() => setSnippetOpen(!snippetOpen)} className="ml-1 not-italic font-medium text-[#1A6B5A]">
              {snippetOpen ? 'less' : 'more'}
            </button>
          )}
        </p>
      </div>

      {/* ── Ad assignment section ── */}
      <div className="px-5 py-4 flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Assign Ad</p>

        {/* Existing ads list */}
        {slot.ads.length > 0 && !showForm && (
          <div className="flex flex-col gap-2">
            {slot.ads.map((ad) => {
              const selected = slot.assignedAdId === ad.id
              const isPlaying = playingAdId === ad.id
              return (
                <div key={ad.id} className="flex items-center gap-2">
                  <button
                    onClick={() => !selected && assignAd(ad.id)}
                    disabled={assigning}
                    className={[
                      'flex-1 text-left rounded-xl border px-3.5 py-3 flex items-center justify-between gap-3 transition-all',
                      selected
                        ? 'border-[#1A6B5A] bg-[#f0faf7]'
                        : 'border-stone-150 hover:border-stone-300 hover:bg-stone-50 border-stone-200',
                    ].join(' ')}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-stone-900 truncate">{ad.title}</p>
                      <p className="text-[11px] text-stone-400 mt-0.5">{ad.brand_name} · {fmtDuration(ad.duration_seconds)}</p>
                    </div>
                    {selected ? (
                      <svg className="w-4 h-4 text-[#1A6B5A] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : assigning ? (
                      <Spinner size={4} />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-stone-200 shrink-0" />
                    )}
                  </button>
                  {/* Preview play/pause button */}
                  <button
                    onClick={() => onPreview(ad.id, ad.audio_url)}
                    title={isPlaying ? 'Pause preview' : 'Play preview'}
                    className={[
                      'shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                      isPlaying
                        ? 'bg-[#1A6B5A]/10 text-[#1A6B5A]'
                        : 'bg-stone-100 text-stone-500 hover:bg-stone-200',
                    ].join(' ')}
                  >
                    {isPlaying ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 translate-x-px" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Toggle button */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="self-start text-xs text-[#1A6B5A] font-medium hover:underline"
          >
            {slot.ads.length === 0 ? '+ Upload an ad for this slot' : '+ Upload a new ad'}
          </button>
        )}

        {/* ── Inline upload form ── */}
        {showForm && (
          <div className="border border-stone-200 rounded-xl p-4 flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-stone-800">Upload new ad</p>
              {slot.ads.length > 0 && (
                <button
                  onClick={() => { setShowForm(false); resetForm() }}
                  className="text-xs text-stone-400 hover:text-stone-600"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Category (locked) */}
            <div>
              <p className="text-[11px] text-stone-400 mb-1.5">Category</p>
              <CategoryBadge category={slot.moment.ad_category} />
            </div>

            {/* Ad title */}
            <div>
              <label className="block text-[11px] text-stone-400 mb-1.5">Ad title</label>
              <input
                type="text"
                value={adTitle}
                onChange={(e) => setAdTitle(e.target.value)}
                placeholder="e.g. Summer Sale 2025"
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#1A6B5A]/30 focus:border-[#1A6B5A]"
              />
            </div>

            {/* Brand name */}
            <div>
              <label className="block text-[11px] text-stone-400 mb-1.5">Brand name</label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="e.g. Zerodha"
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#1A6B5A]/30 focus:border-[#1A6B5A]"
              />
            </div>

            {/* Audio file picker */}
            <div>
              <label className="block text-[11px] text-stone-400 mb-1.5">Audio (MP3 / M4A / WAV · max 60s)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.m4a,.wav,.aac,audio/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              {phase === 'idle' || phase === 'validating' ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={phase === 'validating'}
                  className="w-full rounded-lg border-2 border-dashed border-stone-200 px-3 py-3 text-xs text-stone-400 hover:border-stone-300 hover:bg-stone-50 transition-colors text-center disabled:opacity-50"
                >
                  {phase === 'validating' ? 'Validating…' : 'Click to browse file'}
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-stone-50 rounded-lg border border-stone-200 px-3 py-2">
                  <svg className="w-3.5 h-3.5 text-stone-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  <span className="text-xs text-stone-700 truncate flex-1">{uploadFile?.name}</span>
                  <span className="text-xs text-stone-400 shrink-0">{uploadDuration}s</span>
                  <button
                    onClick={() => { setUploadFile(null); setUploadDuration(null); setPhase('idle'); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="text-stone-300 hover:text-stone-500"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Error */}
            {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}

            {/* Progress bar */}
            {phase === 'uploading' && (
              <div>
                <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                  <span>Uploading…</span><span>{progress}%</span>
                </div>
                <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-200" style={{ width: `${progress}%`, backgroundColor: '#1A6B5A' }} />
                </div>
              </div>
            )}

            {/* Submit */}
            {phase === 'ready' && (
              <button
                onClick={handleUpload}
                className="w-full py-2.5 rounded-lg text-xs font-semibold text-white transition-colors"
                style={{ backgroundColor: '#1A6B5A' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#155a4a')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1A6B5A')}
              >
                Upload & assign
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function AdsPage() {
  const { id: episodeId } = useParams<{ id: string }>()
  const supabase = createClient()

  const [slots, setSlots]       = useState<SlotData[]>([])
  const [loading, setLoading]   = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [playingAdId, setPlayingAdId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    async function load() {
      // 1. Approved moments
      const { data: moments, error: mErr } = await supabase
        .from('moments')
        .select('id, timestamp_seconds, context_snippet, ad_category, confidence_score')
        .eq('episode_id', episodeId)
        .eq('status', 'approved')
        .order('timestamp_seconds', { ascending: true })

      if (mErr || !moments) { setPageError('Could not load approved moments.'); setLoading(false); return }

      const momentIds = moments.map((m) => m.id)

      // 2. Existing ad_slots
      const { data: existingSlots } = await supabase
        .from('ad_slots')
        .select('id, moment_id, ad_id')
        .in('moment_id', momentIds)

      // 3. Available ads by category
      const categories = Array.from(new Set(moments.map((m) => m.ad_category)))
      const { data: allAds } = await supabase
        .from('ads')
        .select('id, title, brand_name, category, audio_url, duration_seconds')
        .in('category', categories)

      // Build lookup maps
      const slotByMoment = new Map<string, { id: string; ad_id: string | null }>(
        (existingSlots ?? []).map((s) => [s.moment_id, { id: s.id, ad_id: s.ad_id }])
      )
      const adsByCategory = new Map<string, AdRow[]>()
      for (const ad of allAds ?? []) {
        const list = adsByCategory.get(ad.category) ?? []
        adsByCategory.set(ad.category, [...list, ad as AdRow])
      }

      const built: SlotData[] = (moments as MomentRow[]).map((m) => {
        const existing = slotByMoment.get(m.id)
        return {
          moment: m,
          ads: adsByCategory.get(m.ad_category) ?? [],
          assignedAdId: existing?.ad_id ?? null,
          adSlotId: existing?.id ?? null,
        }
      })

      setSlots(built)
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId])

  // ── Slot callbacks ────────────────────────────────────────────────────────

  function onAssigned(momentId: string, adId: string, slotId: string) {
    setSlots((prev) =>
      prev.map((s) =>
        s.moment.id === momentId ? { ...s, assignedAdId: adId, adSlotId: slotId } : s
      )
    )
  }

  function onNewAdCreated(category: string, ad: AdRow) {
    setSlots((prev) =>
      prev.map((s) =>
        s.moment.ad_category === category && !s.ads.find((a) => a.id === ad.id)
          ? { ...s, ads: [...s.ads, ad] }
          : s
      )
    )
  }

  function handleAdPreview(adId: string, url: string) {
    // Stop any currently playing preview
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current.onended = null
    }
    // Toggle off if same ad
    if (playingAdId === adId) {
      setPlayingAdId(null)
      audioRef.current = null
      return
    }
    const audio = new Audio(url)
    audio.play().catch(() => {})
    audio.onended = () => { setPlayingAdId(null); audioRef.current = null }
    audioRef.current = audio
    setPlayingAdId(adId)
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const assignedCount = slots.filter((s) => s.assignedAdId !== null).length
  const allAssigned   = slots.length > 0 && assignedCount === slots.length

  // ── Early states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] px-4 pt-10 pb-24">
        <div className="w-full max-w-[640px] mx-auto flex flex-col gap-6 animate-pulse">
          <div>
            <div className="h-3 bg-stone-200 rounded w-1/4 mb-2" />
            <div className="h-7 bg-stone-200 rounded-lg w-1/2 mb-1" />
            <div className="h-4 bg-stone-200 rounded w-2/3" />
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-stone-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="h-3 bg-stone-200 rounded w-12" />
              </div>
              <div className="h-6 bg-stone-200 rounded w-1/3 mb-3" />
              <div className="h-3 bg-stone-100 rounded w-full mb-1.5" />
              <div className="h-3 bg-stone-100 rounded w-4/5 mb-4" />
              <div className="border-t border-stone-50 pt-4 flex flex-col gap-2">
                <div className="h-11 bg-stone-100 rounded-xl" />
                <div className="h-11 bg-stone-100 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (pageError) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center px-4">
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-5 py-4 max-w-md w-full">
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {pageError}
        </div>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F8F7F4] px-4 pt-10 pb-24">
      <div className="w-full max-w-[640px] mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-stone-400 mb-1">
              <Link href={`/episodes/${episodeId}`} className="hover:text-[#1A6B5A]">← Episode</Link>
            </p>
            <h1 className="text-2xl font-semibold text-stone-900 mb-1">Ad Placement</h1>
            <p className="text-sm text-stone-500">Assign an ad to each approved moment</p>
          </div>
          <Link
            href="/ads"
            className="shrink-0 text-xs text-[#1A6B5A] font-medium hover:underline mt-1 whitespace-nowrap"
          >
            Ad library →
          </Link>
        </div>

        {/* Slot cards */}
        {slots.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 text-center">
            <p className="text-sm text-stone-400">No approved moments found.</p>
            <Link href={`/episodes/${episodeId}`} className="mt-3 inline-block text-xs text-[#1A6B5A] hover:underline">
              ← Back to approve moments
            </Link>
          </div>
        ) : (
          slots.map((slot, i) => (
            <SlotCard
              key={slot.moment.id}
              index={i + 1}
              slot={slot}
              playingAdId={playingAdId}
              onPreview={handleAdPreview}
              onAssigned={onAssigned}
              onNewAdCreated={onNewAdCreated}
            />
          ))
        )}

        {/* Footer */}
        {slots.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm text-stone-600">
              <span className="font-semibold text-stone-900">{assignedCount}</span>{' '}
              of {slots.length} slot{slots.length !== 1 ? 's' : ''} assigned
            </p>
            {allAssigned && (
              <Link
                href={`/episodes/${episodeId}/assemble`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors whitespace-nowrap"
                style={{ backgroundColor: '#1A6B5A' }}
                onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#155a4a')}
                onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#1A6B5A')}
              >
                Assemble Final Audio
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
