'use server'

import { redirect } from 'next/navigation'
import { createSession, setSessionCookie, signIn, signUp } from '@/lib/auth'

export interface FormState {
  error?: string
  values?: { email?: string; name?: string }
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const result = await signIn({ email, password })
  if (!result.ok) return { error: result.error, values: { email } }

  await setSessionCookie(await createSession(result.userId))
  redirect('/dashboard')
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '')
  const name = String(formData.get('name') ?? '')
  const password = String(formData.get('password') ?? '')

  const result = await signUp({ email, password, name })
  if (!result.ok) return { error: result.error, values: { email, name } }

  await setSessionCookie(await createSession(result.userId))
  redirect('/welcome')
}
