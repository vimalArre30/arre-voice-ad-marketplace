'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/upload',   label: 'Creator' },
  { href: '/episodes', label: 'My Episodes' },
  { href: '/search',   label: 'Brands' },
  { href: '/ads',      label: 'Ad Library' },
]

export default function Nav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <header className="w-full border-b border-stone-200 bg-[#F8F7F4] sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-stone-900"
          onClick={() => setOpen(false)}
        >
          Arré Voice
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-6">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={[
                'text-sm font-medium transition-colors',
                isActive(l.href)
                  ? 'text-[#1A6B5A]'
                  : 'text-stone-600 hover:text-stone-900',
              ].join(' ')}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button
          className="sm:hidden p-2 -mr-2 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="sm:hidden border-t border-stone-100 bg-[#F8F7F4] px-6 py-2 flex flex-col">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={[
                'py-3 text-sm font-medium border-b border-stone-100 last:border-0 transition-colors',
                isActive(l.href) ? 'text-[#1A6B5A]' : 'text-stone-700 hover:text-stone-900',
              ].join(' ')}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
