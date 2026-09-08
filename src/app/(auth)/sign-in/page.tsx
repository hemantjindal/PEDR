import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { AuthForm } from '../form'
import { signInAction } from '../actions'

export const metadata = { title: 'Sign in · PEDR' }

export default async function SignInPage() {
  if (await getUser()) redirect('/dashboard')

  return (
    <div className="stack-l">
      <div className="stack-s">
        <div className="row">
          <span className="brand-mark">P</span>
          <h1>PEDR</h1>
        </div>
        <p className="dim">
          Log your practical experience as it happens, and let the record sheets write themselves.
        </p>
      </div>

      <AuthForm action={signInAction} submitLabel="Sign in" mode="sign-in" />

      <p className="small faint">
        No account yet? <Link href="/sign-up" style={{ color: 'var(--ink)' }}>Create one</Link>.
      </p>
    </div>
  )
}
