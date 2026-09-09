/**
 * `next/link`, for a page with no Next runtime under it.
 *
 * The static site is one HTML file, so every in-app route becomes a hash. The
 * two routes that need an account cannot exist here at all, and pretending
 * otherwise with a dead link is worse than sending somebody to the working
 * demo, which is what those actually want to show them.
 */
import * as React from 'react'

export const DEMO_URL = 'https://claude.ai/code/artifact/5b9ae995-6d2c-4e1f-869a-fb60aa88e208'

export function toHash(href: string): string {
  if (!href.startsWith('/')) return href
  if (href === '/sign-up' || href === '/sign-in') return '#/app'
  return `#${href}`
}

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

export default function Link({ href, children, ...rest }: Props) {
  return <a href={toHash(href)} {...rest}>{children}</a>
}
