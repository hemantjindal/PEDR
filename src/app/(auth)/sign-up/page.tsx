import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { AuthForm } from '../form'
import { signUpAction } from '../actions'
import { PendingSummary } from '../pending'
import { REQUIREMENTS, SHEET_RULES } from '@/lib/pedr/constants'

export const metadata: Metadata = {
  title: 'Create your account · PEDR',
  description: 'Keep your practical experience record in one place, from now until Part 3.',
}

export default async function SignUpPage() {
  if (await getUser()) redirect('/dashboard')

  return (
    <div className="stack-l">
      <div className="stack-s">
        <h1>Create your account</h1>
      </div>

      {/* What they recovered a moment ago, so the form has a reason. */}
      <PendingSummary />

      <AuthForm action={signUpAction} submitLabel="Create account" mode="sign-up" />

      <dl className="facts">
        <div>
          <dt>You need</dt>
          <dd>{REQUIREMENTS.minTotalMonths} months</dd>
        </div>
        <div>
          <dt>Recorded across</dt>
          <dd>{SHEET_RULES.requiredSheets} sheets</dd>
        </div>
        <div>
          <dt>Each one due</dt>
          <dd>{SHEET_RULES.submitWithinMonths} months after its quarter</dd>
        </div>
      </dl>

      <p className="small faint">
        Already have an account?{' '}
        <Link href="/sign-in" style={{ color: 'var(--ink)' }}>Sign in</Link>
      </p>
    </div>
  )
}
