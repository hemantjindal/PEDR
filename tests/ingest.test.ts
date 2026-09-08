import { describe, expect, it } from 'vitest'
import { detectDumpKind, parseDump } from '@/lib/ingest'
import { matchProject } from '@/lib/ingest/projects'
import { isNoise, parseTeams } from '@/lib/ingest/teams'
import { looksLikeTimesheet, parseDelimited, parseTimesheet } from '@/lib/ingest/timesheet'
import type { Project } from '@/lib/pedr/types'

const projects: Project[] = [
  {
    id: 'p-bat', userId: 'u1', code: '1042', name: 'Battersea Square Phase 2',
    client: 'BSQ Developments', sector: 'Residential', valueGbp: 48_000_000,
    procurement: 'Two stage D&B', contractForm: 'JCT D&B 2016', isCaseStudy: true,
    notes: null, aliases: ['BSQ', 'Battersea'], archived: false, createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'p-nine', userId: 'u1', code: '1088', name: 'Nine Elms Fit-Out',
    client: null, sector: 'Commercial', valueGbp: null, procurement: null, contractForm: null,
    isCaseStudy: false, notes: null, aliases: ['Nine Elms'], archived: false,
    createdAt: '2025-01-01T00:00:00Z',
  },
]

// Friday of the week beginning Monday 7 September 2026.
const reference = '2026-09-11'
const opts = { reference, projects, me: 'Hemant Jindal' }

// ---------------------------------------------------------------------------

describe('detectDumpKind', () => {
  it('spots a delimited timesheet export', () => {
    expect(detectDumpKind('Date,Project,Hours\n07/09/2026,1042,3.5\n08/09/2026,1088,7.5')).toBe('timesheet')
  })

  it('spots a Teams conversation', () => {
    expect(detectDumpKind(
      'Sarah Chen  10:32\nCan you send the detail\n\nTom Reilly  10:40\nOn it now, give me an hour',
    )).toBe('teams')
  })

  it('treats anything else as prose', () => {
    expect(detectDumpKind('Mon - site visit\nTue - tender package')).toBe('freeform')
  })

  it('does not mistake prose containing a comma for a table', () => {
    expect(detectDumpKind(
      'Monday, went to site, met the contractor, and reviewed the drawings, then went back.',
    )).not.toBe('timesheet')
  })

  it('handles an empty dump without throwing', () => {
    expect(detectDumpKind('   ')).toBe('unknown')
    expect(parseDump('   ', opts).entries).toEqual([])
  })
})

// ---------------------------------------------------------------------------

describe('a real, badly typed weekly dump', () => {
  const raw = `w/c 7 Sep
mon - battersea, worked up the stair details with Tom. 4h. sent the wrong revision first, had to reissue
tue: all day on 1042 tender package
wed — site visit nine elms with Sarah Chen from Mace.
thurs - cpd lunchtime talk on the building safety act
fri half day, planning submission for BSQ`

  const result = parseDump(raw, opts)
  const byDate = (d: string) => result.entries.filter((e) => e.date === d)

  it('reads it as prose and finds every day', () => {
    expect(result.kind).toBe('freeform')
    expect(result.stats.days).toBe(5)
    expect(result.entries).toHaveLength(5)
  })

  it('places each day in the week the header named', () => {
    expect(result.entries.map((e) => e.date)).toEqual([
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
    ])
  })

  it('matches projects through nicknames, codes and aliases', () => {
    expect(byDate('2026-09-07')[0].projectId).toBe('p-bat') // "battersea"
    expect(byDate('2026-09-08')[0].projectId).toBe('p-bat') // "1042"
    expect(byDate('2026-09-09')[0].projectId).toBe('p-nine') // "nine elms"
    expect(byDate('2026-09-11')[0].projectId).toBe('p-bat') // "BSQ"
  })

  it('reads the durations that were stated', () => {
    expect(byDate('2026-09-07')[0].minutes).toBe(240) // 4h
    expect(byDate('2026-09-08')[0].minutes).toBe(450) // all day
    expect(byDate('2026-09-11')[0].minutes).toBe(225) // half day
  })

  it('leaves durations at zero when none was given', () => {
    expect(byDate('2026-09-09')[0].minutes).toBe(0)
    expect(byDate('2026-09-09')[0].minutesEstimated).toBe(false)
  })

  it('catches the thing that went wrong', () => {
    expect(byDate('2026-09-07')[0].wentWrong).toMatch(/wrong revision/)
  })

  it('finds the people', () => {
    expect(byDate('2026-09-07')[0].people).toContain('Tom')
    expect(byDate('2026-09-09')[0].people).toContain('Sarah Chen')
  })

  it('infers work stages', () => {
    expect(byDate('2026-09-08')[0].stage).toBe(4) // tender package
    expect(byDate('2026-09-09')[0].stage).toBe(5) // site visit
    expect(byDate('2026-09-11')[0].stage).toBe(3) // planning submission
  })

  it('files CPD as Office Management, not as a project', () => {
    const thursday = byDate('2026-09-10')[0]
    expect(thursday.officeCategory).toBe('cpd')
    expect(thursday.projectId).toBeNull()
  })

  it('tags criteria', () => {
    expect(byDate('2026-09-11')[0].criteria).toContain('PC3') // planning
    expect(byDate('2026-09-08')[0].criteria).toContain('PC5') // tender
  })

  it('strips the duration out of the activity text', () => {
    expect(byDate('2026-09-08')[0].activity).not.toMatch(/all day/i)
    expect(byDate('2026-09-08')[0].activity).toMatch(/tender package/)
  })

  it('keeps a provenance trail back to the input line', () => {
    expect(byDate('2026-09-07')[0].provenance).toMatch(/^line 2:/)
  })
})

describe('durations, when you ask for them to be filled', () => {
  const raw = 'Mon - stair details for 1042\nMon - RFI response on the curtain wall'

  it('leaves blanks alone by default', () => {
    const result = parseDump(raw, opts)
    expect(result.entries.every((e) => e.minutes === 0)).toBe(true)
  })

  it('spreads a standard day and marks every invented minute', () => {
    const result = parseDump(raw, { ...opts, fillMissingDurations: true })
    expect(result.entries.map((e) => e.minutes)).toEqual([225, 225])
    expect(result.entries.every((e) => e.minutesEstimated)).toBe(true)
  })
})

describe('a dump with no dates at all', () => {
  const result = parseDump('Reviewed the contractor shop drawings for the stair balustrade', opts)

  it('files it under the day of the dump and says so', () => {
    expect(result.entries[0].date).toBe(reference)
    expect(result.warnings.join(' ')).toMatch(/No dates found/)
  })

  it('holds it back for review rather than accepting a guessed date', () => {
    expect(result.stats.needsReview).toBe(1)
  })
})

// ---------------------------------------------------------------------------

describe('Teams conversations', () => {
  const raw = `Monday, 7 September 2026
Sarah Chen  10:32
Can you send over the curtain wall head detail for 1042?

Hemant Jindal  10:45
Just issued it, RFI 042 response. The head condition does not work with the new soffit level so I have flagged it to the engineer.

Sarah Chen  10:47
thanks

Hemant Jindal  14:10
Spent the afternoon on the Nine Elms site inspection with Tom Reilly. Missed the drainage connection detail entirely, had to go back.`

  const result = parseDump(raw, opts)

  it('is recognised as a conversation', () => {
    expect(result.kind).toBe('teams')
  })

  it('records only your own messages as things you did', () => {
    expect(result.entries).toHaveLength(2)
    expect(result.entries.every((e) => e.source === 'teams')).toBe(true)
  })

  it('uses the day separator as the date', () => {
    expect(result.entries.every((e) => e.date === '2026-09-07')).toBe(true)
  })

  it('credits everyone in the thread as someone you dealt with', () => {
    expect(result.entries[0].people).toContain('Sarah Chen')
    expect(result.entries[1].people).toContain('Tom Reilly')
  })

  it('still finds the project, the stage and the mistake', () => {
    expect(result.entries[1].projectId).toBe('p-nine')
    expect(result.entries[1].stage).toBe(5)
    expect(result.entries[1].wentWrong).toMatch(/drainage connection/)
  })

  it('never lets chat go straight onto the record', () => {
    expect(result.entries.every((e) => e.confidence <= 0.5)).toBe(true)
    expect(result.stats.needsReview).toBe(2)
  })

  it('does not invent hours from a conversation', () => {
    expect(result.entries.every((e) => e.minutes === 0)).toBe(true)
  })

  it('reads the bracketed timestamp format too', () => {
    const parsed = parseTeams(
      '[10:32] Sarah Chen: send me the detail\n[10:40] Tom Reilly: on it',
      { reference },
    )
    expect(parsed.messages).toHaveLength(2)
    expect(parsed.messages[0]).toMatchObject({ author: 'Sarah Chen', time: '10:32' })
  })

  it('reads a meeting transcript', () => {
    const parsed = parseTeams(
      'WEBVTT\n\n1\n00:00:12.345 --> 00:00:18.900\n<v Sarah Chen>We need the head detail resolved</v>',
      { reference },
    )
    expect(parsed.messages[0]).toMatchObject({ author: 'Sarah Chen' })
    expect(parsed.messages[0].text).toMatch(/head detail/)
  })

  it('normalises 12-hour times', () => {
    const parsed = parseTeams('Sarah Chen  2:15 PM\nsent it over', { reference })
    expect(parsed.messages[0].time).toBe('14:15')
  })

  it('warns rather than guessing when it cannot find you', () => {
    const parsed = parseTeams('Sarah Chen  10:32\nhello there everyone', {
      reference, me: 'Someone Else',
    })
    expect(parsed.warnings.join(' ')).toMatch(/does not appear in this conversation/)
  })

  it('says so when it has guessed who you are', () => {
    const parsed = parseTeams(
      'Sarah Chen  10:32\nfirst message here\n\nSarah Chen  10:33\nsecond message here\n\nTom Reilly  10:34\nreply from tom',
      { reference },
    )
    expect(parsed.me).toBe('Sarah Chen')
    expect(parsed.warnings.join(' ')).toMatch(/Assumed you are/)
  })

  it('drops acknowledgements', () => {
    for (const text of ['thanks', 'ok', '👍', 'Sounds good', 'will do', '']) {
      expect(isNoise(text), text).toBe(true)
    }
    expect(isNoise('Issued the RFI response this morning')).toBe(false)
  })
})

// ---------------------------------------------------------------------------

describe('timesheet imports', () => {
  const csv = `Date,Job No,Project Name,Phase,Hours,Narrative
07/09/2026,1042,Battersea Square Phase 2,4,3.5,Stair balustrade details for tender
07/09/2026,1088,Nine Elms Fit-Out,5,4,Site inspection and snagging list
08/09/2026,1042,Battersea Square Phase 2,4,7.5,Tender package coordination`

  const result = parseDump(csv, opts)

  it('is recognised as a timesheet', () => {
    expect(looksLikeTimesheet(csv)).toBe(true)
    expect(result.kind).toBe('timesheet')
  })

  it('maps columns by name, whatever order they are in', () => {
    expect(result.entries).toHaveLength(3)
    expect(result.entries[0]).toMatchObject({
      date: '2026-09-07', minutes: 210, stage: 4, projectId: 'p-bat',
    })
    expect(result.entries[1]).toMatchObject({
      date: '2026-09-07', minutes: 240, stage: 5, projectId: 'p-nine',
    })
  })

  it('trusts structured data enough to accept it without review', () => {
    expect(result.stats.needsReview).toBe(0)
    expect(result.entries.every((e) => e.confidence >= 0.9)).toBe(true)
  })

  it('never marks imported hours as estimated', () => {
    expect(result.entries.every((e) => !e.minutesEstimated)).toBe(true)
  })

  it('says which columns it ignored rather than silently dropping them', () => {
    expect(result.warnings.join(' ')).toMatch(/Columns ignored: Project Name/)
  })

  it('reads tab-separated exports', () => {
    const tsv = 'Date\tProject\tHours\tNotes\n07/09/2026\t1042\t7.5\tTender package'
    expect(parseDump(tsv, opts).entries).toHaveLength(1)
  })

  it('reads hours written as a clock value', () => {
    const parsed = parseTimesheet('Date,Hours\n07/09/2026,7:30', { reference })
    expect(parsed.rows[0].minutes).toBe(450)
  })

  it('reports rows it could not date instead of dropping them silently', () => {
    const parsed = parseTimesheet(
      'Date,Hours\n07/09/2026,3\nnot a date,4', { reference },
    )
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.warnings.join(' ')).toMatch(/1 row skipped/)
  })

  it('refuses a file with no date column rather than importing nonsense', () => {
    const parsed = parseTimesheet('Project,Hours\n1042,7.5', { reference })
    expect(parsed.rows).toEqual([])
    expect(parsed.warnings.join(' ')).toMatch(/No date column/)
  })
})

describe('parseDelimited', () => {
  it('handles quoted fields containing the delimiter', () => {
    expect(parseDelimited('a,b\n"one, two",three')).toEqual([['a', 'b'], ['one, two', 'three']])
  })

  it('handles escaped quotes', () => {
    expect(parseDelimited('a\n"say ""hello"""')).toEqual([['a'], ['say "hello"']])
  })

  it('handles newlines inside quoted fields', () => {
    expect(parseDelimited('a,b\n"line one\nline two",x')).toEqual([
      ['a', 'b'], ['line one\nline two', 'x'],
    ])
  })

  it('strips a UTF-8 BOM', () => {
    expect(parseDelimited('﻿Date,Hours\n07/09/2026,3')[0][0]).toBe('Date')
  })
})

// ---------------------------------------------------------------------------

describe('matchProject', () => {
  it('matches on code, name, alias and a distinctive word', () => {
    expect(matchProject('worked on 1042 today', projects).projectId).toBe('p-bat')
    expect(matchProject('Battersea Square Phase 2 review', projects).projectId).toBe('p-bat')
    expect(matchProject('BSQ tender', projects).projectId).toBe('p-bat')
    expect(matchProject('the battersea job', projects).projectId).toBe('p-bat')
  })

  it('does not match a code inside a longer number', () => {
    expect(matchProject('invoice 104213 raised', projects).projectId).toBeNull()
  })

  it('tolerates a typo in a long name', () => {
    expect(matchProject('Batersea stair details', projects).projectId).toBe('p-bat')
  })

  it('ignores archived projects', () => {
    const archived = projects.map((p) => ({ ...p, archived: true }))
    expect(matchProject('worked on 1042 today', archived).projectId).toBeNull()
  })

  it('keeps an unrecognised project name as a hint', () => {
    const match = matchProject('Kings Cross - reviewed the shopfront details', projects)
    expect(match.projectId).toBeNull()
    expect(match.hint).toBe('Kings Cross')
  })

  it('does not turn a sentence opening into a project', () => {
    // The scorer awards points for naming a project, so a loose hint rule
    // would quietly award them for nothing.
    expect(matchProject('Just issued it - RFI 042 response', projects).hint).toBeNull()
    expect(matchProject('Spent the morning - mostly on details', projects).hint).toBeNull()
  })

  it('does not read a document reference as a job number', () => {
    expect(matchProject('responded to RFI 0421 today', projects).hint).toBeNull()
  })

  it('recognises office management time', () => {
    expect(matchProject('CPD seminar on fire safety', projects).officeCategory).toBe('cpd')
    expect(matchProject('annual leave', projects).officeCategory).toBe('leave')
  })
})
