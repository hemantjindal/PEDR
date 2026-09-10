import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { AuthForm } from '../form'
import { signInAction } from '../actions'

export const metadata: Metadata = {
  title: 'Sign in · PEDR',
  description: 'Sign in to your practical experience record.',
}

export default async function SignInPage() {
  if (await getUser()) redirect('/dashboard')

  return (
    <div className="stack-l">
      <div className="stack-s">
        <span className="label">Welcome back</span>
        <h1>Sign in</h1>
      </div>

      <AuthForm action={signInAction} submitLabel="Sign in" mode="sign-in" />

      <p className="small faint">
        No account yet?{' '}
        <Link href="/sign-up" style={{ color: 'var(--ink)' }}>Create one</Link>
      </p>
    </div>
  )
}
