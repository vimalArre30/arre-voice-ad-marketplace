'use client'

import { useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createEpisodeRow } from '@/app/actions/episodes'

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/aac', 'audio/x-aac']
const ACCEPTED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.aac']
const MAX_DURATION = 3600

type UploadState = 'idle' | 'validating' | 'ready' | 'uploading' | 'done'

interface ValidatedFile {
  file: File
  durationSeconds: number
  durationFormatted: string
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function sanitiseFilename(name: string): string {
  return name
    .replace(/[｜|[\]{}()!*'";:@&=+$,/?%#]/g, '')
    .replace(/\s+/g, '_')
    .trim()
}

function isAudioFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  return ACCEPTED_EXTENSIONS.includes(ext)
}

async function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(audio.duration)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read audio metadata'))
    }
    audio.src = url
  })
}

function uploadWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Storage error ${xhr.status}: ${xhr.responseText}`))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(file)
  })
}

export default function UploadPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<HTMLDivElement>(null)

  const [state, setState] = useState<UploadState>('idle')
  const [validated, setValidated] = useState<ValidatedFile | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [episodeId, setEpisodeId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const processFile = useCallback(async (file: File) => {
    setError(null)
    setState('validating')

    if (!isAudioFile(file)) {
      setError('Please upload an MP3, M4A, WAV, or AAC file.')
      setState('idle')
      return
    }

    let duration: number
    try {
      duration = await getAudioDuration(file)
    } catch {
      setError('Could not read audio file. Please try a different file.')
      setState('idle')
      return
    }

    if (!isFinite(duration) || duration <= 0) {
      setError('Could not determine audio duration. Please try a different file.')
      setState('idle')
      return
    }

    if (duration > MAX_DURATION) {
      setError('Episode is over 60 minutes. Please trim before uploading.')
      setState('idle')
      return
    }

    setValidated({ file, durationSeconds: duration, durationFormatted: formatDuration(duration) })
    setState('ready')
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const handleUpload = async () => {
    if (!validated) return
    setState('uploading')
    setProgress(0)
    setError(null)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const uuid = crypto.randomUUID()
    const sanitised = sanitiseFilename(validated.file.name)
    const storagePath = `episodes/${uuid}/${sanitised}`
    const uploadUrl = `${supabaseUrl}/storage/v1/object/episode-audio/${storagePath}`

    try {
      await uploadWithProgress(
        uploadUrl,
        validated.file,
        {
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': validated.file.type || 'audio/mpeg',
          'x-upsert': 'false',
        },
        setProgress
      )
    } catch {
      setError('Upload failed. Please try again.')
      setState('ready')
      return
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/episode-audio/${storagePath}`

    const result = await createEpisodeRow({
      audioUrl: publicUrl,
      durationSeconds: Math.round(validated.durationSeconds),
      storagePath,
    })

    if (result.error) {
      setError('Upload failed. Please try again.')
      setState('ready')
      return
    }

    setEpisodeId(result.episodeId ?? null)
    setProgress(100)
    setState('done')
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4] flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-[640px]">
        <h1 className="text-2xl font-semibold text-stone-900 mb-1">Upload your episode</h1>
        <p className="text-sm text-stone-500 mb-8">
          MP3, M4A, WAV or AAC · up to 60 minutes
        </p>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8">

          {/* Drop zone */}
          {state !== 'done' && (
            <div
              ref={dragRef}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`
                relative flex flex-col items-center justify-center gap-3
                border-2 border-dashed rounded-xl p-10 cursor-pointer
                transition-colors select-none
                ${dragging
                  ? 'border-[#1A6B5A] bg-[#f0faf7]'
                  : 'border-stone-200 hover:border-stone-400 hover:bg-stone-50'
                }
              `}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".mp3,.m4a,.wav,.aac,audio/*"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Upload icon */}
              <svg
                className={`w-10 h-10 ${dragging ? 'text-[#1A6B5A]' : 'text-stone-300'} transition-colors`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>

              {state === 'validating' ? (
                <p className="text-sm text-stone-500">Reading file…</p>
              ) : validated ? (
                <div className="text-center">
                  <p className="text-sm font-medium text-stone-800">{validated.file.name}</p>
                  <p className="text-xs text-stone-400 mt-0.5">{validated.durationFormatted} · {(validated.file.size / 1024 / 1024).toFixed(1)} MB</p>
                  <p className="text-xs text-[#1A6B5A] mt-1">Click or drag to replace</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm font-medium text-stone-700">Drag & drop your audio file</p>
                  <p className="text-xs text-stone-400 mt-1">or click to browse</p>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {error}
            </div>
          )}

          {/* Upload button */}
          {(state === 'ready' || state === 'uploading') && validated && (
            <div className="mt-6">
              {state === 'uploading' ? (
                <div>
                  <div className="flex justify-between text-xs text-stone-500 mb-1.5">
                    <span>Uploading…</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full transition-all duration-200"
                      style={{ width: `${progress}%`, backgroundColor: '#1A6B5A' }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleUpload}
                  className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                  style={{ backgroundColor: '#1A6B5A' }}
                  onMouseOver={e => (e.currentTarget.style.backgroundColor = '#155a4a')}
                  onMouseOut={e => (e.currentTarget.style.backgroundColor = '#1A6B5A')}
                >
                  Upload episode
                </button>
              )}
            </div>
          )}

          {/* Done state */}
          {state === 'done' && episodeId && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#f0faf7' }}>
                <svg className="w-6 h-6" style={{ color: '#1A6B5A' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-stone-800">Upload complete</p>
                <p className="text-xs text-stone-400 mt-0.5">{validated?.file.name}</p>
              </div>
              <button
                onClick={() => router.push(`/upload/metadata?episode=${episodeId}`)}
                className="mt-2 px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: '#1A6B5A' }}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = '#155a4a')}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = '#1A6B5A')}
              >
                Continue →
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
