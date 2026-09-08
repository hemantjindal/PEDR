'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import type { FormState } from './actions'

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
      {pending ? 'One moment…' : label}
    </button>
  )
}

export function AuthForm({
  action,
  submitLabel,
  mode,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  submitLabel: string
  mode: 'sign-in' | 'sign-up'
}) {
  const [state, formAction] = useActionState(action, {})

  return (
    <form action={formAction} className="card stack">
      {mode === 'sign-up' && (
        <div className="field">
          <label htmlFor="name">Your name</label>
          <input id="name" name="name" required autoComplete="name" defaultValue={state.values?.name} />
        </div>
      )}

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          defaultValue={state.values?.email}
        />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          minLength={mode === 'sign-up' ? 10 : undefined}
        />
        {mode === 'sign-up' && (
          <span className="hint">At least 10 characters. A phrase you will remember beats a clever short one.</span>
        )}
      </div>

      {state.error && (
        <p className="note note-critical small" role="alert">
          <span aria-hidden="true">⚠</span> {state.error}
        </p>
      )}

      <Submit label={submitLabel} />
    </form>
  )
}
