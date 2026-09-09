import { describe, expect, it } from 'vitest'
import { describeFeedUrl, FeedError, isPublicAddress, normaliseFeedUrl } from '@/lib/ingest/feed'

describe('normaliseFeedUrl', () => {
  it('accepts a published Outlook calendar link', () => {
    const url = normaliseFeedUrl(
      'https://outlook.office365.com/owa/calendar/abc123/reachcalendar.ics',
    )
    expect(url.hostname).toBe('outlook.office365.com')
  })

  it('rewrites the webcal:// link a Subscribe button gives you', () => {
    expect(normaliseFeedUrl('webcal://outlook.office365.com/owa/calendar/a/b.ics').protocol)
      .toBe('https:')
    expect(normaliseFeedUrl('webcals://p01.calendar.yahoo.com/x.ics').protocol).toBe('https:')
  })

  it('trims what people actually paste', () => {
    expect(normaliseFeedUrl('  https://calendar.google.com/calendar/ical/x/basic.ics  ').pathname)
      .toBe('/calendar/ical/x/basic.ics')
  })

  it('refuses plain http, because the link is a credential', () => {
    expect(() => normaliseFeedUrl('http://example.com/cal.ics')).toThrow(FeedError)
    expect(() => normaliseFeedUrl('http://example.com/cal.ics')).toThrow(/not secure/i)
  })

  it('refuses schemes that are not the web', () => {
    expect(() => normaliseFeedUrl('file:///etc/passwd')).toThrow(FeedError)
    expect(() => normaliseFeedUrl('ftp://example.com/cal.ics')).toThrow(FeedError)
  })

  it('refuses localhost', () => {
    expect(() => normaliseFeedUrl('https://localhost/cal.ics')).toThrow(/points at this server/i)
  })

  it('asks for a link rather than throwing at nothing', () => {
    expect(() => normaliseFeedUrl('')).toThrow(/Paste your calendar link/i)
    expect(() => normaliseFeedUrl('my calendar')).toThrow(/does not look like a link/i)
  })
})

describe('isPublicAddress', () => {
  it('accepts ordinary public addresses', () => {
    expect(isPublicAddress('52.109.12.34')).toBe(true)
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true)
  })

  it('rejects loopback', () => {
    expect(isPublicAddress('127.0.0.1')).toBe(false)
    expect(isPublicAddress('::1')).toBe(false)
  })

  it('rejects the cloud metadata address', () => {
    // The one that hands out this host's credentials to anything that asks.
    expect(isPublicAddress('169.254.169.254')).toBe(false)
  })

  it('rejects private ranges', () => {
    expect(isPublicAddress('10.0.0.5')).toBe(false)
    expect(isPublicAddress('172.16.4.1')).toBe(false)
    expect(isPublicAddress('172.31.255.254')).toBe(false)
    expect(isPublicAddress('192.168.1.1')).toBe(false)
    expect(isPublicAddress('100.64.0.1')).toBe(false)
    expect(isPublicAddress('0.0.0.0')).toBe(false)
  })

  it('does not reject 172.32, which is public', () => {
    expect(isPublicAddress('172.32.0.1')).toBe(true)
    expect(isPublicAddress('172.15.0.1')).toBe(true)
  })

  it('rejects IPv6 private and link-local ranges', () => {
    expect(isPublicAddress('fe80::1')).toBe(false)
    expect(isPublicAddress('fd00::1')).toBe(false)
    expect(isPublicAddress('fc00::1')).toBe(false)
  })

  it('sees through an IPv4 address wearing an IPv6 hat', () => {
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false)
    expect(isPublicAddress('::ffff:10.0.0.1')).toBe(false)
    expect(isPublicAddress('::ffff:52.109.12.34')).toBe(true)
  })

  it('rejects anything that is not an address at all', () => {
    expect(isPublicAddress('example.com')).toBe(false)
    expect(isPublicAddress('')).toBe(false)
  })
})

describe('describeFeedUrl', () => {
  it('shows where a link points without printing the token in it', () => {
    const shown = describeFeedUrl(
      'https://outlook.office365.com/owa/calendar/9f3c2a1b8e7d6c5f4a3b2c1d/reachcalendar.ics',
    )
    expect(shown).toBe('outlook.office365.com/owa/calenda…')
    expect(shown).not.toContain('9f3c2a1b')
  })

  it('copes with something that is not a URL', () => {
    expect(describeFeedUrl('nonsense')).toBe('a calendar link')
  })
})
