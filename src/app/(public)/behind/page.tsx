import type { Metadata } from 'next'
import Link from 'next/link'
import { CatchUpTool } from '@/components/catch-up-tool'
import { absolute } from '@/lib/site'

export const metadata: Metadata = {
  title: 'How far behind is your PEDR? · PEDR',
  description:
    'One date, then drop your calendar in. Your two years drawn as 104 week-squares, and the ' +
    'ones your calendar can still fill. Read in your browser, never uploaded.',
  alternates: { canonical: absolute('/behind') },
  openGraph: {
    type: 'website',
    url: absolute('/behind'),
    title: 'How far behind is your PEDR?',
    description: 'Your two years as 104 squares. Drop your calendar in and watch them fill.',
  },
}

export default function BehindPage() {
  return (
    <div className="stack-l">
      <CatchUpTool />
      <div className="strip" style={{ maxWidth: 620, marginInline: 'auto' }}>
        <Link href="/what-is-a-pedr">What a PEDR actually is</Link>
        <Link href="/guides">Answers</Link>
        <Link href="/sign-up">Keep a record</Link>
      </div>
    </div>
  )
}
