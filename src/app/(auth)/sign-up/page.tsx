import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { AuthForm } from '../form'
import { signUpAction } from '../actions'

export const metadata = { title: 'Create an account · PEDR' }

export default async function SignUpPage() {
  if (await getUser()) redirect('/dashboard')

  return (
    <div className="stack-l">
      <div className="stack-s">
        <div className="row">
          <span className="brand-mark">P</span>
          <h1>Create an account</h1>
        </div>
        <p className="dim">
          Everything stays in your own account. Nothing is shared with anyone unless you export it.
        </p>
      </div>

      <AuthForm action={signUpAction} submitLabel="Create account" mode="sign-up" />

      <p className="small muted">
        Already have one? <Link href="/sign-in" style={{ color: 'var(--accent)' }}>Sign in</Link>.
      </p>
    </div>
  )
}
