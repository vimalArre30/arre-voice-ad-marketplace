import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServiceClient } from '@/lib/supabase/service'
import type { TranscriptSegment } from '@/lib/database.types'

// Raise Next.js route timeout to 5 minutes (Vercel Pro/Enterprise max: 300s)
export const maxDuration = 300

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const SIZE_THRESHOLD = 20 * 1024 * 1024 // 20 MB — stay under Whisper's 25 MB limit
const CHUNK_DURATION_SEC = 10 * 60      // 10 minutes per chunk

// ---------------------------------------------------------------------------
// Transcribe a single buffer. Returns segments with timestamps offset by
// `offsetSeconds` so callers can stitch multi-chunk results together.
// ---------------------------------------------------------------------------
async function transcribeChunk(
  buf: Buffer,
  mimeType: string,
  filename: string,
  offsetSeconds: number
): Promise<TranscriptSegment[]> {
  // Convert Buffer → Uint8Array so it's a valid BlobPart in strict TS
  const file = new File([new Uint8Array(buf)], filename, { type: mimeType })

  // verbose_json gives per-segment start/end timestamps
  const response = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  })

  type VerboseSegment = { start: number; end: number; text: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const segments: VerboseSegment[] = (response as any).segments ?? []

  return segments
    .filter((s) => s.text.trim().length > 0)
    .map((s) => ({
      timestamp_seconds: Math.round(s.start + offsetSeconds),
      text: s.text.trim(),
    }))
}

// ---------------------------------------------------------------------------
// Split a buffer into ~10-minute slices using a byte-rate estimate derived
// from the known total duration. Works for CBR/VBR MP3, M4A, AAC, WAV.
// ---------------------------------------------------------------------------
function splitBuffer(
  buf: Buffer,
  totalDurationSec: number
): Array<{ chunk: Buffer; offsetSeconds: number }> {
  const bytesPerSec = buf.length / totalDurationSec
  const chunkBytes = Math.floor(bytesPerSec * CHUNK_DURATION_SEC)
  const result: Array<{ chunk: Buffer; offsetSeconds: number }> = []

  let byteOffset = 0
  let timeOffset = 0

  while (byteOffset < buf.length) {
    const end = Math.min(byteOffset + chunkBytes, buf.length)
    result.push({ chunk: buf.slice(byteOffset, end), offsetSeconds: timeOffset })
    byteOffset = end
    timeOffset += CHUNK_DURATION_SEC
  }

  return result
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

    // ── 1. Fetch episode row ───────────────────────────────────────────────
    const { data: episodeRaw, error: fetchErr } = await supabase
      .from('episodes')
      .select('audio_url, duration_seconds')
      .eq('id', episodeId)
      .single()

    if (fetchErr || !episodeRaw) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
    }

    const episode = episodeRaw as { audio_url: string | null; duration_seconds: number | null }

    if (!episode.audio_url) {
      return NextResponse.json({ error: 'Episode has no audio URL' }, { status: 400 })
    }

    // ── 2. Download audio ──────────────────────────────────────────────────
    const audioRes = await fetch(episode.audio_url)
    if (!audioRes.ok) {
      throw new Error(`Failed to download audio: HTTP ${audioRes.status}`)
    }

    const arrayBuffer = await audioRes.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const mimeType = audioRes.headers.get('content-type') || 'audio/mpeg'
    const ext = episode.audio_url.split('.').pop()?.split('?')[0] || 'mp3'

    // ── 3. Transcribe (direct or chunked) ─────────────────────────────────
    let allSegments: TranscriptSegment[] = []

    if (buffer.length <= SIZE_THRESHOLD) {
      allSegments = await transcribeChunk(buffer, mimeType, `episode.${ext}`, 0)
    } else {
      const durationSec = episode.duration_seconds ?? 3600
      const chunks = splitBuffer(buffer, durationSec)

      for (let i = 0; i < chunks.length; i++) {
        const { chunk, offsetSeconds } = chunks[i]
        const segments = await transcribeChunk(
          chunk,
          mimeType,
          `chunk_${i}.${ext}`,
          offsetSeconds
        )
        allSegments = allSegments.concat(segments)
      }
    }

    // ── 4. Save transcript → status = 'transcribed' ───────────────────────
    const { error: updateErr } = await supabase
      .from('episodes')
      .update({ transcript: allSegments, status: 'transcribed' })
      .eq('id', episodeId)

    if (updateErr) throw new Error(updateErr.message)

    // ── 5. Trigger detect-moments (non-blocking) ──────────────────────────
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'

    fetch(`${appUrl}/api/detect-moments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episode_id: episodeId }),
    }).catch((e) => console.error('[transcribe] detect-moments trigger failed:', e))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[transcribe] error:', err)

    if (episodeId) {
      try {
        await supabase
          .from('episodes')
          .update({ status: 'error' })
          .eq('id', episodeId)
      } catch { /* best-effort — don't mask original error */ }
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Transcription failed' },
      { status: 500 }
    )
  }
}
