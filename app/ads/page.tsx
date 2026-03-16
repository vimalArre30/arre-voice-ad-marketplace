import { createClient } from '@/lib/supabase/server'

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

function fmtDuration(s: number) {
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default async function AdLibraryPage() {
  const supabase = createClient()

  const { data: ads, error } = await supabase
    .from('ads')
    .select('id, title, brand_name, category, duration_seconds, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-[#F8F7F4] px-4 pt-10 pb-20">
      <div className="w-full max-w-[640px] mx-auto">

        <h1 className="text-2xl font-semibold text-stone-900 mb-1">Ad Library</h1>
        <p className="text-sm text-stone-500 mb-8">All uploaded ads across episodes</p>

        {error && (
          <p className="text-sm text-red-500 mb-6">Could not load ads: {error.message}</p>
        )}

        {!error && (!ads || ads.length === 0) ? (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-10 text-center">
            <p className="text-sm text-stone-400">No ads uploaded yet.</p>
            <p className="text-xs text-stone-400 mt-1">Upload an ad from the Ad Placement page of any episode.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {(ads ?? []).map((ad) => {
              const c = CATEGORY_COLOURS[ad.category] ?? DEFAULT_COLOUR
              return (
                <div key={ad.id} className="bg-white rounded-xl border border-stone-100 shadow-sm px-4 py-4 flex items-center gap-4">
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-900 truncate">{ad.title}</p>
                    <p className="text-xs text-stone-400 mt-0.5">{ad.brand_name} · {fmtDuration(ad.duration_seconds)}</p>
                  </div>
                  {/* Badge */}
                  <span className={`shrink-0 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>
                    {ad.category}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
