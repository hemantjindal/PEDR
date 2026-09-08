import { isDateOnlyLine, resolveDatePhrase, type DateContext } from './dates'
import type { DateKey } from '../pedr/week'

/**
 * Reading a Microsoft Teams conversation.
 *
 * There is no single Teams export format. What people actually do is select a
 * conversation and press copy, and what comes out depends on the client, the
 * browser and the day. So this handles the four shapes that turn up in
 * practice, plus meeting transcripts, and ignores anything it cannot place
 * rather than guessing.
 *
 * Chat is noisy evidence. Everything derived from it comes back at moderate
 * confidence so it lands in review rather than going straight onto a record a
 * mentor has to sign.
 */

export interface TeamsMessage {
  author: string
  date: DateKey | null
  time: string | null
  text: string
  line: number
}

export interface TeamsParse {
  messages: TeamsMessage[]
  /** Distinct participants, in order of first appearance. */
  participants: string[]
  /** Whose messages we treated as the user's own. */
  me: string | null
  warnings: string[]
}

const TIME = String.raw`(\d{1,2}[:.]\d{2})\s*(am|pm)?`

/** "Sarah Chen  10:32 AM" or "Sarah Chen 10:32" */
const NAME_THEN_TIME = new RegExp(String.raw`^\s*([^\d[\]<>|]{2,60}?)\s{1,}${TIME}\s*$`, 'i')

/**
 * "[10:32 AM] Sarah Chen: message" or "[10:32] Sarah Chen" with the message on
 * the next line. The remainder is split in code rather than by one regex: a
 * lazy name group with an optional colon after it matches two characters and
 * calls the rest of the name the message.
 */
const BRACKET_TIME = new RegExp(String.raw`^\s*\[\s*${TIME}\s*\]\s*(.*)$`, 'i')

/** "Sarah Chen, 8 September 2026 10:32" */
const NAME_COMMA_DATE = new RegExp(String.raw`^\s*([^,\d]{2,60}?),\s*(.+?)\s+${TIME}\s*$`, 'i')

/** A bare time on its own line, under a name. */
const TIME_ONLY = new RegExp(String.raw`^\s*${TIME}\s*$`, 'i')

/** WebVTT-style meeting transcript: "<v Sarah Chen>text</v>" */
const VTT_SPEAKER = /^\s*<v\s+([^>]{2,60})>(.*?)(?:<\/v>)?\s*$/i

/** Lines Teams inserts that are not messages. */
const CHROME = [
  /^\s*$/,
  /^\s*(unread|new messages|today|edited|forwarded|replied to|reacted)\b/i,
  /^\s*\d+\s+repl(y|ies)\s*$/i,
  /^\s*-{3,}\s*$/,
  /^\s*\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*-->/, // VTT cue timing
  /^\s*WEBVTT\s*$/i,
  /^\s*\d+\s*$/, // VTT cue numbers
]

/** Acknowledgements that are not evidence of anything. */
const NOISE = new Set([
  'ok', 'okay', 'k', 'thanks', 'thank you', 'thx', 'ta', 'cheers', 'great', 'perfect',
  'sure', 'yes', 'yep', 'yeah', 'no', 'nope', 'np', 'no problem', 'sounds good',
  'will do', 'morning', 'good morning', 'afternoon', 'hi', 'hello', 'hey', 'bye',
  'got it', 'understood', 'noted', 'agreed', 'nice', 'lol', 'haha', 'sorry',
])

export function parseTeams(raw: string, ctx: DateContext & { me?: string }): TeamsParse {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const messages: TeamsMessage[] = []
  const warnings: string[] = []

  let currentDate: DateKey | null = null
  let pendingAuthor: string | null = null
  let current: TeamsMessage | null = null

  const flush = () => {
    if (current && current.text.trim()) {
      current.text = current.text.trim()
      messages.push(current)
    }
    current = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (CHROME.some((re) => re.test(line))) {
      // A blank line ends a message but does not end the conversation.
      if (/^\s*$/.test(line)) flush()
      continue
    }

    // A date on its own line is a day separator for everything under it.
    if (isDateOnlyLine(line, { ...ctx, weekStart: null })) {
      const resolved = resolveDatePhrase(line, ctx)
      if (resolved.date) {
        flush()
        currentDate = resolved.date
        pendingAuthor = null
        continue
      }
    }

    const vtt = VTT_SPEAKER.exec(line)
    if (vtt) {
      flush()
      current = { author: clean(vtt[1]), date: currentDate, time: null, text: vtt[2], line: i + 1 }
      continue
    }

    const bracket = BRACKET_TIME.exec(line)
    if (bracket) {
      const rest = (bracket[3] ?? '').trim()
      const colon = rest.indexOf(':')
      const hasName = colon > 0 && colon <= 60
      flush()
      pendingAuthor = clean(hasName ? rest.slice(0, colon) : rest)
      current = {
        author: pendingAuthor,
        date: currentDate,
        time: normaliseTime(bracket[1], bracket[2]),
        text: hasName ? rest.slice(colon + 1).trim() : '',
        line: i + 1,
      }
      continue
    }

    const commaDate = NAME_COMMA_DATE.exec(line)
    if (commaDate) {
      const inner = resolveDatePhrase(commaDate[2], ctx)
      flush()
      pendingAuthor = clean(commaDate[1])
      current = {
        author: pendingAuthor,
        date: inner.date ?? currentDate,
        time: normaliseTime(commaDate[3], commaDate[4]),
        text: '',
        line: i + 1,
      }
      continue
    }

    const nameTime = NAME_THEN_TIME.exec(line)
    if (nameTime && looksLikeName(nameTime[1])) {
      flush()
      pendingAuthor = clean(nameTime[1])
      current = {
        author: pendingAuthor,
        date: currentDate,
        time: normaliseTime(nameTime[2], nameTime[3]),
        text: '',
        line: i + 1,
      }
      continue
    }

    // A bare time under a name line: "Sarah Chen" then "10:32".
    const timeOnly = TIME_ONLY.exec(line)
    if (timeOnly && pendingAuthor) {
      if (current) current.time = normaliseTime(timeOnly[1], timeOnly[2])
      continue
    }

    // A name on its own, with the time on the next line.
    if (!current && looksLikeName(line) && line.trim().split(/\s+/).length <= 4) {
      pendingAuthor = clean(line)
      current = { author: pendingAuthor, date: currentDate, time: null, text: '', line: i + 1 }
      continue
    }

    if (current) {
      current.text += (current.text ? ' ' : '') + line.trim()
    } else if (pendingAuthor) {
      current = { author: pendingAuthor, date: currentDate, time: null, text: line.trim(), line: i + 1 }
    }
    // Otherwise it is a line before any author was established: drop it.
  }
  flush()

  const participants: string[] = []
  for (const m of messages) if (!participants.includes(m.author)) participants.push(m.author)

  let me = ctx.me ?? null
  if (me && !participants.some((p) => p.toLowerCase() === me!.toLowerCase())) {
    warnings.push(
      `"${me}" does not appear in this conversation. Check the name matches your Teams display name.`,
    )
    me = null
  }
  if (!me && participants.length > 0) {
    // Nobody told us who they are. The person who talks most in a conversation
    // they exported is usually them, but say so rather than assuming silently.
    me = mostFrequentAuthor(messages)
    warnings.push(
      `Assumed you are "${me}" because they sent the most messages. Set your Teams display name to be sure.`,
    )
  }

  if (messages.length === 0) {
    warnings.push('No messages recognised. Paste the conversation including the sender names and times.')
  }
  if (messages.some((m) => m.date === null)) {
    warnings.push('Some messages had no date and were filed under the date of the dump.')
  }

  return { messages, participants, me, warnings }
}

/** True when a message says nothing — an acknowledgement or an emoji. */
export function isNoise(text: string): boolean {
  const stripped = text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  if (!stripped) return true
  if (NOISE.has(stripped)) return true
  return stripped.split(' ').filter(Boolean).length < 3
}

function looksLikeName(text: string): boolean {
  const t = text.trim().replace(/[:,]$/, '')
  if (!t || t.length > 60) return false
  if (/[.!?]$/.test(t)) return false
  const words = t.split(/\s+/)
  if (words.length > 4) return false
  // Every word starts with a capital, which is what a display name looks like.
  return words.every((w) => /^[\p{Lu}]/u.test(w) || /^[('"]/.test(w))
}

function clean(name: string): string {
  return name.trim().replace(/[:,]+$/, '').replace(/\s+/g, ' ')
}

function normaliseTime(time: string | undefined, meridiem: string | undefined): string | null {
  if (!time) return null
  const [h, m] = time.replace('.', ':').split(':')
  let hour = Number(h)
  const mer = meridiem?.toLowerCase()
  if (mer === 'pm' && hour < 12) hour += 12
  if (mer === 'am' && hour === 12) hour = 0
  if (hour > 23 || Number(m) > 59) return null
  return `${String(hour).padStart(2, '0')}:${m}`
}

function mostFrequentAuthor(messages: TeamsMessage[]): string {
  const counts = new Map<string, number>()
  for (const m of messages) counts.set(m.author, (counts.get(m.author) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}
