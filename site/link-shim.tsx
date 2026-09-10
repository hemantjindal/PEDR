/**
 * `next/link`, for a page with no Next runtime under it.
 */
import * as React from 'react'

export function toHash(href: string): string {
  return href.startsWith('/') ? `#${href}` : href
}

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

export default function Link({ href, children, ...rest }: Props) {
  return <a href={toHash(href)} {...rest}>{children}</a>
}
