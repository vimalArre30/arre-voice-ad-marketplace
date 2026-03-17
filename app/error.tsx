'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-[60vh] bg-[#F8F7F4] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-stone-100 shadow-sm p-8 text-center flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-stone-900">Something went wrong</p>
          <p className="text-xs text-stone-500 mt-1 max-w-xs mx-auto">
            {error.message || 'An unexpected error occurred. Please try again.'}
          </p>
        </div>
        <button
          onClick={reset}
          className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: '#1A6B5A' }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#155a4a')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1A6B5A')}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
