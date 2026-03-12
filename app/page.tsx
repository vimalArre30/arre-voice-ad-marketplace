export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-24">
      <h1 className="text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl">
        Arré Voice Ad Marketplace
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-stone-600">
        An AI-powered contextual podcast ad platform. Upload your episode, get instant
        transcription and topic analysis, then match with brands whose message fits your
        audience — automatically.
      </p>
      <div className="mt-10 flex gap-4">
        <a
          href="/upload"
          className="rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
        >
          I&apos;m a Creator
        </a>
        <a
          href="/search"
          className="rounded-lg border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100 transition-colors"
        >
          I&apos;m a Brand
        </a>
      </div>
    </div>
  )
}
