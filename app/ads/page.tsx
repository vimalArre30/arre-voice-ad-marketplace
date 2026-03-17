'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Constants ─────────────────────────────────────────────────────────────

const CATEGORIES = [
  'finance', 'business', 'tech', 'health', 'travel',
  'food', 'culture', 'sports', 'entertainment', 'education',
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
  // legacy categories kept for existing ads
  insurance:     { bg: 'bg-purple-100', text: 'text-purple-700' },
  ecommerce:     { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  'real-estate': { bg: 'bg-amber-100',  text: 'text-amber-800' },
  'ed-tech':     { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  fintech:       { bg: 'bg-cyan-100',   text: 'text-cyan-700' },
  auto:          { bg: 'bg-slate-200',  text: 'text-slate-600' },
  lifestyle:     { bg: 'bg-pink-100',   text: 'text-pink-700' },
}
const DEFAULT_COLOUR = { bg: 'bg-stone-100', text: 'text-stone-600' }

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/aac', 'audio/x-aac']
const ACCEPTED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.aac']

// ── Types ─────────────────────────────────────────────────────────────────

interface AdRow {
  id: string
  title: string
  brand_name: string
  category: string
  audio_url: string
  duration_seconds: number
  created_at: string
}

type UploadPhase = 'idle' | 'validating' | 'ready' | 'uploading'

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtDuration(s: number) {
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
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
  url: string,
  file: File,
  headers: Record<string, string>,
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

// ── Sub-components ────────────────────────────────────────────────────────

// Mounts with autoplay via imperative .play() in effect
function AudioPreview({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    ref.current?.play().catch(() => {})
  }, [])
  return (
    <audio
      ref={ref}
      src={src}
      controls
      className="w-full"
      style={{ height: 36, accentColor: '#1A6B5A' } as React.CSSProperties}
    />
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function AdLibraryPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [ads, setAds] = useState<AdRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Preview state — only one active at a time
  const [previewingAdId, setPreviewingAdId] = useState<string | null>(null)

  // Upload form state
  const [showForm, setShowForm] = useState(false)
  const [adTitle, setAdTitle] = useState('')
  const [brandName, setBrandName] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadDuration, setUploadDuration] = useState<number | null>(null)
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // ── Fetch ads ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('ads')
        .select('id, title, brand_name, category, audio_url, duration_seconds, created_at')
        .order('created_at', { ascending: false })
      if (error) { setFetchError(error.message); setLoading(false); return }
      setAds((data ?? []) as AdRow[])
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Upload form handlers ───────────────────────────────────────────────

  function resetForm() {
    setAdTitle(''); setBrandName(''); setCategory(CATEGORIES[0])
    setUploadFile(null); setUploadDuration(null)
    setPhase('idle'); setProgress(0); setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

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

  async function handleUpload() {
    if (!uploadFile || uploadDuration === null) return
    if (!adTitle.trim()) { setUploadError('Ad title is required.'); return }
    if (!brandName.trim()) { setUploadError('Brand name is required.'); return }

    setPhase('uploading'); setProgress(0); setUploadError(null)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const uuid = crypto.randomUUID()
    const storagePath = `ads/${uuid}/${uploadFile.name}`
    const uploadUrl = `${supabaseUrl}/storage/v1/object/ad-audio/${storagePath}`

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
      .insert({ title: adTitle.trim(), brand_name: brandName.trim(), category, audio_url: publicUrl, duration_seconds: uploadDuration })
      .select()
      .single()

    if (error || !newAd) {
      setUploadError('Failed to save ad. Please try again.'); setPhase('ready'); return
    }

    setAds((prev) => [newAd as AdRow, ...prev])
    setShowForm(false)
    resetForm()
  }

  function togglePreview(adId: string) {
    setPreviewingAdId((prev) => (prev === adId ? null : adId))
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F8F7F4] px-4 pt-10 pb-20">
      <div className="w-full max-w-[640px] mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900 mb-1">Ad Library</h1>
            <p className="text-sm text-stone-500">All uploaded ads</p>
          </div>
          <button
            onClick={() => { setShowForm((v) => !v); if (showForm) resetForm() }}
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: '#1A6B5A' }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#155a4a')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1A6B5A')}
          >
            {showForm ? 'Cancel' : '+ Upload New Ad'}
          </button>
        </div>

        {/* ── Inline upload form ── */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-6 flex flex-col gap-4">
            <p className="text-sm font-semibold text-stone-800">New Ad</p>

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

            {/* Category */}
            <div>
              <label className="block text-[11px] text-stone-400 mb-1.5">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1A6B5A]/30 focus:border-[#1A6B5A]"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Audio file */}
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

            {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}

            {phase === 'uploading' && (
              <div>
                <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                  <span>Uploading…</span><span>{progress}%</span>
                </div>
                <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${progress}%`, backgroundColor: '#1A6B5A' }}
                  />
                </div>
              </div>
            )}

            {phase === 'ready' && (
              <button
                onClick={handleUpload}
                className="w-full py-2.5 rounded-lg text-xs font-semibold text-white transition-colors"
                style={{ backgroundColor: '#1A6B5A' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#155a4a')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1A6B5A')}
              >
                Upload Ad
              </button>
            )}
          </div>
        )}

        {/* Fetch error */}
        {fetchError && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-6">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            Could not load ads: {fetchError}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="flex flex-col gap-2 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-stone-100 px-4 py-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-stone-200 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="h-3.5 bg-stone-200 rounded w-2/3 mb-2" />
                  <div className="h-2.5 bg-stone-100 rounded w-1/2" />
                </div>
                <div className="h-6 w-16 bg-stone-100 rounded-full hidden sm:block" />
                <div className="h-7 w-20 bg-stone-100 rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !fetchError && ads.length === 0 && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-10 text-center">
            <p className="text-sm text-stone-500">No ads in your library yet.</p>
            <p className="text-xs text-stone-400 mt-1">Upload your first ad above using &ldquo;+ Upload New Ad&rdquo;.</p>
          </div>
        )}

        {/* ── Ad list ── */}
        {!loading && ads.length > 0 && (
          <div className="flex flex-col gap-2">
            {ads.map((ad) => {
              const c = CATEGORY_COLOURS[ad.category] ?? DEFAULT_COLOUR
              const isPreviewing = previewingAdId === ad.id
              return (
                <div
                  key={ad.id}
                  className="bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden"
                >
                  {/* Row */}
                  <div className="px-4 py-3.5 flex items-center gap-3">
                    {/* Music icon */}
                    <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-900 truncate">{ad.title}</p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {ad.brand_name} · {fmtDuration(ad.duration_seconds)} · {fmtDate(ad.created_at)}
                      </p>
                    </div>

                    {/* Category badge — hidden on small screens */}
                    <span className={`shrink-0 hidden sm:inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>
                      {ad.category}
                    </span>

                    {/* Preview toggle */}
                    <button
                      onClick={() => togglePreview(ad.id)}
                      className={[
                        'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        isPreviewing
                          ? 'bg-[#1A6B5A]/10 text-[#1A6B5A]'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
                      ].join(' ')}
                    >
                      {isPreviewing ? (
                        <>
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                          </svg>
                          Hide
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          Preview
                        </>
                      )}
                    </button>
                  </div>

                  {/* Inline audio player */}
                  {isPreviewing && (
                    <div className="px-4 pb-3.5 pt-1 border-t border-stone-50">
                      <AudioPreview src={ad.audio_url} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
