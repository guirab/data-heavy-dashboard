import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

const TITLE = 'Federal spending gap — commitments vs. payments'
const DESCRIPTION =
  'Which Brazilian federal agencies commit money they don’t end up paying? 300k+ budget lines from Portal da Transparência, filtered and sorted in the browser.'

export const metadata: Metadata = {
  // Absolute URLs for og:url / canonical; the deploy sets NEXT_PUBLIC_SITE_URL to its own origin.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://data-heavy-dashboard.vercel.app'),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  // app/opengraph-image.png (+ .alt.txt) supplies the image tags via the file convention.
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/', siteName: 'Federal spending gap', type: 'website', locale: 'en_US' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

// Respect the OS color scheme before hydration (no theme toggle: fewer moving parts).
const themeScript = `if(window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')`

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
