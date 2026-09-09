import { redirect } from 'next/navigation'
import { Onboarding } from '@/components/onboarding'
import { requireUser } from '@/lib/auth'
import { todayKey } from '@/lib/pedr/week'
import { completeOnboardingAction, skipOnboardingAction } from '../actions'

export const metadata = { title: 'Setting up · PEDR' }
export const dynamic = 'force-dynamic'

export default async function StartPage() {
  const user = await requireUser()
  // Somebody who has already done this, or skipped it, does not get asked again.
  if (user.onboardedAt) redirect('/dashboard')

  return (
    <Onboarding
      name={user.name}
      today={todayKey()}
      action={completeOnboardingAction}
      skipAction={skipOnboardingAction}
    />
  )
}
