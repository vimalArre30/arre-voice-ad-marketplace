import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import Nav from '@/components/Nav'
import './globals.css'

export const metadata: Metadata = {
  title: 'Arré Voice Ad Marketplace',
  description: 'AI-powered contextual podcast ad platform connecting creators with brands.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-[#F8F7F4] antialiased">
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  )
}
