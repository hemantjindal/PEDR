import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'

export default async function Root() {
  const user = await getUser()
  redirect(user ? '/dashboard' : '/sign-in')
}
