import { describe, expect, it } from 'vitest'
import { classify, splitSentences } from '@/lib/ingest/classify'
import { extractPeople } from '@/lib/ingest/people'

describe('stage inference', () => {
  const cases: Array<[string, number]> = [
    ['Site visit to check the blockwork and issued an RFI response', 5],
    ['Marked up the tender package and updated the NBS specification', 4],
    ['Worked up the concept massing options for the client presentation', 2],
    ['Compiled the planning application drawings for submission', 3],
    ['Walked the site inspection and answered the contractor technical query', 5],
    ['Attended practical completion inspection and issued the certificate', 6],
    ['Drafted the project brief and ran the site appraisal', 1],
    ['Post-occupancy evaluation walkaround with the facilities team', 7],
  ]

  it.each(cases)('%s -> stage %i', (text, expected) => {
    expect(classify(text).stage).toBe(expected)
  })

  it('returns no stage when the text says nothing about one', () => {
    const c = classify('Caught up on emails and timesheets')
    expect(c.stage).toBeNull()
    expect(c.stageConfidence).toBe(0)
  })

  it('is less confident when two stages are genuinely in play', () => {
    const clear = classify('Attended the site progress meeting and issued an architect instruction on site')
    const murky = classify('Tender')
    expect(clear.stageConfidence).toBeGreaterThan(murky.stageConfidence)
  })

  it('does not match a keyword inside a longer word', () => {
    // "AI" is an architect's instruction; "detail" must not trigger it.
    const c = classify('Drew the parapet detail')
    expect(c.stageScores['5']).toBe(0)
  })
})

describe('criteria inference', () => {
  it('tags contract administration as PC5', () => {
    expect(classify('Issued interim certificate and reviewed the contractor valuation').criteria)
      .toContain('PC5')
  })

  it('tags statutory work as PC3', () => {
    expect(classify('Submitted the building regulations application to building control').criteria)
      .toContain('PC3')
  })

  it('tags client work as PC2', () => {
    expect(classify('Prepared the fee proposal and presented the brief to the client').criteria)
      .toContain('PC2')
  })

  it('tags office management as PC4', () => {
    expect(classify('Updated the resourcing plan and ran the team workload meeting').criteria)
      .toContain('PC4')
  })

  it('tags conduct and ethics as PC1', () => {
    expect(classify('Reviewed the conflict of interest declaration against the ARB code of conduct').criteria)
      .toContain('PC1')
  })

  it('returns several criteria when the work genuinely spans them', () => {
    const c = classify(
      'Ran the client meeting on the fee variation, then submitted the planning application',
    )
    expect(c.criteria.length).toBeGreaterThanOrEqual(2)
    expect(c.criteria).toContain('PC2')
    expect(c.criteria).toContain('PC3')
  })

  it('never returns more than three, so a sheet stays readable', () => {
    const c = classify(
      'Client fee proposal, planning submission, ARB code of conduct, resourcing plan, JCT contract administration and tender analysis',
    )
    expect(c.criteria.length).toBeLessThanOrEqual(3)
  })

  it('returns nothing when nothing matches', () => {
    expect(classify('Tidied my desk').criteria).toEqual([])
  })
})

describe('friction detection', () => {
  it('picks out the sentence where something went wrong', () => {
    const c = classify(
      'Issued the stair details. Sent the wrong revision and had to reissue within the hour. Then updated the register.',
    )
    expect(c.wentWrong).toBe('Sent the wrong revision and had to reissue within the hour.')
  })

  it('catches the softer admissions too', () => {
    for (const text of [
      'I was completely out of my depth on the fire strategy discussion.',
      'The QS pushed back on my cost assumptions.',
      'Got confused between the two drawing registers.',
      'Should have checked the structural grid before issuing.',
    ]) {
      expect(classify(text).wentWrong, text).not.toBeNull()
    }
  })

  it('does not treat a denial as a confession', () => {
    expect(classify('Nothing went wrong this week.').wentWrong).toBeNull()
    expect(classify('No problems on site.').wentWrong).toBeNull()
  })

  it('returns null for a genuinely smooth week', () => {
    expect(classify('Issued the tender package on time and the client was happy.').wentWrong).toBeNull()
  })
})

describe('learning detection', () => {
  it('finds the sentence where something was learned', () => {
    const c = classify(
      'Sat in on the adjudication call. Learned that the contract administrator cannot vary the contract terms.',
    )
    expect(c.learned).toMatch(/^Learned that/)
  })

  it('recognises first-time experiences', () => {
    expect(classify('First time chairing a design team meeting on my own.').learned).not.toBeNull()
  })
})

describe('splitSentences', () => {
  it('splits on punctuation and newlines', () => {
    expect(splitSentences('One thing. Two things!\nThree things')).toEqual([
      'One thing.', 'Two things!', 'Three things',
    ])
  })
})

describe('extractPeople', () => {
  it('finds names introduced by a cue', () => {
    expect(extractPeople('Site visit with Tom and Sarah').people).toEqual(['Sarah', 'Tom'])
    expect(extractPeople('Chased Priya about the structural comments').people).toContain('Priya')
  })

  it('finds full names anywhere in the line', () => {
    expect(extractPeople('Sarah Chen sent through the revised loadings').people).toEqual(['Sarah Chen'])
  })

  it('collapses a first name into the full name when both appear', () => {
    const result = extractPeople('Spoke to Sarah Chen. Sarah will send the loadings.')
    expect(result.people).toEqual(['Sarah Chen'])
  })

  it('prefers a known contact and matches them on first name alone', () => {
    expect(extractPeople('Tom sent the comments', ['Tom Reilly']).people).toContain('Tom Reilly')
  })

  it('does not invent people out of practice vocabulary', () => {
    const result = extractPeople(
      'Submitted to Building Control on Monday and reviewed the Design Team comments',
    )
    expect(result.people).toEqual([])
  })

  it('files companies as organisations rather than people', () => {
    const result = extractPeople('Coordination call with Arup Engineers and Mace Construction')
    expect(result.people).toEqual([])
    expect(result.organisations.length).toBeGreaterThan(0)
  })

  it('does not read a weekday or a month as a name', () => {
    expect(extractPeople('Monday morning on site, back again in September').people).toEqual([])
  })

  it('does not read an acronym as a name', () => {
    expect(extractPeople('Responded to the TQ from the QS').people).toEqual([])
  })

  it('captures unnamed roles as evidence of who you dealt with', () => {
    const result = extractPeople('Meeting with the quantity surveyor and the structural engineer')
    expect(result.roles).toContain('quantity surveyor')
    expect(result.roles).toContain('structural engineer')
  })
})

describe('friction triggers are word-boundary matched', () => {
  it('does not read "submission" as a miss', () => {
    expect(classify('Half day, planning submission for BSQ').wentWrong).toBeNull()
  })

  it('does not fire on other words that merely contain a trigger', () => {
    for (const text of [
      'Reviewed the misson statement wording',
      'Updated the latest drawing register',
      'Checked the wrongful dismissal clause is not our concern',
    ]) {
      const result = classify(text)
      // Any hit here must be a real word match, not a fragment.
      if (result.wentWrong) expect(result.wentWrong.toLowerCase()).toMatch(/\bwrong\b|\blate\b|\bmiss\b/)
    }
  })

  it('still catches the real thing', () => {
    expect(classify('Missed the drainage connection detail entirely.').wentWrong).not.toBeNull()
    expect(classify('The package went out late because of me.').wentWrong).not.toBeNull()
  })
})

describe('affiliations', () => {
  it('reads "<Person> from <Firm>" as a person and a firm', () => {
    const result = extractPeople('Site visit with Sarah Chen from Mace')
    expect(result.people).toEqual(['Sarah Chen'])
    expect(result.organisations).toContain('Mace')
  })

  it('handles "at" and "of" the same way', () => {
    expect(extractPeople('Call with Priya Nair at Arup').people).toEqual(['Priya Nair'])
    expect(extractPeople('Call with Priya Nair at Arup').organisations).toContain('Arup')
  })

  it('does not strip a second genuine person', () => {
    const result = extractPeople('Met Tom Reilly and Sarah Chen on site')
    expect(result.people).toEqual(['Sarah Chen', 'Tom Reilly'])
  })
})
