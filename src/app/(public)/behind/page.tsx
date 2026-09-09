import { Triage } from '@/components/triage'

export const metadata = {
  title: 'Am I in trouble? · PEDR',
  description:
    'Three questions and a straight answer about how far behind your PEDR really is, whether the ' +
    'time is recoverable, and what to do first. No account.',
}

export default function BehindPage() {
  return <Triage />
}
