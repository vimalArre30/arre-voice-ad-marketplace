'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { updateEpisodeMetadata } from '@/app/actions/episodes'
import type { Database } from '@/lib/database.types'

type Category = Database['public']['Tables']['episodes']['Row']['category']
type AudienceTier = Database['public']['Tables']['episodes']['Row']['audience_tier']
type AgeGroup = Database['public']['Tables']['episodes']['Row']['age_group']
type Gender = Database['public']['Tables']['episodes']['Row']['gender']

const CATEGORIES: { label: string; value: Category }[] = [
  { label: 'Finance', value: 'finance' },
  { label: 'Business', value: 'business' },
  { label: 'Tech', value: 'tech' },
  { label: 'Health', value: 'health' },
  { label: 'Travel', value: 'travel' },
  { label: 'Food', value: 'food' },
  { label: 'Culture', value: 'culture' },
  { label: 'Sports', value: 'sports' },
  { label: 'Entertainment', value: 'entertainment' },
  { label: 'Education', value: 'education' },
]

const AUDIENCE_TIERS: { label: string; value: AudienceTier }[] = [
  { label: 'Metro', value: 'metro' },
  { label: 'Tier 1', value: 'tier1' },
  { label: 'Tier 2', value: 'tier2' },
  { label: 'National', value: 'national' },
]

const AGE_GROUPS: { label: string; value: AgeGroup }[] = [
  { label: '18–24', value: '18-24' },
  { label: '25–34', value: '25-34' },
  { label: '35–44', value: '35-44' },
  { label: '45–54', value: '45-54' },
  { label: '55+', value: '55+' },
]

const GENDERS: { label: string; value: Gender }[] = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Mixed', value: 'mixed' },
]

const GEO_SUGGESTIONS = ['Mumbai', 'Delhi', 'Bengaluru', 'Chennai', 'Hyderabad', 'Pan-India']

interface FormValues {
  creatorName: string
  title: string
  category: Category | ''
  audienceTier: AudienceTier | ''
  geography: string
  ageGroup: AgeGroup | ''
  gender: Gender | ''
}

interface FormErrors {
  creatorName?: string
  title?: string
  category?: string
  audienceTier?: string
  geography?: string
  ageGroup?: string
  gender?: string
}

const inputClass =
  'w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#1A6B5A]/30 focus:border-[#1A6B5A]'

const labelClass = 'block text-sm font-medium text-stone-700 mb-1.5'

const errorClass = 'mt-1 text-xs text-red-500'

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className={errorClass}>{msg}</p>
}

function MetadataForm() {
  const router = useRouter()
  const params = useSearchParams()
  const episodeId = params.get('episode')

  const [values, setValues] = useState<FormValues>({
    creatorName: '',
    title: '',
    category: '',
    audienceTier: '',
    geography: '',
    ageGroup: '',
    gender: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const set = (field: keyof FormValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
    setErrors((er) => ({ ...er, [field]: undefined }))
  }

  function validate(): FormErrors {
    const e: FormErrors = {}
    if (!values.creatorName.trim()) e.creatorName = 'Creator name is required'
    if (!values.title.trim()) e.title = 'Episode title is required'
    if (!values.category) e.category = 'Please select a category'
    if (!values.audienceTier) e.audienceTier = 'Please select an audience tier'
    if (!values.geography.trim()) e.geography = 'Primary geography is required'
    if (!values.ageGroup) e.ageGroup = 'Please select an age group'
    if (!values.gender) e.gender = 'Please select a gender'
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!episodeId) return

    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    const result = await updateEpisodeMetadata(episodeId, {
      creator_name: values.creatorName.trim(),
      title: values.title.trim(),
      category: values.category as Category,
      audience_tier: values.audienceTier as AudienceTier,
      geography: values.geography.trim(),
      age_group: values.ageGroup as AgeGroup,
      gender: values.gender as Gender,
    })

    if (result.error) {
      setSubmitError(result.error)
      setSubmitting(false)
      return
    }

    // Fire transcription job (non-blocking — we don't await the response)
    fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episode_id: episodeId }),
    }).catch(() => {})

    router.push(`/episodes/${episodeId}`)
  }

  // Guard: no episode_id in query
  if (!episodeId) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-start justify-center pt-16 px-4">
        <div className="w-full max-w-[640px]">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 text-center">
            <p className="text-sm text-red-500">Missing episode ID. Please go back and upload your episode first.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4] flex items-start justify-center pt-12 pb-20 px-4">
      <div className="w-full max-w-[640px]">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-stone-400 mb-6 select-none">
          <span className="text-stone-400">Upload</span>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-stone-800 font-medium">Metadata</span>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-stone-400">Analysis</span>
        </nav>

        <h1 className="text-2xl font-semibold text-stone-900 mb-1">Episode details</h1>
        <p className="text-sm text-stone-500 mb-8">Tell us about your episode so we can match the right ads.</p>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8">
          <form onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-5">

              {/* Creator Name */}
              <div>
                <label className={labelClass}>Creator Name</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. The Seen & The Unseen"
                  value={values.creatorName}
                  onChange={set('creatorName')}
                />
                <FieldError msg={errors.creatorName} />
              </div>

              {/* Episode Title */}
              <div>
                <label className={labelClass}>Episode Title</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. The Rise of Indian Podcasting"
                  value={values.title}
                  onChange={set('title')}
                />
                <FieldError msg={errors.title} />
              </div>

              {/* Category */}
              <div>
                <label className={labelClass}>Category</label>
                <select
                  className={inputClass}
                  value={values.category}
                  onChange={set('category')}
                >
                  <option value="">Select a category</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <FieldError msg={errors.category} />
              </div>

              {/* Audience Tier */}
              <div>
                <label className={labelClass}>Audience Tier</label>
                <select
                  className={inputClass}
                  value={values.audienceTier}
                  onChange={set('audienceTier')}
                >
                  <option value="">Select audience tier</option>
                  {AUDIENCE_TIERS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <FieldError msg={errors.audienceTier} />
              </div>

              {/* Primary Geography */}
              <div>
                <label className={labelClass}>Primary Geography</label>
                <input
                  type="text"
                  list="geo-suggestions"
                  className={inputClass}
                  placeholder="e.g. Mumbai"
                  value={values.geography}
                  onChange={set('geography')}
                />
                <datalist id="geo-suggestions">
                  {GEO_SUGGESTIONS.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
                <FieldError msg={errors.geography} />
              </div>

              {/* Age Group */}
              <div>
                <label className={labelClass}>Age Group</label>
                <select
                  className={inputClass}
                  value={values.ageGroup}
                  onChange={set('ageGroup')}
                >
                  <option value="">Select age group</option>
                  {AGE_GROUPS.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
                <FieldError msg={errors.ageGroup} />
              </div>

              {/* Primary Gender */}
              <div>
                <label className={labelClass}>Primary Gender</label>
                <select
                  className={inputClass}
                  value={values.gender}
                  onChange={set('gender')}
                >
                  <option value="">Select gender</option>
                  {GENDERS.map((g) => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
                <FieldError msg={errors.gender} />
              </div>

            </div>

            {/* Submit error */}
            {submitError && (
              <div className="mt-5 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {submitError}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="mt-7 w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#1A6B5A' }}
              onMouseOver={(e) => { if (!submitting) e.currentTarget.style.backgroundColor = '#155a4a' }}
              onMouseOut={(e) => { if (!submitting) e.currentTarget.style.backgroundColor = '#1A6B5A' }}
            >
              {submitting ? 'Saving…' : 'Save & Analyse'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function MetadataPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#1A6B5A] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <MetadataForm />
    </Suspense>
  )
}
