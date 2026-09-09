import type { Metadata } from 'next'
import { Triage } from '@/components/triage'
import { absolute } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Am I in trouble? · PEDR',
  description:
    'Three questions and a straight answer about how far behind your PEDR really is, whether the ' +
    'time is recoverable, and what to do first. No account.',
  alternates: { canonical: absolute('/behind') },
  openGraph: {
    type: 'website',
    url: absolute('/behind'),
    title: 'How far behind on your PEDR are you, really?',
    description:
      'Three questions, about a minute, no account: how many sheets are late, whether the time ' +
      'is recoverable, and what to do first.',
  },
}

export default function BehindPage() {
  return <Triage />
}
