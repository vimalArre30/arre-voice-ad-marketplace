import Link from 'next/link'

export default function Nav() {
  return (
    <header className="w-full border-b border-stone-200 bg-[#F8F7F4]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight text-stone-900">
          Arré Voice
        </Link>
        <nav className="flex items-center gap-6">
          <Link
            href="/upload"
            className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
          >
            Creator
          </Link>
          <Link
            href="/search"
            className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
          >
            Brands
          </Link>
        </nav>
      </div>
    </header>
  )
}
